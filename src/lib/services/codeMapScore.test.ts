import { describe, expect, it } from 'vitest';
import type {
	Binding,
	CodeMap,
	Endpoint,
	FilePath,
	FileRecord,
	ModuleSite,
	RefSite,
	SymbolId
} from '$lib/types/codeMap';
import {
	codeMapEdges,
	findRegressions,
	scoreCodeMap,
	toBaseline,
	type GroundTruth,
	type TruthEdge
} from './codeMapScore';

const ROOT = 'repo';
const file = (rel: string) => ({ kind: 'file', path: `${ROOT}/${rel}` as FilePath }) as const;
const symbol = (rel: string) => ({ kind: 'symbol', id: `${ROOT}/${rel}` as SymbolId }) as const;

function bound(to: Endpoint): Binding<Endpoint> {
	return {
		state: 'bound',
		candidates: [{ to, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }]
	};
}

function guesses(...ends: Endpoint[]): Binding<Endpoint> {
	const guess = (to: Endpoint) => ({
		to,
		provenance: { source: 'resolver', confidence: 'INFERRED' } as const
	});
	const [first, second, ...rest] = ends.map(guess);
	return { state: 'bound', candidates: [first, second, ...rest] };
}

function call(line: number, target: Binding<Endpoint>): RefSite {
	return { kind: 'calls', line, from: null, written: null, target } as RefSite;
}

function importSite(
	line: number,
	module: Binding<Endpoint>,
	named: [string, Binding<Endpoint>][] = []
): ModuleSite {
	return {
		line,
		text: '',
		module: module as ModuleSite['module'],
		specifiers: named.map(([name, target]) => ({
			kind: 'named',
			name,
			local: name,
			typeOnly: false,
			target: target as Binding<never>
		}))
	};
}

function mapOf(
	rel: string,
	parts: Partial<Pick<FileRecord, 'imports' | 'reexports' | 'refs'>>
): CodeMap {
	const path = `${ROOT}/${rel}` as FilePath;
	const record: FileRecord = {
		path,
		language: 'typescript',
		lines: { start: 1, end: null },
		symbols: [],
		imports: parts.imports ?? [],
		reexports: parts.reexports ?? [],
		refs: parts.refs ?? []
	};
	return { version: 2, root: ROOT, files: new Map([[path, record]]) };
}

const edge = (kind: TruthEdge['kind'], line: number, to: string): TruthEdge => ({
	kind,
	from: 'src/main.ts',
	line,
	written: '',
	to
});

const truthOf = (kinds: GroundTruth['kinds'], ...edges: TruthEdge[]): GroundTruth => ({
	kinds,
	edges
});

describe('scoreCodeMap', () => {
	it('scores a map that finds exactly the truth as perfect', () => {
		// Arrange
		const map = mapOf('src/main.ts', {
			imports: [importSite(1, bound(file('src/a.ts')), [['a', bound(symbol('src/a.ts#a'))]])],
			refs: [call(3, bound(symbol('src/a.ts#a')))]
		});
		const truth = truthOf(
			['imports_from', 'imports', 'calls'],
			edge('imports_from', 1, 'src/a.ts'),
			edge('imports', 1, 'src/a.ts#a'),
			edge('calls', 3, 'src/a.ts#a')
		);

		// Act
		const score = scoreCodeMap(map, truth);

		// Assert
		for (const kind of truth.kinds) {
			expect(score[kind]).toMatchObject({
				precision: 1,
				recall: 1,
				siteRecall: 1,
				misses: [],
				falsePositives: []
			});
		}
	});

	it('counts a call bound to the wrong symbol as a miss and a false positive at a found site', () => {
		// Arrange
		const map = mapOf('src/main.ts', { refs: [call(3, bound(symbol('src/b.ts#a')))] });
		const truth = truthOf(['calls'], edge('calls', 3, 'src/a.ts#a'));

		// Act
		const score = scoreCodeMap(map, truth).calls!;

		// Assert
		expect(score).toMatchObject({ precision: 0, recall: 0, siteRecall: 1 });
		expect(score.misses.map((e) => e.to)).toEqual(['src/a.ts#a']);
		expect(score.falsePositives.map((e) => e.to)).toEqual(['src/b.ts#a']);
	});

	it('misses the site too when the call is recorded at another line', () => {
		// Arrange
		const map = mapOf('src/main.ts', { refs: [call(4, bound(symbol('src/a.ts#a')))] });
		const truth = truthOf(['calls'], edge('calls', 3, 'src/a.ts#a'));

		// Act
		const score = scoreCodeMap(map, truth).calls!;

		// Assert
		expect(score).toMatchObject({ precision: 0, recall: 0, siteRecall: 0 });
	});

	it('credits the site of an import no resolver has bound, and predicts nothing for it', () => {
		// Arrange
		const map = mapOf('src/main.ts', { imports: [importSite(1, { state: 'pending' })] });
		const truth = truthOf(['imports_from'], edge('imports_from', 1, 'src/a.ts'));

		// Act
		const score = scoreCodeMap(map, truth).imports_from!;

		// Assert
		expect(score).toMatchObject({ predicted: 0, precision: null, recall: 0, siteRecall: 1 });
	});

	it('counts every candidate of an ambiguous binding against precision', () => {
		// Arrange
		const map = mapOf('src/main.ts', {
			refs: [call(3, guesses(symbol('src/a.ts#save'), symbol('src/b.ts#save')))]
		});
		const truth = truthOf(['calls'], edge('calls', 3, 'src/a.ts#save'));

		// Act
		const score = scoreCodeMap(map, truth).calls!;

		// Assert
		expect(score).toMatchObject({ precision: 0.5, recall: 1 });
	});

	it('scores only the kinds the truth declares', () => {
		// Arrange
		const reference = {
			kind: 'references',
			context: 'parameter_type',
			line: 2,
			from: null,
			written: 'A',
			target: bound(symbol('src/a.ts#A'))
		} as RefSite;
		const map = mapOf('src/main.ts', { refs: [reference, call(3, bound(symbol('src/a.ts#a')))] });
		const truth = truthOf(['calls'], edge('calls', 3, 'src/a.ts#a'));

		// Act
		const score = scoreCodeMap(map, truth);

		// Assert
		expect(Object.keys(score)).toEqual(['calls']);
		expect(score.calls).toMatchObject({ precision: 1, falsePositives: [] });
	});
});

describe('codeMapEdges', () => {
	it('names endpoints relative to the root, with external modules and members apart', () => {
		// Arrange
		const map = mapOf('src/main.ts', {
			imports: [
				importSite(1, bound({ kind: 'external', module: 'lodash-es', name: null }), [
					['debounce', bound({ kind: 'external', module: 'lodash-es', name: 'debounce' })]
				])
			],
			reexports: [importSite(2, bound(file('src/a.ts')), [['a', bound(symbol('src/a.ts#a'))]])]
		});

		// Act
		const edges = codeMapEdges(map);

		// Assert
		expect(edges).toEqual([
			{ kind: 'imports_from', from: 'src/main.ts', line: 1, to: 'ext:lodash-es' },
			{ kind: 'imports', from: 'src/main.ts', line: 1, to: 'ext:lodash-es#debounce' },
			{ kind: 're_exports', from: 'src/main.ts', line: 2, to: 'src/a.ts' },
			{ kind: 're_exports', from: 'src/main.ts', line: 2, to: 'src/a.ts#a' }
		]);
	});
});

describe('findRegressions', () => {
	const scoreWith = (precision: number | null, recall: number) =>
		scoreCodeMap(
			mapOf('src/main.ts', {
				refs:
					precision === null ? [] : [call(3, bound(symbol(recall ? 'src/a.ts#a' : 'src/b.ts#a')))]
			}),
			truthOf(['calls'], edge('calls', 3, 'src/a.ts#a'))
		);

	it('passes a score that meets or beats every recorded floor', () => {
		// Arrange
		const score = scoreWith(1, 1);

		// Act
		const found = findRegressions(score, {
			calls: { precision: 0.5, recall: 1, siteRecall: null }
		});

		// Assert
		expect(found).toEqual([]);
	});

	it('reports each metric that falls below its floor', () => {
		// Arrange
		const score = scoreWith(0, 0);

		// Act
		const found = findRegressions(score, { calls: { precision: 1, recall: 1, siteRecall: 1 } });

		// Assert
		expect(found).toEqual(['calls.precision: 0 < baseline 1', 'calls.recall: 0 < baseline 1']);
	});

	it('treats a precision that became null as zero against a recorded floor', () => {
		// Arrange
		const score = scoreWith(null, 0);

		// Act
		const found = findRegressions(score, {
			calls: { precision: 0.5, recall: null, siteRecall: null }
		});

		// Assert
		expect(found).toEqual(['calls.precision: 0 < baseline 0.5']);
	});

	it('asks for a baseline when a kind has none recorded', () => {
		// Arrange
		const score = scoreWith(1, 1);

		// Act
		const found = findRegressions(score, {});

		// Assert
		expect(found).toEqual(['calls: no baseline recorded']);
	});
});

describe('toBaseline', () => {
	it('records the metrics rounded to four places, keeping null', () => {
		// Arrange
		const map = mapOf('src/main.ts', { refs: [call(1, bound(symbol('src/a.ts#a')))] });
		const truth = truthOf(
			['calls', 'imports_from'],
			edge('calls', 1, 'src/a.ts#a'),
			edge('calls', 2, 'src/a.ts#b'),
			edge('calls', 3, 'src/a.ts#c'),
			edge('imports_from', 1, 'src/a.ts')
		);

		// Act
		const baseline = toBaseline(scoreCodeMap(map, truth));

		// Assert
		expect(baseline).toEqual({
			calls: { precision: 1, recall: 0.3333, siteRecall: 0.3333 },
			imports_from: { precision: null, recall: 0, siteRecall: 0 }
		});
	});
});
