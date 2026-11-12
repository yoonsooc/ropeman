import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { FileContent, FileReadRejection } from '../../src/lib/types/ropemanMap.js';

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

export type FileReadResult =
	| { ok: true; file: FileContent }
	| { ok: false; reason: FileReadRejection; message: string };

const reject = (reason: FileReadRejection, message: string): FileReadResult => ({
	ok: false,
	reason,
	message
});

/** `..x` is a name inside the root; only `..` itself or a `../` prefix leaves it. */
export function isInside(root: string, target: string): boolean {
	const rel = path.relative(root, target);
	return !(rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel));
}

// O_NOFOLLOW: a symlink swapped in after realpath fails instead of being followed.
// O_NONBLOCK: opening a FIFO with no writer would block a libuv thread until one appears.
const OPEN_FLAGS =
	fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

export interface OpenedFile {
	handle: fs.promises.FileHandle;
	stat: fs.Stats;
}

/**
 * Opens `real` (a path from realpath) only if it is a regular file. lstat first, so a FIFO or
 * device is refused without being opened; fstat after, for one swapped in between.
 */
export async function openRegularFile(
	real: string
): Promise<OpenedFile | 'not-found' | 'not-a-file'> {
	try {
		if (!(await fs.promises.lstat(real)).isFile()) return 'not-a-file';
	} catch {
		return 'not-found';
	}
	let handle: fs.promises.FileHandle;
	try {
		handle = await fs.promises.open(real, OPEN_FLAGS);
	} catch {
		return 'not-found';
	}
	const stat = await handle.stat().catch(async (err: unknown) => {
		await handle.close();
		throw err;
	});
	if (stat.isFile()) return { handle, stat };
	await handle.close();
	return 'not-a-file';
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

	const opened = await openRegularFile(real);
	if (opened === 'not-found') return reject('not-found', 'File not found.');
	if (opened === 'not-a-file') return reject('not-a-file', 'Path is not a regular file.');
	const { handle, stat } = opened;
	try {
		if (!(await resolvesTo(root, target, stat))) {
			return reject('changed', 'Path changed while it was being read.');
		}
		if (stat.size > MAX_FILE_SIZE) {
			return reject('too-large', `File is larger than ${MAX_FILE_SIZE} bytes.`);
		}
		const bytes = await handle.readFile();
		if (bytes.length > MAX_FILE_SIZE) {
			return reject('too-large', `File is larger than ${MAX_FILE_SIZE} bytes.`);
		}
		if (bytes.includes(0)) {
			return reject('binary', 'Binary files are not read.');
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

/**
 * Best effort against a parent directory swapped for a symlink between realpath and open
 * (O_NOFOLLOW guards only the last component): `target` must still resolve inside the root
 * to the file that was opened.
 */
async function resolvesTo(root: string, target: string, opened: fs.Stats): Promise<boolean> {
	try {
		const real = await fs.promises.realpath(target);
		if (!isInside(root, real) || isEnvValueFile(real)) return false;
		const now = await fs.promises.stat(real);
		return now.dev === opened.dev && now.ino === opened.ino;
	} catch {
		return false;
	}
}
