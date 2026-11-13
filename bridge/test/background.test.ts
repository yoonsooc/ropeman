import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChildProcess, execFile, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';
import { HOST } from '../src/bridge';
import { readRecord, type ServeRecord, writeRecord } from '../src/background';
import { SERVE_FILE, SERVE_LOG_FILE } from '../src/workFolder';
import { parseServerMessage } from '../../src/lib/services/ropemanMapSchema';
import type { ServerMessage } from '../../src/lib/types/ropemanMap';

const TOKEN = 'background-test-token-42';
const repo = fileURLToPath(new URL('../..', import.meta.url));
/** node and the shell tools, and no `claude`: serve queues folders instead of calling a model */
const PATH = [path.dirname(process.execPath), '/bin', '/usr/bin'].join(path.delimiter);
const env = { ...process.env, PATH, ROPEMAN_BRIDGE_TOKEN: TOKEN };

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.on('error', reject);
		probe.listen(0, HOST, () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const until = async (check: () => boolean, ms = 10_000) => {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out waiting');
		await new Promise((r) => setTimeout(r, 20));
	}
};

/** The serve processes started for `base`: every one carries `--root <base>/project`. */
function servesOf(base: string): number[] {
	try {
		return execFileSync('pgrep', ['-f', `${base}/project`], { encoding: 'utf8' })
			.split('\n')
			.filter(Boolean)
			.map(Number);
	} catch {
		return [];
	}
}

interface Run {
	code: number;
	stdout: string;
	stderr: string;
}

/** One map.get over a fresh socket: what a page does when it opens. */
async function mapGet(port: number): Promise<ServerMessage> {
	const ws = new WebSocket(`ws://${HOST}:${port}/?token=${TOKEN}`);
	try {
		return await new Promise((resolve, reject) => {
			ws.onerror = () => reject(new Error('socket error'));
			ws.onmessage = (ev) => {
				const parsed = parseServerMessage(String(ev.data));
				if (!parsed.ok) return reject(new Error(parsed.message));
				if (parsed.value.type === 'hello') ws.send(JSON.stringify({ id: 1, type: 'map.get' }));
				else if ('id' in parsed.value && parsed.value.id === 1) resolve(parsed.value);
			};
		});
	} finally {
		ws.close();
	}
}

/** A loopback listener that answers every request with `answer`, as a stranger on a port would. */
async function listener(answer: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
	const server = http.createServer(answer);
	const port = await new Promise<number>((resolve) =>
		server.listen(0, HOST, () => resolve((server.address() as net.AddressInfo).port))
	);
	return { server, port };
}

describe.skipIf(process.platform === 'win32')('serve in the background', () => {
	let outDir: string | undefined;
	let bundle: string;
	let bases: string[] = [];
	let listeners: { close(): unknown }[] = [];
	let children: ChildProcess[] = [];

	// The packaged CLI, built into a folder of this run's: the detached serve is a real process
	beforeAll(async () => {
		const cache = path.join(repo, 'node_modules', '.cache');
		fs.mkdirSync(cache, { recursive: true });
		// Under node_modules, so the bundle finds `ws`, its one runtime dependency
		outDir = fs.mkdtempSync(path.join(cache, 'ropeman-bridge-test-'));
		await build({
			configFile: path.join(repo, 'bridge/vite.config.ts'),
			logLevel: 'silent',
			build: { outDir, emptyOutDir: true }
		});
		bundle = path.join(outDir, 'server.mjs');
	}, 60_000);

	afterAll(() => {
		if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
	});

	// Runs when a test fails before any record exists, too: every serve carries its base path
	afterEach(async () => {
		for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
		for (const server of listeners) server.close();
		for (const base of bases) {
			const pids = servesOf(base);
			for (const pid of pids) process.kill(pid, 'SIGKILL');
			await until(() => pids.every((pid) => !alive(pid)));
			fs.rmSync(base, { recursive: true, force: true });
		}
		bases = [];
		listeners = [];
		children = [];
	});

	/** A small project, its `.ropeman` folder and a `--viewer` folder for local mode. */
	function project() {
		// The real path (macOS: /private/var), as serve resolves --root and --out
		const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-bg-')));
		bases.push(base);
		const root = path.join(base, 'project');
		fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
		fs.writeFileSync(path.join(root, 'src', 'lib', 'math.ts'), 'export function add() {}\n');
		fs.writeFileSync(path.join(root, 'src', 'index.ts'), "import { add } from './lib/math';\n");
		const viewer = path.join(base, 'viewer');
		fs.mkdirSync(viewer);
		fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>v</title>');
		return { base, root, out: path.join(root, '.ropeman'), viewer };
	}

	function ropeman(args: string[]): Promise<Run> {
		return new Promise((resolve) => {
			execFile(process.execPath, [bundle, ...args], { env }, (err, stdout, stderr) =>
				resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr })
			);
		});
	}

	const start = (p: ReturnType<typeof project>, port: number, ...extra: string[]) =>
		ropeman([
			'serve',
			'--root',
			p.root,
			'--out',
			p.out,
			'--port',
			String(port),
			'--detach',
			...extra
		]);

	/** `serve` without --detach, as in a terminal; resolves once its output matches `ready`. */
	async function foreground(p: ReturnType<typeof project>, port: number, ready: RegExp) {
		const child = spawn(
			process.execPath,
			[bundle, 'serve', '--root', p.root, '--out', p.out, '--port', String(port)],
			{ env, stdio: ['ignore', 'pipe', 'pipe'] }
		);
		children.push(child);
		let output = '';
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`no ${ready} in: ${output}`)), 15_000);
			const take = (d: Buffer) => {
				output += d;
				if (ready.test(output)) {
					clearTimeout(timer);
					resolve();
				}
			};
			child.stdout!.on('data', take);
			child.stderr!.on('data', take);
		});
		return { child, output: () => output };
	}

	/**
	 * A planted record, valid in every field of this version's record and of 0.3.0's (`root`,
	 * `open`, `idleMinutes`), so a test of an attack on 0.3.0 runs that attack on it; mode 0600
	 * unless given.
	 */
	function plant(out: string, fields: Record<string, unknown>, mode = 0o600) {
		fs.mkdirSync(out, { recursive: true });
		const file = path.join(out, SERVE_FILE);
		fs.writeFileSync(
			file,
			JSON.stringify({
				pid: 1,
				port: 1,
				instance: 'planted',
				secret: 'planted-secret-planted-secret-planted-secret',
				startedAt: new Date().toISOString(),
				version: '0.3.0',
				root: null,
				open: null,
				idleMinutes: 0,
				...fields
			})
		);
		fs.chmodSync(file, mode);
	}

	const record = (out: string) => readRecord(out) as ServeRecord;

	it('keeps serving after the shell that started it and its process group are killed', async () => {
		// Arrange: a shell like an agent's background task, which its time limit kills as a group
		const p = project();
		const port = await freePort();
		const shell = spawn(
			'/bin/sh',
			[
				'-c',
				'"$0" "$1" serve --root "$2" --out "$3" --viewer "$4" --port "$5" --detach; echo "launcher exited $?"; sleep 60',
				process.execPath,
				bundle,
				p.root,
				p.out,
				p.viewer,
				String(port)
			],
			{ env, detached: true, stdio: ['ignore', 'pipe', 'inherit'] }
		);
		children.push(shell);
		let stdout = '';
		shell.stdout!.on('data', (d) => (stdout += d));
		await until(() => stdout.includes('launcher exited'));
		const server = record(p.out);

		// Act
		process.kill(-shell.pid!, 'SIGKILL');
		await until(() => shell.exitCode !== null || shell.signalCode !== null);
		const reply = await mapGet(port);

		// Assert
		expect(stdout).toContain('launcher exited 0');
		expect(stdout).toContain(`Local mode: open http://${HOST}:${port}/#token=${TOKEN}`);
		expect(stdout).toContain(`ropeman stop --out ${p.out}`);
		expect(alive(server.pid)).toBe(true);
		expect(server.port).toBe(port);
		expect(reply).toMatchObject({ id: 1, type: 'map.get' });
		expect('result' in reply && reply.result.levels.length).toBeGreaterThan(0);
		// The token is printed for the agent to give the user, and kept out of the log file
		const log = fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8');
		expect(log).toContain(`Local mode at http://${HOST}:${port}/`);
		expect(log).not.toContain(TOKEN);
		expect(fs.readFileSync(path.join(p.out, SERVE_FILE), 'utf8')).not.toContain(TOKEN);
		// The record holds the control secret, so only this user reads it
		expect(fs.statSync(path.join(p.out, SERVE_FILE)).mode & 0o777).toBe(0o600);
	}, 30_000);

	it('reuses the serve already running for the same folder', async () => {
		// Arrange
		const p = project();
		const port = await freePort();
		await start(p, port, '--viewer', p.viewer);
		const first = record(p.out);

		// Act: the agent runs its start command again, even with another port
		const again = await start(p, await freePort(), '--viewer', p.viewer);

		// Assert
		expect(again.code).toBe(0);
		expect(again.stdout).toContain(`serve already runs for ${p.out} (pid ${first.pid}`);
		expect(again.stdout).toContain(`Local mode: open http://${HOST}:${port}/#token=${TOKEN}`);
		expect(record(p.out)).toEqual(first);
		// The running serve's log stays
		expect(fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8')).toContain(
			'Bridge server ready'
		);
	}, 30_000);

	it('ends two starts at the same moment with one serve, which both report', async () => {
		// Arrange
		const p = project();
		const [a, b] = [await freePort(), await freePort()];

		// Act
		const began = Date.now();
		const runs = await Promise.all([
			start(p, a, '--viewer', p.viewer),
			start(p, b, '--viewer', p.viewer)
		]);

		// Assert
		const { port } = record(p.out);
		const address = `Local mode: open http://${HOST}:${port}/#token=${TOKEN}`;
		expect(runs.map((run) => run.code)).toEqual([0, 0]);
		expect(runs.filter((run) => run.stdout.includes(address))).toHaveLength(2);
		expect(servesOf(p.base)).toHaveLength(1);
		// Not by the loser waiting out its 30 s for a record the winner overwrote
		expect(Date.now() - began).toBeLessThan(20_000);
		expect(await mapGet(port)).toMatchObject({ type: 'map.get' });
	}, 60_000);

	it('replaces a running serve that was started with other options', async () => {
		// Arrange: started without the viewer, then asked for local mode
		const p = project();
		await start(p, await freePort());
		const first = record(p.out);

		// Act
		const port = await freePort();
		const run = await start(p, port, '--viewer', p.viewer);

		// Assert
		expect(run.code).toBe(0);
		expect(run.stdout).toContain(`Stopped the serve for ${p.out} that ran with other options`);
		expect(run.stdout).toContain(`Local mode: open http://${HOST}:${port}/#token=${TOKEN}`);
		expect(alive(first.pid)).toBe(false);
		expect(record(p.out).port).toBe(port);
		expect(record(p.out).pid).not.toBe(first.pid);
	}, 30_000);

	it('leaves a serve started in a terminal alone, and is left alone by it', async () => {
		// Arrange
		const p = project();
		const port = await freePort();
		await start(p, port);
		const detached = record(p.out);

		// Act: a terminal's serve on another port, then one on the same port
		const other = await foreground(p, await freePort(), /Another serve runs for/);
		const clash = await foreground(p, port, /already in use/);
		await until(() => clash.child.exitCode !== null);

		// Assert
		expect(other.output()).toContain('Bridge server ready');
		expect(other.child.exitCode).toBe(null);
		expect(clash.child.exitCode).toBe(1);
		expect(alive(detached.pid)).toBe(true);
		expect(record(p.out)).toEqual(detached);
	}, 30_000);

	it('stops with ropeman stop, which removes the record and can run again', async () => {
		// Arrange
		const p = project();
		const port = await freePort();
		await start(p, port);
		const { pid } = record(p.out);

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);
		const again = await ropeman(['stop', '--out', p.out]);

		// Assert
		expect(stopped.code).toBe(0);
		expect(JSON.parse(stopped.stdout)).toEqual({ stopped: true, pid, port });
		expect(alive(pid)).toBe(false);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
		expect(JSON.parse(again.stdout)).toEqual({ stopped: false, staleRecordRemoved: false });
		const log = fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8');
		expect(log).toContain('Asked to stop (ropeman stop).');
		expect(log).toContain('Server stopped');
	}, 30_000);

	it('removes the record of a serve that was killed and says so', async () => {
		// Arrange
		const p = project();
		await start(p, await freePort());
		const dead = record(p.out);
		process.kill(dead.pid, 'SIGKILL');
		await until(() => !alive(dead.pid));

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);

		// Assert
		expect(stopped.code).toBe(0);
		expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false, staleRecordRemoved: true });
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
	}, 30_000);

	it('stops itself after the idle time, not while a page is connected', async () => {
		// Arrange: 0.02 minutes is 1.2 s
		const p = project();
		const port = await freePort();
		const run = await start(p, port, '--idle-minutes', '0.02');
		const { pid } = record(p.out);
		const ws = new WebSocket(`ws://${HOST}:${port}/?token=${TOKEN}`);
		await new Promise((resolve) => (ws.onopen = resolve));

		// Act
		await new Promise((r) => setTimeout(r, 2_500));
		const aliveWithPage = alive(pid);
		ws.close();
		await until(() => !alive(pid), 10_000);

		// Assert
		expect(run.stdout).toContain('It stops after 0.02 minutes with no page open');
		expect(aliveWithPage).toBe(true);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
		expect(fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8')).toContain(
			'No page open for 0.02 minutes.'
		);
	}, 30_000);

	it('stops after the idle time while a page polls the port without the token', async () => {
		// Arrange: local mode, so the poll loads the viewer page, which needs no token
		const p = project();
		const port = await freePort();
		await start(p, port, '--viewer', p.viewer, '--idle-minutes', '0.02');
		const { pid } = record(p.out);
		const loads: number[] = [];
		const poll = setInterval(() => {
			http
				.get({ host: HOST, port, path: '/' }, (res) => {
					loads.push(res.statusCode ?? 0);
					res.resume();
				})
				.on('error', () => {});
		}, 100);

		// Act
		try {
			await until(() => !alive(pid), 10_000);
		} finally {
			clearInterval(poll);
		}

		// Assert
		expect(loads.filter((status) => status === 200).length).toBeGreaterThan(3);
		expect(fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8')).toContain(
			'No page open for 0.02 minutes.'
		);
	}, 30_000);

	it('replaces a record whose process is gone', async () => {
		// Arrange: a serve killed with SIGKILL leaves its record behind
		const p = project();
		await start(p, await freePort());
		const dead = record(p.out);
		process.kill(dead.pid, 'SIGKILL');
		await until(() => !alive(dead.pid));

		// Act
		const port = await freePort();
		const run = await start(p, port);

		// Assert
		expect(run.code).toBe(0);
		expect(record(p.out).pid).not.toBe(dead.pid);
		expect(record(p.out).port).toBe(port);
		expect(await mapGet(port)).toMatchObject({ type: 'map.get' });
	}, 30_000);

	it('never signals the pid of a planted record whose port answers like 0.3.0 serve', async () => {
		// Arrange: the review's repro. The pid names an unrelated process, and the port a listener
		// that sends the instance header 0.3.0 trusted
		const p = project();
		const bystander = spawn('/bin/sleep', ['30']);
		children.push(bystander);
		const stranger = await listener((_req, res) =>
			res.writeHead(200, { 'x-ropeman-instance': 'planted' }).end()
		);
		listeners.push(stranger.server);
		plant(p.out, { pid: bystander.pid, port: stranger.port });

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);

		// Assert: 0.3.0 killed the bystander here. Something listens on the port, so the record stays
		expect(alive(bystander.pid!)).toBe(true);
		expect(stopped.code).toBe(1);
		expect(stopped.stderr).toContain(`nothing on port ${stranger.port} answered as the serve in`);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(true);
	}, 30_000);

	it('never signals a pid even when a listener knows the planted secret', async () => {
		// Arrange: a stranger that answers the control requests as serve would
		const p = project();
		const bystander = spawn('/bin/sleep', ['30']);
		children.push(bystander);
		let port = 0;
		const stranger = await listener((req, res) => {
			if (req.method === 'POST') return void res.writeHead(202).end();
			const status = { instance: 'planted', pid: bystander.pid, port, root: p.root };
			res
				.writeHead(200)
				.end(JSON.stringify({ ...status, entry: null, idleMinutes: 0, version: '' }));
		});
		listeners.push(stranger.server);
		port = stranger.port;
		plant(p.out, { pid: bystander.pid, port });

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);

		// Assert: it reports a serve that did not stop and leaves the process alone
		expect(stopped.code).toBe(1);
		expect(stopped.stderr).toContain('still answers');
		expect(alive(bystander.pid!)).toBe(true);
	}, 30_000);

	it('removes a record others can read once nothing listens on its port, as a cloned repository ships it', async () => {
		// Arrange: git checks files out 0644
		const p = project();
		plant(p.out, { port: await freePort() }, 0o644);

		// Act
		const port = await freePort();
		const run = await start(p, port);

		// Assert
		expect(run.code).toBe(0);
		expect(record(p.out).port).toBe(port);
		expect(record(p.out).instance).not.toBe('planted');
	}, 30_000);

	it('never trusts a record others can read while its port answers, and starts no serve', async () => {
		// Arrange: a 0644 record and a listener that answers for its secret
		const p = project();
		let strangerPort = 0;
		const stranger = await listener((_req, res) => {
			const status = { instance: 'planted', pid: 1, port: strangerPort, root: p.root };
			res
				.writeHead(200)
				.end(JSON.stringify({ ...status, entry: null, idleMinutes: 0, version: '' }));
		});
		listeners.push(stranger.server);
		strangerPort = stranger.port;
		plant(p.out, { port: strangerPort, open: 'http://evil.example/' }, 0o644);

		// Act
		const run = await start(p, await freePort());

		// Assert
		expect(run.code).toBe(1);
		expect(run.stderr).toContain('is not a private file of this user (mode 644)');
		expect(run.stdout + run.stderr).not.toContain('already runs');
		expect(run.stdout + run.stderr).not.toContain('evil.example');
		expect(fs.readFileSync(path.join(p.out, SERVE_FILE), 'utf8')).toContain('"planted"');
		expect(servesOf(p.base)).toEqual([]);
	}, 30_000);

	it('keeps a record that is not private while its serve runs, and says how to recover', async () => {
		// Arrange: the mode a file system that keeps no modes (exFAT, SMB, NFS) reports
		const p = project();
		const port = await freePort();
		await start(p, port);
		const kept = record(p.out);
		const file = path.join(p.out, SERVE_FILE);
		fs.chmodSync(file, 0o644);

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);
		const again = await start(p, await freePort());
		const serves = servesOf(p.base);
		const reply = await mapGet(port);
		// The recovery the message names
		fs.chmodSync(file, 0o600);
		const recovered = await ropeman(['stop', '--out', p.out]);

		// Assert
		expect(stopped.code).toBe(1);
		expect(stopped.stderr).toContain('is not a private file of this user (mode 644)');
		expect(stopped.stderr).toContain(`run chmod 600 ${file} and try again`);
		expect(again.code).toBe(1);
		expect(again.stderr).toContain('mode 644');
		expect(serves).toEqual([kept.pid]);
		expect(reply).toMatchObject({ type: 'map.get' });
		expect(JSON.parse(recovered.stdout)).toEqual({ stopped: true, pid: kept.pid, port });
	}, 30_000);

	it('keeps the record of a serve too busy to answer, and starts no second one', async () => {
		// Arrange: a stopped process accepts connections and answers none, as an event loop blocked
		// past the 5 s probe
		const p = project();
		const port = await freePort();
		await start(p, port);
		const busy = record(p.out);
		process.kill(busy.pid, 'SIGSTOP');

		// Act
		let stopped: Run;
		let again: Run;
		try {
			stopped = await ropeman(['stop', '--out', p.out]);
			again = await start(p, await freePort());
		} finally {
			process.kill(busy.pid, 'SIGCONT');
		}
		const reply = await mapGet(port);

		// Assert
		expect(stopped.code).toBe(1);
		expect(stopped.stderr).toContain(`answered as the serve in ${p.out}/serve.json within 5 s`);
		expect(again.code).toBe(1);
		expect(record(p.out)).toEqual(busy);
		expect(servesOf(p.base)).toEqual([busy.pid]);
		expect(reply).toMatchObject({ type: 'map.get' });
	}, 40_000);

	it('ignores a planted record with a pid of 0 or a port out of range', async () => {
		// Arrange: process.kill(0) would signal this whole process group
		const p = project();
		plant(p.out, { pid: 0, port: 70000 });

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);
		const started = await start(p, await freePort());

		// Assert
		expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false, staleRecordRemoved: true });
		expect(started.code).toBe(0);
		expect(record(p.out).pid).toBeGreaterThan(0);
	}, 30_000);

	it('reports a serve that cannot start and leaves no record', async () => {
		// Arrange
		const p = project();
		const holder = net.createServer();
		listeners.push(holder);
		const port = await new Promise<number>((resolve) =>
			holder.listen(0, HOST, () => resolve((holder.address() as net.AddressInfo).port))
		);

		// Act
		const run = await start(p, port);

		// Assert
		expect(run.code).toBe(1);
		expect(run.stderr).toContain('Cannot start: serve exited before it was ready.');
		expect(run.stderr).toContain(`Port ${port} is already in use`);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
	}, 30_000);

	it('says it cannot start when serve.log cannot be opened, with no stack trace', async () => {
		// Arrange
		const p = project();
		fs.mkdirSync(path.join(p.out, SERVE_LOG_FILE), { recursive: true });

		// Act
		const run = await start(p, await freePort());

		// Assert
		expect(run.code).toBe(1);
		expect(run.stderr).toMatch(/^Cannot start: .*serve\.log: /);
		expect(run.stderr).not.toMatch(/\n\s+at /);
		expect(servesOf(p.base)).toEqual([]);
	}, 30_000);

	it('replaces a planted serve.log link instead of writing through it', async () => {
		// Arrange
		const p = project();
		fs.mkdirSync(p.out, { recursive: true });
		const victim = path.join(path.dirname(p.root), 'victim.txt');
		fs.writeFileSync(victim, 'keep me\n');
		fs.symlinkSync(victim, path.join(p.out, SERVE_LOG_FILE));

		// Act
		const run = await start(p, await freePort());

		// Assert
		expect(run.code).toBe(0);
		expect(fs.readFileSync(victim, 'utf8')).toBe('keep me\n');
		expect(fs.lstatSync(path.join(p.out, SERVE_LOG_FILE)).isSymbolicLink()).toBe(false);
	}, 30_000);

	it('needs --out to detach', async () => {
		// Arrange
		const p = project();

		// Act
		const run = await ropeman(['serve', '--root', p.root, '--detach']);

		// Assert
		expect(run.code).toBe(1);
		expect(run.stderr).toContain('--detach needs --out');
	});
});

describe.skipIf(process.platform === 'win32')('writeRecord', () => {
	const record: ServeRecord = {
		pid: process.pid,
		port: 9999,
		instance: 'mine',
		secret: 'a-secret-long-enough-to-be-a-record-secret',
		startedAt: new Date().toISOString(),
		version: '0.3.1'
	};
	let out: string;

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(out, { recursive: true, force: true });
	});

	it('keeps a record that reads back private', () => {
		// Arrange
		out = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-record-'));

		// Act
		const exposed = writeRecord(out, record);

		// Assert
		expect(exposed).toBe(null);
		expect(readRecord(out)).toEqual(record);
	});

	it("removes a record the file system reports as others' too, and says what it reported", () => {
		// Arrange: the mode a mount that keeps no modes reports for every file
		out = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-record-'));
		const fstat = fs.fstatSync;
		vi.spyOn(fs, 'fstatSync').mockImplementation(((fd: number) => {
			const stat = fstat(fd);
			stat.mode = (stat.mode & ~0o777) | 0o755;
			return stat;
		}) as typeof fs.fstatSync);

		// Act
		const exposed = writeRecord(out, record);

		// Assert
		expect(exposed).toBe('mode 755');
		expect(fs.existsSync(path.join(out, SERVE_FILE))).toBe(false);
	});
});
