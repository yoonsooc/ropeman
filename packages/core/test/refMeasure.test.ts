import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeMap, FilePath, RefSite } from '$lib/types/codeMap';
import { verifyMap } from '$lib/services/mapVerifier';
import { readGraphifyGraph } from '$lib/services/graphifyAdapter';
import { isResolverConfig, readResolverConfig } from '$lib/services/importResolver';
import { resolveRefs, type RefOutcome } from '$lib/services/refResolver';
import { extractDirectory } from '../src/extract';
import { groupedMap } from './groupedMap';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const wasmDir = join(repo, 'static');

type Tally = Record<string, number>;
const bump = (t: Tally, key: string) => (t[key] = (t[key] ?? 0) + 1);

function state(ref: RefSite): string {
	if (ref.target.state !== 'bound') return ref.target.state;
	const [first] = ref.target.candidates;
	return ref.target.candidates.length > 1 ? 'INFERRED(several)' : first.provenance.confidence;
}

function refTally(map: CodeMap): Record<string, Tally> {
	const out: Record<string, Tally> = {};
	for (const record of map.files.values()) {
		for (const ref of record.refs) bump((out[`${record.language} ${ref.kind}`] ??= {}), state(ref));
	}
	return out;
}

/** The resolver config files among the map's folders, read again for the timed pass. */
async function configTexts(dir: string, map: CodeMap): Promise<Map<string, string>> {
	const folders = new Set(
		[...map.files.keys()].map((p) => p.slice(0, Math.max(p.lastIndexOf('/'), 0)))
	);
	const texts = new Map<string, string>();
	for (const folder of folders) {
		for (const name of ['go.mod', 'Cargo.toml', 'package.json', 'tsconfig.json']) {
			const path = folder ? `${folder}/${name}` : name;
			if (!isResolverConfig(path)) continue;
			try {
				texts.set(path, await readFile(join(dir, path), 'utf8'));
			} catch {
				// not every folder has one
			}
		}
	}
	return texts;
}

/**
 * Calls bound to an in-map symbol, keyed `file:line -> target file`, by confidence. Files, not
 * symbol ids, because graph.json and the parser name nested symbols differently.
 */
function callPairs(map: CodeMap, prefix: string, kinds: readonly string[]): Map<string, string> {
	const pairs = new Map<string, string>();
	for (const record of map.files.values()) {
		for (const ref of record.refs) {
			if (!kinds.includes(ref.kind) || ref.target.state !== 'bound') continue;
			for (const { to, provenance } of ref.target.candidates) {
				if (to.kind !== 'symbol') continue;
				const key = `${record.path.slice(prefix.length)}:${ref.line} -> ${to.id.slice(prefix.length, to.id.indexOf('#'))}`;
				pairs.set(key, provenance.confidence);
			}
		}
	}
	return pairs;
}

/**
 * Reference resolution on a real repo, for docs/ARCH.md and the PR: `ROPEMAN_REFS_DIR=<folder>
 * [ROPEMAN_REFS_GRAPH=<graph.json>] npx vitest run packages/core/test/refMeasure.test.ts`.
 * Prints ref states per language and kind, the grouped map's edge evidence, verifier
 * violations, time and memory, and with a graph.json how its ast calls agree with ours.
 */
describe.runIf(process.env.ROPEMAN_REFS_DIR)('reference resolution on ROPEMAN_REFS_DIR', () => {
	it('reports resolution, map relations and cost', { timeout: 900_000 }, async () => {
		const dir = process.env.ROPEMAN_REFS_DIR!;
		const before = process.memoryUsage();
		const start = performance.now();
		const extraction = await extractDirectory(dir, { wasmDir });
		const extractMs = performance.now() - start;
		(globalThis as { gc?: () => void }).gc?.();
		const after = process.memoryUsage();
		// Binding again from the bound map repeats the resolver's work, timed on its own
		const config = readResolverConfig(await configTexts(dir, extraction.map));
		const resolveRuns: number[] = [];
		let outcomes: RefOutcome[] = [];
		for (let i = 0; i < 3; i++) {
			const t = performance.now();
			outcomes = resolveRefs(extraction.map, config).outcomes;
			resolveRuns.push(performance.now() - t);
		}
		resolveRuns.sort((a, b) => a - b);
		const reasons: Tally = {};
		for (const { kind, resolution } of outcomes) {
			bump(
				reasons,
				`${kind} ${resolution.status === 'unresolved' ? resolution.reason : `${resolution.status} ${resolution.rule}`}`
			);
		}
		const built = groupedMap(extraction, basename(dir));
		const edges = built.levels.flatMap((l) => l.edges);
		const evidence: Tally = {};
		const relations: Tally = {};
		for (const edge of edges) {
			bump(evidence, edge.evidence?.confidence ?? 'none');
			for (const ref of edge.evidence?.refs ?? [])
				bump(relations, `${ref.relation} ${ref.confidence}`);
		}
		const result = verifyMap(built, extraction.map);
		const report: Record<string, unknown> = {
			files: extraction.map.files.size,
			extractMs: Math.round(extractMs),
			resolveMs: resolveRuns.map(Math.round),
			heapMB: Math.round(after.heapUsed / 2 ** 20),
			rssMB: Math.round(after.rss / 2 ** 20),
			heapDeltaMB: Math.round((after.heapUsed - before.heapUsed) / 2 ** 20),
			refs: refTally(extraction.map),
			outcomes: reasons,
			levels: built.levels.length,
			mapBytes: Buffer.byteLength(JSON.stringify(built)),
			folderLevelBytes: Buffer.byteLength(
				JSON.stringify({ ...built, levels: built.levels.filter((l) => !l.fileLevel) })
			),
			edges: edges.length,
			edgeEvidence: evidence,
			evidenceRefs: relations,
			violations: result.parsed ? result.violations.length : `parse failed: ${result.failure.code}`,
			violationCodes: result.parsed ? [...new Set(result.violations.map((v) => v.code))] : []
		};
		const graphPath = process.env.ROPEMAN_REFS_GRAPH;
		if (graphPath) {
			const graph = readGraphifyGraph(JSON.parse(readFileSync(graphPath, 'utf8')), null);
			// The default filter skips folders such as `tests/`; compare only files both maps hold
			const both = (key: string) =>
				key.split(' -> ').every((end) => extraction.map.files.has(end.split(':')[0] as FilePath));
			const compare = (kinds: readonly string[]) => {
				const ours = callPairs(extraction.map, '', kinds);
				const theirs = new Map([...callPairs(graph.map, '', kinds)].filter(([key]) => both(key)));
				const agreement: Tally = {};
				for (const [key, confidence] of theirs) {
					bump(agreement, `graphify ${confidence} / ropeman ${ours.get(key) ?? 'none'}`);
				}
				for (const [key, confidence] of ours) {
					if (!theirs.has(key)) bump(agreement, `graphify none / ropeman ${confidence}`);
				}
				return agreement;
			};
			report.graphifyCalls = compare(['calls']);
			report.graphifyBases = compare(['inherits', 'implements']);
		}
		process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
	});
});
