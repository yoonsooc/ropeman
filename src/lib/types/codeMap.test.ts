import { describe, it, expect, expectTypeOf } from 'vitest';
import {
	PROVENANCE_RULES,
	type CallTarget,
	type CodeProvenance,
	type FilePath,
	type ImportTarget,
	type Provenance,
	type SymbolId
} from './codeMap';
import type { SkeletonSymbol, WireSymbolKind } from './skeleton';

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

describe('targets', () => {
	it('gives provenance only to targets a resolver bound', () => {
		const path = 'src/a.ts' as FilePath;
		const bound: ImportTarget = {
			state: 'file',
			path,
			provenance: { source: 'resolver', confidence: 'EXTRACTED' }
		};
		// @ts-expect-error a bound target must say who bound it
		const unsourced: ImportTarget = { state: 'file', path };
		const pending: CallTarget = {
			state: 'pending',
			// @ts-expect-error nothing has looked at a pending target, so nothing can vouch for it
			provenance: { source: 'ast', confidence: 'EXTRACTED' }
		};

		expect([bound, unsourced, pending].map((t) => t.state)).toEqual(['file', 'file', 'pending']);
	});

	it('does not accept a bare string where an id or path is expected', () => {
		// @ts-expect-error ids are made by the code map, not typed by hand
		const id: SymbolId = 'src/a.ts#main';
		// @ts-expect-error paths are branded where the record is built
		const path: FilePath = 'src/a.ts';

		expect([id, path]).toHaveLength(2);
	});
});

describe('wire symbol kinds', () => {
	it('sends the same kinds as v1 did', () => {
		expectTypeOf<SkeletonSymbol['kind']>().toEqualTypeOf<WireSymbolKind>();
		expectTypeOf<WireSymbolKind>().toEqualTypeOf<
			'function' | 'class' | 'method' | 'import' | 'frontmatter' | 'heading'
		>();
	});
});
