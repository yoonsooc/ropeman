import { describe, it, expect } from 'vitest';
import {
	extractSkeleton,
	extractSubSkeleton,
	estimatePayloadSize,
	formatPayloadPreview
} from './skeletonExtractor';
import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';
import type { SkeletonPayload } from '$lib/types/skeleton';
import { settingsStore } from '$lib/stores/settingsStore.svelte';

// --- Test fixtures ---

function makeFileTree(): FileNode {
	return {
		name: 'project',
		path: '',
		kind: 'directory',
		children: [
			{ name: 'main.py', path: 'main.py', kind: 'file', language: 'python' },
			{ name: 'utils.ts', path: 'utils.ts', kind: 'file', language: 'typescript' },
			{ name: 'lib.go', path: 'lib.go', kind: 'file', language: 'go' }
		]
	};
}

function makeAstMap(): Map<string, ASTSymbol[]> {
	const map = new Map<string, ASTSymbol[]>();
	map.set('main.py', [
		{ name: 'from flask import Flask', kind: 'import', lineStart: 1, lineEnd: 1 },
		{ name: 'create_app', kind: 'function', lineStart: 3, lineEnd: 10 },
		{
			name: 'App',
			kind: 'class',
			lineStart: 12,
			lineEnd: 30,
			children: [
				{ name: 'run', kind: 'method', lineStart: 15, lineEnd: 20 },
				{ name: 'stop', kind: 'method', lineStart: 22, lineEnd: 28 }
			]
		},
		{ name: 'config', kind: 'variable', lineStart: 32, lineEnd: 32 }
	]);
	map.set('utils.ts', [
		{ name: 'import { z } from "zod"', kind: 'import', lineStart: 1, lineEnd: 1 },
		{ name: 'formatDate', kind: 'function', lineStart: 3, lineEnd: 8 },
		{ name: 'IConfig', kind: 'interface', lineStart: 10, lineEnd: 15 },
		{ name: 'ConfigType', kind: 'type', lineStart: 17, lineEnd: 17 }
	]);
	map.set('lib.go', [
		{ name: 'import "fmt"', kind: 'import', lineStart: 3, lineEnd: 3 },
		{ name: 'Handler', kind: 'class', lineStart: 5, lineEnd: 20 }
	]);
	return map;
}

// --- Tests ---

describe('extractSkeleton', () => {
	it('extracts skeleton from file tree and AST map', () => {
		const result = extractSkeleton('test-project', makeFileTree(), makeAstMap());

		expect(result.projectName).toBe('test-project');
		expect(result.totalFiles).toBe(3);
		expect(result.files).toHaveLength(3);
		expect(result.generatedAt).toBeTruthy();
	});

	it('filters out variable, interface, and type symbols from output', () => {
		const result = extractSkeleton('test', makeFileTree(), makeAstMap());

		const utilsFile = result.files.find((f) => f.path === 'utils.ts');
		expect(utilsFile).toBeDefined();
		// formatDate should be included, IConfig and ConfigType should be filtered
		expect(utilsFile!.symbols).toHaveLength(1);
		expect(utilsFile!.symbols[0].name).toBe('formatDate');
	});

	it('converts imports to SkeletonImport format', () => {
		const result = extractSkeleton('test', makeFileTree(), makeAstMap());

		const mainFile = result.files.find((f) => f.path === 'main.py');
		expect(mainFile).toBeDefined();
		expect(mainFile!.imports).toHaveLength(1);
		expect(mainFile!.imports[0].source).toBeTruthy();
	});

	it('preserves class children (methods)', () => {
		const result = extractSkeleton('test', makeFileTree(), makeAstMap());

		const mainFile = result.files.find((f) => f.path === 'main.py');
		const appClass = mainFile!.symbols.find((s) => s.name === 'App');
		expect(appClass).toBeDefined();
		expect(appClass!.children).toHaveLength(2);
		expect(appClass!.children![0].name).toBe('run');
		expect(appClass!.children![1].name).toBe('stop');
	});

	it('counts symbols including nested children', () => {
		const result = extractSkeleton('test', makeFileTree(), makeAstMap());
		// main.py: create_app(1) + App(1) + run(1) + stop(1) = 4
		// utils.ts: formatDate(1) = 1
		// lib.go: Handler(1) = 1
		// Total = 6
		expect(result.totalSymbols).toBe(6);
	});

	it('infers language from file extension', () => {
		const result = extractSkeleton('test', makeFileTree(), makeAstMap());

		const pyFile = result.files.find((f) => f.path === 'main.py');
		expect(pyFile!.language).toBe('python');

		const tsFile = result.files.find((f) => f.path === 'utils.ts');
		expect(tsFile!.language).toBe('typescript');

		const goFile = result.files.find((f) => f.path === 'lib.go');
		expect(goFile!.language).toBe('go');
	});

	it('skips files with no symbols', () => {
		const tree = makeFileTree();
		const astMap = new Map<string, ASTSymbol[]>();
		astMap.set('main.py', []); // Empty
		astMap.set('utils.ts', [{ name: 'helper', kind: 'function', lineStart: 1, lineEnd: 5 }]);
		const result = extractSkeleton('test', tree, astMap);
		expect(result.totalFiles).toBe(1);
		expect(result.files[0].path).toBe('utils.ts');
	});

	it('returns empty skeleton for null file tree', () => {
		const result = extractSkeleton('test', null, new Map());
		expect(result.totalFiles).toBe(0);
		expect(result.files).toHaveLength(0);
	});
});

describe('extractSkeleton with markdown and include entries', () => {
	function tree(paths: string[]): FileNode {
		return {
			name: 'repo',
			path: '',
			kind: 'directory',
			children: paths.map((p) => ({ name: p.split('/').pop()!, path: p, kind: 'file' as const }))
		};
	}

	it('sends markdown outlines with language "markdown"', () => {
		const astMap = new Map<string, ASTSymbol[]>([
			[
				'skills/review/SKILL.md',
				[
					{ name: 'name: review', kind: 'frontmatter', lineStart: 2, lineEnd: 2 },
					{ name: 'Review', kind: 'heading', lineStart: 5, lineEnd: 20 },
					{ name: 'references/checklist.md', kind: 'import', lineStart: 1, lineEnd: 1 }
				]
			]
		]);

		const skeleton = extractSkeleton('repo', tree(['skills/review/SKILL.md']), astMap);

		expect(skeleton.files[0]).toMatchObject({
			path: 'skills/review/SKILL.md',
			language: 'markdown',
			imports: [{ source: 'references/checklist.md', specifiers: [] }]
		});
		expect(skeleton.files[0].symbols.map((s) => s.kind)).toEqual(['frontmatter', 'heading']);
	});

	it('lets include entries override the skeleton exclusions', () => {
		// Regression: .github/instructions passed the loader but the skeleton still dropped ^.github/
		const sym: ASTSymbol[] = [{ name: 'run', kind: 'function', lineStart: 1, lineEnd: 2 }];
		const astMap = new Map<string, ASTSymbol[]>([
			[
				'.github/instructions/ts.instructions.md',
				[{ name: 'TS', kind: 'heading', lineStart: 1, lineEnd: 3 }]
			],
			['scripts/build.py', sym]
		]);
		const files = tree(['.github/instructions/ts.instructions.md', 'scripts/build.py']);

		try {
			expect(extractSkeleton('repo', files, astMap).files.map((f) => f.path)).toEqual([
				'.github/instructions/ts.instructions.md'
			]);
			settingsStore.customIncludePatterns = ['scripts'];
			expect(extractSkeleton('repo', files, astMap).files.map((f) => f.path)).toContain(
				'scripts/build.py'
			);
		} finally {
			settingsStore.customIncludePatterns = [];
		}
	});
});

describe('extractSubSkeleton', () => {
	it('extracts skeleton for subset of files', () => {
		const result = extractSubSkeleton(['main.py'], makeFileTree(), makeAstMap());

		expect(result.projectName).toBe('sub-skeleton');
		expect(result.totalFiles).toBe(1);
		expect(result.files[0].path).toBe('main.py');
	});

	it('ignores files not in the astMap', () => {
		const result = extractSubSkeleton(['nonexistent.py'], makeFileTree(), makeAstMap());
		expect(result.totalFiles).toBe(0);
	});
});

describe('estimatePayloadSize', () => {
	it('returns byte size and formatted string', () => {
		const payload: SkeletonPayload = {
			projectName: 'test',
			totalFiles: 0,
			totalSymbols: 0,
			files: [],
			generatedAt: new Date().toISOString()
		};
		const { bytes, formatted } = estimatePayloadSize(payload);
		expect(bytes).toBeGreaterThan(0);
		expect(formatted).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);
	});

	it('formats sizes correctly', () => {
		const smallPayload: SkeletonPayload = {
			projectName: 'x',
			totalFiles: 0,
			totalSymbols: 0,
			files: [],
			generatedAt: ''
		};
		const { formatted } = estimatePayloadSize(smallPayload);
		// Small payload should be in bytes
		expect(formatted).toMatch(/B$/);
	});
});

describe('formatPayloadPreview', () => {
	it('returns valid JSON string', () => {
		const payload: SkeletonPayload = {
			projectName: 'test',
			totalFiles: 1,
			totalSymbols: 2,
			files: [],
			generatedAt: '2024-01-01T00:00:00Z'
		};
		const preview = formatPayloadPreview(payload);
		const parsed = JSON.parse(preview);
		expect(parsed.projectName).toBe('test');
		expect(parsed.totalFiles).toBe(1);
	});
});
