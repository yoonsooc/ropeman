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

/** The checks on a map the parser accepts; a test that means a parser refusal says so. */
function check(map: unknown, codeMap: CodeMap) {
	const result = verifyMap(map, codeMap);
	if (!result.parsed) throw new Error(`${result.failure.code} at ${result.failure.at}`);
	return result;
}

const codes = (map: RopemanMap, codeMap: CodeMap) =>
	check(map, codeMap).violations.map(({ code, at }) => ({ code, at }));

/** A Korean file name as macOS spells it on disk (NFD) and as an LLM writes it (NFC). */
const CART_KO = 'src/ui/장바구니.svelte';
const NFD = CART_KO.normalize('NFD');
const NFC = CART_KO.normalize('NFC');

describe('verifyMap on a true map', () => {
	it.each([null, 'sample-shop'])('passes the fixture against its code (root %s)', (root) => {
		const result = check(fixtureMap(), shopCode(root));

		expect(result.violations).toEqual([]);
		expect(result.checked).toEqual({ files: 6, levels: 2, nodes: 5, edges: 2, refs: 1 });
	});

	// ADR-21: an LLM relation with no code behind it is allowed, dashed, and not a fact
	it('passes an INFERRED edge that cites nothing and lists it as unverified', () => {
		const result = check(fixtureMap(), shopCode(null));

		expect(result.violations).toEqual([]);
		expect(result.unverified).toEqual([
			{ at: 'levels[0].edges[1]', level: 0, source: 'sem:ui', target: 'sem:api' }
		]);
	});

	it('returns the parsed copy, so a later change to the input is not what was verified', () => {
		const input = fixtureMap();

		const result = check(input, shopCode(null));
		input.levels[0].nodes[0].filePaths.push('src/api/payments.ts');

		expect(result.map).not.toBe(input);
		expect(result.map.levels[0].nodes[0].filePaths).toEqual([
			'src/api/routes.ts',
			'src/api/auth.ts'
		]);
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

		const result = check(map, shopCode(null));
		expect(result.violations).toEqual([]);
		// It cites a name-matched call, so it is not in the list of edges with nothing behind them
		expect(result.unverified.map((e) => e.at)).toEqual(['levels[0].edges[1]']);
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
	'assignment-left-out': {
		// Three files went to no role, yet no node holds three: the count is not this level's
		break: (map) =>
			(map.levels[0].assignment = { leftOut: 3, duplicated: 0, invented: 0, emptied: 0 }),
		expected: [{ code: 'assignment-left-out', at: 'levels[0].assignment.leftOut' }]
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
	'path-collision': {
		// Linux keeps both spellings as two files; a map path cannot say which one it means
		break: (map, extra) => {
			extra.push(emptyFile(NFC), emptyFile(NFD));
			map.files.push({ path: NFC, reason: 'no-symbols' });
		},
		expected: [{ code: 'path-collision', at: 'files' }]
	},
	'key-symbol-unknown': {
		// A plausible name the code does not have
		break: (map) => map.levels[0].nodes[0].keySymbols.push('checkout'),
		expected: [{ code: 'key-symbol-unknown', at: 'levels[0].nodes[0].keySymbols[2]' }]
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

		expect(check(map, shopCode(null)).violations).toEqual([
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
			// auth.ts left sem:api, and requireSession with it
			{ code: 'key-symbol-unknown', at: 'levels[0].nodes[0].keySymbols[1]' },
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

	it('refuses a reason that says a file of the code map was never read', () => {
		const map = fixtureMap();
		map.files[1].reason = 'env-values';

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'coverage-mismatch', at: 'files[1].reason' },
			// Not sent, so auth.ts is outside the top scope and the scope of sem:api's level
			{ code: 'file-outside-scope', at: 'levels[0].nodes[0].filePaths[1]' },
			{ code: 'file-outside-scope', at: 'levels[1].nodes[1].filePaths[0]' }
		]);
	});

	it('checks the source end too: a real import inside sem:storage does not back sem:api', () => {
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [ref('src/db/client.ts', 2, 'imports_from', 'src/db/schema.ts')]
		};

		expect(codes(map, shopCode(null))).toEqual([
			{ code: 'evidence-ends', at: 'levels[0].edges[0].evidence.refs[0]' }
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
		'src/api/\u0000routes.ts'
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

	// The parser refuses an empty ref path, so an empty one gets here only as a node file
	it('refuses an empty node file', () => {
		const map = fixtureMap();
		map.levels[1].nodes[0].filePaths = [''];

		expect(codes(map, shopCode(null))).toEqual([
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

describe('verifyMap parses before it checks', () => {
	// The verifier's probes on #76: each skipped the parser and either passed or threw
	it.each([
		{
			probe: 'EXTRACTED evidence that cites nothing',
			break: (map: RopemanMap) =>
				Object.assign(map.levels[0].edges[0], { evidence: { confidence: 'EXTRACTED', refs: [] } }),
			at: 'levels[0].edges[0].evidence.refs'
		},
		{
			probe: 'INFERRED evidence that cites an EXTRACTED ref',
			break: (map: RopemanMap) =>
				Object.assign(map.levels[0].edges[0].evidence!, { confidence: 'INFERRED' }),
			at: 'levels[0].edges[0].evidence.refs[0].confidence'
		},
		{
			probe: 'a node with an id only',
			break: (map: RopemanMap) => Object.assign(map.levels[0], { nodes: [{ id: 'A' }] }),
			at: 'levels[0].nodes[0].label'
		},
		{
			probe: 'files: null',
			break: (map: RopemanMap) => Object.assign(map, { files: null }),
			at: 'files'
		}
	])('returns the parser refusal for $probe instead of checking it', ({ break: breakIt, at }) => {
		const map = fixtureMap();
		breakIt(map);

		const result = verifyMap(map, shopCode(null));

		expect(result).toMatchObject({ parsed: false, failure: { code: 'invalid', at } });
	});

	// The tree is the parser's (ADR-24), so the verifier has no codes of its own for it
	it.each([
		{
			tree: 'no top level',
			break: (map: RopemanMap) => (map.levels[0].parentId = 'sem:ui'),
			at: 'levels'
		},
		{
			tree: 'an unknown parent',
			break: (map: RopemanMap) => (map.levels[1].parentId = 'sem:payments'),
			at: 'levels[1].parentId'
		},
		{
			tree: 'a node id used twice',
			break: (map: RopemanMap) => (map.levels[1].nodes[1].id = 'sem:ui'),
			at: 'levels[1].nodes[1].id'
		},
		{
			tree: 'an edge to a node of another level',
			break: (map: RopemanMap) => (map.levels[0].edges[1].source = 'dir:src/api/auth.ts'),
			at: 'levels[0].edges[1].source'
		}
	])('returns the parser refusal for $tree', ({ break: breakIt, at }) => {
		const map = fixtureMap();
		breakIt(map);

		expect(verifyMap(map, shopCode(null))).toMatchObject({
			parsed: false,
			failure: { code: 'invalid', at }
		});
	});

	it.each([null, undefined, 42, 'ropeman.json', [], {}])('never throws, even on %j', (input) => {
		const result = verifyMap(input, shopCode(null));

		expect(result).toMatchObject({ parsed: false, failure: { code: 'not-a-map' } });
	});
});

describe('verifyMap with names macOS and LLMs spell apart', () => {
	/** The fixture with Cart's Korean sibling, the code map spelling it `onDisk`, the map `inMap`. */
	function koreanCart(onDisk: string, inMap: string, root: string | null = null) {
		const map = fixtureMap();
		map.files.push({ path: inMap, reason: 'sent' });
		map.levels[0].nodes[2].filePaths.push(inMap);
		return { map, codeMap: shopCode(root, [emptyFile(onDisk)]) };
	}

	it.each([
		{ onDisk: NFD, inMap: NFC, root: null },
		{ onDisk: NFD, inMap: NFC, root: 'sample-shop' },
		{ onDisk: NFC, inMap: NFD, root: null }
	])('matches a Korean file name across NFC and NFD (root $root)', ({ onDisk, inMap, root }) => {
		const { map, codeMap } = koreanCart(onDisk, inMap, root);

		expect(codes(map, codeMap)).toEqual([]);
	});

	it('fails a map when two code map files are one name in NFC', () => {
		const { map, codeMap } = koreanCart(NFD, NFC);
		codeMap.files = new Map([
			...codeMap.files,
			[NFC as FilePath, { ...codeMap.files.get(NFD as FilePath)!, path: NFC as FilePath }]
		]);

		expect(check(map, codeMap).violations).toEqual([
			{
				code: 'path-collision',
				at: 'files',
				level: null,
				nodeId: null,
				path: NFC,
				message: `${JSON.stringify(NFC)} and ${JSON.stringify(NFD)} are one path in NFC.`
			}
		]);
	});
});

describe('verifyMap on key symbols and counts', () => {
	it('accepts a dotted name of a nested symbol and refuses a symbol of another node', () => {
		const codeMap = shopCode(null);
		const auth = codeMap.files.get('src/api/auth.ts' as FilePath)!;
		auth.symbols[0].children.push({
			...auth.symbols[0],
			id: 'src/api/auth.ts#requireSession.refresh' as SymbolId,
			name: 'refresh',
			children: []
		});
		const map = fixtureMap();
		map.levels[0].nodes[0].keySymbols = ['requireSession.refresh', 'refresh', 'Cart'];

		expect(codes(map, codeMap)).toEqual([
			{ code: 'key-symbol-unknown', at: 'levels[0].nodes[0].keySymbols[2]' }
		]);
	});

	it('accepts leftOut when one node holds that many files, as the unclassified node does', () => {
		const map = fixtureMap();
		map.levels[0].assignment = { leftOut: 1, duplicated: 2, invented: 1, emptied: 1 };

		expect(codes(map, shopCode(null))).toEqual([]);
	});
});

describe('verifyMap reads a symbol target through to its file', () => {
	function callTo(id: string, line: number) {
		const codeMap = shopCode(null);
		codeMap.files.get('src/api/routes.ts' as FilePath)!.refs.push({
			kind: 'calls',
			line,
			from: null,
			written: 'x',
			target: {
				state: 'bound',
				candidates: [
					{
						to: { kind: 'symbol', id: id as SymbolId },
						provenance: { source: 'resolver', confidence: 'EXTRACTED' }
					}
				]
			}
		});
		const map = fixtureMap();
		map.levels[0].edges[0].evidence = {
			confidence: 'EXTRACTED',
			refs: [ref('src/api/routes.ts', line, 'calls', 'src/db/schema.ts')]
		};
		return codes(map, codeMap);
	}

	it('finds the file of a symbol whose name holds a `#`', () => {
		expect(callTo('src/db/schema.ts#Orders#v2', 11)).toEqual([]);
	});

	// The old slice dropped the last character, so `schema.tsx` read as `schema.ts`
	it('backs nothing with an id that has no `#`', () => {
		expect(callTo('src/db/schema.tsx', 12)).toEqual([
			{ code: 'evidence-unknown', at: 'levels[0].edges[0].evidence.refs[0]' }
		]);
	});
});
