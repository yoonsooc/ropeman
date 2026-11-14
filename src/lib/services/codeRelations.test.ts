import { describe, expect, it } from 'vitest';
import type { CodeMap, FilePath, FileRecord, ModuleSite } from '$lib/types/codeMap';
import { fileRelations } from './codeRelations';

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
