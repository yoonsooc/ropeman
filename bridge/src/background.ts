import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { parseArgs } from 'util';
import { HOST, INSTANCE_HEADER } from './bridge.js';
import { KILL_GRACE_MS } from './cli.js';
import type { CommandEnv } from './mapCommand.js';
import { SERVE_FILE, SERVE_LOG_FILE, readOutFile, writeAtomic } from './workFolder.js';

/**
 * serve outside the agent's shell. A coding agent runs serve as a background task, and the
 * agent's time limit for those kills it (Claude Code: "the first server was stopped by the default
 * background time limit"). `ropeman serve --detach` starts serve in a session of its own, waits
 * until it listens, prints the address and exits; `OUT/serve.json` says which process serves
 * `OUT`, so a second start reuses it and `ropeman stop --out OUT` stops it.
 */

/** `OUT/serve.json`, written by the serve once it listens and removed when it exits. Never the token. */
export interface ServeRecord {
	pid: number;
	port: number;
	/** The server sends it on every HTTP answer (`INSTANCE_HEADER`) */
	instance: string;
	root: string | null;
	/** The local-mode address without the token; null when serve hosts no viewer */
	open: string | null;
	/** Minutes with no page open before serve stops itself; 0 never */
	idleMinutes: number;
	startedAt: string;
	version: string;
}

/**
 * A detached serve stops itself after this long with no page connected and no request. An hour
 * covers a break with the tab closed; a later start costs one command and one extraction (about
 * 8 s on PASEO), while a serve nobody stops would hold its port and about 1 GB for days.
 */
export const DEFAULT_IDLE_MINUTES = 60;
/** serve listens within a second; the CLI check before it can take up to 10 s */
const READY_MS = 30_000;
const PROBE_MS = 2_000;
const MAX_RECORD_BYTES = 4_096;

export function readRecord(out: string): ServeRecord | null {
	const read = readOutFile(out, SERVE_FILE, MAX_RECORD_BYTES);
	if (!read || !('text' in read) || read.cut) return null;
	let value: Partial<ServeRecord>;
	try {
		value = JSON.parse(read.text);
	} catch {
		return null;
	}
	// pid 0 or below would signal a process group, a port out of range throws in `http.get`
	const ok =
		Number.isSafeInteger(value?.pid) &&
		value.pid! > 0 &&
		Number.isSafeInteger(value.port) &&
		value.port! > 0 &&
		value.port! < 65536 &&
		typeof value.instance === 'string' &&
		(value.root === null || typeof value.root === 'string') &&
		(value.open === null || typeof value.open === 'string') &&
		typeof value.idleMinutes === 'number' &&
		typeof value.startedAt === 'string' &&
		typeof value.version === 'string';
	return ok ? (value as ServeRecord) : null;
}

export function writeRecord(out: string, record: ServeRecord): void {
	writeAtomic(path.join(out, SERVE_FILE), `${JSON.stringify(record, null, 1)}\n`);
}

/** Removes the record only while it is this instance's, so a newer serve keeps its own. */
export function removeRecord(out: string, instance: string): void {
	if (readRecord(out)?.instance === instance)
		fs.rmSync(path.join(out, SERVE_FILE), { force: true });
}

/** Whether the server on the recorded port is the process that wrote the record. */
function answers(record: ServeRecord): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(
			{
				host: HOST,
				port: record.port,
				path: '/',
				headers: { Host: `${HOST}:${record.port}` },
				timeout: PROBE_MS
			},
			(res) => {
				res.resume();
				resolve(res.headers[INSTANCE_HEADER] === record.instance);
			}
		);
		req.on('timeout', () => req.destroy());
		req.on('error', () => resolve(false));
	});
}

/**
 * The serve running for `out`. A record left by a serve that was killed, or one a cloned
 * repository shipped, names a pid and port nothing of ours answers on, so it counts as none.
 */
export async function runningServe(out: string): Promise<ServeRecord | null> {
	const record = readRecord(out);
	return record && (await answers(record)) ? record : null;
}

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const signal = (pid: number, name: NodeJS.Signals) => {
	try {
		process.kill(pid, name);
	} catch {
		// Already gone
	}
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stops a serve `runningServe` found and waits until its process is gone. serve stops its
 * workers and exits within KILL_GRACE_MS + 3 s of SIGTERM; past that it gets SIGKILL. On Windows
 * SIGTERM ends the process at once, with no cleanup (untested).
 */
export async function stopServe(out: string, record: ServeRecord): Promise<void> {
	signal(record.pid, 'SIGTERM');
	const end = Date.now() + KILL_GRACE_MS + 5_000;
	while (alive(record.pid) && Date.now() < end) await sleep(50);
	if (alive(record.pid)) signal(record.pid, 'SIGKILL');
	while (alive(record.pid)) await sleep(50);
	// A serve that exits normally removes it itself; a killed one cannot
	removeRecord(out, record.instance);
}

export type Launched = { ok: true; record: ServeRecord; log: string } | { ok: false; log: string };

/**
 * Opens `OUT/serve.log` for the child's stdout and stderr. A planted link is removed, not
 * followed, so the write cannot land in a file the link points to.
 */
function openLog(out: string): number {
	const file = path.join(out, SERVE_LOG_FILE);
	fs.rmSync(file, { force: true });
	return fs.openSync(file, 'wx', 0o600);
}

const readLog = (out: string) => {
	const read = readOutFile(out, SERVE_LOG_FILE, 64 * 1024);
	return read && 'text' in read ? read.text.trimEnd() : '';
};

/**
 * Starts `node <entry> <args>` in a session of its own (`detached`: on POSIX `setsid`, so the
 * agent's process group kill and the terminal's SIGHUP do not reach it), its output in
 * `OUT/serve.log`, and waits until it writes its record. The child exiting first, or no record
 * within READY_MS, is a failed start; the log says why.
 */
export async function launchDetached(
	out: string,
	entry: string,
	args: string[]
): Promise<Launched> {
	const fd = openLog(out);
	const child = spawn(process.execPath, [...process.execArgv, entry, ...args], {
		detached: true,
		stdio: ['ignore', fd, fd],
		windowsHide: true
	});
	fs.closeSync(fd);
	let exited = false;
	child.on('exit', () => (exited = true));
	child.on('error', () => (exited = true));
	child.unref();

	const end = Date.now() + READY_MS;
	while (Date.now() < end) {
		const record = readRecord(out);
		if (record && record.pid === child.pid) return { ok: true, record, log: readLog(out) };
		if (exited) return { ok: false, log: readLog(out) };
		await sleep(50);
	}
	child.kill('SIGKILL');
	return { ok: false, log: `${readLog(out)}\nserve did not start within ${READY_MS / 1000} s.` };
}

const STOP_USAGE = 'usage: ropeman stop --out <folder>';

/** `ropeman stop --out OUT`: stops the serve running for OUT. Nothing running is not an error. */
export async function runStop(args: string[], env: CommandEnv): Promise<number> {
	let out: string | undefined;
	try {
		out = parseArgs({ args, options: { out: { type: 'string' } }, strict: true }).values.out;
	} catch (err) {
		throw new Error(`${(err as Error).message}\n${STOP_USAGE}`, { cause: err });
	}
	if (!out) throw new Error(`--out is required.\n${STOP_USAGE}`);
	const folder = path.resolve(out);
	const record = await runningServe(folder);
	if (!record) {
		// A record nothing answers for is left over from a serve that was killed
		fs.rmSync(path.join(folder, SERVE_FILE), { force: true });
		env.out(JSON.stringify({ stopped: false }, null, 1));
		return 0;
	}
	await stopServe(folder, record);
	env.out(JSON.stringify({ stopped: true, pid: record.pid, port: record.port }, null, 1));
	return 0;
}
