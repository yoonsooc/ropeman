import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
	Binding,
	CodeMap,
	Endpoint,
	FileEnd,
	FilePath,
	FileRecord,
	ModuleSite,
	SymbolEnd,
	SymbolId
} from '$lib/types/codeMap';
import { VIOLATION_RULES, type ViolationCode } from '$lib/types/mapVerification';
import type { RopemanMap } from '$lib/types/ropemanMap';
import { isNormalizedPath, verifyMap } from './mapVerifier';
import { parseRopemanMap } from './ropemanMapSchema';

const FIXTURE = fileURLToPath(
	new URL('../../../tests/fixtures/ropeman-map/ropeman.json', import.meta.url)
);

/** The schema fixture as the parser reads it, mutable so a case can break one field. */
function fixtureMap(): RopemanMap {
	const parsed = parseRopemanMap(fs.readFileSync(FIXTURE, 'utf8'));
	if (!parsed.ok) throw new Error(parsed.message);
	return parsed.value;
}

type Draft = { path: string; record: Omit<FileRecord, 'path'> };

/**
 * The sample-shop code the fixture map describes. `root` is null as the Node core names files,
 * or the project folder as the browser loaders do.
 */
function shopCode(root: string | null, extra: Draft[] = []): CodeMap {
	const fp = (path: string) => (root === null ? path : `${root}/${path}`) as FilePath;
	const symbol = (path: string, name: string): SymbolEnd => ({
		kind: 'symbol',
		id: `${fp(path)}#${name}` as SymbolId
	});
	const extracted = <E extends Endpoint>(to: E): Binding<E> => ({
		state: 'bound',
		candidates: [{ to, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }]
	});
	const file = (path: string): FileEnd => ({ kind: 'file', path: fp(path) });
	const imp = (line: number, to: string, name: string): ModuleSite => ({
		line,
		text: `import { ${name} } from '${to}'`,
		module: extracted(file(to)),
		specifiers: [
			{
				kind: 'named',
				name,
				local: name,
				typeOnly: false,
				target: extracted(symbol(to, name))
			}
		]
	});
	const record = (
		path: string,
		symbols: string[],
		parts: Partial<FileRecord> = {}
	): Omit<FileRecord, 'path'> => ({
		language: 'typescript',
		lines: { start: 1, end: 20 },
		symbols: symbols.map((name, i) => ({
			id: `${fp(path)}#${name}` as SymbolId,
			name,
			kind: 'function',
			lines: { start: i + 1, end: i + 1 },
			badges: [],
			children: []
		})),
		imports: [],
		reexports: [],
		refs: [],
		...parts
	});
	const drafts: Draft[] = [
		{
			path: 'src/api/routes.ts',
			record: record('src/api/routes.ts', ['router'], {
				imports: [imp(1, 'src/api/auth.ts', 'requireSession'), imp(3, 'src/db/client.ts', 'db')],
				refs: [
					{
						kind: 'calls',
						line: 9,
						from: null,
						written: 'orders',
						// The resolver matched the name only
						target: {
							state: 'bound',
							candidates: [
								{
									to: symbol('src/db/schema.ts', 'orders'),
									provenance: { source: 'resolver', confidence: 'INFERRED' }
								}
							]
						}
					},
					{
						kind: 'calls',
						line: 10,
						from: null,
						written: 'z.object',
						target: extracted({ kind: 'external', module: 'zod', name: 'object' })
					}
				]
			})
		},
		{ path: 'src/api/auth.ts', record: record('src/api/auth.ts', ['requireSession']) },
		{
			path: 'src/db/client.ts',
			record: record('src/db/client.ts', ['db'], {
				imports: [imp(2, 'src/db/schema.ts', 'orders')]
			})
		},
		{ path: 'src/db/schema.ts', record: record('src/db/schema.ts', ['orders']) },
		{
			path: 'src/ui/Cart.svelte',
			record: record('src/ui/Cart.svelte', ['Cart'], {
				language: 'svelte',
				imports: [imp(2, 'src/api/routes.ts', 'router')]
			})
		},
		...extra
	];
	return {
		version: 2,
		root,
		files: new Map(drafts.map((d) => [fp(d.path), { path: fp(d.path), ...d.record }]))
	};
}

const emptyFile = (path: string): Draft => ({
	path,
	record: {
		language: 'typescript',
		lines: { start: 1, end: 1 },
		symbols: [],
		imports: [],
		reexports: [],
		refs: []
	}
});

const codes = (map: RopemanMap, codeMap: CodeMap) =>
	verifyMap(map, codeMap).violations.map(({ code, at }) => ({ code, at }));

describe('verifyMap on a true map', () => {
	it.each([null, 'sample-shop'])('passes the fixture against its code (root %s)', (root) => {
		const result = verifyMap(fixtureMap(), shopCode(root));

		expect(result.violations).toEqual([]);
		expect(result.checked).toEqual({ files: 6, levels: 2, nodes: 5, edges: 2, refs: 1 });
	});

	it('accepts an INFERRED ref that is a name-matched relation of the code', () => {
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'INFERRED',
			refs: [
				{
					path: 'src/api/routes.ts' as FilePath,
					line: 9,
					relation: 'calls',
					toPath: 'src/db/schema.ts' as FilePath,
					confidence: 'INFERRED'
				}
			]
		};

		expect(codes(map, shopCode(null))).toEqual([]);
	});

	it('accepts a ref to a symbol an import names, read through the symbol to its file', () => {
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [
				{
					path: 'src/api/routes.ts' as FilePath,
					line: 3,
					relation: 'imports',
					toPath: 'src/db/client.ts' as FilePath,
					confidence: 'EXTRACTED'
				}
			]
		};

		expect(codes(map, shopCode('sample-shop'))).toEqual([]);
	});
});

type Case = {
	break: (map: RopemanMap, extra: Draft[]) => void;
	expected: { code: ViolationCode; at: string }[];
};

const ref = (path: string, line: number, relation: 'imports_from' | 'calls', toPath: string) => ({
	path: path as FilePath,
	line,
	relation,
	toPath: toPath as FilePath,
	confidence: 'EXTRACTED' as const
});

/**
 * One break per code, each a mistake a writer makes: an LLM that leaves a file out, lists one
 * twice, invents a path or claims a relation the code does not have; a writer that builds the
 * level tree or the coverage list wrong. A Record, so a new code without a case does not compile.
 */
const CASES: Record<ViolationCode, Case> = {
	'level-root': {
		break: (map) => (map.levels[0].parentId = 'sem:ui'),
		expected: [{ code: 'level-root', at: 'levels' }]
	},
	'level-parent-unknown': {
		break: (map) => (map.levels[1].parentId = 'sem:payments'),
		expected: [{ code: 'level-parent-unknown', at: 'levels[1].parentId' }]
	},
	'level-parent-twice': {
		break: (map) =>
			map.levels.push({
				...map.levels[1],
				nodes: map.levels[1].nodes.map((n) => ({ ...n, id: `again:${n.id}` }))
			}),
		expected: [{ code: 'level-parent-twice', at: 'levels[2].parentId' }]
	},
	'level-unreachable': {
		break: (map) => {
			const node = (id: string) => ({
				id,
				label: id,
				description: '',
				filePaths: ['src/api/auth.ts'],
				keySymbols: []
			});
			map.levels.push(
				{
					parentId: 'loop:b',
					naming: 'grouped',
					nodes: [node('loop:a')],
					edges: [],
					assignment: null
				},
				{
					parentId: 'loop:a',
					naming: 'grouped',
					nodes: [node('loop:b')],
					edges: [],
					assignment: null
				}
			);
		},
		expected: [
			{ code: 'level-unreachable', at: 'levels[2].parentId' },
			{ code: 'level-unreachable', at: 'levels[3].parentId' }
		]
	},
	'node-id-duplicate': {
		break: (map) => (map.levels[1].nodes[1].id = 'sem:ui'),
		expected: [{ code: 'node-id-duplicate', at: 'levels[1].nodes[1].id' }]
	},
	'edge-end-unknown': {
		break: (map) => (map.levels[0].edges[1].source = 'sem:payments'),
		expected: [{ code: 'edge-end-unknown', at: 'levels[0].edges[1].source' }]
	},
	'file-unassigned': {
		// The grouped level of sem:api forgot auth.ts
		break: (map) => map.levels[1].nodes.pop(),
		expected: [{ code: 'file-unassigned', at: 'levels[1]' }]
	},
	'file-duplicated': {
		break: (map) => map.levels[0].nodes[1].filePaths.push('src/api/routes.ts'),
		expected: [{ code: 'file-duplicated', at: 'levels[0].nodes[1].filePaths[2]' }]
	},
	'file-outside-scope': {
		// sem:api does not hold schema.ts, so its expansion may not list it
		break: (map) => map.levels[1].nodes[0].filePaths.push('src/db/schema.ts'),
		expected: [{ code: 'file-outside-scope', at: 'levels[1].nodes[0].filePaths[1]' }]
	},
	'node-empty': {
		// A role whose every file went to another role (T0-7 `emptied`)
		break: (map) =>
			map.levels[0].nodes.push({
				id: 'sem:payments',
				label: 'Payments',
				description: '',
				filePaths: [],
				keySymbols: []
			}),
		expected: [{ code: 'node-empty', at: 'levels[0].nodes[3].filePaths' }]
	},
	'assignment-counts': {
		break: (map) =>
			(map.levels[1].assignment = { leftOut: 0, duplicated: 0, invented: 0, emptied: 0 }),
		expected: [{ code: 'assignment-counts', at: 'levels[1].assignment' }]
	},
	'path-invalid': {
		break: (map) => (map.files[5].path = '../.env'),
		expected: [{ code: 'path-invalid', at: 'files[5].path' }]
	},
	'path-unknown': {
		// An invented file: the LLM's guess at what a payments module would be called
		break: (map) => map.levels[1].nodes[0].filePaths.push('src/api/payments.ts'),
		expected: [{ code: 'path-unknown', at: 'levels[1].nodes[0].filePaths[1]' }]
	},
	'coverage-duplicate': {
		break: (map) => map.files.push({ path: 'src/api/auth.ts', reason: 'sent' }),
		expected: [{ code: 'coverage-duplicate', at: 'files[6].path' }]
	},
	'coverage-missing': {
		break: (_, extra) => extra.push(emptyFile('src/db/migrate.ts')),
		expected: [{ code: 'coverage-missing', at: 'files' }]
	},
	'coverage-mismatch': {
		// A skipped `.env` reported as sent
		break: (map) => (map.files[5].reason = 'sent'),
		expected: [{ code: 'coverage-mismatch', at: 'files[5].reason' }]
	},
	'evidence-missing': {
		break: (map) => (map.levels[0].edges[1].evidence = null),
		expected: [{ code: 'evidence-missing', at: 'levels[0].edges[1].evidence' }]
	},
	'evidence-unknown': {
		// The import is on line 3; the writer cited the line after it
		break: (map) => {
			map.levels[0].edges[0].evidence = {
				confidence: 'EXTRACTED',
				refs: [ref('src/api/routes.ts', 4, 'imports_from', 'src/db/client.ts')]
			};
		},
		expected: [{ code: 'evidence-unknown', at: 'levels[0].edges[0].evidence.refs[0]' }]
	},
	'evidence-ends': {
		// A real import, but inside sem:api: it does not back sem:api -> sem:storage
		break: (map) => {
			map.levels[0].edges[0].evidence = {
				confidence: 'EXTRACTED',
				refs: [ref('src/api/routes.ts', 1, 'imports_from', 'src/api/auth.ts')]
			};
		},
		expected: [{ code: 'evidence-ends', at: 'levels[0].edges[0].evidence.refs[0]' }]
	},
	'evidence-confidence': {
		// The call was matched by name only, and the writer called it EXTRACTED
		break: (map) => {
			map.levels[0].edges[0].evidence = {
				confidence: 'EXTRACTED',
				refs: [ref('src/api/routes.ts', 9, 'calls', 'src/db/schema.ts')]
			};
		},
		expected: [
			{ code: 'evidence-confidence', at: 'levels[0].edges[0].evidence.refs[0].confidence' }
		]
	}
};

describe('verifyMap reports each violation where it is', () => {
	it.each(Object.entries(CASES))('%s', (_, { break: breakIt, expected }) => {
		const map = fixtureMap();
		const extra: Draft[] = [];
		breakIt(map, extra);

		expect(codes(map, shopCode(null, extra))).toEqual(expected);
	});

	it('has a case for every code, and every code belongs to one of the three rules', () => {
		expect(Object.keys(CASES).sort()).toEqual(Object.keys(VIOLATION_RULES).sort());
		expect(new Set(Object.values(VIOLATION_RULES))).toEqual(
			new Set(['assignment', 'path', 'evidence'])
		);
	});
});

describe('verifyMap on real failure shapes', () => {
	it('reports the file, the node and the level so a viewer can mark them', () => {
		const map = fixtureMap();
		map.levels[1].nodes[0].filePaths.push('src/api/payments.ts');

		expect(verifyMap(map, shopCode(null)).violations).toEqual([
			{
				code: 'path-unknown',
				at: 'levels[1].nodes[0].filePaths[1]',
				level: 1,
				nodeId: 'dir:src/api/routes.ts',
				path: 'src/api/payments.ts',
				message: 'src/api/payments.ts is not a file of the code map.'
			}
		]);
	});

	it('reports every violation, not the first one', () => {
		const map = fixtureMap();
		map.levels[0].nodes[0].filePaths = ['src/api/routes.ts', 'src/db/client.ts'];
		map.levels[0].edges[1].evidence = null;

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'file-duplicated', at: 'levels[0].nodes[1].filePaths[0]' },
			{ code: 'file-unassigned', at: 'levels[0]' },
			{ code: 'evidence-missing', at: 'levels[0].edges[1].evidence' },
			{ code: 'file-outside-scope', at: 'levels[1].nodes[1].filePaths[0]' },
			{ code: 'file-unassigned', at: 'levels[1]' }
		]);
	});

	// Local folder paths carry the project folder ("ropeman/src/a.ts"), and models copy it
	it('refuses a path that keeps the project folder the browser puts before its keys', () => {
		const map = fixtureMap();
		map.levels[1].nodes[0].filePaths = ['sample-shop/src/api/routes.ts'];

		expect(codes(map, shopCode('sample-shop'))).toEqual([
			{ code: 'path-unknown', at: 'levels[1].nodes[0].filePaths[0]' },
			{ code: 'file-unassigned', at: 'levels[1]' }
		]);
	});

	it('refuses a file the parser read but did not send, on the top level', () => {
		const map = fixtureMap();
		map.files.push({ path: 'src/api/legacy.ts', reason: 'no-symbols' });
		map.levels[0].nodes[0].filePaths.push('src/api/legacy.ts');

		expect(codes(map, shopCode(null, [emptyFile('src/api/legacy.ts')]))).toEqual([
			{ code: 'file-outside-scope', at: 'levels[0].nodes[0].filePaths[2]' }
		]);
	});

	it('checks each ref end, so a reversed import is reported as not a relation', () => {
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [ref('src/db/client.ts', 3, 'imports_from', 'src/api/routes.ts')]
		};

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'evidence-ends', at: 'levels[0].edges[0].evidence.refs[0]' },
			{ code: 'evidence-unknown', at: 'levels[0].edges[0].evidence.refs[0]' }
		]);
	});

	it('refuses a ref to a package outside the project', () => {
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [ref('src/api/routes.ts', 10, 'calls', 'zod')]
		};

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'path-unknown', at: 'levels[0].edges[0].evidence.refs[0].toPath' }
		]);
	});

	it.each([
		'../src/api/routes.ts',
		'/src/api/routes.ts',
		'C:/src/api/routes.ts',
		'src\\api\\routes.ts',
		'./src/api/routes.ts',
		'src/api/../api/routes.ts',
		'src//api/routes.ts',
		'src/api/routes.ts/',
		'src/api/\u0000routes.ts',
		''
	])('refuses the non-normalized path %j wherever it is', (bad) => {
		const map = fixtureMap();
		map.levels[1].nodes[0].filePaths = [bad];
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [
				{
					...ref('src/api/routes.ts', 3, 'imports_from', 'src/db/client.ts'),
					path: bad as FilePath
				}
			]
		};

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'path-invalid', at: 'levels[0].edges[0].evidence.refs[0].path' },
			{ code: 'path-invalid', at: 'levels[1].nodes[0].filePaths[0]' },
			{ code: 'file-unassigned', at: 'levels[1]' }
		]);
	});

	it.each(['a.ts', '.github/workflows/ci.yml', 'src/routes/[id]/+page.svelte', 'docs/a b.md'])(
		'accepts the normalized path %j',
		(good) => {
			expect(isNormalizedPath(good)).toBe(true);
		}
	);
});
