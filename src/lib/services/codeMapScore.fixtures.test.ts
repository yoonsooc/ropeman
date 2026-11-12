import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from '../../../scripts/vite-dev-fs-plugin.js';
import { isSupported } from '$lib/utils/languageDetector';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { CodeMap, SymbolRecord } from '$lib/types/codeMap';
import { buildCodeMap } from './skeletonExtractor';
import { readGraphifyGraph } from './graphifyAdapter';
import { isResolverConfig, namedConfigs } from './importResolver';
import {
	findRegressions,
	scoreCodeMap,
	toBaseline,
	type Baseline,
	type GroundTruth,
	type Score
} from './codeMapScore';

// The worker loads `/tree-sitter*.wasm` URLs; in Node those resolve to the files in static/.
vi.mock('web-tree-sitter', async (importOriginal) => {
	const real = await importOriginal<typeof import('web-tree-sitter')>();
	const { fileURLToPath } = await import('node:url');
	const fromStatic = (url: string) =>
		fileURLToPath(new URL(`../../../static${url}`, import.meta.url));

	class Parser extends real.Parser {
		static init() {
			return real.Parser.init({ locateFile: () => fromStatic('/tree-sitter.wasm') });
		}
	}
	const Language = { load: (url: string) => real.Language.load(fromStatic(url)) };
	return { Parser, Language, Query: real.Query };
});

const GRAPHS = fileURLToPath(new URL('../../../tests/fixtures/graphs', import.meta.url));
const BASELINE_FILE = path.join(GRAPHS, 'baseline.json');
const REPOS = ['ts-monorepo', 'svelte-app', 'py-shop'];
const GRAPHIFY = fileURLToPath(new URL('../../../tests/fixtures/graphify', import.meta.url));
/** Overloads, accessors, nested functions and same-named methods, for SymbolId parity only */
const ID_REPO = 'ids';

interface ScannedNode {
	name: string;
	path: string;
	kind: 'file' | 'directory';
	language?: string;
	_absolutePath?: string;
	children?: ScannedNode[];
}

interface Extracted {
	map: CodeMap;
	/** Every scanned file's lines, by repo-relative path */
	sources: Map<string, string[]>;
}

const extracted = new Map<string, Extracted>();
const truths = new Map<string, GroundTruth>();

beforeAll(async () => {
	const posted: unknown[] = [];
	const scope: { postMessage: (msg: unknown) => void; onmessage: unknown } = {
		postMessage: (msg) => posted.push(msg),
		onmessage: null
	};
	vi.stubGlobal('self', scope);
	await import('$lib/workers/parserWorker');
	const send = scope.onmessage as (e: { data: unknown }) => Promise<void>;
	await send({ data: { type: 'init' } });
	posted.pop();

	const parse = async (filePath: string, content: string, language: string) => {
		await send({ data: { type: 'parse', filePath, content, language } });
		return posted.pop() as Parsed;
	};
	for (const repo of REPOS) {
		extracted.set(repo, await extract(path.join(GRAPHS, repo), parse));
		truths.set(repo, JSON.parse(fs.readFileSync(path.join(GRAPHS, `${repo}.truth.json`), 'utf-8')));
	}
	extracted.set(ID_REPO, await extract(path.join(GRAPHIFY, ID_REPO), parse));
	vi.unstubAllGlobals();
});

interface Parsed {
	symbols: ASTSymbol[];
	refs: ASTRef[];
}

/** The code map today's extractor builds from the files the `?testDir=` loader reads in `dir`. */
async function extract(
	dir: string,
	parse: (filePath: string, content: string, language: string) => Promise<Parsed>
): Promise<Extracted> {
	const tree = scanDirectory(dir) as ScannedNode;
	const astMap = new Map<string, ASTSymbol[]>();
	const refMap = new Map<string, ASTRef[]>();
	const sources = new Map<string, string[]>();
	const configs = new Map<string, string>();
	const contents = new Map<string, string>();
	const stack = [tree];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.kind === 'directory') {
			stack.push(...(node.children ?? []));
			continue;
		}
		const content = fs.readFileSync(node._absolutePath!, 'utf-8');
		sources.set(node.path.slice(tree.name.length + 1), content.split('\n'));
		contents.set(node.path, content);
		if (isResolverConfig(node.path)) configs.set(node.path, content);
		if (node.language && isSupported(node.language) && content) {
			const { symbols, refs } = await parse(node.path, content, node.language);
			astMap.set(node.path, symbols);
			refMap.set(node.path, refs);
		}
	}
	if (astMap.size === 0) throw new Error(`no parseable files read from ${dir}`);
	for (let named = namedConfigs(configs); ; named = namedConfigs(configs)) {
		const found = named.filter((p) => contents.has(p));
		if (found.length === 0) break;
		for (const p of found) configs.set(p, contents.get(p)!);
	}
	return { map: buildCodeMap(astMap, tree.name, { refs: refMap, configs }), sources };
}

/** `text` standing alone, so `main` does not match inside `__main__` or `fetchUser` inside `refetchUser` */
const token = (text: string) =>
	new RegExp(`(?<![\\w$.])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);

describe.each(REPOS)('ground truth of %s', (repo) => {
	it('shows each edge at its line, as written', () => {
		const { sources } = extracted.get(repo)!;
		const wrong = truths
			.get(repo)!
			.edges.filter((e) => !token(e.written).test(sources.get(e.from)?.[e.line - 1] ?? ''));
		expect(wrong).toEqual([]);
	});

	it('points each edge at a parsed file and a name that file declares', () => {
		const { map, sources } = extracted.get(repo)!;
		const parsed = new Set([...map.files.keys()].map((key) => key.slice(repo.length + 1)));
		const dangling = truths
			.get(repo)!
			.edges.filter((e) => !e.to.startsWith('ext:'))
			.filter((e) => {
				const [target, qualified] = e.to.split('#');
				if (!parsed.has(target)) return true;
				if (!qualified) return false;
				const name = qualified.split('.').pop()!;
				return !sources.get(target)!.some((line) => token(name).test(line));
			});
		expect(dangling).toEqual([]);
	});

	it('lists each edge once, under a kind it declares', () => {
		const truth = truths.get(repo)!;
		const keys = truth.edges.map((e) => `${e.kind} ${e.from}:${e.line} -> ${e.to}`);
		expect(keys.length - new Set(keys).size).toBe(0);
		expect(truth.edges.filter((e) => !truth.kinds.includes(e.kind))).toEqual([]);
	});
});

describe("today's extractor against the ground truth", () => {
	it('scores no lower than the recorded baseline', () => {
		const scores = new Map<string, Score>(
			REPOS.map((repo) => [repo, scoreCodeMap(extracted.get(repo)!.map, truths.get(repo)!)])
		);

		if (process.env.UPDATE_GRAPH_BASELINE) {
			if (process.env.CI)
				throw new Error('UPDATE_GRAPH_BASELINE rewrites the gate; never set it in CI');
			const current = Object.fromEntries(
				REPOS.map((repo) => [repo, toBaseline(scores.get(repo)!)])
			);
			fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(current, null, '\t')}\n`);
			return;
		}

		const baseline: Record<string, Baseline> = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
		const regressions = REPOS.flatMap((repo) =>
			findRegressions(scores.get(repo)!, baseline[repo] ?? {}).map((line) => `${repo} ${line}`)
		);
		expect(regressions, 'rerun with UPDATE_GRAPH_BASELINE=1 only after an intended change').toEqual(
			[]
		);
	});
});

/** Where an adapter symbol has no parser id to match, because the parser does not emit it */
const PARSER_GAPS: {
	gap: string;
	holds: (sym: SymbolRecord, parent: SymbolRecord | null, lines: string[]) => boolean;
}[] = [
	{ gap: 'a binding that is not an arrow function', holds: (sym) => sym.kind === 'variable' },
	{
		gap: 'a TS interface or type alias, which Graphify marks as a class',
		holds: (sym, _, lines) =>
			sym.kind === 'class' && /^\s*(export\s+)?(interface|type)\s/.test(lines[sym.lines.start - 1])
	},
	{ gap: 'a function inside a function', holds: (_, parent) => parent?.kind === 'function' },
	{
		gap: 'a class inside a class',
		holds: (sym, parent) => sym.kind === 'class' && parent?.kind === 'class'
	},
	{
		gap: 'a decorated Python method',
		holds: (sym, _, lines) =>
			sym.kind === 'method' && /^\s*@/.test(lines[sym.lines.start - 2] ?? '')
	}
];

/** Parser ids Graphify cannot carry: it keys a node by file and name, so namesakes in one scope merge */
const GRAPHIFY_MERGES: Record<string, string[]> = {
	[ID_REPO]: ['ids/src/over.ts#Box.size~2 method']
};

/** Config languages Graphify 0.9.104 does not parse, so their keys and tables are parser-only */
const GRAPHIFY_UNPARSED = new Set(['json', 'yaml', 'toml']);

/** Every symbol in `symbols` and below, as `id kind` */
const flatten = (symbols: readonly SymbolRecord[]): string[] =>
	symbols.flatMap((s) => [`${s.id} ${s.kind}`, ...flatten(s.children)]);

/**
 * The parser's SymbolIds for each file against the ones readGraphifyGraph gives that file from
 * Graphify 0.9.104's graph.json, as `id kind`. An adapter-only symbol is named with the parser
 * gap that explains it, or `unexplained`; its children inherit the gap.
 */
function idParity(repo: string) {
	const { map: parsed, sources } = extracted.get(repo)!;
	const graph = JSON.parse(fs.readFileSync(path.join(GRAPHIFY, `${repo}.graph.json`), 'utf-8'));
	const adapted = readGraphifyGraph(graph, repo).map;
	const result = { matched: 0, parserOnly: [] as string[], adapterOnly: [] as string[] };
	for (const [file, record] of parsed.files) {
		if (GRAPHIFY_UNPARSED.has(record.language)) continue;
		const lines = sources.get(file.slice(repo.length + 1))!;
		const ours = new Set(flatten(record.symbols));
		const walk = (
			symbols: readonly SymbolRecord[],
			parent: SymbolRecord | null,
			inherited: string | null
		) => {
			for (const sym of symbols) {
				const key = `${sym.id} ${sym.kind}`;
				let gap = inherited;
				if (ours.delete(key)) result.matched++;
				else {
					gap ??= PARSER_GAPS.find((g) => g.holds(sym, parent, lines))?.gap ?? 'unexplained';
					result.adapterOnly.push(`${key}: ${gap}`);
				}
				walk(sym.children, sym, gap);
			}
		};
		walk(adapted.files.get(file)?.symbols ?? [], null, null);
		result.parserOnly.push(...ours);
	}
	return result;
}

describe('SymbolIds from Graphify graph.json against the parser', () => {
	it.each([...REPOS, ID_REPO])('match in %s, apart from what one side cannot emit', (repo) => {
		const { matched, parserOnly, adapterOnly } = idParity(repo);

		expect(matched).toBeGreaterThan(0);
		expect(parserOnly).toEqual(GRAPHIFY_MERGES[repo] ?? []);
		expect(adapterOnly.filter((line) => line.endsWith(': unexplained'))).toEqual([]);
	});
});
