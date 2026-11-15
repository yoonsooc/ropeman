import { MAX_FILE_SIZE } from '$lib/utils/filePriority';
import { isEnvValueFile } from '$lib/utils/languageDetector';
import { decodeSourceText, pathSegments, type SourceFileResult } from './sourceFile';

async function fileHandle(
	dir: FileSystemDirectoryHandle,
	segments: string[]
): Promise<FileSystemFileHandle> {
	let current = dir;
	for (const name of segments.slice(0, -1)) current = await current.getDirectoryHandle(name);
	return current.getFileHandle(segments[segments.length - 1]);
}

// NotFoundError: no such entry. TypeMismatchError: a folder where a file was expected, or the
// reverse. TypeError: a name the platform refuses, such as one holding `\` on Windows.
// Lowercased first, because on a case-insensitive disk `.ENV` opens `.env`
const KEY_FILE = /^(?:\.npmrc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.+\.(?:pem|key))$/;

/** An `.env` with values, a private key, or a file that holds registry or login tokens */
export function isSecretFile(path: string): boolean {
	const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
	return isEnvValueFile(name) || KEY_FILE.test(name);
}

function failureReason(err: unknown): 'not-found' | 'invalid-path' | 'unavailable' {
	const name = (err as { name?: unknown } | null)?.name;
	if (name === 'NotFoundError' || name === 'TypeMismatchError') return 'not-found';
	if (name === 'TypeError') return 'invalid-path';
	return 'unavailable';
}

export async function readFolderFile(
	dir: FileSystemDirectoryHandle,
	path: string
): Promise<SourceFileResult> {
	const segments = pathSegments(path);
	if (!segments) return { ok: false, reason: 'invalid-path' };
	if (isSecretFile(path)) return { ok: false, reason: 'secret-file' };
	let file: File;
	try {
		file = await (await fileHandle(dir, segments)).getFile();
	} catch (err) {
		return { ok: false, reason: failureReason(err) };
	}
	if (file.size > MAX_FILE_SIZE) return { ok: false, reason: 'too-large' };
	try {
		return decodeSourceText(new Uint8Array(await file.arrayBuffer()));
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
}

export interface FolderMatch {
	checked: number;
	found: number;
	expectedPath: string | null;
}

const evenlySpaced = <T>(items: T[], n: number): T[] =>
	items.length <= n
		? items
		: Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);

export function samplePaths(paths: string[], limit = 8): string[] {
	const usable = [...new Set(paths)]
		.filter((path) => pathSegments(path) && !isSecretFile(path))
		.sort();
	return evenlySpaced(usable, limit);
}

export async function checkFolder(
	dir: FileSystemDirectoryHandle,
	paths: string[]
): Promise<FolderMatch> {
	const sample = samplePaths(paths);
	const present = await Promise.all(
		sample.map((path) =>
			fileHandle(dir, pathSegments(path)!).then(
				() => true,
				() => false
			)
		)
	);
	return {
		checked: sample.length,
		found: present.filter(Boolean).length,
		expectedPath: sample[0] ?? null
	};
}

export const folderMatches = (match: FolderMatch): boolean => match.found * 2 >= match.checked;
