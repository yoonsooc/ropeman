import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
	CodeMap,
	CodeProvenance,
	FilePath,
	FileRecord,
	SymbolId,
	SymbolRecord
} from '$lib/types/codeMap';
import { fileEdges, folderView, partOf, renderPrompt } from './view';
import { adjustedRandIndex, checkAnswer, labels, parseAnswer, type Group } from './checks';
import {
	planRuns,
	preregistrationSection,
	readOptions,
	readPreregistration,
	refuseCalls
} from './experiment';

const extracted: CodeProvenance = { source: 'graphify', confidence: 'EXTRACTED' };
const inferred: CodeProvenance = { source: 'graphify', confidence: 'INFERRED' };

const fn = (path: string, name: string, line = 1): SymbolRecord => ({
	id: `${path}#${name}` as SymbolId,
	name,
	kind: 'function',
	lines: { start: line, end: line + 2 },
	badges: [],
	children: []
});

function file(path: string, parts: Partial<FileRecord> = {}): FileRecord {
	return {
		path: path as FilePath,
		language: 'typescript',
		lines: { start: 1, end: null },
		symbols: [],
		imports: [],
		reexports: [],
		refs: [],
		...parts
	};
}

const importOf = (line: number, to: string, provenance: CodeProvenance = extracted) => ({
	line,
	text: `import x from '${to}'`,
	module: {
		state: 'bound' as const,
		candidates: [{ to: { kind: 'file' as const, path: to as FilePath }, provenance }] as const
	},
	specifiers: null
});

const callOf = (line: number, target: string) => ({
	kind: 'calls' as const,
	line,
	from: null,
	written: target.split('#')[1],
	target: {
		state: 'bound' as const,
		candidates: [
			{ to: { kind: 'symbol' as const, id: target as SymbolId }, provenance: extracted }
		] as const
	}
});

/** src/api calls into src/db; src/ui imports src/api; one INFERRED import that must not show. */
function fixtureMap(): CodeMap {
	const records = [
		file('src/api/routes.ts', {
			symbols: [fn('src/api/routes.ts', 'handle')],
			imports: [importOf(1, 'src/db/store.ts')],
			refs: [callOf(5, 'src/db/store.ts#save'), callOf(6, 'src/db/store.ts#save')]
		}),
		file('src/db/store.ts', { symbols: [fn('src/db/store.ts', 'save')] }),
		file('src/ui/page.ts', {
			imports: [importOf(2, 'src/api/routes.ts'), importOf(3, 'src/db/store.ts', inferred)]
		}),
		file('src/main.ts')
	];
	return { version: 2, root: null, files: new Map(records.map((r) => [r.path, r])) };
}

describe('folderView', () => {
	it('splits a folder into its subfolders and own files with counts', () => {
		// Arrange
		const map = fixtureMap();

		// Act
		const view = folderView(map, 'src', fileEdges(map));

		// Assert
		expect(view.parts.map((p) => [p.path, p.type, p.files])).toEqual([
			['src/api', 'folder', 1],
			['src/db', 'folder', 1],
			['src/main.ts', 'file', 1],
			['src/ui', 'folder', 1]
		]);
		expect(view.parts[0].names).toEqual(['handle']);
	});

	it('keeps EXTRACTED cross-part relations by kind with their sites, and drops INFERRED ones', () => {
		// Arrange
		const map = fixtureMap();

		// Act
		const view = folderView(map, 'src', fileEdges(map));

		// Assert
		expect(view.relations).toEqual([
			{
				from: 'src/api',
				to: 'src/db',
				kind: 'calls',
				count: 2,
				evidence: [
					{ path: 'src/api/routes.ts', line: 5, to: 'src/db/store.ts' },
					{ path: 'src/api/routes.ts', line: 6, to: 'src/db/store.ts' }
				]
			},
			{
				from: 'src/api',
				to: 'src/db',
				kind: 'imports',
				count: 1,
				evidence: [{ path: 'src/api/routes.ts', line: 1, to: 'src/db/store.ts' }]
			},
			{
				from: 'src/ui',
				to: 'src/api',
				kind: 'imports',
				count: 1,
				evidence: [{ path: 'src/ui/page.ts', line: 2, to: 'src/api/routes.ts' }]
			}
		]);
	});

	it('renders the same prompt for the same map', () => {
		// Arrange
		const a = fixtureMap();
		const b = fixtureMap();

		// Act
		const pa = renderPrompt(folderView(a, 'src', fileEdges(a)));
		const pb = renderPrompt(folderView(b, 'src', fileEdges(b)));

		// Assert
		expect(pa).toBe(pb);
	});
});

describe('partOf', () => {
	it('names the direct child a path falls in, or null outside the folder', () => {
		expect(partOf('src/api/routes.ts', 'src')).toBe('src/api');
		expect(partOf('src/main.ts', 'src')).toBe('src/main.ts');
		expect(partOf('src/main.ts', '')).toBe('src');
		expect(partOf('srcx/a.ts', 'src')).toBeNull();
	});
});

describe('checkAnswer', () => {
	const map = fixtureMap();
	const view = folderView(map, 'src', fileEdges(map));
	const reply = (groups: Group[]) => JSON.stringify({ groups });
	const group = (members: string[], evidence: Group['evidence'] = []): Group => ({
		name: 'n',
		summary: 's',
		members,
		evidence
	});

	it('passes a partition that cites only input sites', () => {
		// Arrange
		const text = reply([
			group(['src/api', 'src/db'], [{ path: 'src/api/routes.ts', line: 5, to: 'src/db/store.ts' }]),
			group(['src/ui', 'src/main.ts'])
		]);

		// Act
		const result = checkAnswer(view, parseAnswer(text));

		// Assert
		expect(result).toMatchObject({
			pass: true,
			strictJson: true,
			missing: 0,
			evidenceInInput: 1,
			evidenceOnGroup: 1,
			groupsWithEvidence: 1
		});
	});

	it('fails a reply that drops a part, repeats one, invents one or cites a site not in the input', () => {
		// Arrange
		const text = reply([
			group(
				['src/api', 'src/db', 'src/nope'],
				[{ path: 'src/api/routes.ts', line: 99, to: 'src/db/store.ts' }]
			),
			group(['src/db'])
		]);

		// Act
		const result = checkAnswer(view, parseAnswer(text));

		// Assert
		expect(result).toMatchObject({
			pass: false,
			missing: 2,
			duplicated: 1,
			unknown: 1,
			evidence: 1,
			evidenceInInput: 0
		});
	});

	it('still reads a fenced reply but marks it as not strict JSON', () => {
		// Arrange
		const text =
			'```json\n' +
			reply([group(['src/api', 'src/db']), group(['src/ui', 'src/main.ts'])]) +
			'\n```';

		// Act
		const result = checkAnswer(view, parseAnswer(text));

		// Assert
		expect(result.parsed).toBe(true);
		expect(result.strictJson).toBe(false);
		expect(result.pass).toBe(true);
	});

	it('fails a reply that is not JSON', () => {
		expect(checkAnswer(view, parseAnswer('I think the groups are...')).parsed).toBe(false);
	});
});

describe('adjustedRandIndex', () => {
	const of = (groups: string[][]) =>
		labels(groups.map((members) => ({ name: '', summary: '', members, evidence: [] })));

	it('is 1 for the same partition under other group order', () => {
		expect(
			adjustedRandIndex(
				of([
					['a', 'b'],
					['c', 'd']
				]),
				of([
					['c', 'd'],
					['b', 'a']
				])
			)
		).toBe(1);
	});

	it('matches the textbook value for a one-item move', () => {
		// {a,b,c},{d,e,f} vs {a,b},{c,d,e,f}: index 4, expected 6 * 7 / 15 = 2.8, max 6.5
		const ari = adjustedRandIndex(
			of([
				['a', 'b', 'c'],
				['d', 'e', 'f']
			]),
			of([
				['a', 'b'],
				['c', 'd', 'e', 'f']
			])
		);
		expect(ari).toBeCloseTo(1.2 / 3.7, 10);
	});

	it('scores only the parts both groupings place', () => {
		expect(
			adjustedRandIndex(
				of([['a', 'b'], ['c', 'd'], ['x']]),
				of([
					['a', 'b'],
					['c', 'd']
				])
			)
		).toBe(1);
	});

	it('is 0 for one group against all singletons', () => {
		expect(adjustedRandIndex(of([['a', 'b', 'c']]), of([['a'], ['b'], ['c']]))).toBe(0);
	});
});

const repo = resolve(__dirname, '../..');
const DOC = 'docs/measurements/2026-11-13-paseo-graphify-comparison.md';

/** Each `run.mjs` command in the doc's rerun block, as the arguments after the script */
function documentedRuns(markdown: string): string[][] {
	const block = markdown.slice(markdown.indexOf('## 4.')).split('```sh')[1].split('```')[0];
	return block
		.replace(/\\\n\s*/g, ' ')
		.split('\n')
		.filter((line) => line.startsWith('node scripts/paseo-comparison/run.mjs '))
		.map((line) => line.trim().split(/\s+/).slice(2));
}

describe('the documented rerun', () => {
	it('gives flags that pass the call guard for all 30 pre-registered calls', async () => {
		const options = documentedRuns(readFileSync(resolve(repo, DOC), 'utf8')).map(readOptions);
		const calls = options.filter((o) => o !== null && !o.dryRun);

		expect(options).toHaveLength(2);
		expect(options.every((o) => o !== null)).toBe(true);
		expect(calls).toHaveLength(1);
		const o = calls[0]!;
		const prereg = o.prereg === null ? null : await readPreregistration(resolve(repo, o.prereg));
		expect(planRuns(o)).toHaveLength(30);
		expect(refuseCalls(planRuns(o).length, o, prereg)).toBeNull();
	});
});

describe('refuseCalls', () => {
	const options = (...extra: string[]) =>
		readOptions(['--repo', 'r', '--graph', 'g.json', '--out', 'o', ...extra])!;
	const prereg = { file: 'doc.md', sha256: 'ab' };

	it('refuses more calls than --max-calls, which defaults to 24', () => {
		expect(refuseCalls(25, options(), prereg)).toMatch(/over --max-calls 24/);
		expect(refuseCalls(24, options(), prereg)).toBeNull();
		expect(refuseCalls(30, options('--max-calls', '30'), prereg)).toBeNull();
	});

	it('refuses model calls without a pre-registration, but not a rerun that makes none', () => {
		expect(refuseCalls(1, options(), null)).toMatch(/--prereg/);
		expect(refuseCalls(0, options(), null)).toBeNull();
	});
});

describe('preregistrationSection', () => {
	const doc = (rule: string, result: string) =>
		`# Title\n\n## 1. Goal\n\ngoal\n\n## 2. 사전 등록\n\n${rule}\n\n## 3. 결과\n\n${result}\n`;

	it('covers the pre-registration up to the next section, so results do not change it', () => {
		const section = preregistrationSection(doc('rule A', 'result 1'));

		expect(section).toBe('## 2. 사전 등록\n\nrule A\n');
		expect(preregistrationSection(doc('rule A', 'result 2'))).toBe(section);
		expect(preregistrationSection(doc('rule B', 'result 1'))).not.toBe(section);
	});

	it('is null for a file with no pre-registration section', () => {
		expect(preregistrationSection('# Title\n\n## 1. Goal\n')).toBeNull();
	});

	it('finds the section in the comparison doc', () => {
		const section = preregistrationSection(readFileSync(resolve(repo, DOC), 'utf8'));

		expect(section).toContain('### 2-6. 판정 규칙');
		expect(section).not.toContain('## 3. 결과');
	});
});
