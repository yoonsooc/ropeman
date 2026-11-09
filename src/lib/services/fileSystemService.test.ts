import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/utils/languageDetector', () => ({
	detectLanguage: vi.fn((name: string) => {
		if (name.endsWith('.ts')) return 'typescript';
		if (name.endsWith('.py')) return 'python';
		if (name.endsWith('.js')) return 'javascript';
		return null;
	})
}));

import { handleFallbackInput } from './fileSystemService';

describe('fileSystemService', () => {
	describe('handleFallbackInput', () => {
		function makeFileList(files: { name: string; path: string; size?: number }[]): FileList {
			const list = files.map((f) => ({
				name: f.name,
				webkitRelativePath: f.path,
				size: f.size ?? 100,
				text: () => Promise.resolve(''),
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

		it('returns a directory tree from FileList', () => {
			const files = makeFileList([
				{ name: 'index.ts', path: 'myproject/src/index.ts' },
				{ name: 'utils.ts', path: 'myproject/src/utils.ts' }
			]);

			const tree = handleFallbackInput(files);

			expect(tree.name).toBe('myproject');
			expect(tree.kind).toBe('directory');
			expect(tree.children).toBeDefined();
			expect(tree.children!.length).toBe(1); // src directory

			const srcDir = tree.children![0];
			expect(srcDir.name).toBe('src');
			expect(srcDir.children!.length).toBe(2);
		});

		it('extracts project name from first file path', () => {
			const files = makeFileList([{ name: 'app.py', path: 'cool-project/app.py' }]);

			const tree = handleFallbackInput(files);
			expect(tree.name).toBe('cool-project');
		});

		it('skips files in node_modules', () => {
			const files = makeFileList([
				{ name: 'main.ts', path: 'proj/main.ts' },
				{ name: 'lodash.js', path: 'proj/node_modules/lodash/lodash.js' }
			]);

			const tree = handleFallbackInput(files);

			// Should only have main.ts, not node_modules
			const allNames = (tree.children ?? []).map((c) => c.name);
			expect(allNames).not.toContain('node_modules');
		});

		it('keeps agent instruction folders but skips other hidden folders', () => {
			const files = makeFileList([
				{ name: 'SKILL.md', path: 'repo/.agents/skills/review/SKILL.md' },
				{ name: 'ci.yml', path: 'repo/.github/workflows/ci.yml' },
				{ name: 'a.ts', path: 'repo/.claude/worktrees/x/a.ts' },
				{ name: 'index.ts', path: 'repo/src/index.ts' }
			]);

			const tree = handleFallbackInput(files);

			const names = JSON.stringify(tree);
			expect(names).toContain('SKILL.md');
			expect(names).toContain('index.ts');
			expect(names).not.toContain('ci.yml');
			expect(names).not.toContain('worktrees');
		});

		it('applies the include entries passed in', async () => {
			const { createPathFilter } = await import('$lib/utils/filePriority');
			const files = makeFileList([{ name: 'guide.md', path: 'repo/docs/guide.md' }]);

			expect(JSON.stringify(handleFallbackInput(files))).not.toContain('guide.md');
			expect(JSON.stringify(handleFallbackInput(files, createPathFilter([], ['docs'])))).toContain(
				'guide.md'
			);
		});

		it('detects language for known extensions', () => {
			const files = makeFileList([{ name: 'app.ts', path: 'proj/app.ts' }]);

			const tree = handleFallbackInput(files);
			const fileNode = tree.children![0];
			expect(fileNode.language).toBe('typescript');
		});

		it('sorts directories first, then alphabetically', () => {
			const files = makeFileList([
				{ name: 'z.ts', path: 'proj/z.ts' },
				{ name: 'a.ts', path: 'proj/a.ts' },
				{ name: 'index.ts', path: 'proj/lib/index.ts' }
			]);

			const tree = handleFallbackInput(files);
			const names = (tree.children ?? []).map((c) => c.name);
			// Directory 'lib' should come first
			expect(names[0]).toBe('lib');
			// Then files alphabetically
			expect(names[1]).toBe('a.ts');
			expect(names[2]).toBe('z.ts');
		});

		it('returns project name "project" for empty FileList', () => {
			const files = makeFileList([]);
			const tree = handleFallbackInput(files);
			expect(tree.name).toBe('project');
		});
	});
});
