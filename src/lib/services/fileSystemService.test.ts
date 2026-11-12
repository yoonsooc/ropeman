import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/utils/languageDetector', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/languageDetector')>()),
	detectLanguage: vi.fn((name: string) => {
		if (name.endsWith('.ts')) return 'typescript';
		if (name.endsWith('.py')) return 'python';
		if (name.endsWith('.js')) return 'javascript';
		return null;
	}),
	isSupported: (lang: string) => ['typescript', 'python', 'javascript'].includes(lang)
}));

import { handleFallbackInput, readDirectoryRecursive } from './fileSystemService';
import { MAX_FILE_SIZE, MAX_FILES } from '$lib/utils/filePriority';
import type { FileNode } from '$lib/types/fileTree';

/** Folder layout where folder order would spend the whole file limit on packages/app */
function paseoLikePaths(): string[] {
	const files = (folder: string, count: number) =>
		Array.from({ length: count }, (_, i) => `${folder}/f${i}.ts`);
	return [
		...files('packages/app/src', MAX_FILES + 100),
		...files('packages/server/src', 30),
		...files('packages/cli/src', 10),
		'packages/protocol/src/schema.ts'
	];
}

function filePaths(node: FileNode): string[] {
	if (node.kind === 'file') return [node.path];
	return (node.children ?? []).flatMap(filePaths);
}

function directoryPaths(node: FileNode): string[] {
	if (node.kind === 'file') return [];
	return [node.path, ...(node.children ?? []).flatMap(directoryPaths)];
}

function topPackages(paths: string[]): Set<string> {
	return new Set(paths.map((p) => p.split('/').slice(0, 2).join('/')));
}

type FakeEntry = FakeDir | { kind: 'file'; name: string; text: string };
interface FakeDir {
	kind: 'directory';
	name: string;
	entries: FakeEntry[];
}

function fakeFileHandle(name: string, text = '') {
	return { kind: 'file', name, getFile: async () => new File([text], name) };
}

/** Directory handle whose `values()` yields entries in insertion order */
function fakeDirectoryHandle(dir: FakeDir): FileSystemDirectoryHandle {
	return {
		kind: 'directory',
		name: dir.name,
		async *values() {
			for (const entry of dir.entries) {
				yield entry.kind === 'directory'
					? fakeDirectoryHandle(entry)
					: fakeFileHandle(entry.name, entry.text);
			}
		},
		async getFileHandle(name: string) {
			const found = dir.entries.find((e) => e.kind === 'file' && e.name === name);
			if (!found || found.kind !== 'file') throw new DOMException('missing', 'NotFoundError');
			return fakeFileHandle(name, found.text);
		}
	} as unknown as FileSystemDirectoryHandle;
}

function fakeFolder(
	name: string,
	paths: string[],
	texts: Record<string, string> = {}
): FileSystemDirectoryHandle {
	const root: FakeDir = { kind: 'directory', name, entries: [] };
	for (const path of paths) {
		const parts = path.split('/');
		let dir = root;
		for (const part of parts.slice(0, -1)) {
			let next = dir.entries.find((e): e is FakeDir => e.kind === 'directory' && e.name === part);
			if (!next) {
				next = { kind: 'directory', name: part, entries: [] };
				dir.entries.push(next);
			}
			dir = next;
		}
		dir.entries.push({ kind: 'file', name: parts[parts.length - 1], text: texts[path] ?? '' });
	}
	return fakeDirectoryHandle(root);
}

describe('fileSystemService', () => {
	describe('readDirectoryRecursive', () => {
		it('keeps every package when folder order would fill the file limit with one', async () => {
			// Regression (PASEO, 2026-11-11): the walk stopped at 2000 files inside packages/app,
			// so server, cli and protocol never reached the parser
			const paths = paseoLikePaths();

			const { tree } = await readDirectoryRecursive(fakeFolder('paseo', paths));

			const kept = filePaths(tree);
			expect(kept).toHaveLength(MAX_FILES);
			expect(topPackages(kept)).toEqual(
				new Set(['packages/app', 'packages/server', 'packages/cli', 'packages/protocol'])
			);
			expect(kept.filter((p) => p.startsWith('packages/server/'))).toHaveLength(30);
		});

		it('records the files left out by the limit', async () => {
			const paths = paseoLikePaths();

			const { cut } = await readDirectoryRecursive(fakeFolder('paseo', paths));

			expect(cut).toHaveLength(paths.length - MAX_FILES);
			expect(cut.every((c) => c.reason === 'file-limit')).toBe(true);
			expect(topPackages(cut.map((c) => c.path))).toEqual(new Set(['packages/app']));
		});

		it('drops folders whose files were all cut by the limit', async () => {
			// Regression (#41 follow-up): a folder of low ranked files stayed in the tree empty
			const source = Array.from({ length: MAX_FILES }, (_, i) => `src/f${i}.ts`);

			const { tree, cut } = await readDirectoryRecursive(
				fakeFolder('proj', [...source, 'notes/a.md', 'notes/deep/b.md'])
			);

			expect(cut.map((c) => c.path).sort()).toEqual(['notes/a.md', 'notes/deep/b.md']);
			expect(directoryPaths(tree)).toEqual(['proj', 'src']);
		});

		it('reads the resolver configs the file limit cut', async () => {
			// Regression: on PASEO the limit and the ranking dropped every tsconfig and package.json
			const source = Array.from({ length: MAX_FILES }, (_, i) => `src/f${i}.ts`);
			const texts = {
				'tsconfig.json': '{ "extends": "./tsconfig.base.json" }',
				'tsconfig.base.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
				'packages/a/package.json': '{ "name": "a" }'
			};

			const { cut, configs } = await readDirectoryRecursive(
				fakeFolder('proj', [...source, ...Object.keys(texts), 'node_modules/x/package.json'], texts)
			);

			expect(cut.map((c) => c.path)).toEqual(expect.arrayContaining(Object.keys(texts)));
			expect(Object.fromEntries(configs)).toEqual(texts);
		});

		it('returns file nodes with handles that read the file, and skips excluded folders', async () => {
			const { tree, cut } = await readDirectoryRecursive(
				fakeFolder('proj', ['src/a.ts', 'node_modules/x/index.js', 'README'])
			);

			expect(tree.name).toBe('proj');
			expect(filePaths(tree).sort()).toEqual(['README', 'src/a.ts']);
			const src = tree.children!.find((c) => c.name === 'src')!;
			const file = await (src.children![0].handle as FileSystemFileHandle).getFile();
			expect(file.name).toBe('a.ts');
			expect(src.children![0].language).toBe('typescript');
			expect(cut).toEqual([]);
		});
	});

	describe('handleFallbackInput', async () => {
		function makeFileList(
			files: { name: string; path: string; size?: number; text?: string }[]
		): FileList {
			const list = files.map((f) => ({
				name: f.name,
				webkitRelativePath: f.path,
				size: f.size ?? 100,
				text: () => Promise.resolve(f.text ?? ''),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
				slice: () => new Blob(),
				stream: () => new ReadableStream(),
				type: '',
				lastModified: Date.now()
			}));

			return {
				length: list.length,
				item: (i: number) => list[i] as any,
				[Symbol.iterator]: function* () {
					yield* list as any;
				},
				...Object.fromEntries(list.map((f, i) => [i, f]))
			} as any;
		}

		it('returns a directory tree from FileList', async () => {
			const files = makeFileList([
				{ name: 'index.ts', path: 'myproject/src/index.ts' },
				{ name: 'utils.ts', path: 'myproject/src/utils.ts' }
			]);

			const { tree } = await handleFallbackInput(files);

			expect(tree.name).toBe('myproject');
			expect(tree.kind).toBe('directory');
			expect(tree.children).toBeDefined();
			expect(tree.children!.length).toBe(1); // src directory

			const srcDir = tree.children![0];
			expect(srcDir.name).toBe('src');
			expect(srcDir.children!.length).toBe(2);
		});

		it('reads resolver configs, but not one over the file size limit', async () => {
			const files = makeFileList([
				{ name: 'tsconfig.json', path: 'proj/tsconfig.json', text: '{}' },
				{ name: 'package.json', path: 'proj/package.json', size: MAX_FILE_SIZE + 1, text: '{}' },
				{ name: 'index.ts', path: 'proj/src/index.ts', text: 'export {}' }
			]);

			const { configs } = await handleFallbackInput(files);

			expect(Object.fromEntries(configs)).toEqual({ 'tsconfig.json': '{}' });
		});

		it('extracts project name from first file path', async () => {
			const files = makeFileList([{ name: 'app.py', path: 'cool-project/app.py' }]);

			const { tree } = await handleFallbackInput(files);
			expect(tree.name).toBe('cool-project');
		});

		it('skips files in node_modules', async () => {
			const files = makeFileList([
				{ name: 'main.ts', path: 'proj/main.ts' },
				{ name: 'lodash.js', path: 'proj/node_modules/lodash/lodash.js' }
			]);

			const { tree } = await handleFallbackInput(files);

			// Should only have main.ts, not node_modules
			const allNames = (tree.children ?? []).map((c) => c.name);
			expect(allNames).not.toContain('node_modules');
		});

		it('keeps agent instruction folders but skips other hidden folders', async () => {
			const files = makeFileList([
				{ name: 'SKILL.md', path: 'repo/.agents/skills/review/SKILL.md' },
				{ name: 'bug.yml', path: 'repo/.github/ISSUE_TEMPLATE/bug.yml' },
				{ name: 'a.ts', path: 'repo/.claude/worktrees/x/a.ts' },
				{ name: 'index.ts', path: 'repo/src/index.ts' }
			]);

			const { tree } = await handleFallbackInput(files);

			const names = JSON.stringify(tree);
			expect(names).toContain('SKILL.md');
			expect(names).toContain('index.ts');
			expect(names).not.toContain('bug.yml');
			expect(names).not.toContain('worktrees');
		});

		it('applies the include entries passed in', async () => {
			const { createPathFilter } = await import('$lib/utils/filePriority');
			const files = makeFileList([{ name: 'guide.md', path: 'repo/docs/guide.md' }]);

			expect(JSON.stringify((await handleFallbackInput(files)).tree)).not.toContain('guide.md');
			expect(
				JSON.stringify((await handleFallbackInput(files, createPathFilter([], ['docs']))).tree)
			).toContain('guide.md');
		});

		it('detects language for known extensions', async () => {
			const files = makeFileList([{ name: 'app.ts', path: 'proj/app.ts' }]);

			const { tree } = await handleFallbackInput(files);
			const fileNode = tree.children![0];
			expect(fileNode.language).toBe('typescript');
		});

		it('sorts directories first, then alphabetically', async () => {
			const files = makeFileList([
				{ name: 'z.ts', path: 'proj/z.ts' },
				{ name: 'a.ts', path: 'proj/a.ts' },
				{ name: 'index.ts', path: 'proj/lib/index.ts' }
			]);

			const { tree } = await handleFallbackInput(files);
			const names = (tree.children ?? []).map((c) => c.name);
			// Directory 'lib' should come first
			expect(names[0]).toBe('lib');
			// Then files alphabetically
			expect(names[1]).toBe('a.ts');
			expect(names[2]).toBe('z.ts');
		});

		it('keeps every package past the file limit and records the cut', async () => {
			const paths = paseoLikePaths();
			const files = makeFileList(
				paths.map((p) => ({ name: p.split('/').pop()!, path: `paseo/${p}` }))
			);

			const { tree, cut } = await handleFallbackInput(files);

			const kept = filePaths(tree);
			expect(kept).toHaveLength(MAX_FILES);
			expect(topPackages(kept)).toEqual(
				new Set(['packages/app', 'packages/server', 'packages/cli', 'packages/protocol'])
			);
			expect(cut).toHaveLength(paths.length - MAX_FILES);
		});

		it('returns project name "project" for empty FileList', async () => {
			const files = makeFileList([]);
			const { tree } = await handleFallbackInput(files);
			expect(tree.name).toBe('project');
		});
	});
});
