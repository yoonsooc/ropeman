import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { parseArgs } from 'util';
import { CONTROL_PATH, HOST, SECRET_HEADER } from './bridge.js';
import { KILL_GRACE_MS } from './cli.js';
import type { CommandEnv } from './mapCommand.js';
import {
	SERVE_FILE,
	SERVE_LOCK_FILE,
	SERVE_LOG_FILE,
	readOutFile,
	writeAtomic
} from './workFolder.js';

/**
 * serve outside the agent's shell. A coding agent runs serve as a background task, and the
 * agent's time limit for those kills it (Claude Code: "the first server was stopped by the default
 * background time limit"). `ropeman serve --detach` starts serve in a session of its own, waits
 * until it listens, prints the address and exits; `OUT/serve.json` says where the serve for `OUT`
 * listens, so a second `--detach` start reuses it and `ropeman stop --out OUT` stops it.
 *
 * The record is only a pointer. A cloned repository can ship one, and a pid or port in it can
 * belong to anything by now, so nothing here signals a pid from it or prints an address it names.
 * The serve proves itself by answering a request that carries the record's secret, and it stops
 * when such a request asks it to.
 */

/** `OUT/serve.json`, mode 0600, written by serve once it listens and removed when it exits. Never the token. */
export interface ServeRecord {
	/** For messages only; nothing is signalled by it */
	pid: number;
	port: number;
	/** Chosen by the command that starts serve, so it waits for this serve's record and no other */
	instance: string;
	/** What a control request carries (`SECRET_HEADER`) */
	secret: string;
	startedAt: string;
	version: string;
}

/** What a serve answers about itself to a request with its secret (`ServeControl.status`). */
export interface ServeStatus {
	instance: string;
	pid: number;
	port: number;
	root: string | null;
	/** The local-mode page; null when serve hosts no viewer */
	entry: '/bridge' | '/' | null;
	idleMinutes: number;
	version: string;
}

export interface Running {
	record: ServeRecord;
	status: ServeStatus;
}

/**
 * A detached serve stops itself after this long with no page connected and no request. An hour
 * covers a break with the tab closed; a later start costs one command and one extraction (about
 * 8 s on PASEO), while a serve nobody stops would hold its port and about 1 GB for days.
 */
export const DEFAULT_IDLE_MINUTES = 60;
/** Passed with the instance id to the serve `--detach` starts: no token in its log, which is a file */
export const DETACHED_CHILD = '--detached-child';
/** serve listens within a second; the CLI check before it can take up to 10 s */
const READY_MS = 30_000;
/** A refused port answers at once; this bounds a serve whose event loop is busy, or a stranger */
const PROBE_MS = 5_000;
/** serve closes its port at once and exits within KILL_GRACE_MS + 3 s of a stop request */
const STOP_MS = KILL_GRACE_MS + 5_000;
/** The longest a start holds the lock: a stop of the serve it replaces, then a launch */
const LOCK_STALE_MS = 2 * PROBE_MS + STOP_MS + READY_MS + 5_000;
const LOCK_WAIT_MS = LOCK_STALE_MS + 10_000;
const MAX_RECORD_BYTES = 4_096;
const MAX_STATUS_BYTES = 8_192;

const isString = (value: unknown): value is string => typeof value === 'string';
const isPort = (value: unknown) =>
	Number.isSafeInteger(value) && (value as number) > 0 && (value as number) < 65536;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function readRecord(out: string): ServeRecord | null {
	const read = readOutFile(out, SERVE_FILE, MAX_RECORD_BYTES, { owned: true });
	if (!read || !('text' in read) || read.cut) return null;
	let value: Partial<ServeRecord> | null;
	try {
		value = JSON.parse(read.text);
	} catch {
		return null;
	}
	const ok =
		Number.isSafeInteger(value?.pid) &&
		isPort(value!.port) &&
		isString(value!.instance) &&
		isString(value!.secret) &&
		value!.secret.length >= 32 &&
		isString(value!.startedAt) &&
		isString(value!.version);
	return ok ? (value as ServeRecord) : null;
}

export function writeRecord(out: string, record: ServeRecord): void {
	writeAtomic(path.join(out, SERVE_FILE), `${JSON.stringify(record, null, 1)}\n`, 0o600);
}

/** Removes the record only while it is this instance's, so a newer serve keeps its own. */
export function removeRecord(out: string, instance: string): void {
	if (readRecord(out)?.instance === instance)
		fs.rmSync(path.join(out, SERVE_FILE), { force: true });
}

/** One control request to the recorded port, bounded in time and size; null without an answer. */
function control(
	record: ServeRecord,
	method: 'GET' | 'POST'
): Promise<{ status: number; body: string } | null> {
	return new Promise((resolve) => {
		const req = http.request(
			{
				host: HOST,
				port: record.port,
				path: CONTROL_PATH,
				method,
				headers: { Host: `${HOST}:${record.port}`, [SECRET_HEADER]: record.secret },
				signal: AbortSignal.timeout(PROBE_MS)
			},
			(res) => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', (chunk: string) => {
					body += chunk;
					if (body.length > MAX_STATUS_BYTES) req.destroy();
				});
				res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
				res.on('close', () => resolve(null));
			}
		);
		req.on('error', () => resolve(null));
		req.end();
	});
}

/** The status of the serve that wrote `record`, or null when nothing that knows its secret answers. */
async function ask(record: ServeRecord): Promise<ServeStatus | null> {
	const reply = await control(record, 'GET');
	if (reply?.status !== 200) return null;
	let status: Partial<ServeStatus> | null;
	try {
		status = JSON.parse(reply.body);
	} catch {
		return null;
	}
	const ok =
		status?.instance === record.instance &&
		status.port === record.port &&
		Number.isSafeInteger(status.pid) &&
		(status.root === null || isString(status.root)) &&
		(status.entry === null || status.entry === '/bridge' || status.entry === '/') &&
		typeof status.idleMinutes === 'number' &&
		isString(status.version);
	return ok ? (status as ServeStatus) : null;
}

/**
 * The serve running for `out`. A record left by a serve that was killed, or one a cloned
 * repository shipped, has no serve behind it that knows its secret, so it counts as none.
 */
export async function runningServe(out: string): Promise<Running | null> {
	const record = readRecord(out);
	const status = record && (await ask(record));
	return status ? { record: record!, status } : null;
}

/**
 * Asks the serve to stop and waits until it removed its record. serve closes its port at once and
 * exits within KILL_GRACE_MS + 3 s. false when it still answers after STOP_MS; it is never killed
 * from here. On Windows the stop runs the same shutdown (untested).
 */
export async function stopServe(out: string, { record }: Running): Promise<boolean> {
	const accepted = (await control(record, 'POST'))?.status === 202;
	const end = Date.now() + STOP_MS;
	while (accepted && Date.now() < end && readRecord(out)?.instance === record.instance) {
		await sleep(50);
	}
	if (await ask(record)) return false;
	// Its port is closed; a serve that did not get to exit cleanly could not remove the record
	removeRecord(out, record.instance);
	return true;
}

/** A lock text names a live process that took it less than LOCK_STALE_MS ago. */
function lockHeld(text: string, file: string): boolean {
	let holder: { pid?: unknown; at?: unknown } | null;
	try {
		holder = JSON.parse(text);
	} catch {
		// A start that just created the file may not have written it yet
		const age = Date.now() - (fs.lstatSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0);
		return age < 5_000;
	}
	const { pid, at } = holder ?? {};
	if (!Number.isSafeInteger(pid) || (pid as number) <= 0 || typeof at !== 'number') return false;
	if (Date.now() - at > LOCK_STALE_MS) return false;
	try {
		// Signal 0 sends nothing; it only asks whether the pid exists
		process.kill(pid as number, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** The lock's text; null when there is none, false when it is not a private file of this user. */
const lockText = (out: string, name = SERVE_LOCK_FILE): string | null | false => {
	const read = readOutFile(out, name, 256, { owned: true });
	return read && 'text' in read ? read.text : read === null ? null : false;
};

/**
 * Takes `OUT/serve.lock`, so one start at a time checks for a running serve and launches one. A
 * lock whose holder died, or held past LOCK_STALE_MS, is broken. Resolves to the release, or to
 * null when another start held it for LOCK_WAIT_MS.
 */
async function lock(out: string): Promise<(() => void) | null> {
	const file = path.join(out, SERVE_LOCK_FILE);
	const mine = JSON.stringify({ pid: process.pid, at: Date.now() });
	const end = Date.now() + LOCK_WAIT_MS;
	while (Date.now() < end) {
		try {
			fs.writeFileSync(file, mine, { flag: 'wx', mode: 0o600 });
			return () => {
				if (lockText(out) === mine) fs.rmSync(file, { force: true });
			};
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
		}
		const held = lockText(out);
		// A link, a folder or a planted file is no start's lock
		if (held === false || (held !== null && !lockHeld(held, file))) breakLock(out, held);
		await sleep(100);
	}
	return null;
}

/** Moves a stale lock aside; a lock another start took in the meantime goes back. */
function breakLock(out: string, stale: string | false): void {
	const file = path.join(out, SERVE_LOCK_FILE);
	const name = `${SERVE_LOCK_FILE}.${process.pid}.stale`;
	const aside = path.join(out, name);
	try {
		fs.renameSync(file, aside);
	} catch {
		return;
	}
	if (lockText(out, name) !== stale) {
		try {
			fs.linkSync(aside, file);
		} catch {
			// Another start holds a newer lock
		}
	}
	fs.rmSync(aside, { recursive: true, force: true });
}

/**
 * Opens `OUT/serve.log` for the child's stdout and stderr. A planted link is removed, not
 * followed, so the write cannot land in a file the link points to. Called only under the lock
 * with no serve answering, so it never cuts the log of a running serve.
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

type Launched =
	| { ok: true; running: Running; log: string }
	| { ok: false; message: string; log: string };

/**
 * Starts `node <entry> <args>` in a session of its own (`detached`: on POSIX `setsid`, so the
 * agent's process group kill and the terminal's SIGHUP do not reach it), its output in
 * `OUT/serve.log`, and waits until a serve with the instance id it chose answers. The child
 * exiting first, or no answer within READY_MS, is a failed start; the log says why.
 */
async function launchDetached(out: string, entry: string, args: string[]): Promise<Launched> {
	let fd: number;
	try {
		fd = openLog(out);
	} catch (err) {
		return {
			ok: false,
			message: `${path.join(out, SERVE_LOG_FILE)}: ${(err as Error).message}`,
			log: ''
		};
	}
	const instance = randomUUID();
	const child = spawn(
		process.execPath,
		[...process.execArgv, entry, ...args, DETACHED_CHILD, instance],
		{
			detached: true,
			stdio: ['ignore', fd, fd],
			windowsHide: true
		}
	);
	fs.closeSync(fd);
	let exited = false;
	child.on('exit', () => (exited = true));
	child.on('error', () => (exited = true));
	child.unref();

	const end = Date.now() + READY_MS;
	while (Date.now() < end) {
		const record = readRecord(out);
		const status = record?.instance === instance ? await ask(record) : null;
		if (status) return { ok: true, running: { record: record!, status }, log: readLog(out) };
		if (exited) return { ok: false, message: 'serve exited before it listened', log: readLog(out) };
		await sleep(50);
	}
	child.kill('SIGKILL');
	return {
		ok: false,
		message: `serve did not start within ${READY_MS / 1000} s`,
		log: readLog(out)
	};
}

export interface DetachRequest {
	root: string | null;
	/** Whether the start asks for local mode, which a running serve must also have */
	viewer: boolean;
	/** The bundle to run (`server.mjs`) and its arguments */
	entry: string;
	args: string[];
}

export type Detached =
	| { kind: 'reused'; running: Running }
	| { kind: 'started'; running: Running; log: string; replaced: ServeStatus | null }
	| { kind: 'failed'; message: string; log: string };

const fits = (status: ServeStatus, want: DetachRequest) =>
	status.root === want.root && (status.entry !== null) === want.viewer;

/**
 * `serve --detach`: reuses the serve running for `out` when it serves the same root in the same
 * mode, replaces it when not, and otherwise starts one. Under `OUT/serve.lock`, so two starts at
 * once end with one serve, which both report.
 */
export async function startDetached(out: string, want: DetachRequest): Promise<Detached> {
	let unlock: (() => void) | null;
	try {
		unlock = await lock(out);
	} catch (err) {
		const message = `${path.join(out, SERVE_LOCK_FILE)}: ${(err as Error).message}`;
		return { kind: 'failed', message, log: '' };
	}
	if (!unlock) {
		const message = `another start for ${out} has held ${SERVE_LOCK_FILE} for ${LOCK_WAIT_MS / 1000} s`;
		return { kind: 'failed', message, log: '' };
	}
	try {
		const running = await runningServe(out);
		if (running && fits(running.status, want)) return { kind: 'reused', running };
		if (running && !(await stopServe(out, running))) {
			const message = `the serve for ${out} that runs with other options (pid ${running.status.pid}) did not stop within ${STOP_MS / 1000} s`;
			return { kind: 'failed', message, log: '' };
		}
		const launched = await launchDetached(out, want.entry, want.args);
		if (launched.ok) {
			const { running: started, log } = launched;
			return { kind: 'started', running: started, log, replaced: running?.status ?? null };
		}
		// A serve started in a terminal meanwhile may hold the port for this folder
		const now = await runningServe(out);
		if (now && fits(now.status, want)) return { kind: 'reused', running: now };
		return { kind: 'failed', message: launched.message, log: launched.log };
	} finally {
		unlock();
	}
}

const STOP_USAGE = 'usage: ropeman stop --out <folder>';

/**
 * `ropeman stop --out OUT`: asks the serve running for OUT to stop. With none answering it only
 * removes a stale record and says so. Nothing running is not an error; a serve that does not stop is.
 */
export async function runStop(args: string[], env: CommandEnv): Promise<number> {
	let out: string | undefined;
	try {
		out = parseArgs({ args, options: { out: { type: 'string' } }, strict: true }).values.out;
	} catch (err) {
		throw new Error(`${(err as Error).message}\n${STOP_USAGE}`, { cause: err });
	}
	if (!out) throw new Error(`--out is required.\n${STOP_USAGE}`);
	const folder = path.resolve(out);
	const running = await runningServe(folder);
	if (!running) {
		const file = path.join(folder, SERVE_FILE);
		const stale = fs.lstatSync(file, { throwIfNoEntry: false });
		if (stale && !stale.isDirectory()) fs.rmSync(file, { force: true });
		env.out(
			JSON.stringify(
				{ stopped: false, staleRecordRemoved: !!stale && !stale.isDirectory() },
				null,
				1
			)
		);
		return 0;
	}
	const { pid } = running.status;
	if (!(await stopServe(folder, running))) {
		env.err(
			`The serve for ${folder} (pid ${pid}) still answers ${STOP_MS / 1000} s after it was asked to stop.`
		);
		return 1;
	}
	env.out(JSON.stringify({ stopped: true, pid, port: running.record.port }, null, 1));
	return 0;
}
