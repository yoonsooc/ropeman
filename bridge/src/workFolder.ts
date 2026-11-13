import fs from 'fs';
import path from 'path';

/**
 * The folder (`--out`) the agent and serve share. Each file has one writer, so nothing needs a
 * lock: the agent writes `names.json` and `brief.md`; `ropeman map` writes `ropeman.json` and
 * `work.json`; serve writes `queue.json` (folders the user opened that have no names and no
 * worker to name them) and `naming-log.jsonl` (what its workers named); `ropeman inbox` writes
 * `inbox-read.json`, the last log entry the agent has seen. Any other channel to the agent (a
 * Claude Code channel, later) reads and writes the same files.
 *
 * A cloned repository can ship any of these files, so every read here treats them as untrusted.
 */
export const NAMES_FILE = 'names.json';
export const BRIEF_FILE = 'brief.md';
export const MAP_FILE = 'ropeman.json';
export const WORK_FILE = 'work.json';
export const QUEUE_FILE = 'queue.json';
export const LOG_FILE = 'naming-log.jsonl';
export const INBOX_READ_FILE = 'inbox-read.json';

/** The most of `brief.md` a worker prompt carries; the rest is cut and says so. */
export const MAX_BRIEF_BYTES = 4_000;
/** Far above what an agent writes for the largest map Ropeman takes */
export const MAX_NAMES_BYTES = 8 * 1024 * 1024;
const MAX_QUEUE_BYTES = 1024 * 1024;
/** serve trims `naming-log.jsonl` to its newest entries before it grows past this */
export const MAX_LOG_BYTES = 1_000_000;
const MAX_CURSOR_BYTES = 1024;

export type OutRead = { text: string; cut: boolean } | { refused: string } | null;

const linkRefused = (name: string) => ({
	refused: `${name} is a link; Ropeman reads only the folder's own files.`
});

/**
 * One file of `--out`, which is a real path: only a regular file directly in it, never a link,
 * so the bytes read are the folder's own. At most `maxBytes` of it; `cut` says there was more.
 * null when the file is missing; `refused` says why it was not read. It opens without blocking,
 * so a FIFO is refused instead of stopping serve.
 */
export function readOutFile(out: string, name: string, maxBytes: number): OutRead {
	const file = path.join(out, name);
	const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
	// Windows has no O_NOFOLLOW; a link is refused before the open there
	if (O_NOFOLLOW === undefined && fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) {
		return linkRefused(name);
	}
	let fd: number;
	try {
		fd = fs.openSync(file, O_RDONLY | (O_NOFOLLOW ?? 0) | (O_NONBLOCK ?? 0));
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'ENOENT') return null;
		if (code === 'ELOOP' || code === 'EMLINK') return linkRefused(name);
		return { refused: `${name} could not be opened (${code}).` };
	}
	try {
		const stat = fs.fstatSync(fd);
		if (!stat.isFile()) return { refused: `${name} is not a regular file.` };
		const bytes = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
		let read = 0;
		for (let n = -1; n !== 0 && read < bytes.length; read += n) {
			n = fs.readSync(fd, bytes, read, bytes.length - read, null);
		}
		return {
			text: bytes.subarray(0, Math.min(read, maxBytes)).toString('utf8'),
			cut: read > maxBytes
		};
	} finally {
		fs.closeSync(fd);
	}
}

/** A whole file of `--out` as text; null when it is missing, refused or over `maxBytes`. */
function readWhole(out: string, name: string, maxBytes: number): string | null {
	const read = readOutFile(out, name, maxBytes);
	return read && 'text' in read && !read.cut ? read.text : null;
}

/**
 * Writes beside the target and renames, so a reader never sees half a file and a link planted
 * at the target is replaced, not followed. The temporary file is created new for the same reason.
 */
export function writeAtomic(file: string, text: string): void {
	const tmp = `${file}.${process.pid}.tmp`;
	fs.rmSync(tmp, { force: true });
	fs.writeFileSync(tmp, text, { flag: 'wx' });
	fs.renameSync(tmp, file);
}

/** The queued node ids, oldest first; none when the file is missing or not a queue. */
export function readQueue(out: string): string[] {
	let value: unknown;
	try {
		value = JSON.parse(readWhole(out, QUEUE_FILE, MAX_QUEUE_BYTES) ?? '');
	} catch {
		return [];
	}
	const queued = (value as { queued?: unknown } | null)?.queued;
	return Array.isArray(queued) ? queued.filter((id): id is string => typeof id === 'string') : [];
}

export function writeQueue(out: string, ids: readonly string[]): void {
	writeAtomic(path.join(out, QUEUE_FILE), `${JSON.stringify({ queued: ids }, null, 1)}\n`);
}

/** The agent's brief for worker prompts, cut to MAX_BRIEF_BYTES; null when there is none. */
export function readBrief(out: string): string | null {
	const read = readOutFile(out, BRIEF_FILE, MAX_BRIEF_BYTES);
	if (!read || 'refused' in read) return null;
	const text = read.text.replace(/�$/, '').trim();
	if (text === '') return null;
	return read.cut ? `${text}\n[brief cut at ${MAX_BRIEF_BYTES} bytes]` : text;
}

/** One worker result, as `naming-log.jsonl` holds it. */
export interface LogEntry {
	/**
	 * Grows with every entry and never repeats across trims, restarts and a removed log (it starts
	 * from the clock), so `ropeman inbox` can say which entries it has shown.
	 */
	seq: number;
	at: string;
	nodeId: string;
	folder: string;
	worker: string;
	/**
	 * `named`; `agent-named` when the agent's names arrived while the worker ran and were kept;
	 * otherwise why there are no names (`naming-failed`, `verification-failed`)
	 */
	outcome: string;
	names: { id: string; label: string; description: string; keySymbols: string[] }[];
	ms: number;
}

/**
 * Adds one entry. The log is small, so it is rewritten whole, which lets it be trimmed: past
 * MAX_LOG_BYTES only the newest entries that fill half of it stay. Throws when the folder
 * cannot be written.
 */
export function appendLog(out: string, entry: Omit<LogEntry, 'seq'>): void {
	const kept = readLog(out);
	const seq = Math.max(Date.now(), (kept.at(-1)?.seq ?? 0) + 1);
	const lines = [...kept, { seq, ...entry }].map((e) => `${JSON.stringify(e)}\n`);
	let size = lines.reduce((n, line) => n + Buffer.byteLength(line), 0);
	if (size > MAX_LOG_BYTES) {
		while (lines.length > 1 && size > MAX_LOG_BYTES / 2) size -= Buffer.byteLength(lines.shift()!);
	}
	writeAtomic(path.join(out, LOG_FILE), lines.join(''));
}

/** Every whole entry of the log, oldest first; a line still being written is left for the next read. */
export function readLog(out: string): LogEntry[] {
	const read = readOutFile(out, LOG_FILE, MAX_LOG_BYTES);
	if (!read || 'refused' in read) return [];
	return read.text
		.split('\n')
		.slice(0, -1)
		.flatMap((line) => {
			try {
				const entry = JSON.parse(line) as LogEntry;
				return typeof entry?.seq === 'number' && typeof entry.nodeId === 'string' ? [entry] : [];
			} catch {
				return [];
			}
		});
}

/** The `seq` of the last log entry `ropeman inbox` showed; 0 before the first. */
export function readInboxCursor(out: string): number {
	try {
		const seq = JSON.parse(readWhole(out, INBOX_READ_FILE, MAX_CURSOR_BYTES) ?? '').seq;
		return typeof seq === 'number' ? seq : 0;
	} catch {
		return 0;
	}
}

export function writeInboxCursor(out: string, seq: number): void {
	writeAtomic(path.join(out, INBOX_READ_FILE), `${JSON.stringify({ seq })}\n`);
}
