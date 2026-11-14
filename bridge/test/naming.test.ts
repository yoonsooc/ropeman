import { describe, expect, it } from 'vitest';
import type { CodeMap, FilePath, FileRecord } from '../../src/lib/types/codeMap';
import type { MapEdge, MapLevel } from '../../src/lib/types/ropemanMap';
import os from 'os';
import { CliError, CliRunner, headlessCommand } from '../src/cli';
import {
	MAX_PARTS,
	MAX_PROMPT_BYTES,
	buildNamingPrompt,
	importCount,
	nameLevel,
	parseNamingAnswer,
	readCliOutput,
	type NamingTarget
} from '../src/naming';

function record(path: string, names: string[]): FileRecord {
	return {
		path: path as FilePath,
		language: 'typescript',
		lines: { start: 1, end: 10 },
		symbols: names.map((name, i) => ({
			id: `${path}#${name}` as FileRecord['symbols'][number]['id'],
			name,
			kind: 'function',
			lines: { start: i + 1, end: i + 1 },
			badges: [],
			children: []
		})),
		imports: [],
		reexports: [],
		refs: []
	};
}

function fixture(parts: number, filesPerPart = 2): { target: NamingTarget; codeMap: CodeMap } {
	const files = new Map<FilePath, FileRecord>();
	const nodes = Array.from({ length: parts }, (_, p) => {
		const paths = Array.from({ length: filesPerPart }, (_, f) => `src/part${p}/file${f}.ts`);
		for (const path of paths) files.set(path as FilePath, record(path, [`fn${p}`, `helper${p}`]));
		return {
			id: `dir:src/part${p}`,
			label: `part${p}`,
			description: '',
			filePaths: paths,
			keySymbols: []
		};
	});
	files.set('src/.env' as FilePath, record('src/.env', []));
	nodes[0].filePaths.push('src/.env');
	const level: MapLevel = {
		parentId: 'dir:src',
		naming: 'grouped',
		nodes,
		edges: [],
		assignment: null
	};
	return {
		target: { project: 'demo', nodeId: 'dir:src', folder: 'src', level },
		codeMap: { version: 2, root: null, files }
	};
}

const valid = (target: NamingTarget) =>
	JSON.stringify({
		nodes: target.level.nodes.map((n, i) => ({
			id: n.id,
			label: `Part ${i}`,
			description: 'Does a thing.',
			keySymbols: [`fn${i}`]
		}))
	});

describe('buildNamingPrompt', () => {
	it('lists each part by id with paths and declared names, and never an env file', () => {
		const { target, codeMap } = fixture(2);
		const prompt = buildNamingPrompt(target, codeMap)!;
		expect(prompt).toContain('"id":"dir:src/part0"');
		expect(prompt).toContain('src/part1/file1.ts');
		expect(prompt).toContain('function helper1');
		expect(prompt).not.toContain('.env');
	});

	it('is the same text for the same input', () => {
		const { target, codeMap } = fixture(3);
		expect(buildNamingPrompt(target, codeMap)).toBe(buildNamingPrompt(target, codeMap));
	});

	it('shrinks samples to stay under the byte cap, and refuses too many parts', () => {
		const big = fixture(MAX_PARTS, 400);
		const prompt = buildNamingPrompt(big.target, big.codeMap)!;
		expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(MAX_PROMPT_BYTES);
		const tooMany = fixture(MAX_PARTS + 1);
		expect(buildNamingPrompt(tooMany.target, tooMany.codeMap)).toBeNull();
	});
});

describe('importCount', () => {
	it('counts the import statements of an edge, not the calls its evidence also cites', () => {
		// Arrange
		const ref = (line: number, relation: 'imports_from' | 'calls') => ({
			path: 'src/a.ts' as FilePath,
			line,
			relation,
			toPath: 'lib/b.ts' as FilePath,
			confidence: 'EXTRACTED' as const
		});
		const edge: MapEdge = {
			source: 'dir:src',
			target: 'dir:lib',
			type: 'depends_on',
			label: null,
			evidence: {
				confidence: 'EXTRACTED' as const,
				refs: [ref(1, 'imports_from'), ref(4, 'calls'), ref(5, 'calls')] as const
			}
		};

		// Act
		const count = importCount(edge);

		// Assert
		expect(count).toBe(1);
	});
});

describe('parseNamingAnswer', () => {
	it('reads names from a fenced or prose-wrapped answer', () => {
		const text =
			'Here you go:\n```json\n{"nodes":[{"id":"a","label":"Auth","description":"","keySymbols":[]}]}\n```';
		expect(parseNamingAnswer(text)).toEqual({
			ok: true,
			names: [{ id: 'a', label: 'Auth', description: '', keySymbols: [] }]
		});
	});

	it('names each problem of a malformed answer', () => {
		expect(parseNamingAnswer('no')).toMatchObject({ ok: false });
		const long = parseNamingAnswer(
			JSON.stringify({
				nodes: [{ id: 'a', label: 'x'.repeat(61), description: '', keySymbols: [] }]
			})
		);
		expect(long).toEqual({ ok: false, problems: [expect.stringContaining('label for a')] });
	});
});

describe('readCliOutput', () => {
	it('unwraps claude JSON output and keeps its token counts', () => {
		const out = readCliOutput(
			JSON.stringify({
				result: 'answer',
				usage: { input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 5 },
				total_cost_usd: 0.01
			})
		);
		expect(out).toEqual({
			text: 'answer',
			usage: {
				inputTokens: 3,
				outputTokens: 4,
				cacheReadTokens: 5,
				cacheCreationTokens: 0,
				costUsd: 0.01
			}
		});
	});

	it('takes plain text as the answer, and rejects a reported error', () => {
		expect(readCliOutput('{"nodes":[]}')).toEqual({ text: '{"nodes":[]}', usage: null });
		expect(() => readCliOutput(JSON.stringify({ result: 'quota', is_error: true }))).toThrow(
			'quota'
		);
	});
});

describe('nameLevel', () => {
	it('asks again with the complaints, then returns the passing level', async () => {
		// Arrange
		const { target, codeMap } = fixture(2);
		const prompts: string[] = [];
		const answers = ['not json', valid(target)];

		// Act
		const outcome = await nameLevel(target, {
			codeMap,
			run: async (prompt) => (prompts.push(prompt), answers.shift()!),
			verify: () => []
		});

		// Assert
		expect(outcome).toMatchObject({ ok: true, attempts: 2, level: { naming: 'named' } });
		expect(prompts[1]).toContain('"nodes" array');
	});

	it('fails verification after two refused answers', async () => {
		const { target, codeMap } = fixture(2);
		const outcome = await nameLevel(target, {
			codeMap,
			run: async () => valid(target),
			verify: () => ['levels[1].nodes[0].keySymbols[0]: No file declares "x".']
		});
		expect(outcome).toMatchObject({ ok: false, code: 'verification-failed', attempts: 2 });
	});

	it('does not ask a CLI that failed again, and lets cancellation through', async () => {
		const { target, codeMap } = fixture(2);
		let runs = 0;
		const failed = await nameLevel(target, {
			codeMap,
			run: async () => {
				runs++;
				throw new CliError('timeout', 'No answer within 5 ms.');
			},
			verify: () => []
		});
		expect(failed).toMatchObject({ ok: false, code: 'naming-failed', attempts: 1 });
		expect(runs).toBe(1);
		await expect(
			nameLevel(target, {
				codeMap,
				run: async () => {
					throw new CliError('aborted', 'Cancelled.');
				},
				verify: () => []
			})
		).rejects.toMatchObject({ reason: 'aborted' });
	});
});

describe('headlessCommand', () => {
	it('turns off what each CLI lets the bridge turn off', () => {
		expect(headlessCommand('claude', 'hi')).toEqual({
			args: [
				'-p',
				'--output-format',
				'json',
				'--no-session-persistence',
				'--strict-mcp-config',
				'--tools',
				''
			],
			stdin: 'hi'
		});
		expect(headlessCommand('gemini', 'hi')).toEqual({
			args: [
				'-p',
				'hi',
				'--approval-mode',
				'default',
				'--allowed-mcp-server-names',
				'ropeman-none',
				'-e',
				'none'
			],
			stdin: null
		});
	});
});

describe.skipIf(process.platform === 'win32')('CliRunner', () => {
	const base = { stdin: null, timeoutMs: 5_000, maxOutputBytes: 1_000 };
	const runner = new CliRunner(2, os.tmpdir());

	it('stops a run whose output passes the cap', async () => {
		const run = runner.run({ ...base, command: 'yes', args: [] });
		await expect(run).rejects.toMatchObject({ reason: 'too-large' });
	});

	it('reports a missing program', async () => {
		const run = runner.run({ ...base, command: 'ropeman-no-such-cli', args: [] });
		await expect(run).rejects.toMatchObject({ reason: 'not-found' });
	});

	it('passes arguments as argv, so shell syntax stays text', async () => {
		const out = await runner.run({ ...base, command: 'printf', args: ['%s', '$(id) `id`; id'] });
		expect(out).toBe('$(id) `id`; id');
	});
});
