import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/** Same cap as the app's file reader (`src/lib/utils/filePriority.ts`). */
export const MAX_FILE_SIZE = 500_000;

// Same rule as the app (`src/lib/utils/languageDetector.ts`): every `.env` variant holds real
// values except a template, whose suffix names it as one. `test/fileRead.test.ts` checks the two agree.
const ENV_FILE = /^\.env(?:\..+)?$/;
const ENV_TEMPLATE = /^\.env(?:\.[^.]+)*\.(?:example|sample|template|dist|defaults)$/;

/** Lowercased first, because on a case-insensitive disk `.ENV` opens `.env`. */
export function isEnvValueFile(filePath: string): boolean {
	const name = path.basename(filePath).toLowerCase();
	return ENV_FILE.test(name) && !ENV_TEMPLATE.test(name);
}

export interface FileContent {
	/** The path as requested, relative to the root. */
	path: string;
	content: string;
	sha256: string;
	size: number;
}

export type FileReadRejection =
	| 'invalid-path'
	| 'absolute-path'
	| 'outside-root'
	| 'symlink-outside-root'
	| 'env-file'
	| 'not-found'
	| 'not-a-file'
	| 'too-large';

export type FileReadResult =
	| { ok: true; file: FileContent }
	| { ok: false; reason: FileReadRejection; message: string };

const reject = (reason: FileReadRejection, message: string): FileReadResult => ({
	ok: false,
	reason,
	message
});

function isInside(root: string, target: string): boolean {
	const rel = path.relative(root, target);
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve once at startup: every later check compares real paths against it. */
export function resolveRoot(dir: string): string {
	const real = fs.realpathSync.native(path.resolve(dir));
	if (!fs.statSync(real).isDirectory()) throw new Error(`Root is not a directory: ${dir}`);
	return real;
}

/**
 * Reads one file under `root` (a path from `resolveRoot`) for the viewer. The requested path and
 * the file it resolves to must both stay inside the root and must not be a real `.env`.
 */
export async function readRootedFile(root: string, requested: unknown): Promise<FileReadResult> {
	if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) {
		return reject('invalid-path', 'Path must be a non-empty string.');
	}
	if (path.posix.isAbsolute(requested) || path.win32.isAbsolute(requested)) {
		return reject('absolute-path', 'Path must be relative to the project root.');
	}
	const target = path.resolve(root, requested);
	if (!isInside(root, target)) {
		return reject('outside-root', 'Path leaves the project root.');
	}
	if (isEnvValueFile(target)) {
		return reject('env-file', 'Env files with real values are never read.');
	}

	let real: string;
	try {
		real = await fs.promises.realpath(target);
	} catch {
		return reject('not-found', 'File not found.');
	}
	if (!isInside(root, real)) {
		return reject('symlink-outside-root', 'Path resolves outside the project root.');
	}
	if (isEnvValueFile(real)) {
		return reject('env-file', 'Env files with real values are never read.');
	}

	let handle: fs.promises.FileHandle;
	try {
		// O_NOFOLLOW: a symlink swapped in after realpath fails here instead of being followed
		handle = await fs.promises.open(real, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
	} catch {
		return reject('not-found', 'File not found.');
	}
	try {
		const stat = await handle.stat();
		if (!stat.isFile()) return reject('not-a-file', 'Path is not a regular file.');
		if (stat.size > MAX_FILE_SIZE) {
			return reject('too-large', `File is larger than ${MAX_FILE_SIZE} bytes.`);
		}
		const bytes = await handle.readFile();
		if (bytes.length > MAX_FILE_SIZE) {
			return reject('too-large', `File is larger than ${MAX_FILE_SIZE} bytes.`);
		}
		return {
			ok: true,
			file: {
				path: requested,
				content: bytes.toString('utf8'),
				sha256: createHash('sha256').update(bytes).digest('hex'),
				size: bytes.length
			}
		};
	} finally {
		await handle.close();
	}
}
