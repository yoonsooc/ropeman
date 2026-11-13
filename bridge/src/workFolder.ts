import fs from 'fs';
import path from 'path';

/**
 * The folder (`--out`) the agent and serve share. Each file has one writer, so nothing needs a
 * lock: the agent writes `names.json`; `ropeman map` writes `ropeman.json` and `work.json`;
 * serve writes `queue.json`, the folders the user opened that have no names yet. Any other
 * channel to the agent (a Claude Code channel, later) reads and writes the same files.
 */
export const NAMES_FILE = 'names.json';
export const MAP_FILE = 'ropeman.json';
export const WORK_FILE = 'work.json';
export const QUEUE_FILE = 'queue.json';

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
