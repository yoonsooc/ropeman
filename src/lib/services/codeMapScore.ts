import type { Binding, CodeMap, Endpoint, GuessBinding, RelationKind } from '$lib/types/codeMap';

/** The import and call relations a ground truth lists, by their codeMap.ts names. */
export const SCORED_KINDS = [
	'imports_from',
	'imports',
	're_exports',
	'dynamic_import',
	'calls'
] as const;
export type ScoredKind = (typeof SCORED_KINDS)[number];

/**
 * One relation, keyed by where it is written and what it points at. `from` is the file it is
 * written in, relative to the repo. `to` is a repo-relative `path`, a `path#Qualified.name`
 * SymbolId without the root, `ext:module`, or `ext:module#name`.
 */
export interface Edge {
	kind: RelationKind;
	from: string;
	line: number;
	to: string;
}

export interface TruthEdge extends Edge {
	kind: ScoredKind;
	/** What the source shows at that line: the module specifier, the imported name, or the callee */
	written: string;
}

export interface GroundTruth {
	/** The kinds the truth lists exhaustively. Predictions of any other kind are not scored. */
	kinds: ScoredKind[];
	edges: TruthEdge[];
}

export interface KindScore {
	truth: number;
	predicted: number;
	matched: number;
	/** null when the map predicts nothing of this kind */
	precision: number | null;
	/** null when the truth lists nothing of this kind */
	recall: number | null;
	/** Share of truth edges whose site the map has at that line, whatever its binding */
	siteRecall: number | null;
	misses: TruthEdge[];
	falsePositives: Edge[];
}

export type Score = Partial<Record<ScoredKind, KindScore>>;

export const METRICS = ['precision', 'recall', 'siteRecall'] as const;
export type Metric = (typeof METRICS)[number];
export type Baseline = Partial<Record<ScoredKind, Record<Metric, number | null>>>;

const edgeKey = (e: Edge) => `${e.kind} ${e.from}:${e.line} -> ${e.to}`;
const siteKey = (kind: RelationKind, from: string, line: number) => `${kind} ${from}:${line}`;

/** Every bound relation in the map, one edge per candidate. */
export function codeMapEdges(map: CodeMap): Edge[] {
	const rel = relativize(map.root);
	const edges: Edge[] = [];
	const add = (
		kind: RelationKind,
		from: string,
		line: number,
		binding: Binding<Endpoint> | GuessBinding<Endpoint>
	) => {
		if (binding.state !== 'bound') return;
		for (const candidate of binding.candidates) {
			edges.push({ kind, from, line, to: endpointKey(candidate.to, rel) });
		}
	};
	for (const record of map.files.values()) {
		const from = rel(record.path);
		for (const site of record.imports) {
			add('imports_from', from, site.line, site.module);
			for (const spec of site.specifiers ?? []) add('imports', from, site.line, spec.target);
		}
		for (const site of record.reexports) {
			add('re_exports', from, site.line, site.module);
			for (const spec of site.specifiers ?? []) add('re_exports', from, site.line, spec.target);
		}
		for (const ref of record.refs) add(ref.kind, from, ref.line, ref.target);
	}
	return edges;
}

/** Precision and recall per kind the truth declares, with the edges each side lacks. */
export function scoreCodeMap(map: CodeMap, truth: GroundTruth): Score {
	const predicted = new Map(codeMapEdges(map).map((e) => [edgeKey(e), e]));
	const sites = siteKeys(map);
	const score: Score = {};
	for (const kind of truth.kinds) {
		const expected = truth.edges.filter((e) => e.kind === kind);
		const expectedKeys = new Set(expected.map(edgeKey));
		const guessed = [...predicted.values()].filter((e) => e.kind === kind);
		const misses = expected.filter((e) => !predicted.has(edgeKey(e)));
		const matched = expected.length - misses.length;
		const sited = expected.filter((e) => sites.has(siteKey(e.kind, e.from, e.line))).length;
		score[kind] = {
			truth: expected.length,
			predicted: guessed.length,
			matched,
			precision: ratio(matched, guessed.length),
			recall: ratio(matched, expected.length),
			siteRecall: ratio(sited, expected.length),
			misses,
			falsePositives: guessed.filter((e) => !expectedKeys.has(edgeKey(e)))
		};
	}
	return score;
}

/**
 * Each recorded metric the score now falls below, as a readable line. A metric the baseline
 * records as null makes no claim. A kind the baseline lacks is reported so it gets recorded.
 */
export function findRegressions(score: Score, baseline: Baseline): string[] {
	const found: string[] = [];
	for (const [kind, current] of Object.entries(score) as [ScoredKind, KindScore][]) {
		const recorded = baseline[kind];
		if (!recorded) {
			found.push(`${kind}: no baseline recorded`);
			continue;
		}
		for (const metric of METRICS) {
			const floor = recorded[metric];
			if (floor === null) continue;
			const now = round(current[metric] ?? 0);
			if (now < floor) found.push(`${kind}.${metric}: ${now} < baseline ${floor}`);
		}
	}
	return found;
}

/** The metrics of a score as a baseline, rounded so a rerun writes the same file. */
export function toBaseline(score: Score): Baseline {
	const baseline: Baseline = {};
	for (const [kind, current] of Object.entries(score) as [ScoredKind, KindScore][]) {
		baseline[kind] = {
			precision: roundOrNull(current.precision),
			recall: roundOrNull(current.recall),
			siteRecall: roundOrNull(current.siteRecall)
		};
	}
	return baseline;
}

/** Sites by where they are written, binding ignored: an import site holds both import kinds. */
function siteKeys(map: CodeMap): Set<string> {
	const rel = relativize(map.root);
	const keys = new Set<string>();
	for (const record of map.files.values()) {
		const from = rel(record.path);
		for (const site of record.imports) {
			keys.add(siteKey('imports_from', from, site.line));
			keys.add(siteKey('imports', from, site.line));
		}
		for (const site of record.reexports) keys.add(siteKey('re_exports', from, site.line));
		for (const ref of record.refs) keys.add(siteKey(ref.kind, from, ref.line));
	}
	return keys;
}

function relativize(root: string | null): (key: string) => string {
	if (root === null) return (key) => key;
	const prefix = `${root}/`;
	return (key) => {
		if (!key.startsWith(prefix)) throw new Error(`${key} is outside the map root ${root}`);
		return key.slice(prefix.length);
	};
}

function endpointKey(end: Endpoint, rel: (key: string) => string): string {
	switch (end.kind) {
		case 'file':
			return rel(end.path);
		case 'symbol':
			return rel(end.id);
		case 'external':
			return end.name === null ? `ext:${end.module}` : `ext:${end.module}#${end.name}`;
	}
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const roundOrNull = (value: number | null) => (value === null ? null : round(value));
