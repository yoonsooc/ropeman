import { describe, it, expect, vi } from 'vitest';
import type { FileNode } from '$lib/types/fileTree';
import { parseSource, parseSources, supportedFiles, type SourceReader } from './sourceExtraction';

const file = (path: string, language?: string): FileNode => ({
	name: path.split('/').pop()!,
	path,
	kind: 'file',
	language
});

const grammar = vi.fn(async (path: string) => {
	if (path.includes('broken')) throw new Error('syntax errors and no symbols');
	return {
		symbols: [{ name: 'f', kind: 'function' as const, lineStart: 1, lineEnd: 1 }],
		refs: []
	};
});

function reader(sizes: Record<string, number | null>, limits = { fileSize: 100, totalSize: 1000 }) {
	const open = vi.fn(async (node: FileNode) => {
		const size = sizes[node.path];
		if (size === null || size === undefined) throw new Error('gone');
		return new Blob(['x'.repeat(size)]);
	});
	return { open, grammar, ...limits } satisfies SourceReader;
}

describe('parseSource', () => {
	it('reads markdown and config formats with line parsers, never the grammar', async () => {
		// Act
		const md = await parseSource('SKILL.md', '# Review', 'markdown', grammar);
		const docker = await parseSource('Dockerfile', 'FROM node:22', 'dockerfile', grammar);

		// Assert
		expect(md.symbols.map((s) => s.name)).toEqual(['Review']);
		expect(docker.symbols.length).toBeGreaterThan(0);
		expect(grammar).not.toHaveBeenCalled();
	});
});

describe('supportedFiles', () => {
	it('lists supported files only, core source before tests', () => {
		// Arrange
		const tree: FileNode = {
			name: 'repo',
			path: 'repo',
			kind: 'directory',
			children: [
				{
					name: 'tests',
					path: 'tests',
					kind: 'directory',
					children: [file('tests/a.test.ts', 'typescript')]
				},
				{
					name: 'src',
					path: 'src',
					kind: 'directory',
					children: [file('src/a.ts', 'typescript'), file('src/logo.png')]
				}
			]
		};

		// Act
		const files = supportedFiles(tree);

		// Assert
		expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'tests/a.test.ts']);
	});
});

describe('parseSources', () => {
	it('reports why each file was not read, and never opens past the limits', async () => {
		// Arrange
		const io = reader(
			{ 'a.ts': 60, 'big.ts': 101, 'b.ts': 60, 'broken.ts': 10, 'gone.ts': null },
			{
				fileSize: 100,
				totalSize: 100
			}
		);
		const files = ['a.ts', 'big.ts', 'b.ts', 'broken.ts', 'gone.ts'].map((p) =>
			file(p, 'typescript')
		);
		const progress = vi.fn();

		// Act
		const { astMap, skipped } = await parseSources(files, io, progress);

		// Assert
		expect([...astMap.keys()]).toEqual(['a.ts']);
		expect(skipped).toEqual([
			{ path: 'big.ts', reason: 'file-size' },
			{ path: 'b.ts', reason: 'total-size' },
			{ path: 'broken.ts', reason: 'parse-failed' },
			{ path: 'gone.ts', reason: 'unreadable' }
		]);
		expect(progress).toHaveBeenLastCalledWith({ done: 5, total: 5 });
	});
});
