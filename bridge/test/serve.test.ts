import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBridgeServer, HOST, MAX_NAMINGS_IN_FLIGHT } from '../src/bridge';
import { CliRunner, KILL_GRACE_MS } from '../src/cli';
import { resolveRoot } from '../src/fileRead';
import { MapSession, type NamingOptions } from '../src/mapSession';
import { parseServerMessage } from '../../src/lib/services/ropemanMapSchema';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { extractDirectory } from '../../packages/core/src/extract';
import type { MapLevel, RopemanMap, ServerMessage } from '../../src/lib/types/ropemanMap';

const TOKEN = 'serve-test-token-0123';
const FAKE_CLI = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
const WASM_DIR = fileURLToPath(new URL('../../static', import.meta.url));
const SECRET = 'hunter2-never-leaves';
const BODY_MARKER = 'BODY_MARKER_7f3a';
const SERVER = { name: '@ropeman/bridge', version: 'test' };

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

const until = async (check: () => boolean, ms = 5_000) => {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out waiting');
		await new Promise((r) => setTimeout(r, 20));
	}
};

/** A small project: two folders under src with an import between them, files in src, a real .env. */
function makeProject(base: string): string {
	const root = path.join(base, 'project');
	const write = (rel: string, text: string) => {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	};
	write(
		'src/app/main.ts',
		`import { add } from '../lib/math';\nexport function start() {\n\tconst note = '${BODY_MARKER}';\n\treturn add(1, 2) + note.length;\n}\n`
	);
	write('src/app/routes.ts', `import { start } from './main';\nexport const routes = [start];\n`);
	write('src/lib/math.ts', 'export function add(a: number, b: number) {\n\treturn a + b;\n}\n');
	write('src/lib/strings.ts', 'export function pad(s: string) {\n\treturn ` ${s}`;\n}\n');
	write('src/index.ts', `import { start } from './app/main';\nstart();\n`);
	write('.env', `SECRET_VALUE=${SECRET}\n`);
	write('tools/build.ts', 'export function build() {}\n');
	return root;
}

/** A socket client that parses every server message with the viewer's parser. */
class Client {
	readonly messages: ServerMessage[] = [];
	readonly unparsed: string[] = [];
	private nextId = 1;
	private constructor(private readonly ws: WebSocket) {
		ws.onmessage = (ev) => {
			const parsed = parseServerMessage(String(ev.data));
			if (parsed.ok) this.messages.push(parsed.value);
			else this.unparsed.push(String(ev.data));
		};
	}

	static async open(port: number): Promise<Client> {
		const ws = new WebSocket(`ws://${HOST}:${port}/?token=${TOKEN}`);
		const client = new Client(ws);
		await new Promise((resolve, reject) => {
			ws.onopen = resolve;
			ws.onerror = () => reject(new Error('socket error'));
		});
		await client.wait((m) => m.type === 'hello');
		return client;
	}

	async wait(match: (m: ServerMessage) => boolean, ms = 10_000): Promise<ServerMessage> {
		await until(() => this.messages.some(match), ms);
		return this.messages.find(match)!;
	}

	sendRaw(text: string) {
		this.ws.send(text);
	}

	async request(msg: Record<string, unknown>): Promise<ServerMessage> {
		const id = this.nextId++;
		this.ws.send(JSON.stringify({ id, ...msg }));
		return this.wait((m) => 'id' in m && m.id === id);
	}

	named(nodeId: string) {
		return this.wait((m) => m.type === 'node.named' && m.nodeId === nodeId, 15_000);
	}

	close() {
		this.ws.close();
	}
}

interface Serve {
	port: number;
	root: string;
	cliDir: string;
	namingDir: string;
	calls: () => { args: string[]; stdin: string; cwd: string; pid: number }[];
	/** The pids a fork step recorded: the fake CLI and the grandchild it started */
	forks: () => { pid: number; grandchild: number }[];
	close: () => Promise<void>;
}

describe.skipIf(process.platform === 'win32')('ropeman serve', () => {
	type Bridge = ReturnType<typeof createBridgeServer>;
	let servers: Bridge[] = [];
	let bases: string[] = [];

	afterEach(async () => {
		for (const { server, clients, close } of servers) {
			for (const ws of clients) ws.terminate();
			server.closeAllConnections();
			await close();
		}
		for (const base of bases) fs.rmSync(base, { recursive: true, force: true });
		servers = [];
		bases = [];
	});

	async function serve(
		options: { plan?: string[]; naming?: Partial<NamingOptions> | null } = {}
	): Promise<Serve> {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-serve-'));
		bases.push(base);
		const root = resolveRoot(makeProject(base));
		const cliDir = path.join(base, 'cli');
		const namingDir = path.join(base, 'naming-cwd');
		fs.mkdirSync(cliDir);
		fs.mkdirSync(namingDir);
		fs.writeFileSync(path.join(cliDir, 'plan.json'), JSON.stringify(options.plan ?? []));
		process.env.FAKE_CLI_DIR = cliDir;
		const port = await freePort();
		const runner = new CliRunner(2, namingDir);
		const session = new MapSession({
			root,
			wasmDir: WASM_DIR,
			naming:
				options.naming === null
					? null
					: {
							cli: 'claude',
							command: FAKE_CLI,
							timeoutMs: 10_000,
							maxOutputBytes: 1_000_000,
							runner,
							...options.naming
						},
			server: SERVER,
			// macOS delivers watch events in batches about 50 ms apart; a shorter debounce splits a burst
			debounceMs: 150,
			log: () => {}
		});
		const bridge = createBridgeServer({
			port,
			token: TOKEN,
			allowedOrigins: new Set(),
			root,
			viewerDir: null,
			session,
			runner,
			server: SERVER
		});
		servers.push(bridge);
		await new Promise<void>((resolve) => bridge.server.listen(port, HOST, resolve));
		const records = (sub: string) =>
			fs.existsSync(path.join(cliDir, sub))
				? fs
						.readdirSync(path.join(cliDir, sub))
						.sort()
						.map((f) => JSON.parse(fs.readFileSync(path.join(cliDir, sub, f), 'utf8')))
				: [];
		return {
			port,
			root,
			cliDir,
			namingDir,
			calls: () => records('calls'),
			forks: () => records('grandchildren'),
			close: bridge.close
		};
	}

	const result = <T>(m: ServerMessage): T => {
		if (!('result' in m)) throw new Error(`no result: ${JSON.stringify(m)}`);
		return m.result as T;
	};

	it('runs map.get, node.expand, node.named, file.read and map.changed end to end', async () => {
		// Arrange
		const { port, root, calls } = await serve();
		const client = await Client.open(port);

		// Act: the map, then one folder expanded and named
		const map = result<RopemanMap>(await client.request({ type: 'map.get' }));
		const grouped = result<MapLevel>(
			await client.request({ type: 'node.expand', nodeId: 'dir:src' })
		);
		const named = await client.named('dir:src');
		const file = result<{ content: string }>(
			await client.request({ type: 'file.read', path: 'src/lib/math.ts' })
		);
		fs.appendFileSync(path.join(root, 'src/lib/math.ts'), 'export const zero = 0;\n');
		const changed = await client.wait((m) => m.type === 'map.changed');
		const after = result<RopemanMap>(await client.request({ type: 'map.get' }));

		// Assert: every message parsed, the map passes the verifier, the names were verified
		expect(client.unparsed).toEqual([]);
		expect(map.levels[0].nodes.map((n) => n.id)).toEqual(['dir:src', 'dir:tools']);
		const extraction = await extractDirectory(root, { wasmDir: WASM_DIR });
		const check = verifyMap(map, extraction.map);
		expect(check.parsed && check.violations).toEqual([]);
		expect(grouped).toMatchObject({ parentId: 'dir:src', naming: 'grouped' });
		expect(grouped.nodes.map((n) => n.id)).toEqual(['dir:src/app', 'dir:src/lib', 'files:src']);
		expect(grouped.edges).toContainEqual(
			expect.objectContaining({ source: 'dir:src/app', target: 'dir:src/lib' })
		);
		expect(named).toMatchObject({
			type: 'node.named',
			level: { naming: 'named', parentId: 'dir:src' }
		});
		const level = (named as { level: MapLevel }).level;
		const lib = level.nodes.find((n) => n.id === 'dir:src/lib')!;
		expect(lib.label).toBe('Named src/lib');
		expect(lib.filePaths.toSorted()).toEqual(['src/lib/math.ts', 'src/lib/strings.ts']);
		expect(['add', 'pad']).toContain(lib.keySymbols[0]);
		expect(file.content).toContain('return a + b');
		expect(changed).toEqual({ type: 'map.changed', paths: ['src/lib/math.ts'] });
		expect(after.levels.find((l) => l.parentId === 'dir:src')?.naming).toBe('named');
		expect(calls()).toHaveLength(1);
		client.close();
	});

	it('ignores skipped paths and sends one map.changed for a burst of edits', async () => {
		// Arrange
		const { port, root } = await serve();
		const client = await Client.open(port);
		await client.request({ type: 'map.get' });

		// Act: paths the walk skips, then two edits inside one debounce window
		fs.mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
		fs.writeFileSync(path.join(root, 'node_modules/dep/index.ts'), 'export {};\n');
		fs.writeFileSync(path.join(root, '.env'), 'SECRET_VALUE=rotated\n');
		fs.writeFileSync(path.join(root, '.DS_Store'), '');
		await new Promise((r) => setTimeout(r, 300));
		const quiet = client.messages.filter((m) => m.type === 'map.changed').length;
		fs.appendFileSync(path.join(root, 'src/lib/math.ts'), '// a\n');
		fs.appendFileSync(path.join(root, 'tools/build.ts'), '// b\n');
		const changed = await client.wait((m) => m.type === 'map.changed');
		await new Promise((r) => setTimeout(r, 300));

		// Assert
		expect(quiet).toBe(0);
		expect(changed).toEqual({ type: 'map.changed', paths: ['src/lib/math.ts', 'tools/build.ts'] });
		expect(client.messages.filter((m) => m.type === 'map.changed')).toHaveLength(1);
		client.close();
	});

	it('sends the CLI structure only, from outside the project, with argv and no shell', async () => {
		// Arrange
		const { port, root, calls } = await serve();
		const client = await Client.open(port);

		// Act
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		await client.named('dir:src');

		// Assert: paths and declared names go out; no file body, no .env, no project cwd
		const [call] = calls();
		expect(call.args).toEqual([
			'-p',
			'--output-format',
			'json',
			'--no-session-persistence',
			'--strict-mcp-config',
			'--tools',
			''
		]);
		expect(call.stdin).toContain('src/lib/math.ts');
		expect(call.stdin).toContain('function add');
		expect(call.stdin).not.toContain(BODY_MARKER);
		expect(call.stdin).not.toContain('return a + b');
		expect(call.stdin).not.toContain(SECRET);
		expect(call.stdin).not.toContain('.env');
		expect(fs.realpathSync(call.cwd)).not.toContain(root);
		client.close();
	});

	it('retries once with the violations, then pushes the verified names', async () => {
		// Arrange: the first answer names a symbol no file declares
		const { port, calls } = await serve({ plan: ['bad-symbol', 'names'] });
		const client = await Client.open(port);

		// Act
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		const named = await client.named('dir:src');

		// Assert
		expect(named).toMatchObject({ level: { naming: 'named' } });
		const [, second] = calls();
		expect(second.stdin).toContain('Your previous answer was refused');
		expect(second.stdin).toContain('noSuchSymbol');
		client.close();
	});

	it('keeps the folder names and says why when the answer fails twice', async () => {
		// Arrange
		const { port, calls } = await serve({ plan: ['drop-one', 'not-json'] });
		const client = await Client.open(port);

		// Act
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		const named = await client.named('dir:src');
		const again = result<MapLevel>(
			await client.request({ type: 'node.expand', nodeId: 'dir:src' })
		);

		// Assert: no unverified level reaches the socket
		expect(named).toMatchObject({ type: 'node.named', code: 'verification-failed' });
		expect(calls()).toHaveLength(2);
		expect(again.naming).toBe('grouped');
		client.close();
	});

	it('reports a CLI that fails or times out without asking it again', async () => {
		// Arrange
		const { port, calls } = await serve({ plan: ['exit', 'hang'], naming: { timeoutMs: 800 } });
		const client = await Client.open(port);

		// Act
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		const failed = await client.named('dir:src');
		await client.request({ type: 'node.expand', nodeId: 'dir:src/app' });
		const timedOut = await client.named('dir:src/app');

		// Assert
		expect(failed).toMatchObject({ code: 'naming-failed', error: 'fake failure' });
		expect(timedOut).toMatchObject({ code: 'naming-failed' });
		expect((timedOut as { error: string }).error).toContain('800 ms');
		expect(calls()).toHaveLength(2);
		client.close();
	});

	it('kills the CLI and what it started when the only socket waiting for it closes', async () => {
		// Arrange: a CLI that forks a grandchild, like a shell or npm wrapper
		const { port, forks } = await serve({ plan: ['fork-hang'] });
		const client = await Client.open(port);
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		await until(() => forks().length === 1);
		const [{ pid, grandchild }] = forks();
		expect([alive(pid), alive(grandchild)]).toEqual([true, true]);

		// Act
		client.close();

		// Assert
		await until(() => !alive(pid) && !alive(grandchild));
	});

	it('kills the whole tree of a CLI that times out', async () => {
		// Arrange
		const { port, forks } = await serve({ plan: ['fork-hang'], naming: { timeoutMs: 500 } });
		const client = await Client.open(port);

		// Act
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		const timedOut = await client.named('dir:src');

		// Assert
		expect(timedOut).toMatchObject({ code: 'naming-failed' });
		const [{ pid, grandchild }] = forks();
		await until(() => !alive(pid) && !alive(grandchild));
		client.close();
	});

	it('closes only after a CLI tree that ignores SIGTERM is killed', async () => {
		// Arrange: the CLI and its grandchild both ignore SIGTERM
		const { port, forks, close } = await serve({ plan: ['fork-stubborn'] });
		const client = await Client.open(port);
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		await until(() => forks().length === 1);
		const [{ pid, grandchild }] = forks();

		// Act
		const started = Date.now();
		await close();
		const waited = Date.now() - started;

		// Assert: close waited for the SIGKILL, and nothing of the tree is left after it
		expect(waited).toBeGreaterThanOrEqual(KILL_GRACE_MS - 100);
		await until(() => !alive(pid) && !alive(grandchild), 1_000);
	});

	it('runs one CLI for two sockets expanding the same node and pushes to both', async () => {
		// Arrange
		const { port, calls } = await serve();
		const a = await Client.open(port);
		const b = await Client.open(port);

		// Act
		await Promise.all([
			a.request({ type: 'node.expand', nodeId: 'dir:src' }),
			b.request({ type: 'node.expand', nodeId: 'dir:src' })
		]);
		await Promise.all([a.named('dir:src'), b.named('dir:src')]);

		// Assert
		expect(calls()).toHaveLength(1);
		a.close();
		b.close();
	});

	it('answers a named node with its named level and no push', async () => {
		// Arrange
		const { port, calls } = await serve();
		const client = await Client.open(port);
		await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		await client.named('dir:src');

		// Act
		const level = result<MapLevel>(
			await client.request({ type: 'node.expand', nodeId: 'dir:src' })
		);

		// Assert
		expect(level.naming).toBe('named');
		expect(calls()).toHaveLength(1);
		client.close();
	});

	it('runs two CLIs at a time and refuses expansions past the per-connection limit', async () => {
		// Arrange: every run hangs, so each expansion stays in flight
		const { port, calls } = await serve({ plan: Array(10).fill('hang') });
		const client = await Client.open(port);
		const ids = ['dir:src', 'dir:src/app', 'dir:src/lib', 'dir:tools'];

		// Act
		for (const nodeId of ids) await client.request({ type: 'node.expand', nodeId });
		const over = await client.request({ type: 'node.expand', nodeId: 'dir:src' });
		await until(() => calls().length === 2);
		await new Promise((r) => setTimeout(r, 300));

		// Assert: two run, two wait for a slot
		expect(ids).toHaveLength(MAX_NAMINGS_IN_FLIGHT);
		expect(over).toMatchObject({ type: 'node.expand', code: 'busy' });
		expect(calls()).toHaveLength(2);
		client.close();
	});

	it('says no-cli when no CLI was found', async () => {
		// Arrange
		const { port } = await serve({ naming: null });
		const client = await Client.open(port);

		// Act
		const level = result<MapLevel>(
			await client.request({ type: 'node.expand', nodeId: 'dir:src' })
		);
		const named = await client.named('dir:src');

		// Assert
		expect(level.naming).toBe('grouped');
		expect(named).toMatchObject({ code: 'no-cli' });
		client.close();
	});

	it('answers unknown nodes and malformed messages with a code and keeps the socket', async () => {
		// Arrange
		const { port } = await serve();
		const client = await Client.open(port);

		// Act
		const unknown = await client.request({ type: 'node.expand', nodeId: 'files:src' });
		client.sendRaw(JSON.stringify({ id: 41, type: 'map.delete' }));
		client.sendRaw('{not json');
		client.sendRaw(JSON.stringify({ id: 42, type: 'node.expand' }));
		const missing = await client.wait((m) => 'id' in m && m.id === 42);
		await until(() => client.unparsed.length === 2);
		const map = await client.request({ type: 'map.get' });

		// Assert
		expect(unknown).toMatchObject({ code: 'unknown-node' });
		expect(client.unparsed.map((t) => JSON.parse(t))).toEqual([
			expect.objectContaining({ id: 41, type: 'map.delete', code: 'bad-request' }),
			expect.objectContaining({ id: 0, type: 'unknown', code: 'bad-request' })
		]);
		expect(missing).toMatchObject({ type: 'node.expand', code: 'bad-request' });
		expect('result' in map).toBe(true);
		client.close();
	});
});
