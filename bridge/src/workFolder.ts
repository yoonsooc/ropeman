import fs from 'fs';
import path from 'path';

/**
 * The folder (`--out`) the agent and serve share. Each file has one writer, so nothing needs a
 * lock: the agent writes `names.json` and `brief.md`; `ropeman map` writes `ropeman.json` and
 * `work.json`; serve writes `queue.json` (folders the user opened that have no names and no
 * worker to name them) and `naming-log.jsonl` (what its workers named); `ropeman inbox` writes
 * `inbox-read.json`, how much of the log the agent has seen. Any other channel to the agent (a
 * Claude Code channel, later) reads and writes the same files.
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

/** Writes beside the target and renames, so a reader never sees half a file. */
export function writeAtomic(file: string, text: string): void {
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, text);
	fs.renameSync(tmp, file);
}

/** The queued node ids, oldest first; none when the file is missing or not a queue. */
export function readQueue(out: string): string[] {
	let value: unknown;
	try {
		value = JSON.parse(fs.readFileSync(path.join(out, QUEUE_FILE), 'utf8'));
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
	let bytes: Buffer;
	try {
		bytes = fs.readFileSync(path.join(out, BRIEF_FILE));
	} catch {
		return null;
	}
	const text = bytes
		.subarray(0, MAX_BRIEF_BYTES)
		.toString('utf8')
		.replace(/\uFFFD$/, '')
		.trim();
	if (text === '') return null;
	return bytes.length > MAX_BRIEF_BYTES ? `${text}\n[brief cut at ${MAX_BRIEF_BYTES} bytes]` : text;
}

/** One worker result, as `naming-log.jsonl` holds it. */
export interface LogEntry {
	at: string;
	nodeId: string;
	folder: string;
	worker: string;
	/** `named`, or why there are no names (`naming-failed`, `verification-failed`) */
	outcome: string;
	names: { id: string; label: string; description: string; keySymbols: string[] }[];
	ms: number;
}

export function appendLog(out: string, entry: LogEntry): void {
	fs.appendFileSync(path.join(out, LOG_FILE), `${JSON.stringify(entry)}\n`);
}

/** Every whole line of the log; a line still being written is left for the next read. */
export function readLog(out: string): LogEntry[] {
	let text: string;
	try {
		text = fs.readFileSync(path.join(out, LOG_FILE), 'utf8');
	} catch {
		return [];
	}
	const lines = text.split('\n').slice(0, -1);
	return lines.flatMap((line) => {
		try {
			return [JSON.parse(line) as LogEntry];
		} catch {
			return [];
		}
	});
}
