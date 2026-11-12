import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodeMap, SymbolRecord } from '$lib/types/codeMap';
import { readGraphifyGraph, type IssueReason } from '$lib/services/graphifyAdapter';
import { createPathFilter } from '$lib/utils/filePriority';
import { extractDirectory } from '../../packages/core/src/extract';
import { fileEdges, type FileEdge } from './view';

export const CONDITIONS = ['ropeman', 'graphify'] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface LoadedInput {
	condition: Condition;
	map: CodeMap;
	edges: FileEdge[];
	/** Wall time to produce the map from what is on disk (graph.json already built for graphify) */
	seconds: number;
	/** graph.json entries the adapter left out or weakened, by reason (graphify only) */
	issues: Partial<Record<IssueReason, number>>;
}

/**
 * Ropeman's own extraction of `root`, uncapped. `skip` names folders left out of the walk, such
 * as a `graphify-out/` that is build output and not part of the repository.
 */
export async function loadRopeman(
	root: string,
	wasmDir: string,
	skip: string[]
): Promise<LoadedInput> {
	const started = performance.now();
	const { map } = await extractDirectory(root, { wasmDir, filter: createPathFilter(skip) });
	const seconds = (performance.now() - started) / 1000;
	return { condition: 'ropeman', map, edges: fileEdges(map), seconds, issues: {} };
}

/** Graphify's graph.json through the A-10 adapter: ast layer and external nodes, no semantic layer. */
export async function loadGraphify(graphPath: string): Promise<LoadedInput> {
	const started = performance.now();
	const { map, issues } = readGraphifyGraph(JSON.parse(await readFile(graphPath, 'utf8')), null);
	const seconds = (performance.now() - started) / 1000;
	const counts: Partial<Record<IssueReason, number>> = {};
	for (const issue of issues) counts[issue.reason] = (counts[issue.reason] ?? 0) + 1;
	return { condition: 'graphify', map, edges: fileEdges(map), seconds, issues: counts };
}

const countSymbols = (symbols: readonly SymbolRecord[]): number =>
	symbols.reduce((sum, sym) => sum + 1 + countSymbols(sym.children), 0);

const bump = (counts: Record<string, number>, key: string, by = 1) => {
	counts[key] = (counts[key] ?? 0) + by;
};

/** What a map holds, counted the same way for both inputs. */
export interface Coverage {
	files: number;
	filesByLanguage: Record<string, number>;
	symbols: number;
	importSites: number;
	/** Module sites by binding: file, external, unresolved, pending, ambiguous */
	importsBy: Record<string, number>;
	refSites: Record<string, number>;
	/** Reference sites bound to exactly one target, by kind */
	refsBound: Record<string, number>;
	/** Cross-file relations with one target file, by kind and confidence */
	crossFile: Record<string, number>;
}

export function coverage(input: LoadedInput): Coverage {
	const out: Coverage = {
		files: input.map.files.size,
		filesByLanguage: {},
		symbols: 0,
		importSites: 0,
		importsBy: {},
		refSites: {},
		refsBound: {},
		crossFile: {}
	};
	for (const record of input.map.files.values()) {
		bump(out.filesByLanguage, record.language ?? 'other');
		out.symbols += countSymbols(record.symbols);
		for (const site of [...record.imports, ...record.reexports]) {
			out.importSites++;
			const m = site.module;
			const key =
				m.state !== 'bound'
					? m.state
					: m.candidates.length > 1
						? 'ambiguous'
						: m.candidates[0].to.kind;
			bump(out.importsBy, key);
		}
		for (const ref of record.refs) {
			bump(out.refSites, ref.kind);
			if (ref.target.state === 'bound' && ref.target.candidates.length === 1)
				bump(out.refsBound, ref.kind);
		}
	}
	for (const edge of input.edges) bump(out.crossFile, `${edge.kind} ${edge.confidence}`);
	return out;
}

/** One sampled relation checked against the line it cites on disk. */
export interface DiskCheck {
	kind: 'imports' | 'refs';
	sampled: number;
	/** The cited file exists and has the cited line */
	lineExists: number;
	/** The line reads as the relation: an import keyword for a file target, else the symbol's name */
	lineMatches: number;
	/** Every sampled relation whose line exists but does not read as the relation */
	mismatches: { path: string; line: number; to: string; text: string }[];
}

export const DISK_SAMPLE = 300;

const IMPORT_WORD = /\b(import|require|from|export)\b/;

/**
 * Every k-th EXTRACTED cross-file relation, in path and line order, checked against the
 * source on disk. Deterministic, so a rerun samples the same sites.
 */
export async function checkOnDisk(root: string, input: LoadedInput): Promise<DiskCheck[]> {
	const sorted = input.edges
		.filter((e) => e.confidence === 'EXTRACTED')
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
	const lines = new Map<string, string[] | null>();
	const read = async (path: string) => {
		if (!lines.has(path)) {
			lines.set(
				path,
				await readFile(join(root, path), 'utf8').then(
					(text) => text.split('\n'),
					() => null
				)
			);
		}
		return lines.get(path)!;
	};
	const results: DiskCheck[] = [];
	for (const kind of ['imports', 'refs'] as const) {
		const pool = sorted.filter((e) => (kind === 'imports') === (e.kind === 'imports'));
		const step = Math.max(1, Math.floor(pool.length / DISK_SAMPLE));
		const sample = pool.filter((_, i) => i % step === 0).slice(0, DISK_SAMPLE);
		const check: DiskCheck = {
			kind,
			sampled: sample.length,
			lineExists: 0,
			lineMatches: 0,
			mismatches: []
		};
		for (const edge of sample) {
			const text = (await read(edge.path))?.[edge.line - 1];
			if (text === undefined) continue;
			check.lineExists++;
			// A ref to a file is an `import()`; a ref to a symbol names it on its line
			const matches = edge.toName === null ? IMPORT_WORD.test(text) : text.includes(edge.toName);
			if (matches) check.lineMatches++;
			else
				check.mismatches.push({
					path: edge.path,
					line: edge.line,
					to: edge.toName ?? edge.toPath,
					text: text.trim().slice(0, 120)
				});
		}
		results.push(check);
	}
	return results;
}

/** Where two maps agree: files both read, and import sites both bind to the same file. */
export interface MapAgreement {
	filesBoth: number;
	filesOnlyA: Record<string, number>;
	filesOnlyB: Record<string, number>;
	importsBoth: number;
	importsOnlyA: number;
	importsOnlyB: number;
}

export function compareMaps(a: LoadedInput, b: LoadedInput): MapAgreement {
	const only = (x: LoadedInput, y: LoadedInput) => {
		const counts: Record<string, number> = {};
		for (const [path, record] of x.map.files)
			if (!y.map.files.has(path)) bump(counts, record.language ?? 'other');
		return counts;
	};
	const importKeys = (x: LoadedInput) =>
		new Set(
			x.edges
				.filter((e) => e.kind === 'imports' && e.confidence === 'EXTRACTED')
				.map((e) => `${e.path}:${e.line}->${e.toPath}`)
		);
	const ia = importKeys(a);
	const ib = importKeys(b);
	const importsBoth = [...ia].filter((k) => ib.has(k)).length;
	return {
		filesBoth: [...a.map.files.keys()].filter((p) => b.map.files.has(p)).length,
		filesOnlyA: only(a, b),
		filesOnlyB: only(b, a),
		importsBoth,
		importsOnlyA: ia.size - importsBoth,
		importsOnlyB: ib.size - importsBoth
	};
}
