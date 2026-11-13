import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
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
 *
 * A record is removed only when nothing listens on its port, the one proof that no serve is
 * behind it. A record that is not private, or whose port accepts connections without the serve
 * answering in time, may still point to a running serve; deleting it would leave that serve
 * unreachable and let the next start launch a second one, so it is kept and the command says why.
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
/** How far ahead of this clock a lock's time may be and still count, for clocks a little apart */
const LOCK_SKEW_MS = 5_000;
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

/** `OUT/serve.json` as found, before anything it says is trusted. */
interface RecordFile {
	/** The port it names; null when it names none, so no serve can be reached through it */
	port: number | null;
	/** Every field a serve of this version writes; null for anything else */
	record: ServeRecord | null;
	/** Why others could read or replace it ("mode 644"); null for a private file of this user */
	exposed: string | null;
}

/** null when there is no record. A link or a special file is one that names no port. */
function readRecordFile(out: string): RecordFile | null {
	const read = readOutFile(out, SERVE_FILE, MAX_RECORD_BYTES, { owned: true });
	if (read === null) return null;
	let value: Partial<ServeRecord> | null = null;
	try {
		if ('text' in read && !read.cut) value = JSON.parse(read.text);
	} catch {
		// Names no port
	}
	const full =
		Number.isSafeInteger(value?.pid) &&
		isPort(value!.port) &&
		isString(value!.instance) &&
		isString(value!.secret) &&
		value!.secret.length >= 32 &&
		isString(value!.startedAt) &&
		isString(value!.version);
	return {
		port: isPort(value?.port) ? value!.port! : null,
		record: full ? (value as ServeRecord) : null,
		exposed: ('exposed' in read && read.exposed) || null
	};
}

/** The record a private file of this user holds; null for none or any other file. */
export function readRecord(out: string): ServeRecord | null {
	const file = readRecordFile(out);
	return file && !file.exposed ? file.record : null;
}

/**
 * Writes the record (mode 0600) and reads it back. On a file system that does not keep modes
 * (some network shares and FAT or exFAT mounts) it reads back as others' too and would never be
 * trusted, so it is removed and the result says what the file system reported; null when kept.
 */
export function writeRecord(out: string, record: ServeRecord): string | null {
	writeAtomic(path.join(out, SERVE_FILE), `${JSON.stringify(record, null, 1)}\n`, 0o600);
	const exposed = readRecordFile(out)?.exposed ?? null;
	if (exposed) removeRecord(out, record.instance);
	return exposed;
}

/** Removes the record only while it is this instance's, so a newer serve keeps its own. */
export function removeRecord(out: string, instance: string): void {
	if (readRecordFile(out)?.record?.instance === instance)
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

/** Whether connecting to `port` is refused: the one answer that proves no serve listens there. */
function refused(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({ host: HOST, port, timeout: PROBE_MS });
		const done = (answer: boolean) => {
			socket.destroy();
			resolve(answer);
		};
		socket.on('connect', () => done(false));
		socket.on('timeout', () => done(false));
		socket.on('error', (err: NodeJS.ErrnoException) => done(err.code === 'ECONNREFUSED'));
	});
}

/** What `OUT/serve.json` points to, once its port was asked. */
export type Found =
	| { kind: 'none' }
	| { kind: 'running'; running: Running }
	/** Nothing listens on its port, or it names none: the record can go */
	| { kind: 'stale'; instance: string | null }
	/** A serve may still be behind it: keep it, and say why and what the user can do */
	| { kind: 'unproven'; problem: string };

/**
 * The serve running for `out`. A record left by a serve that was killed, or one a cloned
 * repository shipped, has no serve behind it that knows its secret; it is stale only once its
 * port refuses connections.
 */
export async function findServe(out: string): Promise<Found> {
	const found = readRecordFile(out);
	if (!found) return { kind: 'none' };
	const { port, record, exposed } = found;
	const instance = record?.instance ?? null;
	if (port === null) return { kind: 'stale', instance };
	const status = record && !exposed ? await ask(record) : null;
	if (status) return { kind: 'running', running: { record: record!, status } };
	if (await refused(port)) return { kind: 'stale', instance };
	const file = path.join(out, SERVE_FILE);
	const kept = `port ${port} it names accepts connections, so a serve may still run there and the record is kept`;
	if (exposed) {
		return {
			kind: 'unproven',
			problem: `${file} is not a private file of this user (${exposed}), so Ropeman does not trust it, and ${kept}. If it is this folder's serve, run chmod 600 ${file} and try again; otherwise stop the process on port ${port}, or remove ${file} if nothing of yours runs there`
		};
	}
	if (!record) {
		return {
			kind: 'unproven',
			problem: `${file} is not a record this version of Ropeman reads, and ${kept}. A serve of another Ropeman version may run there: stop it with that version's ropeman stop, or stop the process on port ${port}`
		};
	}
	return {
		kind: 'unproven',
		problem: `nothing on port ${port} answered as the serve in ${file} within ${PROBE_MS / 1000} s (a busy serve, or another program on that port), and ${kept}. Try again in a minute; if it still does not answer, stop the process on port ${port}`
	};
}

/** Removes a record `findServe` found stale, unless a serve replaced it since. */
function removeStale(out: string, instance: string | null): boolean {
	const file = path.join(out, SERVE_FILE);
	const stat = fs.lstatSync(file, { throwIfNoEntry: false });
	if (!stat || stat.isDirectory()) return false;
	if ((readRecordFile(out)?.record?.instance ?? null) !== instance) return false;
	fs.rmSync(file, { force: true });
	return true;
}

type StopOutcome = 'stopped' | 'still answers' | 'port open';

/**
 * Asks the serve to stop and waits until it removed its record. serve closes its port at once and
 * exits within KILL_GRACE_MS + 3 s. It is never killed from here, and its record stays unless its
 * port then refuses connections. On Windows the stop runs the same shutdown (untested).
 */
export async function stopServe(out: string, { record }: Running): Promise<StopOutcome> {
	const accepted = (await control(record, 'POST'))?.status === 202;
	const end = Date.now() + STOP_MS;
	while (accepted && Date.now() < end && readRecord(out)?.instance === record.instance) {
		await sleep(50);
	}
	if (await refused(record.port)) {
		// A serve that did not get to exit cleanly could not remove the record
		removeRecord(out, record.instance);
		return 'stopped';
	}
	return (await ask(record)) ? 'still answers' : 'port open';
}

const notStopped = (out: string, { record, status }: Running, outcome: StopOutcome) =>
	outcome === 'still answers'
		? `the serve for ${out} (pid ${status.pid}) still answers ${STOP_MS / 1000} s after it was asked to stop`
		: `the serve for ${out} (pid ${status.pid}) stopped answering, but port ${record.port} still accepts connections, so its record is kept. Try again in a minute, or stop the process on port ${record.port}`;

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
	// The time window, not the file's mode, bounds a lock nobody releases: one a cloned repository
	// ships is long past, and one dated ahead is refused, so even a file system that keeps no
	// modes keeps the lock
	const age = Date.now() - at;
	if (age > LOCK_STALE_MS || age < -LOCK_SKEW_MS) return false;
	try {
		// Signal 0 sends nothing; it only asks whether the pid exists
		process.kill(pid as number, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** The lock's text; null when there is none, false when it is a link or not a regular file. */
const lockText = (out: string, name = SERVE_LOCK_FILE): string | null | false => {
	const read = readOutFile(out, name, 256);
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
		// A link or a folder is no start's lock
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
		if (exited)
			return { ok: false, message: 'serve exited before it was ready', log: readLog(out) };
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
		const found = await findServe(out);
		if (found.kind === 'unproven') return { kind: 'failed', message: found.problem, log: '' };
		const running = found.kind === 'running' ? found.running : null;
		if (running && fits(running.status, want)) return { kind: 'reused', running };
		const outcome = running ? await stopServe(out, running) : 'stopped';
		if (outcome !== 'stopped') {
			const message = `the serve for ${out} runs with other options and was not replaced: ${notStopped(out, running!, outcome)}`;
			return { kind: 'failed', message, log: '' };
		}
		const launched = await launchDetached(out, want.entry, want.args);
		if (launched.ok) {
			const { running: started, log } = launched;
			return { kind: 'started', running: started, log, replaced: running?.status ?? null };
		}
		// A serve started in a terminal meanwhile may hold the port for this folder
		const now = await findServe(out);
		if (now.kind === 'running' && fits(now.running.status, want)) {
			return { kind: 'reused', running: now.running };
		}
		return { kind: 'failed', message: launched.message, log: launched.log };
	} finally {
		unlock();
	}
}

const STOP_USAGE = 'usage: ropeman stop --out <folder>';

/**
 * `ropeman stop --out OUT`: asks the serve running for OUT to stop. With none answering and its
 * port refused it only removes the stale record and says so. Nothing running is not an error; a
 * serve that does not stop, or a record that may still point to one, is.
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
	const found = await findServe(folder);
	if (found.kind === 'unproven') {
		env.err(`Cannot stop: ${found.problem}.`);
		return 1;
	}
	if (found.kind !== 'running') {
		const removed = found.kind === 'stale' && removeStale(folder, found.instance);
		env.out(JSON.stringify({ stopped: false, staleRecordRemoved: removed }, null, 1));
		return 0;
	}
	const { running } = found;
	const outcome = await stopServe(folder, running);
	if (outcome !== 'stopped') {
		env.err(`Cannot stop: ${notStopped(folder, running, outcome)}.`);
		return 1;
	}
	env.out(
		JSON.stringify({ stopped: true, pid: running.status.pid, port: running.record.port }, null, 1)
	);
	return 0;
}
