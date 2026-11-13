import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	runCommand,
	runMap,
	runNext,
	runVerify,
	type CommandEnv,
	type MapReport,
	type Work
} from '../src/mapCommand';
import { MAP_FILE, NAMES_FILE, QUEUE_FILE, WORK_FILE, writeQueue } from '../src/workFolder';
import { MapSession, type Subscriber } from '../src/mapSession';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { extractDirectory } from '../../packages/core/src/extract';
import type { RopemanMap, RpcPush } from '../../src/lib/types/ropemanMap';

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

function session(log: string[] = []) {
	return new MapSession({
		root: fs.realpathSync(root),
		wasmDir: WASM_DIR,
		naming: null,
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

const until = async (check: () => boolean, ms = 5_000) => {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out waiting');
		await new Promise((r) => setTimeout(r, 20));
	}
};

async function next(timeout = '0') {
	const e = env();
	const code = await runCommand(runNext, ['--out', out, '--timeout', timeout], e);
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

	it('ropeman next waits for a folder the browser queues and returns it at once', async () => {
		await map();
		const started = Date.now();
		const waiting = next('5');
		setTimeout(() => writeQueue(out, ['dir:src']), 100);

		const { code, result } = await waiting;

		expect(code).toBe(0);
		expect(result).toEqual({ queued: ['dir:src'], timedOut: false });
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it('queues a folder opened without names, lists it for the agent, and answers once the agent names it', async () => {
		await map('--depth', '1');
		writeNames(nameWork(read<Work>(WORK_FILE)));
		await map('--depth', '1');
		const s = session();
		s.start();
		const viewer = subscriber();

		try {
			const idle = await next();
			const expanded = await s.expand('dir:src');
			s.name('dir:src', viewer);
			const waiting = await next();
			const run = await map('--depth', '1');
			const work = read<Work>(WORK_FILE);
			writeNames(nameWork(work, read(NAMES_FILE)));
			await map('--depth', '1');
			await until(() => viewer.pushes.length === 2);

			expect(idle.result).toEqual({ queued: [], timedOut: true });
			expect(expanded.ok && expanded.level.naming).toBe('grouped');
			expect(viewer.pushes[0]).toMatchObject({ type: 'node.named', code: 'queued' });
			expect(waiting.result).toEqual({ queued: ['dir:src'], timedOut: false });
			expect(run.report.next).toMatchObject({ stage: null, queued: 1, levels: 1 });
			expect(work.levels.map((l) => [l.level, l.queued])).toEqual([['dir:src', true]]);
			expect(viewer.pushes[1]).toMatchObject({
				type: 'node.named',
				nodeId: 'dir:src',
				level: { naming: 'named' }
			});
			expect(read(QUEUE_FILE)).toEqual({ queued: [] });
			expect((await next()).result).toEqual({ queued: [], timedOut: true });
		} finally {
			s.close();
		}
	});
});
