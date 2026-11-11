import { describe, it, expect, beforeEach } from 'vitest';
import { projectStore } from './projectStore.svelte';

describe('projectStore', () => {
	beforeEach(() => {
		projectStore.reset();
	});

	describe('initial state', () => {
		it('fileTree is null', () => {
			expect(projectStore.fileTree).toBeNull();
		});

		it('astMap is empty Map', () => {
			expect(projectStore.astMap).toBeInstanceOf(Map);
			expect(projectStore.astMap.size).toBe(0);
		});

		it('isLoading is false', () => {
			expect(projectStore.isLoading).toBe(false);
		});

		it('projectName is empty string', () => {
			expect(projectStore.projectName).toBe('');
		});

		it('parsingProgress is zero', () => {
			expect(projectStore.parsingProgress).toEqual({ done: 0, total: 0 });
		});

		it('isSnippetMode is false', () => {
			expect(projectStore.isSnippetMode).toBe(false);
		});
	});

	describe('setters', () => {
		it('sets fileTree', () => {
			const tree = { name: 'root', path: '', kind: 'directory' as const, children: [] };
			projectStore.fileTree = tree;
			expect(projectStore.fileTree).toEqual(tree);
		});

		it('sets fileTree to null', () => {
			const tree = { name: 'root', path: '', kind: 'directory' as const, children: [] };
			projectStore.fileTree = tree;
			projectStore.fileTree = null;
			expect(projectStore.fileTree).toBeNull();
		});

		it('sets astMap', () => {
			const map = new Map([
				['file.ts', [{ name: 'fn', kind: 'function' as const, lineStart: 1, lineEnd: 5 }]]
			]);
			projectStore.astMap = map;
			expect(projectStore.astMap.size).toBe(1);
			expect(projectStore.astMap.get('file.ts')).toHaveLength(1);
		});

		it('sets isLoading', () => {
			projectStore.isLoading = true;
			expect(projectStore.isLoading).toBe(true);
		});

		it('sets projectName', () => {
			projectStore.projectName = 'my-project';
			expect(projectStore.projectName).toBe('my-project');
		});

		it('sets parsingProgress', () => {
			projectStore.parsingProgress = { done: 5, total: 10 };
			expect(projectStore.parsingProgress).toEqual({ done: 5, total: 10 });
		});

		it('sets isSnippetMode', () => {
			projectStore.isSnippetMode = true;
			expect(projectStore.isSnippetMode).toBe(true);
		});
	});

	describe('reset', () => {
		it('resets all state to initial values', () => {
			projectStore.fileTree = { name: 'root', path: '', kind: 'directory' as const, children: [] };
			projectStore.astMap = new Map([['f', []]]);
			projectStore.isLoading = true;
			projectStore.projectName = 'test';
			projectStore.parsingProgress = { done: 3, total: 5 };
			projectStore.isSnippetMode = true;
			projectStore.cutFiles = [{ path: 'src/a.ts', reason: 'file-limit' }];

			projectStore.reset();

			expect(projectStore.fileTree).toBeNull();
			expect(projectStore.astMap.size).toBe(0);
			expect(projectStore.isLoading).toBe(false);
			expect(projectStore.projectName).toBe('');
			expect(projectStore.parsingProgress).toEqual({ done: 0, total: 0 });
			expect(projectStore.isSnippetMode).toBe(false);
			// A new project must not show the previous project's cut files
			expect(projectStore.cutFiles).toEqual([]);
		});

		it('is idempotent', () => {
			projectStore.reset();
			projectStore.reset();
			expect(projectStore.fileTree).toBeNull();
			expect(projectStore.projectName).toBe('');
		});
	});
});
