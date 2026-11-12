import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
	Binding,
	CodeMap,
	Endpoint,
	FilePath,
	FileRecord,
	GuessBinding,
	SymbolRecord
} from '$lib/types/codeMap';
import { GraphifyFormatError, readGraphifyGraph, type IssueReason } from './graphifyAdapter';
import { codeMapEdges, scoreCodeMap, toBaseline, type GroundTruth } from './codeMapScore';

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures', import.meta.url));
const readJson = (path: string): unknown =>
	JSON.parse(fs.readFileSync(`${FIXTURES}/${path}`, 'utf8'));

const hand = () => readGraphifyGraph(readJson('graphify/hand.graph.json'), 'app');

function record(map: CodeMap, path: string): FileRecord {
	const found = map.files.get(`app/${path}` as FilePath);
	if (!found) throw new Error(`no record for ${path}`);
	return found;
}

/** Each site's binding as `kind line -> [to (confidence)]`, so a test reads like the code map. */
function sites(file: FileRecord): string[] {
	const show = (binding: Binding<Endpoint> | GuessBinding<Endpoint>) =>
		binding.state === 'bound'
			? binding.candidates.map((c) => `${endpoint(c.to)} (${c.provenance.confidence})`).join(', ')
			: binding.state;
	return [
		...file.imports.flatMap((s) => [
			`imports_from ${s.line} -> ${show(s.module)}`,
			...(s.specifiers ?? []).map((sp) => `imports ${s.line} -> ${show(sp.target)}`)
		]),
		...file.refs.map((r) => `${r.kind} ${r.line} ${r.from ?? 'top'} -> ${show(r.target)}`)
	];
}

const endpoint = (end: Endpoint) =>
	end.kind === 'file' ? end.path : end.kind === 'symbol' ? end.id : `ext:${end.module}`;

const ids = (symbols: readonly SymbolRecord[]): string[] =>
	symbols.flatMap((s) => [s.id, ...ids(s.children)]);

const reasons = (issues: { reason: IssueReason; subject: string }[], reason: IssueReason) =>
	issues.filter((i) => i.reason === reason).map((i) => i.subject);

describe('readGraphifyGraph', () => {
	it('names files {root}/{source_file} and symbols Parent.name, with ~n on a duplicate', () => {
		// Arrange
		const json = readJson('graphify/hand.graph.json');

		// Act
		const { map } = readGraphifyGraph(json, 'app');

		// Assert
		expect([...map.files.keys()]).toEqual([
			'app/src/a.ts',
			'app/src/b.ts',
			'app/lib/c.ts',
			'app/package.json',
			'app/tools/x.py'
		]);
		expect(ids(record(map, 'src/a.ts').symbols)).toEqual([
			'app/src/a.ts#run',
			'app/src/a.ts#Store',
			'app/src/a.ts#Store.save',
			'app/src/a.ts#Store.save~2',
			'app/src/a.ts#lost'
		]);
		expect(record(map, 'src/a.ts').symbols[1]).toMatchObject({
			kind: 'class',
			lines: { start: 10, end: null },
			children: [
				{ kind: 'method', name: 'save' },
				{ kind: 'method', name: 'save' }
			]
		});
	});

	it('gives two callees on one line a site each, keeping EXTRACTED', () => {
		// Arrange: PASEO `applySkills(targets, nonDestructivePlan(status))` is one such line
		const json = readJson('graphify/hand.graph.json');

		// Act
		const { map } = readGraphifyGraph(json, 'app');

		// Assert
		expect(sites(record(map, 'src/a.ts')).filter((s) => s.startsWith('calls 4 '))).toEqual([
			'calls 4 app/src/a.ts#run -> app/src/b.ts#helper (EXTRACTED)',
			'calls 4 app/src/a.ts#run -> app/src/b.ts#format (EXTRACTED)'
		]);
	});

	it('keeps targets that share a name on one line as INFERRED candidates of one site', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(sites(record(map, 'src/a.ts')).filter((s) => s.startsWith('calls 5 '))).toEqual([
			'calls 5 app/src/a.ts#run -> app/src/a.ts#Store.save (INFERRED), app/src/a.ts#Store.save~2 (INFERRED)'
		]);
		expect(reasons(issues, 'downgraded')).toEqual([
			'calls src_a_run -> src_a_store_save',
			'calls src_a_run -> src_a_store_save_2',
			'calls src_a_store_save -> src_b_format'
		]);
	});

	it('gives each also_seen location its own site with its own confidence', () => {
		// Act
		const { map } = hand();

		// Assert
		expect(sites(record(map, 'src/a.ts'))).toContain(
			'calls 6 app/src/a.ts#run -> app/src/b.ts#helper (INFERRED)'
		);
	});

	it('reads AMBIGUOUS as INFERRED and indirect calls as INFERRED guesses', () => {
		// Act
		const { map } = hand();

		// Assert
		const a = sites(record(map, 'src/a.ts'));
		expect(a).toContain('calls 12 app/src/a.ts#Store.save -> app/src/b.ts#format (INFERRED)');
		expect(a).toContain('indirect_call 20 top -> app/src/b.ts#helper (INFERRED)');
	});

	it('maps inherits and references from the symbol that writes them', () => {
		// Act
		const { map } = hand();

		// Assert
		const a = sites(record(map, 'src/a.ts'));
		expect(a).toContain('inherits 10 app/src/a.ts#Store -> app/src/b.ts#Base (EXTRACTED)');
		expect(a).toContain('references 11 app/src/a.ts#Store.save -> app/src/b.ts#Base (EXTRACTED)');
		expect(record(map, 'src/a.ts').refs.find((r) => r.kind === 'references')).toMatchObject({
			context: 'parameter_type',
			written: null
		});
	});

	it('binds imports to files, symbols and manifest packages, with type-only names', () => {
		// Act
		const { map } = hand();

		// Assert
		const a = record(map, 'src/a.ts');
		expect(sites(a).filter((s) => s.startsWith('imports'))).toEqual([
			'imports_from 1 -> app/src/b.ts (EXTRACTED)',
			'imports 1 -> app/src/b.ts#helper (EXTRACTED)',
			'imports 1 -> app/src/b.ts#format (EXTRACTED)',
			'imports_from 2 -> unresolved',
			'imports_from 8 -> ext:zod (EXTRACTED)'
		]);
		expect(a.imports[0].specifiers?.map((s) => [s.local, s.typeOnly])).toEqual([
			['helper', false],
			['format', true]
		]);
		expect(a.imports[0].text).toBe('');
	});

	it('keeps an import of a target graphify could not resolve as an unresolved site', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(record(map, 'src/a.ts').imports[1]).toEqual({
			line: 2,
			text: '',
			module: { state: 'unresolved' },
			specifiers: null
		});
		expect(reasons(issues, 'external-target')).toEqual([
			'imports src_a -> src_shared_types_thing (src_shared_types_thing)'
		]);
		expect(reasons(issues, 'missing-module-edge')).toEqual([
			'imports src_a -> src_shared_types_thing'
		]);
	});

	it('reads a deferred JS/TS import as a dynamic import from its function, not in Python', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(sites(record(map, 'src/a.ts'))).toContain(
			'dynamic_import 7 app/src/a.ts#run -> app/lib/c.ts (EXTRACTED)'
		);
		expect(sites(record(map, 'tools/x.py'))).toEqual([]);
		expect(reasons(issues, 'nested-import')).toEqual(['imports_from tools_x_go -> src_b']);
	});

	it('leaves the semantic layer and community names out of the map', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		const everything = JSON.stringify([...map.files.values()]);
		expect(everything).not.toContain('concept_caching');
		expect(everything).not.toContain('Caching strategy');
		expect(everything).not.toContain('LLM Named Cluster');
		expect(reasons(issues, 'semantic-layer')).toEqual([
			'concept_caching',
			'references src_a_run -> concept_caching'
		]);
	});

	it('reports every relation it drops, with the reason', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(codeMapEdges(map).some((e) => e.from === 'package.json')).toBe(false);
		expect(reasons(issues, 'manifest-dependency')).toEqual(['imports pkg_package -> ref_zod']);
		expect(reasons(issues, 'no-location')).toEqual(['dynamic_import src_a -> lib_c']);
		expect(reasons(issues, 'not-a-code-relation')).toEqual(['uses src_a_store -> src_b_base']);
		expect(reasons(issues, 'endpoint-mismatch')).toEqual(['implements src_a -> src_b_base']);
		expect(reasons(issues, 'no-file-node')).toEqual(['ghost_g']);
		expect(reasons(issues, 'dropped-endpoint')).toEqual(['calls src_a_run -> ghost_g']);
	});

	it('reports the evidence graphify folded away for a node pair', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(reasons(issues, 'folded-call')).toEqual(['contains src_a -> src_a_store']);
		expect(issues.filter((i) => i.reason === 'reverse-import')).toEqual([
			{
				reason: 'reverse-import',
				subject: 'imports_from src_a -> src_b',
				file: 'src/a.ts',
				line: null
			}
		]);
		expect(sites(record(map, 'src/b.ts'))).toEqual(['imports_from 2 -> app/src/a.ts (EXTRACTED)']);
	});

	it('puts a symbol with no contains edge at the top of its file and says so', () => {
		// Act
		const { map, issues } = hand();

		// Assert
		expect(record(map, 'src/a.ts').symbols.map((s) => s.name)).toEqual(['run', 'Store', 'lost']);
		expect(reasons(issues, 'no-parent')).toEqual(['src_a_lost']);
	});

	it('rejects a schema_version it does not know', () => {
		// Arrange
		const json = { graph: { schema_version: 2 }, nodes: [], links: [] };

		// Act / Assert
		expect(() => readGraphifyGraph(json, 'app')).toThrow(GraphifyFormatError);
		expect(() => readGraphifyGraph({ nodes: [], links: [] }, 'app')).toThrow(/schema_version/);
	});

	it('reads `edges` as well as `links`, and keys files repo-relative when root is null', () => {
		// Arrange
		const json = {
			graph: { schema_version: 1 },
			nodes: [
				{
					id: 'f',
					label: 'f.py',
					_origin: 'ast',
					file_type: 'code',
					source_file: 'f.py',
					source_location: 'L1'
				},
				{
					id: 'f_g',
					label: 'g()',
					_origin: 'ast',
					file_type: 'code',
					source_file: 'f.py',
					source_location: 'L2'
				}
			],
			edges: [
				{
					source: 'f',
					target: 'f_g',
					relation: 'contains',
					_origin: 'ast',
					confidence: 'EXTRACTED',
					source_file: 'f.py',
					source_location: 'L2'
				},
				{
					source: 'f',
					target: 'f_g',
					relation: 'calls',
					_origin: 'ast',
					confidence: 'EXTRACTED',
					source_file: 'f.py',
					source_location: 'L9'
				}
			]
		};

		// Act
		const { map } = readGraphifyGraph(json, null);

		// Assert
		expect(map.root).toBeNull();
		expect(codeMapEdges(map)).toEqual([{ kind: 'calls', from: 'f.py', line: 9, to: 'f.py#g' }]);
	});
});

describe('readGraphifyGraph on Graphify 0.9.104 output for the ground-truth repos', () => {
	const REPOS = ['ts-monorepo', 'svelte-app', 'py-shop'] as const;
	const load = (repo: string) => readGraphifyGraph(readJson(`graphify/${repo}.graph.json`), repo);

	it('scores as recorded against tests/fixtures/graphs truth', () => {
		// Arrange
		const scores: Record<string, unknown> = {};

		// Act
		for (const repo of REPOS) {
			const truth = readJson(`graphs/${repo}.truth.json`) as GroundTruth;
			scores[repo] = toBaseline(scoreCodeMap(load(repo).map, truth));
		}

		// Assert
		const p = (precision: number, recall: number, siteRecall: number) => ({
			precision,
			recall,
			siteRecall
		});
		expect(scores).toEqual({
			'ts-monorepo': {
				imports_from: p(1, 0.9444, 1),
				imports: p(1, 0.9, 1),
				re_exports: p(1, 0.9286, 1),
				dynamic_import: p(1, 1, 1),
				calls: p(1, 0.7308, 0.7692)
			},
			'svelte-app': {
				imports_from: p(1, 0.3, 1),
				imports: p(1, 0.2941, 1),
				re_exports: p(1, 1, 1),
				calls: p(1, 0.25, 0.25)
			},
			'py-shop': {
				imports_from: p(1, 0.6923, 1),
				imports: p(1, 0.9167, 1),
				calls: p(1, 0.8571, 0.9286)
			}
		});
	});

	it('points every bound candidate at a file or symbol the map holds', () => {
		for (const repo of REPOS) {
			// Act
			const { map } = load(repo);

			// Assert
			const symbols = new Set([...map.files.values()].flatMap((f) => ids(f.symbols)));
			const dangling = codeMapEdges(map).filter(
				(e) =>
					!e.to.startsWith('ext:') &&
					!(e.to.includes('#')
						? symbols.has(`${repo}/${e.to}`)
						: map.files.has(`${repo}/${e.to}` as FilePath))
			);
			expect(dangling, repo).toEqual([]);
		}
	});
});
