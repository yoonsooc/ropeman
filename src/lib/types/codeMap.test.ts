import { describe, it, expect, expectTypeOf } from 'vitest';
import {
	PROVENANCE_RULES,
	type Binding,
	type CodeProvenance,
	type EdgeEvidence,
	type FileEnd,
	type FilePath,
	type ModuleSite,
	type Provenance,
	type RefSite,
	type RelationKind,
	type RelationRef,
	type SymbolEnd,
	type SymbolId
} from './codeMap';
import type { SemanticEdge } from './semantic';
import type { SkeletonSymbol, WireSymbolKind } from './skeleton';

const fileA = 'repo/src/a.ts' as FilePath;
const fileB = 'repo/src/b.ts' as FilePath;
const saveInA: SymbolEnd = { kind: 'symbol', id: 'repo/src/a.ts#Store.save' as SymbolId };
const saveInB: SymbolEnd = { kind: 'symbol', id: 'repo/src/b.ts#Cache.save' as SymbolId };
const byName = { source: 'resolver', confidence: 'INFERRED' } as const;
const byPath = { source: 'resolver', confidence: 'EXTRACTED' } as const;

describe('provenance', () => {
	it('lets each source claim only the confidences its rule lists', () => {
		const accepted: Provenance[] = [
			{ source: 'ast', confidence: 'EXTRACTED' },
			{ source: 'resolver', confidence: 'EXTRACTED' },
			{ source: 'resolver', confidence: 'INFERRED' },
			{ source: 'graphify', confidence: 'INFERRED' },
			{ source: 'llm', confidence: 'INFERRED' }
		];
		// @ts-expect-error the parser reads what is written, so it never infers
		const astInferred: Provenance = { source: 'ast', confidence: 'INFERRED' };
		// @ts-expect-error an LLM relation is evidenced only through code facts checked afterwards
		const llmExtracted: Provenance = { source: 'llm', confidence: 'EXTRACTED' };

		// The graph.json adapter checks untyped input against the same table at runtime
		const allowedAtRuntime = ({ source, confidence }: Provenance) =>
			(PROVENANCE_RULES[source] as readonly string[]).includes(confidence);

		expect(accepted.every(allowedAtRuntime)).toBe(true);
		expect([astInferred, llmExtracted].some(allowedAtRuntime)).toBe(false);
	});

	it('keeps LLM claims out of the code map', () => {
		// @ts-expect-error the code map holds code facts only
		const fromLlm: CodeProvenance = { source: 'llm', confidence: 'INFERRED' };

		expectTypeOf<CodeProvenance['source']>().toEqualTypeOf<'ast' | 'resolver' | 'graphify'>();
		expect(fromLlm.source).toBe('llm');
	});
});

describe('bindings', () => {
	it('gives provenance only to targets a resolver bound', () => {
		const bound: Binding<FileEnd> = {
			state: 'bound',
			candidates: [{ to: { kind: 'file', path: fileA }, provenance: byPath }]
		};
		const unsourced: Binding<FileEnd> = {
			state: 'bound',
			// @ts-expect-error a bound target must say who bound it
			candidates: [{ to: { kind: 'file', path: fileA } }]
		};
		const pending: Binding<SymbolEnd> = {
			state: 'pending',
			// @ts-expect-error nothing has looked at a pending target, so nothing can vouch for it
			provenance: { source: 'ast', confidence: 'EXTRACTED' }
		};

		expect([bound, unsourced, pending].map((b) => b.state)).toEqual(['bound', 'bound', 'pending']);
	});

	it('keeps every candidate of a call the code does not decide, each one inferred', () => {
		const dispatch: Binding<SymbolEnd> = {
			state: 'bound',
			candidates: [
				{ to: saveInA, provenance: byName },
				{ to: saveInB, provenance: { source: 'graphify', confidence: 'INFERRED' } }
			]
		};
		const mixed: Binding<SymbolEnd> = {
			state: 'bound',
			// @ts-expect-error the code decided one target, so it cannot have rivals
			candidates: [
				{ to: saveInA, provenance: byPath },
				{ to: saveInB, provenance: byName }
			]
		};
		// @ts-expect-error a site bound to nothing is unresolved, not bound
		const empty: Binding<SymbolEnd> = { state: 'bound', candidates: [] };

		expect([dispatch, mixed, empty].map((b) => b.state)).toEqual(['bound', 'bound', 'bound']);
	});

	it('does not accept a bare string where an id or path is expected', () => {
		// @ts-expect-error ids are made by the code map, not typed by hand
		const id: SymbolId = 'src/a.ts#main';
		// @ts-expect-error paths are branded where the record is built
		const path: FilePath = 'src/a.ts';

		expect([id, path]).toHaveLength(2);
	});
});

describe('sites', () => {
	it('binds the module and each imported name of a statement on their own', () => {
		const site: ModuleSite = {
			line: 1,
			text: "{ save, type Row } from './b'",
			module: {
				state: 'bound',
				candidates: [{ to: { kind: 'file', path: fileB }, provenance: byPath }]
			},
			specifiers: [
				{
					kind: 'named',
					name: 'save',
					local: 'save',
					typeOnly: false,
					target: { state: 'bound', candidates: [{ to: saveInB, provenance: byPath }] }
				},
				{
					kind: 'named',
					name: 'Row',
					local: 'Row',
					typeOnly: true,
					target: { state: 'unresolved' }
				}
			]
		};
		const fileForName: ModuleSite = {
			...site,
			specifiers: [
				// @ts-expect-error a named import points at a symbol, not a whole file
				{
					kind: 'named',
					name: 'save',
					local: 'save',
					typeOnly: false,
					target: {
						state: 'bound',
						candidates: [{ to: { kind: 'file', path: fileB }, provenance: byPath }]
					}
				}
			]
		};

		expect([site, fileForName].map((s) => s.specifiers?.length)).toEqual([2, 1]);
	});

	it('shapes each reference kind as graphify writes its edges', () => {
		const top = { line: 3, from: null, written: 'save' } as const;
		const sites: RefSite[] = [
			{ ...top, kind: 'calls', target: { state: 'pending' } },
			{ ...top, kind: 'indirect_call', context: 'argument', target: { state: 'unresolved' } },
			{ ...top, kind: 'references', context: 'generic_arg', target: { state: 'pending' } },
			{ ...top, kind: 'inherits', from: saveInA.id, written: null, target: { state: 'pending' } }
		];
		// @ts-expect-error inheritance is written on a class, never in top-level code
		const loose: RefSite = { ...top, kind: 'implements', target: { state: 'pending' } };
		// @ts-expect-error a type reference says where it sits (parameter, field, ...)
		const bare: RefSite = { ...top, kind: 'references', target: { state: 'pending' } };
		// @ts-expect-error nothing in the code says a value is ever called, so it is only inferred
		const passed: RefSite = {
			...top,
			kind: 'indirect_call',
			context: 'collection',
			target: {
				state: 'bound',
				candidates: [{ to: saveInA, provenance: byPath }]
			}
		};

		expect([...sites, loose, bare, passed]).toHaveLength(7);
	});

	it('names relations as graphify names its ast edges', () => {
		expectTypeOf<RelationKind>().toEqualTypeOf<
			| 'calls'
			| 'indirect_call'
			| 'references'
			| 'inherits'
			| 'implements'
			| 'dynamic_import'
			| 'imports'
			| 'imports_from'
			| 're_exports'
			| 'contains'
			| 'method'
		>();
	});
});

describe('semantic edge evidence', () => {
	const extracted: RelationRef<'EXTRACTED'> = {
		path: fileA,
		line: 1,
		relation: 'imports_from',
		toPath: fileB,
		confidence: 'EXTRACTED'
	};
	const guessed: RelationRef<'INFERRED'> = {
		...extracted,
		relation: 'calls',
		confidence: 'INFERRED'
	};

	it('backs an extracted edge with at least one extracted code relation', () => {
		const backed: EdgeEvidence = { confidence: 'EXTRACTED', refs: [extracted] };
		const dashed: EdgeEvidence = { confidence: 'INFERRED', refs: [] };
		const suggested: EdgeEvidence = { confidence: 'INFERRED', refs: [guessed] };
		// @ts-expect-error an extracted edge has to cite the code that backs it
		const uncited: EdgeEvidence = { confidence: 'EXTRACTED', refs: [] };
		// @ts-expect-error a name match does not make an edge extracted
		const overclaimed: EdgeEvidence = { confidence: 'EXTRACTED', refs: [guessed] };

		expect([backed, dashed, suggested, uncited, overclaimed]).toHaveLength(5);
	});

	it('still reads a level cached before evidence existed', () => {
		const cached: SemanticEdge = JSON.parse(
			'{"id":"sem-edge:0:a->b","source":"sem:a","target":"sem:b","type":"uses"}'
		);
		const withEvidence: SemanticEdge = {
			...cached,
			evidence: { confidence: 'EXTRACTED', refs: [extracted] }
		};

		expect(cached.evidence).toBeUndefined();
		expect(JSON.parse(JSON.stringify(withEvidence))).toEqual(withEvidence);
	});
});

describe('wire symbol kinds', () => {
	it('sends the v1 kinds plus the config kinds, which only config files carry', () => {
		expectTypeOf<SkeletonSymbol['kind']>().toEqualTypeOf<WireSymbolKind>();
		expectTypeOf<WireSymbolKind>().toEqualTypeOf<
			| 'function'
			| 'class'
			| 'method'
			| 'import'
			| 'frontmatter'
			| 'heading'
			| 'stage'
			| 'port'
			| 'command'
			| 'resource'
			| 'input'
			| 'output'
			| 'target'
			| 'env'
			| 'key'
			| 'table'
			| 'job'
			| 'service'
		>();
	});
});
