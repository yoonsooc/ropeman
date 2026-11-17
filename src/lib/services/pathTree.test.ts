import { describe, expect, it } from 'vitest';
import { fileTreeFromPaths } from './pathTree';
import type { FileNode } from '$lib/types/fileTree';

/** `dir/` for a folder, the bare name for a file, children in tree order. */
function outline(node: FileNode): unknown {
	if (node.kind === 'file') return node.name;
	return { [`${node.name}/`]: node.children!.map(outline) };
}

describe('fileTreeFromPaths', () => {
	it('nests repo-relative paths under a root named after the project', () => {
		// Arrange
		const paths = ['src/api/a.ts', 'src/b.ts', 'README.md'];

		// Act
		const tree = fileTreeFromPaths('shop', paths);

		// Assert
		expect(outline(tree)).toEqual({
			'shop/': [{ 'src/': [{ 'api/': ['a.ts'] }, 'b.ts'] }, 'README.md']
		});
	});

	it('keeps each path as the map names it, with the root at the empty path', () => {
		const tree = fileTreeFromPaths('shop', ['src/api/a.ts']);

		const src = tree.children![0];
		const api = src.children![0];
		expect([tree.path, src.path, api.path, api.children![0].path]).toEqual([
			'',
			'src',
			'src/api',
			'src/api/a.ts'
		]);
	});

	it('claims nothing the paths do not say: no size, language or handle', () => {
		const file = fileTreeFromPaths('shop', ['main.py']).children![0];

		expect(file).toEqual({ name: 'main.py', path: 'main.py', kind: 'file' });
	});

	it('lists a repeated path once and skips paths with an empty segment', () => {
		const tree = fileTreeFromPaths('shop', ['a.ts', 'a.ts', '', '/b.ts', 'c//d.ts', 'e/']);

		expect(outline(tree)).toEqual({ 'shop/': ['a.ts'] });
	});

	it('gives an empty map an empty root', () => {
		expect(fileTreeFromPaths('shop', [])).toEqual({
			name: 'shop',
			path: '',
			kind: 'directory',
			children: []
		});
	});
});
