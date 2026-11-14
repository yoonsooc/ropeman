import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	runCommand,
	runMap,
	runInbox,
	runVerify,
	serveOutValue,
	type CommandEnv,
	type MapReport,
	type Work
} from '../src/mapCommand';
import {
	BRIEF_FILE,
	INBOX_READ_FILE,
	LOG_FILE,
	MAP_FILE,
	MAX_BRIEF_BYTES,
	MAX_LOG_BYTES,
	NAMES_FILE,
	QUEUE_FILE,
	WORK_FILE,
	appendLog,
	readBrief,
	readQueue,
	writeQueue,
	type LogEntry
} from '../src/workFolder';
import { CliRunner } from '../src/cli';
import { MapSession, type Subscriber } from '../src/mapSession';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { extractDirectory } from '../../packages/core/src/extract';
import { MAX_MAP_BYTES, type RopemanMap, type RpcPush } from '../../src/lib/types/ropemanMap';

const WASM_DIR = fileURLToPath(new URL('../../static', import.meta.url));
const SECRET = 'hunter2-never-leaves';

function makeProject(base: string): string {
	const root = path.join(base, 'project');
	const write = (rel: string, text: string) => {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	};
	write(
		'src/app/main.ts',
		`import { add } from '../lib/math';\nexport function start() {\n\treturn add(1, 2);\n}\n`
	);
	write('src/app/routes.ts', `import { start } from './main';\nexport const routes = [start];\n`);
	write('src/lib/math.ts', 'export function add(a: number, b: number) {\n\treturn a + b;\n}\n');
	write('src/lib/strings.ts', 'export function pad(s: string) {\n\treturn ` ${s}`;\n}\n');
	write('src/index.ts', `import { start } from './app/main';\nstart();\n`);
	write('tools/build.ts', 'export function build() {}\n');
	write('.env', `SECRET_VALUE=${SECRET}\n`);
	return root;
}

interface Run {
	code: number;
	report: MapReport;
	stdout: string;
	stderr: string;
}

let base: string;
let root: string;
let out: string;

beforeEach(() => {
	base = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-map-'));
	root = makeProject(base);
	out = path.join(base, 'out');
});

afterEach(() => {
	fs.rmSync(base, { recursive: true, force: true });
});

function env(): CommandEnv & { stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		wasmDir: WASM_DIR,
		generator: { name: '@ropeman/bridge', version: 'test' },
		out: (t) => stdout.push(t),
		err: (t) => stderr.push(t),
		now: () => new Date('2026-11-13T00:00:00.000Z'),
		stdout,
		stderr
	};
}

async function map(...extra: string[]): Promise<Run> {
	const e = env();
	const code = await runCommand(runMap, ['--root', root, '--out', out, ...extra], e);
	const stdout = e.stdout.join('\n');
	return { code, report: stdout ? JSON.parse(stdout) : null, stdout, stderr: e.stderr.join('\n') };
}

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'));
const writeNames = (names: Record<string, unknown>) =>
	fs.writeFileSync(path.join(out, NAMES_FILE), JSON.stringify(names));

/** Names every part of the work list the way an agent would: a label, a sentence, one symbol. */
function nameWork(work: Work, names: Record<string, unknown> = {}) {
	for (const level of work.levels) {
		for (const part of level.parts) {
			const symbol = part.symbols[0]?.split(' ')[1];
			names[part.id] = {
				label: `Part ${part.id}`,
				description: `Holds ${part.files} files.`,
				keySymbols: symbol ? [symbol] : []
			};
		}
	}
	return names;
}

async function verified(m: RopemanMap) {
	const { map: codeMap } = await extractDirectory(root, { wasmDir: WASM_DIR });
	return verifyMap(m, codeMap);
}

describe('ropeman map', () => {
	it('writes a verified grouped map, the coverage, and the first stage to name', async () => {
		const run = await map();

		expect(run.code).toBe(0);
		const result = await verified(read<RopemanMap>(MAP_FILE));
		expect(result.parsed && result.violations).toEqual([]);
		expect(run.report.done).toBe(false);
		expect(run.report.next).toEqual({ stage: 1, queued: 0, levels: 1, parts: 2 });
		expect(run.report.coverage.byReason.sent).toBe(6);
		expect(run.report.stages).toEqual([
			{ depth: 1, levels: 1, named: 0 },
			{ depth: 2, levels: 2, named: 0 }
		]);
		const work = read<Work>(WORK_FILE);
		expect(work.stage).toBe(1);
		expect(work.levels[0].parts.map((p) => p.id)).toEqual(['dir:src', 'dir:tools']);
		expect(fs.readFileSync(path.join(out, MAP_FILE), 'utf8')).not.toContain(SECRET);
		expect(JSON.stringify(work)).not.toContain('.env');
	});

	it('applies one stage of names, then lists the next stage with the parent name', async () => {
		await map();
		writeNames(nameWork(read<Work>(WORK_FILE)));

		const run = await map();

		expect(run.code).toBe(0);
		const written = read<RopemanMap>(MAP_FILE);
		expect(written.levels[0].naming).toBe('named');
		expect(written.levels[0].nodes.find((n) => n.id === 'dir:src')?.label).toBe('Part dir:src');
		const result = await verified(written);
		expect(result.parsed && result.violations).toEqual([]);
		const work = read<Work>(WORK_FILE);
		expect(work.stage).toBe(2);
		const src = work.levels.find((l) => l.level === 'dir:src')!;
		expect(src.parent).toEqual({ label: 'Part dir:src', description: 'Holds 5 files.' });
		expect(src.parts.map((p) => p.id).sort()).toEqual(['dir:src/app', 'dir:src/lib', 'files:src']);
	});

	it('reports done once every stage up to --depth passes, and a rerun changes nothing', async () => {
		await map();
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map();
		writeNames(nameWork(read<Work>(WORK_FILE), read(NAMES_FILE)));

		const run = await map();
		const first = fs.readFileSync(path.join(out, MAP_FILE), 'utf8');
		const again = await map();

		expect(run.report.done).toBe(true);
		expect(run.report.next).toBeNull();
		expect(read<Work>(WORK_FILE).levels).toEqual([]);
		expect(again.stdout).toBe(run.stdout);
		expect(fs.readFileSync(path.join(out, MAP_FILE), 'utf8')).toBe(first);
	});

	it('writes the files of a folder as a level with their imports, which the agent never names', async () => {
		await map();
		writeNames({
			...nameWork(read<Work>(WORK_FILE)),
			'file:src/app/main.ts': { label: 'Main', description: 'Starts.', keySymbols: [] }
		});

		const run = await map();

		const written = read<RopemanMap>(MAP_FILE);
		const app = written.levels.find((l) => l.parentId === 'files:src/app')!;
		expect(app).toMatchObject({ naming: 'grouped', assignment: null, fileLevel: true });
		expect(app.nodes.map((n) => [n.id, n.label, n.filePaths]).toSorted()).toEqual([
			['file:src/app/main.ts', 'main.ts', ['src/app/main.ts']],
			['file:src/app/routes.ts', 'routes.ts', ['src/app/routes.ts']]
		]);
		expect(app.edges.map((e) => [e.source, e.target, e.evidence?.confidence])).toEqual([
			['file:src/app/routes.ts', 'file:src/app/main.ts', 'EXTRACTED']
		]);
		expect(written.levels.find((l) => l.parentId === 'files:src/lib')?.edges).toEqual([]);
		expect(written.levels.some((l) => l.parentId === 'files:src')).toBe(false);
		const result = await verified(written);
		expect(result.parsed && result.violations).toEqual([]);
		expect(run.report.problems).toEqual([
			expect.objectContaining({ code: 'node-unknown', nodeId: 'file:src/app/main.ts' })
		]);
		expect(run.report.stages).toEqual([
			{ depth: 1, levels: 1, named: 1 },
			{ depth: 2, levels: 2, named: 0 }
		]);
		expect(JSON.stringify(read<Work>(WORK_FILE))).not.toContain('file:');
	});

	describe('the size cap', () => {
		const written = () => fs.readFileSync(path.join(out, MAP_FILE));
		const capped = async (maxMapBytes: number) => {
			const e = { ...env(), maxMapBytes };
			const code = await runCommand(runMap, ['--root', root, '--out', out], e);
			const stdout = e.stdout.join('\n');
			return { code, report: stdout ? JSON.parse(stdout) : null, stderr: e.stderr.join('\n') };
		};

		it('writes every file level when the map fits', async () => {
			const run = await map();

			expect(run.report).toMatchObject({
				fileLevels: { written: 2, dropped: 0, droppedExamples: [] }
			});
		});

		it('leaves out the largest file levels until the map fits, and says which', async () => {
			// Arrange: one byte under the whole map
			await map();
			const whole = written().length;

			// Act
			const run = await capped(whole - 1);

			// Assert: files:src/app carries an import, so it is the larger of the two
			expect(run.code).toBe(0);
			expect(run.report.fileLevels).toEqual({
				written: 1,
				dropped: 1,
				droppedExamples: ['files:src/app']
			});
			expect(run.stderr).toContain('leaves out the 1 largest file levels');
			expect(written().length).toBeLessThanOrEqual(whole - 1);
			const fitted = JSON.parse(written().toString()) as RopemanMap;
			const expanded = fitted.levels.map((l) => l.parentId);
			expect(expanded).toContain('files:src/lib');
			expect(expanded).not.toContain('files:src/app');
			const result = await verified(fitted);
			expect(result.parsed && result.violations).toEqual([]);
		});

		it('writes nothing and fails when the folder levels alone are over', async () => {
			// Arrange: the size without any file level, minus one
			await map();
			const full = JSON.parse(written().toString()) as RopemanMap;
			const folders = Buffer.byteLength(
				JSON.stringify({ ...full, levels: full.levels.filter((l) => !l.fileLevel) })
			);
			fs.rmSync(out, { recursive: true });

			// Act
			const run = await capped(folders - 1);

			// Assert
			expect(run.code).toBe(2);
			expect(run.stderr).toContain(`over ${folders - 1} bytes even without its file levels`);
			expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(false);
			expect(fs.existsSync(path.join(out, WORK_FILE))).toBe(false);
		});
	});

	it('keeps a level grouped and says why when its names fail, and the map still verifies', async () => {
		await map();
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map();
		const names = nameWork(read<Work>(WORK_FILE), read(NAMES_FILE));
		names['dir:src/lib'] = { label: 'Math', description: '', keySymbols: ['start'] };
		names['dir:tools/ghost'] = { label: 'Ghost', description: '', keySymbols: [] };
		writeNames(names);

		const run = await map();

		expect(run.code).toBe(1);
		expect(run.report.done).toBe(false);
		expect(run.report.problems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'node-unknown', nodeId: 'dir:tools/ghost' }),
				expect.objectContaining({
					code: 'key-symbol-unknown',
					level: 'dir:src',
					nodeId: 'dir:src/lib'
				})
			])
		);
		const written = read<RopemanMap>(MAP_FILE);
		expect(written.levels.find((l) => l.parentId === 'dir:src')?.naming).toBe('grouped');
		expect(written.levels.find((l) => l.parentId === 'dir:tools')?.naming).toBe('named');
		const result = await verified(written);
		expect(result.parsed && result.violations).toEqual([]);
		const work = read<Work>(WORK_FILE);
		expect(work.levels.map((l) => l.level)).toEqual(['dir:src']);
		expect(work.levels[0].problems[0].code).toBe('key-symbol-unknown');
	});

	it('refuses a level named in part, and names that break the naming rules', async () => {
		await map();
		writeNames({
			'dir:src': { label: 'x'.repeat(61), description: '', keySymbols: [] },
			'dir:tools': { label: 'Tools', description: '', keySymbols: [] },
			'dir:src/app': { label: 'App', description: '', keySymbols: [] }
		});

		const run = await map();

		expect(run.code).toBe(1);
		const codes = run.report.problems.map((p) => [p.code, p.level]);
		expect(codes).toEqual(
			expect.arrayContaining([
				['name-invalid', null],
				['name-missing', 'dir:src']
			])
		);
		expect(read<RopemanMap>(MAP_FILE).levels.every((l) => l.naming === 'grouped')).toBe(true);
	});

	it('lists a refused level outside the current stage, so its problem has a place to be fixed', async () => {
		await map('--depth', '1');
		writeNames({
			...nameWork(read<Work>(WORK_FILE)),
			'dir:src/app': { label: 'App', description: '', keySymbols: [] }
		});

		const run = await map('--depth', '1');

		expect(run.code).toBe(1);
		expect(run.report.next).toMatchObject({ stage: null, levels: 1 });
		expect(read<Work>(WORK_FILE).levels.map((l) => [l.level, l.problems[0]?.code])).toEqual([
			['dir:src', 'name-missing']
		]);
	});

	it('reports a names file that is not one JSON object and still writes the grouped map', async () => {
		fs.mkdirSync(out);
		fs.writeFileSync(path.join(out, NAMES_FILE), '["dir:src"]');

		const run = await map();

		expect(run.code).toBe(1);
		expect(run.report.problems).toEqual([expect.objectContaining({ code: 'names-unreadable' })]);
		expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(true);
	});

	it('takes an output folder outside the repo or hidden in it, and refuses one the map would list', async () => {
		out = path.join(root, 'maps');
		const listed = await map();
		out = path.join(root, '.ropeman');
		const hidden = await map();

		expect(listed.code).toBe(2);
		expect(listed.stderr).toContain('inside the repo');
		expect(fs.existsSync(path.join(root, 'maps'))).toBe(false);
		expect(hidden.code).toBe(0);
		expect(hidden.report.coverage.byReason.sent).toBe(6);
	});

	it('refuses an unknown flag, a missing --out and a bad --depth', async () => {
		const e = env();
		const codes = [
			await runCommand(runMap, ['--root', root, '--out', out, '--bogus'], e),
			await runCommand(runMap, ['--root', root], e),
			await runCommand(runMap, ['--root', root, '--out', out, '--depth', '0'], e)
		];

		expect(codes).toEqual([2, 2, 2]);
		expect(e.stdout).toEqual([]);
	});
});

describe('ropeman verify', () => {
	async function verify(file: string) {
		const e = env();
		const code = await runCommand(runVerify, ['--root', root, '--map', file], e);
		return { code, result: JSON.parse(e.stdout.join('\n')) };
	}

	it('passes the map `ropeman map` wrote and names the violation in an edited one', async () => {
		await map();
		const file = path.join(out, MAP_FILE);
		const clean = await verify(file);
		const edited = read<RopemanMap>(MAP_FILE);
		edited.levels[0].nodes[0].filePaths.pop();
		fs.writeFileSync(file, JSON.stringify(edited));

		const broken = await verify(file);

		expect(clean).toMatchObject({ code: 0, result: { ok: true, violations: [] } });
		expect(broken.code).toBe(1);
		expect(broken.result.violations[0]).toMatchObject({ code: 'file-unassigned', level: 0 });
	});

	it('reports a file that is not a map with the parser code', async () => {
		fs.mkdirSync(out);
		const file = path.join(out, 'not-a-map.json');
		fs.writeFileSync(file, '{ nope');

		const run = await verify(file);

		expect(run).toMatchObject({ code: 1, result: { ok: false, failure: { code: 'not-json' } } });
	});
});

const FAKE_CLI = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));

/** serve in `--out` mode; with `worker`, the fake CLI names opened folders as `claude`. */
function session(log: string[] = [], worker = false) {
	return new MapSession({
		root: fs.realpathSync(root),
		wasmDir: WASM_DIR,
		naming: worker
			? {
					cli: 'claude',
					command: FAKE_CLI,
					timeoutMs: 10_000,
					maxOutputBytes: 1_000_000,
					runner: new CliRunner(2, base)
				}
			: null,
		out: fs.realpathSync(out),
		server: { name: '@ropeman/bridge', version: 'test' },
		debounceMs: 20,
		log: (m) => log.push(m)
	});
}

function subscriber(): Subscriber & { pushes: RpcPush[] } {
	const pushes: RpcPush[] = [];
	return { pushes, push: (m) => pushes.push(m) };
}

/**
 * Waits for `check`, rewriting `touch` with its own bytes every 200 ms meanwhile. Observed on
 * macOS under load: a change made right after the session opens its watchers can go unreported,
 * so the test would wait forever for an event the change never produced.
 */
const until = async (check: () => boolean, touch?: string) => {
	const end = Date.now() + 5_000;
	let next = Date.now() + 200;
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out waiting');
		if (touch && Date.now() > next) {
			fs.writeFileSync(touch, fs.readFileSync(touch));
			next = Date.now() + 200;
		}
		await new Promise((r) => setTimeout(r, 20));
	}
};

async function inbox() {
	const e = env();
	const code = await runCommand(runInbox, ['--out', out], e);
	return { code, result: JSON.parse(e.stdout.join('\n')) };
}

describe('serve --out', () => {
	it('serves the named levels of the shared map and drops the ones the code no longer backs', async () => {
		await map();
		const top = nameWork(read<Work>(WORK_FILE));
		top['dir:tools'] = { label: 'Tools', description: 'Build scripts.', keySymbols: [] };
		writeNames(top);
		await map();
		writeNames(nameWork(read<Work>(WORK_FILE), read(NAMES_FILE)));
		await map();
		expect(
			read<RopemanMap>(MAP_FILE)
				.levels.filter((l) => l.naming === 'named')
				.map((l) => l.parentId)
		).toEqual([null, 'dir:src', 'dir:tools']);
		fs.writeFileSync(path.join(root, 'tools/build.ts'), 'export function compile() {}\n');
		const s = session();

		try {
			const served = await s.map();
			const src = await s.expand('dir:src');
			const tools = await s.expand('dir:tools');

			expect(served.levels[0].naming).toBe('named');
			expect(served.levels[0].nodes.find((n) => n.id === 'dir:src')?.label).toBe('Part dir:src');
			expect(src.ok && src.level.naming).toBe('named');
			expect(tools.ok && tools.level.naming).toBe('grouped');
			expect(await s.expand('__root__')).toMatchObject({ ok: false, code: 'unknown-node' });
			const result = await verified(served);
			expect(result.parsed && result.violations).toEqual([]);
		} finally {
			s.close();
		}
	});

	it('queues a folder opened without names, lists it for the agent, and answers once the agent names it', async () => {
		await map('--depth', '1');
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map('--depth', '1');
		const s = session();
		s.start();
		const viewer = subscriber();

		try {
			const idle = await inbox();
			const expanded = await s.expand('dir:src');
			s.name('dir:src', viewer);
			const waiting = await inbox();
			const run = await map('--depth', '1');
			const work = read<Work>(WORK_FILE);
			writeNames(nameWork(work, read(NAMES_FILE)));
			await map('--depth', '1');
			await until(() => viewer.pushes.length === 2, path.join(out, MAP_FILE));

			expect(idle.result).toEqual({ queued: [], named: [] });
			expect(expanded.ok && expanded.level.naming).toBe('grouped');
			expect(viewer.pushes[0]).toMatchObject({ type: 'node.named', code: 'queued' });
			expect(waiting.result).toEqual({ queued: ['dir:src'], named: [] });
			expect(run.report.next).toMatchObject({ stage: null, queued: 1, levels: 1 });
			expect(work.levels.map((l) => [l.level, l.queued])).toEqual([['dir:src', true]]);
			expect(viewer.pushes[1]).toMatchObject({
				type: 'node.named',
				nodeId: 'dir:src',
				level: { naming: 'named' }
			});
			expect(read(QUEUE_FILE)).toEqual({ queued: [] });
			expect((await inbox()).result).toEqual({ queued: [], named: [] });
		} finally {
			s.close();
		}
	});

	it('serves names again once the code backs them again after a folder comes and goes', async () => {
		await map('--depth', '1');
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map('--depth', '1');
		const extra = path.join(root, 'extra');
		fs.mkdirSync(extra);
		fs.writeFileSync(path.join(extra, 'x.ts'), 'export const x = 1;\n');
		const s = session();
		const viewer = subscriber();
		s.join(viewer);

		try {
			const withExtra = await s.map();
			fs.rmSync(extra, { recursive: true });
			// The rewrite of src/index.ts also starts a re-extraction, so this proves the names
			// come back once a rescan no longer sees extra/, not that serve noticed the removal
			await until(
				() => viewer.pushes.some((m) => m.type === 'map.changed'),
				path.join(root, 'src/index.ts')
			);
			const without = await s.map();

			expect(withExtra.levels[0].naming).toBe('grouped');
			expect(without.levels[0].naming).toBe('named');
		} finally {
			s.close();
		}
	});

	it('drops a queued folder that no longer exists, and never reports it as pending', async () => {
		await map('--depth', '1');
		writeQueue(out, ['dir:src/gone', 'dir:src']);
		const s = session();

		try {
			s.start();
			await until(() => read<{ queued: string[] }>(QUEUE_FILE).queued.length === 1);
			const pending = await inbox();

			expect(read(QUEUE_FILE)).toEqual({ queued: ['dir:src'] });
			expect(pending.result).toEqual({ queued: ['dir:src'], named: [] });
		} finally {
			s.close();
		}
	});

	it('names an opened folder with the worker, the brief and the parent name, and logs it for the agent', async () => {
		await map('--depth', '1');
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map('--depth', '1');
		fs.writeFileSync(path.join(out, BRIEF_FILE), 'Call the math helpers "arithmetic".\n');
		process.env.FAKE_CLI_DIR = path.join(base, 'cli');
		const s = session([], true);
		const viewer = subscriber();

		try {
			await s.expand('dir:src');
			s.name('dir:src', viewer);
			await until(() => viewer.pushes.length === 1);
			const prompt = JSON.parse(
				fs.readFileSync(path.join(base, 'cli/calls/000.json'), 'utf8')
			).stdin;
			const first = await inbox();
			const again = await inbox();

			expect(viewer.pushes[0]).toMatchObject({
				type: 'node.named',
				nodeId: 'dir:src',
				level: { naming: 'named' },
				namedBy: { worker: 'claude', runs: 1 }
			});
			expect(prompt).toContain('Call the math helpers "arithmetic".');
			expect(prompt).toContain('This folder is named: Part dir:src. Holds 5 files.');
			expect(fs.existsSync(path.join(out, QUEUE_FILE))).toBe(false);
			expect(first.result.queued).toEqual([]);
			expect(first.result.named).toEqual([
				expect.objectContaining({ nodeId: 'dir:src', worker: 'claude', outcome: 'named' })
			]);
			expect(first.result.named[0].names.map((n: { id: string }) => n.id).sort()).toEqual([
				'dir:src/app',
				'dir:src/lib',
				'files:src'
			]);
			expect(again.result.named).toEqual([]);
			expect(fs.readFileSync(path.join(out, LOG_FILE), 'utf8').trim().split('\n')).toHaveLength(1);
		} finally {
			s.close();
			delete process.env.FAKE_CLI_DIR;
		}
	});

	it('cuts a long brief before it reaches a prompt', () => {
		fs.mkdirSync(out);
		fs.writeFileSync(path.join(out, BRIEF_FILE), 'x'.repeat(MAX_BRIEF_BYTES + 500));

		const brief = readBrief(out)!;

		expect(Buffer.byteLength(brief)).toBeLessThan(MAX_BRIEF_BYTES + 100);
		expect(brief).toContain(`[brief cut at ${MAX_BRIEF_BYTES} bytes]`);
	});
});

const posix = process.platform !== 'win32';

/** `map --depth 1` with the top level named, as the agent leaves it before serve starts. */
async function namedTop() {
	await map('--depth', '1');
	writeNames(nameWork(read<Work>(WORK_FILE)));
	await map('--depth', '1');
}

/** The fake CLI's folder with a plan of steps; its runs are recorded under `calls/`. */
function fakeCli(plan: string[] = []) {
	const dir = path.join(base, 'cli');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan));
	process.env.FAKE_CLI_DIR = dir;
	const callsDir = path.join(dir, 'calls');
	const calls = (): { stdin: string; pid: number }[] =>
		fs.existsSync(callsDir)
			? fs
					.readdirSync(callsDir)
					.sort()
					.map((f) => JSON.parse(fs.readFileSync(path.join(callsDir, f), 'utf8')))
			: [];
	return { dir, calls, release: () => fs.writeFileSync(path.join(dir, 'release'), '') };
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** A worker result as serve logs it, with a description `size` characters long. */
const logEntry = (n: number, size = 10): Omit<LogEntry, 'seq'> => ({
	at: '2026-11-13T00:00:00.000Z',
	nodeId: `dir:src/n${n}`,
	folder: `src/n${n}`,
	worker: 'claude',
	outcome: 'named',
	names: [{ id: `dir:src/n${n}/a`, label: 'A', description: 'x'.repeat(size), keySymbols: [] }],
	ms: 1
});

const nodeIds = (entries: { nodeId: string }[]) => entries.map((e) => e.nodeId);
const labelOf = (level: { nodes: { id: string; label: string }[] }, id: string) =>
	level.nodes.find((n) => n.id === id)?.label;

describe('the work folder a cloned repository can plant files in', () => {
	it.runIf(posix)('follows no brief, names or queue link out of the folder', async () => {
		await map('--depth', '1');
		const secretFile = path.join(base, 'credentials');
		fs.writeFileSync(secretFile, `${SECRET}\n`);
		const namesElsewhere = path.join(base, 'names-elsewhere.json');
		fs.writeFileSync(namesElsewhere, JSON.stringify(nameWork(read<Work>(WORK_FILE))));
		const queueElsewhere = path.join(base, 'queue-elsewhere.json');
		fs.writeFileSync(queueElsewhere, JSON.stringify({ queued: ['dir:src'] }));
		fs.symlinkSync(secretFile, path.join(out, BRIEF_FILE));
		fs.symlinkSync(namesElsewhere, path.join(out, NAMES_FILE));
		fs.symlinkSync(queueElsewhere, path.join(out, QUEUE_FILE));

		const run = await map('--depth', '1');

		expect(readBrief(out)).toBeNull();
		expect(readQueue(out)).toEqual([]);
		expect(run.code).toBe(1);
		expect(run.report.problems).toEqual([
			expect.objectContaining({ code: 'names-unreadable', level: null })
		]);
		expect(read<RopemanMap>(MAP_FILE).levels[0].naming).toBe('grouped');
	});

	it.runIf(posix)('reads no brief from a FIFO instead of blocking serve', () => {
		fs.mkdirSync(out);
		execFileSync('mkfifo', [path.join(out, BRIEF_FILE)]);

		const brief = readBrief(out);

		expect(brief).toBeNull();
	});

	it('reads only the start of a huge brief', () => {
		fs.mkdirSync(out);
		const file = path.join(out, BRIEF_FILE);
		fs.writeFileSync(file, 'Use plain words.\n');
		// Sparse: 3 GiB on paper, so a whole-file read fails or takes seconds
		fs.truncateSync(file, 3 * 1024 ** 3);

		const brief = readBrief(out);

		expect(brief).toMatch(/^Use plain words\./);
		expect(brief).toContain(`[brief cut at ${MAX_BRIEF_BYTES} bytes]`);
	});

	it.runIf(posix)('refuses an output folder that is a link the repository ships', async () => {
		const elsewhere = path.join(base, 'elsewhere');
		fs.mkdirSync(elsewhere);
		fs.symlinkSync(elsewhere, path.join(root, '.ropeman'));
		out = path.join(root, '.ropeman');

		const run = await map();

		expect(run.code).toBe(2);
		expect(run.stderr).toContain('is a link');
		expect(fs.readdirSync(elsewhere)).toEqual([]);
	});

	it('keeps the work folder out of commits when it is inside a git repository', async () => {
		execFileSync('git', ['init', '-q'], { cwd: root });
		out = path.join(root, '.ropeman');

		await map();
		const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
			cwd: root,
			encoding: 'utf8'
		});

		expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(true);
		expect(status).toContain('src/');
		expect(status).not.toContain('.ropeman');
	});

	it('adds no .gitignore to a hidden folder the user already keeps', async () => {
		out = path.join(root, '.github');
		fs.mkdirSync(out);

		const run = await map();

		expect(run.code).toBe(0);
		expect(fs.existsSync(path.join(out, '.gitignore'))).toBe(false);
	});
});

describe('serve --out workers and the naming log', () => {
	it('keeps a verified name and leaks no path when the naming log cannot be written', async () => {
		await namedTop();
		fs.mkdirSync(path.join(out, LOG_FILE));
		fakeCli();
		const log: string[] = [];
		const s = session(log, true);
		const viewer = subscriber();

		try {
			await s.expand('dir:src');
			s.name('dir:src', viewer);
			await until(() => viewer.pushes.length === 1);
			const served = await s.expand('dir:src');

			expect(viewer.pushes[0]).toMatchObject({ nodeId: 'dir:src', level: { naming: 'named' } });
			expect(JSON.stringify(viewer.pushes)).not.toContain(base);
			expect(served.ok && served.level.naming).toBe('named');
			expect(log.some((m) => m.includes(LOG_FILE))).toBe(true);
		} finally {
			s.close();
			delete process.env.FAKE_CLI_DIR;
		}
	});

	it('keeps the names the agent wrote while a worker was still naming the folder', async () => {
		await namedTop();
		const cli = fakeCli(['gate']);
		const log: string[] = [];
		const s = session(log, true);
		s.start();
		const viewer = subscriber();

		try {
			await s.expand('dir:src');
			s.name('dir:src', viewer);
			await until(() => cli.calls().length === 1);
			await map('--depth', '2');
			writeNames(nameWork(read<Work>(WORK_FILE), read(NAMES_FILE)));
			await map('--depth', '2');
			await until(() => log.some((m) => m.startsWith('Names for')), path.join(out, MAP_FILE));
			cli.release();
			await until(() => viewer.pushes.length === 1);
			const served = await s.expand('dir:src');

			const pushed = viewer.pushes[0] as { level: { nodes: { id: string; label: string }[] } };
			expect(labelOf(pushed.level, 'dir:src/app')).toBe('Part dir:src/app');
			expect(served.ok && labelOf(served.level, 'dir:src/app')).toBe('Part dir:src/app');
		} finally {
			s.close();
			delete process.env.FAKE_CLI_DIR;
		}
	});

	it('names two opened folders at once and stops the run no socket waits for', async () => {
		await namedTop();
		const cli = fakeCli(['hang', 'hang']);
		const s = session([], true);
		const src = subscriber();
		const tools = subscriber();

		try {
			await s.expand('dir:src');
			await s.expand('dir:tools');
			s.name('dir:src', src);
			s.name('dir:tools', tools);
			await until(() => cli.calls().length === 2);
			const pidOf = (folder: string) =>
				cli.calls().find((c) => c.stdin.includes(`Folder: ${folder}\n`))!.pid;
			s.leave(tools);
			await until(() => !alive(pidOf('tools')));

			expect(alive(pidOf('src'))).toBe(true);
			expect(s.pendingFor(src)).toBe(1);
			expect(tools.pushes).toEqual([]);
			expect(fs.existsSync(path.join(out, LOG_FILE))).toBe(false);
		} finally {
			s.close();
			delete process.env.FAKE_CLI_DIR;
		}
	});

	it('keeps the naming log bounded, and the inbox shows each entry once across a trim', async () => {
		await map();
		for (let n = 1; n <= 150; n++) appendLog(out, logEntry(n, 20_000));
		const first = await inbox();
		appendLog(out, logEntry(151));

		const second = await inbox();

		expect(fs.statSync(path.join(out, LOG_FILE)).size).toBeLessThanOrEqual(MAX_LOG_BYTES);
		expect(nodeIds(first.result.named).at(-1)).toBe('dir:src/n150');
		expect(nodeIds(second.result.named)).toEqual(['dir:src/n151']);
	});

	it('shows every entry of a replaced log that the agent has not seen', async () => {
		await map();
		const lines = (...seqs: number[]) =>
			seqs.map((seq) => `${JSON.stringify({ seq, ...logEntry(seq) })}\n`).join('');
		fs.writeFileSync(path.join(out, LOG_FILE), lines(1, 2));
		const first = await inbox();
		// serve trimmed the log: the oldest entry went, two new ones came
		fs.writeFileSync(path.join(out, LOG_FILE), lines(2, 3, 4));

		const second = await inbox();

		expect(nodeIds(first.result.named)).toEqual(['dir:src/n1', 'dir:src/n2']);
		expect(nodeIds(second.result.named)).toEqual(['dir:src/n3', 'dir:src/n4']);
	});
});

describe('flags', () => {
	it('refuses serve --out with no folder or a flag in its place', () => {
		const missing = () => serveOutValue(['--root', root, '--out']);
		const flag = () => serveOutValue(['--out', '--local']);

		expect(serveOutValue(['--root', root])).toBeNull();
		expect(serveOutValue(['--out', out, '--local'])).toBe(out);
		expect(missing).toThrow('--out needs a folder');
		expect(flag).toThrow('--out needs a folder');
	});

	// Review of PR #96: a map over the cap read as "has no ropeman.json"
	it('says a map over the size cap is too large, not missing', async () => {
		fs.mkdirSync(out);
		fs.writeFileSync(path.join(out, MAP_FILE), Buffer.alloc(MAX_MAP_BYTES + 1, ' '));
		const e = env();

		const code = await runCommand(runInbox, ['--out', out], e);

		expect(code).toBe(2);
		expect(e.stderr.join('\n')).toContain(`over ${MAX_MAP_BYTES} bytes`);
		expect(e.stderr.join('\n')).not.toContain('has no');
	});

	it('refuses an inbox folder that ropeman map never wrote, and writes nothing there', async () => {
		fs.mkdirSync(out);
		const e = env();

		const code = await runCommand(runInbox, ['--out', out], e);

		expect(code).toBe(2);
		expect(e.stderr.join('\n')).toContain('run ropeman map first');
		expect(fs.readdirSync(out)).toEqual([]);
		expect(fs.existsSync(path.join(out, INBOX_READ_FILE))).toBe(false);
	});
});
