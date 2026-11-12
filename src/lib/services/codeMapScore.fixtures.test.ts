import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from '../../../scripts/vite-dev-fs-plugin.js';
import { isSupported } from '$lib/utils/languageDetector';
import type { ASTSymbol } from '$lib/types/ast';
import type { CodeMap } from '$lib/types/codeMap';
import { buildCodeMap } from './skeletonExtractor';
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
	return { Parser, Language };
});

const GRAPHS = fileURLToPath(new URL('../../../tests/fixtures/graphs', import.meta.url));
const BASELINE_FILE = path.join(GRAPHS, 'baseline.json');
const REPOS = ['ts-monorepo', 'svelte-app', 'py-shop'];

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

	for (const repo of REPOS) {
		extracted.set(
			repo,
			await extract(repo, async (filePath, content, language) => {
				await send({ data: { type: 'parse', filePath, content, language } });
				return (posted.pop() as { symbols: ASTSymbol[] }).symbols;
			})
		);
		truths.set(repo, JSON.parse(fs.readFileSync(path.join(GRAPHS, `${repo}.truth.json`), 'utf-8')));
	}
	vi.unstubAllGlobals();
});

/** The code map today's extractor builds from the files the `?testDir=` loader reads. */
async function extract(
	repo: string,
	parse: (filePath: string, content: string, language: string) => Promise<ASTSymbol[]>
): Promise<Extracted> {
	const tree = scanDirectory(path.join(GRAPHS, repo)) as ScannedNode;
	const astMap = new Map<string, ASTSymbol[]>();
	const sources = new Map<string, string[]>();
	const stack = [tree];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.kind === 'directory') {
			stack.push(...(node.children ?? []));
			continue;
		}
		const content = fs.readFileSync(node._absolutePath!, 'utf-8');
		sources.set(node.path.slice(tree.name.length + 1), content.split('\n'));
		if (node.language && isSupported(node.language) && content) {
			astMap.set(node.path, await parse(node.path, content, node.language));
		}
	}
	return { map: buildCodeMap(astMap, tree.name), sources };
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
