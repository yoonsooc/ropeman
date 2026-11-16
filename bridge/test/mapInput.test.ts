import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCommand, runMap, runVerify, type CommandEnv } from '../src/mapCommand';
import { INPUT_FILE, findCandidates, inputForServe, promptText } from '../src/mapInput';
import { MAP_FILE } from '../src/workFolder';

const WASM_DIR = fileURLToPath(new URL('../../static', import.meta.url));
const GRAPHIFY = { schema_version: 1, graphify_version: '0.9.104' };

let base: string;
let root: string;
let out: string;

function write(rel: string, text: string) {
	fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	fs.writeFileSync(path.join(root, rel), text);
}

/** A Graphify graph.json with one file node and one function per path. */
function graphOf(paths: string[], header: object = GRAPHIFY) {
	return {
		directed: false,
		multigraph: false,
		graph: header,
		nodes: paths.flatMap((p) => [
			{
				id: p,
				label: path.basename(p),
				_origin: 'ast',
				file_type: 'code',
				source_file: p,
				source_location: 'L1'
			},
			{
				id: `${p}#f`,
				label: 'f()',
				_origin: 'ast',
				file_type: 'code',
				source_file: p,
				source_location: 'L1'
			}
		]),
		links: paths.map((p) => ({
			source: p,
			target: `${p}#f`,
			relation: 'contains',
			_origin: 'ast',
			confidence: 'EXTRACTED',
			source_file: p,
			source_location: 'L1'
		}))
	};
}

const SERVER = ['server/api.ts', 'server/db.ts'];
const graphFile = () => path.join(root, 'graphify-out/graph.json');

beforeEach(() => {
	base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-input-')));
	root = path.join(base, 'project');
	for (const p of SERVER) write(p, 'export function f() {}\n');
	write('app/view.tsx', 'export function f() {}\n');
	write('app/state.ts', 'export function f() {}\n');
	out = path.join(base, 'out');
	vi.stubEnv('HOME', path.join(base, 'home'));
});

afterEach(() => {
	vi.unstubAllEnvs();
	fs.rmSync(base, { recursive: true, force: true });
});

/** Answers each question with the next of `answers`; null closes the input. */
function env(answers?: (string | null)[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const asked: string[] = [];
	const e: CommandEnv = {
		wasmDir: WASM_DIR,
		generator: { name: '@ropeman/bridge', version: 'test' },
		out: (t) => stdout.push(t),
		err: (t) => stderr.push(t),
		now: () => new Date('2026-11-13T00:00:00.000Z'),
		...(answers && {
			ask: async (q: string) => {
				asked.push(q);
				return answers.shift() ?? null;
			}
		})
	};
	return { e, stdout, stderr, asked };
}

async function map(extra: string[] = [], answers?: (string | null)[]) {
	const run = env(answers);
	const code = await runCommand(runMap, ['--root', root, '--out', out, ...extra], run.e);
	const text = run.stdout.join('\n');
	return { ...run, code, report: text ? JSON.parse(text) : null };
}

async function verify(extra: string[] = []) {
	const run = env();
	const args = ['--root', root, '--map', path.join(out, MAP_FILE), ...extra];
	const code = await runCommand(runVerify, args, run.e);
	return { code, report: JSON.parse(run.stdout.join('\n')) };
}

const recorded = () => JSON.parse(fs.readFileSync(path.join(out, INPUT_FILE), 'utf8')).input;
const mapFiles = () =>
	(
		JSON.parse(fs.readFileSync(path.join(out, MAP_FILE), 'utf8')) as { files: { path: string }[] }
	).files
		.map((f) => f.path)
		.sort();

describe('findCandidates', () => {
	it('finds nothing in a repository without a graph file', async () => {
		expect(await findCandidates(root)).toEqual([]);
	});

	it('finds each known location and reads what it can', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		write(
			'.graphicle/graph.json',
			JSON.stringify(
				graphOf(SERVER, { schema_version: 1, graphicle_version: '0.9.103-graphicle.1' })
			)
		);

		// Act
		const found = await findCandidates(root);

		// Assert
		expect(found.map((c) => [c.location, c.read.ok ? 'ok' : c.read.code])).toEqual([
			['graphify-out/graph.json', 'ok'],
			['.graphicle/graph.json', 'graphicle']
		]);
		expect(found[0].read.ok && found[0].read.coverage).toMatchObject({ covered: 2, codeFiles: 4 });
	});

	it('refuses a graph file reached through a folder link', async () => {
		// Arrange
		const elsewhere = path.join(base, 'theirs');
		fs.mkdirSync(elsewhere);
		fs.writeFileSync(path.join(elsewhere, 'graph.json'), JSON.stringify(graphOf(SERVER)));
		fs.symlinkSync(elsewhere, path.join(root, 'graphify-out'));

		// Act
		const [found] = await findCandidates(root);

		// Assert
		expect(found.read).toMatchObject({ ok: false, code: 'link' });
	});

	it('refuses a graph file that is a link', async () => {
		// Arrange
		const elsewhere = path.join(base, 'theirs.json');
		fs.writeFileSync(elsewhere, JSON.stringify(graphOf(SERVER)));
		fs.mkdirSync(path.join(root, 'graphify-out'));
		fs.symlinkSync(elsewhere, graphFile());

		// Act
		const [found] = await findCandidates(root);

		// Assert
		expect(found.read).toMatchObject({ ok: false, code: 'link' });
	});
});

describe('promptText', () => {
	it('lists own extraction first, then each file with its coverage and warnings', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		write('.graphicle/graph.json', '{}');
		const found = await findCandidates(root);

		// Act
		const text = promptText(found);

		// Assert
		const lines = text.split('\n');
		expect(lines[1]).toBe("  1. Ropeman's own extraction (default)");
		expect(lines[2]).toMatch(
			/^ {2}2\. graphify-out\/graph\.json: \d+ KB, modified .+ UTC, written by Graphify 0\.9\.104$/
		);
		expect(lines[3]).toBe(
			'     Holds 2 of 4 code files on disk (50%). Not in it: app 2; by type: .ts 1, .tsx 1.'
		);
		expect(lines[4]).toMatch(/^ {5}Low coverage: the map shows only the 2 files in this graph/);
		expect(lines[5]).toMatch(/^ {2}- {2}\.graphicle\/graph\.json: .* Cannot be used: /);
	});
});

describe('ropeman map input', () => {
	it('builds from own extraction and records nothing when no graph file exists', async () => {
		// Act
		const run = await map();

		// Assert
		expect(run.code).toBe(0);
		expect(run.report.input).toEqual({ kind: 'ropeman', decidedBy: 'default' });
		expect(fs.existsSync(path.join(out, INPUT_FILE))).toBe(false);
		expect(run.report.files.input).toBeUndefined();
	});

	it('stops without a terminal and lists the choices when a graph file exists', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));

		// Act
		const run = await map();

		// Assert
		expect(run.code).toBe(2);
		expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(false);
		expect(run.report.inputRequired).toMatch(/Ask the user/);
		expect(run.report.choices.map((c: { input: string }) => c.input)).toEqual([
			'ropeman',
			graphFile()
		]);
		expect(run.report.choices[1].warnings[0]).toMatch(/^Low coverage/);
		expect(run.stderr.join('\n')).toMatch(/--input ropeman or --input <graph file>/);
	});

	it('uses own extraction with a note when no graph file found can be read', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify({ graph: {}, nodes: [], links: [] }));

		// Act
		const run = await map();

		// Assert
		expect(run.code).toBe(0);
		expect(run.report.input).toMatchObject({
			kind: 'ropeman',
			decidedBy: 'default',
			notUsed: [{ location: 'graphify-out/graph.json', code: 'schema-version' }]
		});
		expect(fs.existsSync(path.join(out, INPUT_FILE))).toBe(false);
	});

	it('builds from the graph file passed with --input, records it, and verifies against it', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));

		// Act
		const run = await map(['--input', graphFile()]);
		const checked = await verify();

		// Assert
		expect(run.code).toBe(0);
		expect(run.report.input).toMatchObject({
			kind: 'graph',
			file: graphFile(),
			decidedBy: 'flag',
			coverage: { covered: 2, codeFiles: 4, low: true }
		});
		expect(run.report.coverage).toMatchObject({ inMap: 2, notInGraph: 2 });
		expect(run.stderr.join('\n')).toMatch(/Warning: Low coverage/);
		expect(mapFiles()).toEqual(SERVER);
		expect(recorded()).toBe(graphFile());
		expect(checked.code).toBe(0);
		expect(checked.report).toMatchObject({
			ok: true,
			input: { kind: 'graph', decidedBy: 'recorded' }
		});
	});

	it('fails verify of a graph map against own extraction, so the input matters', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		await map(['--input', graphFile()]);

		// Act
		const checked = await verify(['--input', 'ropeman']);

		// Assert
		expect(checked.code).toBe(1);
		expect(checked.report.input).toEqual({ kind: 'ropeman', decidedBy: 'flag' });
	});

	it('keeps the recorded choice on later runs until --input changes it', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		await map(['--input', 'ropeman']);

		// Act
		const again = await map();
		const switched = await map(['--input', graphFile()]);
		const after = await map();

		// Assert
		expect(again.report.input).toEqual({ kind: 'ropeman', decidedBy: 'recorded' });
		expect(switched.report.input.kind).toBe('graph');
		expect(after.report.input).toMatchObject({ kind: 'graph', decidedBy: 'recorded' });
	});

	it('refuses a recorded graph file that is gone instead of switching input', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		await map(['--input', graphFile()]);
		fs.rmSync(graphFile());

		// Act
		const run = await map();

		// Assert
		expect(run.code).toBe(2);
		expect(run.stderr.join('\n')).toMatch(/recorded in .*input\.json.*no such file/);
	});

	it.each([0o600, 0o644])(
		'refuses a recorded choice a clone ships (mode %o) instead of using its graph',
		async (mode) => {
			// Arrange
			write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
			fs.mkdirSync(out);
			const planted = JSON.stringify({ input: graphFile(), mac: 'x'.repeat(43) });
			fs.writeFileSync(path.join(out, INPUT_FILE), planted, { mode });

			// Act
			const run = await map();

			// Assert
			expect(run.code).toBe(2);
			expect(run.stderr.join('\n')).toMatch(/was not written by ropeman map for this folder/);
			expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(false);
		}
	);

	it('refuses a recorded choice copied from another work folder', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		await map(['--input', graphFile()]);
		const other = path.join(base, 'other');
		fs.mkdirSync(other);
		fs.copyFileSync(path.join(out, INPUT_FILE), path.join(other, INPUT_FILE));

		// Act
		const run = env();
		const code = await runCommand(runMap, ['--root', root, '--out', other], run.e);

		// Assert
		expect(code).toBe(2);
		expect(run.stderr.join('\n')).toMatch(/was not written by ropeman map for this folder/);
	});

	it('uses own extraction with a note when a candidate is not a graph it reads', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify({ graph: GRAPHIFY }));

		// Act
		const run = await map();

		// Assert
		expect(run.code).toBe(0);
		expect(run.report.input.notUsed).toEqual([
			expect.objectContaining({ location: 'graphify-out/graph.json', code: 'malformed' })
		]);
	});

	it('counts files outside the graph apart from files in no language Ropeman reads', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		write('package.json', '{}');
		write('logo.png', 'png');

		// Act
		const own = await map(['--input', 'ropeman']);
		const run = await map(['--input', graphFile()]);

		// Assert
		expect(run.report.coverage).toMatchObject({ inMap: 2, notInGraph: 3 });
		expect(run.report.coverage.noGrammar).toBe(own.report.coverage.noGrammar);
	});

	it('refuses --input naming a file Ropeman does not read, with the reason', async () => {
		// Arrange
		write('csharp.json', JSON.stringify({ nodes: [], edges: [], graphify_csharp: {} }));

		// Act
		const run = await map(['--input', path.join(root, 'csharp.json')]);

		// Assert
		expect(run.code).toBe(2);
		expect(run.stderr.join('\n')).toMatch(/graphify-csharp/);
		expect(fs.existsSync(path.join(out, INPUT_FILE))).toBe(false);
	});

	it.each([
		['Enter keeps own extraction', [''], 'ropeman'],
		['1 is own extraction', ['1'], 'ropeman'],
		['2 is the graph file', ['2'], 'graph'],
		['a bad answer asks again', ['7', 'x', '2'], 'graph']
	])('on a terminal: %s', async (_name, answers, kind) => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));

		// Act
		const run = await map([], answers);

		// Assert
		expect(run.code).toBe(0);
		expect(run.report.input).toMatchObject({ kind, decidedBy: 'prompt' });
		expect(run.asked.at(-1)).toBe('Choose 1-2 [1]: ');
		expect(run.stderr[0]).toMatch(/^Graph files in this repository/);
		expect(recorded()).toBe(kind === 'graph' ? graphFile() : 'ropeman');
	});

	it.each([
		['a closed input', [null]],
		['three bad answers', ['9', '9', '9']]
	])('on a terminal: %s stops without a choice', async (_name, answers) => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));

		// Act
		const run = await map([], answers);

		// Assert
		expect(run.code).toBe(2);
		expect(fs.existsSync(path.join(out, INPUT_FILE))).toBe(false);
		expect(fs.existsSync(path.join(out, MAP_FILE))).toBe(false);
	});

	it('does not ask on a terminal once a choice is recorded', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));
		await map([], ['2']);

		// Act
		const run = await map([], []);

		// Assert
		expect(run.asked).toEqual([]);
		expect(run.report.input).toMatchObject({ kind: 'graph', decidedBy: 'recorded' });
	});
});

describe('inputForServe', () => {
	it('serves the recorded input, and own extraction without one', async () => {
		// Arrange
		write('graphify-out/graph.json', JSON.stringify(graphOf(SERVER)));

		// Act
		const before = await inputForServe(root, null);
		await map(['--input', graphFile()]);
		const after = await inputForServe(root, out);

		// Assert
		expect(before.input).toEqual({ kind: 'ropeman' });
		expect(
			after.input.kind === 'graph' && [...after.input.read.extraction.map.files.keys()]
		).toEqual(SERVER);
	});
});
