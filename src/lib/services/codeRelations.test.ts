import { describe, expect, it } from 'vitest';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { CodeMap, FilePath, FileRecord, ModuleSite } from '$lib/types/codeMap';
import { buildCodeMap } from './codeMapBuilder';
import { fileRelations } from './codeRelations';
import { summarizeHierarchy } from './hierarchySummary';

const path = (p: string) => p as FilePath;

function site(line: number, module: ModuleSite['module']): ModuleSite {
	return { line, text: `import ${line}`, module, specifiers: null };
}

const toFile = (p: string, confidence: 'EXTRACTED' | 'INFERRED' = 'EXTRACTED') =>
	({
		state: 'bound',
		candidates: [
			{ to: { kind: 'file', path: path(p) }, provenance: { source: 'resolver', confidence } }
		]
	}) as const;

function record(p: string, imports: ModuleSite[]): FileRecord {
	return {
		path: path(p),
		language: 'typescript',
		lines: { start: 1, end: 10 },
		symbols: [],
		imports,
		reexports: [],
		refs: []
	};
}

const codeMap = (records: FileRecord[]): CodeMap => ({
	version: 2,
	root: null,
	files: new Map(records.map((r) => [r.path, r]))
});

describe('fileRelations', () => {
	it('lists each import resolved to one file with its line and confidence, in map order', () => {
		// Arrange
		const map = codeMap([
			record('src/b.ts', [site(3, toFile('src/a.ts', 'INFERRED'))]),
			record('src/a.ts', [site(1, toFile('src/c.ts')), site(2, toFile('lib/d.ts'))])
		]);

		// Act
		const relations = fileRelations(map);

		// Assert
		expect(relations).toEqual([
			{
				path: 'src/b.ts',
				line: 3,
				relation: 'imports_from',
				toPath: 'src/a.ts',
				confidence: 'INFERRED'
			},
			{
				path: 'src/a.ts',
				line: 1,
				relation: 'imports_from',
				toPath: 'src/c.ts',
				confidence: 'EXTRACTED'
			},
			{
				path: 'src/a.ts',
				line: 2,
				relation: 'imports_from',
				toPath: 'lib/d.ts',
				confidence: 'EXTRACTED'
			}
		]);
	});

	it('leaves out imports no file backs: unresolved, pending, guessed between files, external', () => {
		// Arrange
		const guess = { source: 'resolver', confidence: 'INFERRED' } as const;
		const map = codeMap([
			record('src/a.ts', [
				site(1, { state: 'unresolved' }),
				site(2, { state: 'pending' }),
				site(3, {
					state: 'bound',
					candidates: [
						{ to: { kind: 'file', path: path('src/b.ts') }, provenance: guess },
						{ to: { kind: 'file', path: path('src/c.ts') }, provenance: guess }
					]
				}),
				site(4, {
					state: 'bound',
					candidates: [
						{
							to: { kind: 'external', module: 'lodash', name: null },
							provenance: { source: 'resolver', confidence: 'EXTRACTED' }
						}
					]
				})
			])
		]);

		// Act, Assert
		expect(fileRelations(map)).toEqual([]);
	});
});

const fn = (name: string, lineStart: number, lineEnd = lineStart): ASTSymbol => ({
	name,
	kind: 'function',
	lineStart,
	lineEnd
});
const imp = (text: string, line = 1): ASTSymbol => ({
	name: text,
	kind: 'import',
	lineStart: line,
	lineEnd: line
});

function build(files: Record<string, { symbols: ASTSymbol[]; refs?: ASTRef[] }>): CodeMap {
	const astMap = new Map(Object.entries(files).map(([path, f]) => [path, f.symbols]));
	const refs = new Map(Object.entries(files).map(([path, f]) => [path, f.refs ?? []]));
	return buildCodeMap(astMap, null, { refs });
}

const withoutRefs = (map: CodeMap): CodeMap => ({
	...map,
	files: new Map([...map.files].map(([path, record]) => [path, { ...record, refs: [] }]))
});

describe('fileRelations: reference sites', () => {
	it('lists imports and EXTRACTED references between two files, each with its kind and line', () => {
		// Arrange
		const map = build({
			'src/util/fmt.ts': { symbols: [fn('fmt', 3), fn('pad', 5)] },
			'src/app/main.ts': {
				symbols: [imp("import { fmt } from '../util/fmt';"), fn('run', 3, 6), fn('local', 8)],
				refs: [
					{ kind: 'calls', line: 4, written: 'fmt' },
					{ kind: 'calls', line: 5, written: 'local' },
					{ kind: 'dynamic_import', line: 6, written: '../util/fmt' }
				]
			}
		});

		// Act
		const relations = fileRelations(map);

		// Assert
		expect(relations).toEqual([
			{
				path: 'src/app/main.ts',
				line: 1,
				relation: 'imports_from',
				toPath: 'src/util/fmt.ts',
				confidence: 'EXTRACTED'
			},
			{
				path: 'src/app/main.ts',
				line: 4,
				relation: 'calls',
				toPath: 'src/util/fmt.ts',
				confidence: 'EXTRACTED'
			},
			{
				path: 'src/app/main.ts',
				line: 6,
				relation: 'dynamic_import',
				toPath: 'src/util/fmt.ts',
				confidence: 'EXTRACTED'
			}
		]);
	});

	it('leaves out references inferred by name, external and unresolved ones', () => {
		// Arrange: `pad` is matched only by its name, `json.dumps` is a package's, `print` a builtin
		const map = build({
			'lib/text.py': {
				symbols: [
					{ name: 'Fmt', kind: 'class', lineStart: 1, lineEnd: 4, children: [fn('pad', 2)] }
				]
			},
			'app/main.py': {
				symbols: [imp('import json'), fn('run', 3, 6)],
				refs: [
					{ kind: 'calls', line: 4, written: 'value.pad' },
					{ kind: 'calls', line: 5, written: 'json.dumps' },
					{ kind: 'calls', line: 6, written: 'print' }
				]
			}
		});

		// Act
		const relations = fileRelations(map);

		// Assert
		expect(map.files.get('app/main.py' as never)?.refs[0].target.state).toBe('bound');
		expect(relations).toEqual([]);
	});

	it('gives the folder links of the imports alone when no reference is EXTRACTED', () => {
		// Arrange: the contract with the folder summary, so an imports-only map counts as before
		const map = build({
			'a/x.ts': { symbols: [fn('x', 3)] },
			'b/y.ts': {
				symbols: [imp("import { x } from '../a/x';"), fn('y', 3, 5)],
				refs: [
					{ kind: 'calls', line: 4, written: 'thing.unknown' },
					{ kind: 'calls', line: 5, written: 'console.log' }
				]
			}
		});

		// Act
		const withRefs = summarizeHierarchy(map);
		const importsOnly = summarizeHierarchy(withoutRefs(map));

		// Assert
		expect(withRefs).toEqual(importsOnly);
		expect(withRefs.links).toEqual([{ from: 'b', to: 'a', relations: 1 }]);
	});

	it('names the file of a symbol whose file name holds a `#`', () => {
		// Arrange
		const map = build({
			'a#b.ts': { symbols: [fn('f', 1)] },
			'c.ts': {
				symbols: [imp("import { f } from './a#b';"), fn('g', 3, 4)],
				refs: [{ kind: 'calls', line: 4, written: 'f' }]
			}
		});

		// Act
		const calls = fileRelations(map).filter((r) => r.relation === 'calls');

		// Assert
		expect(calls.map((r) => r.toPath)).toEqual(['a#b.ts']);
	});
});
