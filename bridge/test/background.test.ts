import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';
import { HOST } from '../src/bridge';
import { readRecord, type ServeRecord } from '../src/background';
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

describe.skipIf(process.platform === 'win32')('serve in the background', () => {
	let bundle: string;
	let bases: string[] = [];

	// The packaged CLI, built into a folder of this run's: the detached serve is a real process
	beforeAll(async () => {
		const cache = path.join(repo, 'node_modules', '.cache');
		fs.mkdirSync(cache, { recursive: true });
		// Under node_modules, so the bundle finds `ws`, its one runtime dependency
		const outDir = fs.mkdtempSync(path.join(cache, 'ropeman-bridge-test-'));
		await build({
			configFile: path.join(repo, 'bridge/vite.config.ts'),
			logLevel: 'silent',
			build: { outDir, emptyOutDir: true }
		});
		bundle = path.join(outDir, 'server.mjs');
	}, 60_000);

	afterAll(() => fs.rmSync(path.dirname(bundle), { recursive: true, force: true }));

	afterEach(async () => {
		for (const base of bases) {
			const record = readRecord(path.join(base, 'project', '.ropeman'));
			if (record && alive(record.pid)) {
				process.kill(record.pid, 'SIGKILL');
				await until(() => !alive(record.pid));
			}
			fs.rmSync(base, { recursive: true, force: true });
		}
		bases = [];
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
		return { root, out: path.join(root, '.ropeman'), viewer };
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
		expect(alive(server.pid)).toBe(true);
		expect(server).toMatchObject({ port, root: p.root, open: `http://${HOST}:${port}/` });
		expect(reply).toMatchObject({ id: 1, type: 'map.get' });
		expect('result' in reply && reply.result.levels.length).toBeGreaterThan(0);
		// The token is printed for the agent to give the user, and kept out of the log file
		const log = fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8');
		expect(log).toContain(`Local mode at http://${HOST}:${port}/`);
		expect(log).not.toContain(TOKEN);
		expect(fs.readFileSync(path.join(p.out, SERVE_FILE), 'utf8')).not.toContain(TOKEN);
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
	}, 30_000);

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
		expect(alive(first.pid)).toBe(false);
		expect(record(p.out)).toMatchObject({ port, open: `http://${HOST}:${port}/` });
		expect(record(p.out).pid).not.toBe(first.pid);
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
		expect(JSON.parse(again.stdout)).toEqual({ stopped: false });
		expect(fs.readFileSync(path.join(p.out, SERVE_LOG_FILE), 'utf8')).toContain('Server stopped');
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

	it('never signals a recorded pid that no serve of its own answers for', async () => {
		// Arrange: a record (planted by a cloned repo, or its pid reused) names an unrelated process
		const p = project();
		fs.mkdirSync(p.out, { recursive: true });
		const bystander = spawn('/bin/sleep', ['30']);
		fs.writeFileSync(
			path.join(p.out, SERVE_FILE),
			JSON.stringify({
				pid: bystander.pid,
				port: await freePort(),
				instance: 'planted',
				root: p.root,
				open: null,
				idleMinutes: 0,
				startedAt: new Date().toISOString(),
				version: '0.3.0'
			})
		);

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);

		// Assert
		expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false });
		expect(alive(bystander.pid!)).toBe(true);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
		bystander.kill('SIGKILL');
	}, 30_000);

	it('ignores a planted record with a pid of 0 or a port out of range', async () => {
		// Arrange: process.kill(0) would signal this whole process group
		const p = project();
		fs.mkdirSync(p.out, { recursive: true });
		const planted = {
			instance: 'x',
			root: p.root,
			open: null,
			idleMinutes: 0,
			startedAt: '',
			version: ''
		};
		fs.writeFileSync(
			path.join(p.out, SERVE_FILE),
			JSON.stringify({ ...planted, pid: 0, port: 70000 })
		);

		// Act
		const stopped = await ropeman(['stop', '--out', p.out]);
		const started = await start(p, await freePort());

		// Assert
		expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false });
		expect(started.code).toBe(0);
		expect(record(p.out).pid).toBeGreaterThan(0);
	}, 30_000);

	it('reports a serve that cannot start and leaves no record', async () => {
		// Arrange
		const p = project();
		const holder = net.createServer();
		const port = await new Promise<number>((resolve) =>
			holder.listen(0, HOST, () => resolve((holder.address() as net.AddressInfo).port))
		);

		// Act
		const run = await start(p, port);
		holder.close();

		// Assert
		expect(run.code).toBe(1);
		expect(run.stderr).toContain(`Port ${port} is already in use`);
		expect(fs.existsSync(path.join(p.out, SERVE_FILE))).toBe(false);
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
