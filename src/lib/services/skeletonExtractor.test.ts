import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	extractSkeleton,
	extractSubSkeleton,
	selectSkeleton,
	selectSubSkeleton,
	estimatePayloadSize,
	formatPayloadPreview,
	buildCodeMap,
	fileFromAst,
	toWireFile
} from './skeletonExtractor';
import type { FileRecord, FilePath, SymbolId } from '$lib/types/codeMap';
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

	it('names both single-file component languages', () => {
		const component = { name: 'mount', kind: 'function' as const, lineStart: 2, lineEnd: 4 };
		const astMap = new Map<string, ASTSymbol[]>([
			['App.vue', [component]],
			['App.svelte', [component]]
		]);
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [
				{ name: 'App.vue', path: 'App.vue', kind: 'file' },
				{ name: 'App.svelte', path: 'App.svelte', kind: 'file' }
			]
		};

		const result = extractSkeleton('test', tree, astMap);

		expect(result.files.map((f) => [f.path, f.language]).sort()).toEqual([
			['App.svelte', 'svelte'],
			['App.vue', 'vue']
		]);
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

function manyFiles(count: number): { tree: FileNode; astMap: Map<string, ASTSymbol[]> } {
	const astMap = new Map<string, ASTSymbol[]>();
	const children: FileNode[] = [];
	for (let i = 0; i < count; i++) {
		const path = `src/module${i}/service${i}.ts`;
		children.push({ name: `service${i}.ts`, path, kind: 'file', language: 'typescript' });
		astMap.set(
			path,
			Array.from({ length: 8 }, (_, j) => ({
				name: `handleRequest${i}_${j}`,
				kind: 'function' as const,
				lineStart: j,
				lineEnd: j
			}))
		);
	}
	return { tree: { name: 'repo', path: '', kind: 'directory', children }, astMap };
}

const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

describe('skeleton budget', () => {
	afterEach(() => {
		settingsStore.maxSkeletonKB = 250;
		settingsStore.skeletonUnlimited = false;
		vi.useRealTimers();
	});

	it('never sends more bytes than the budget allows', () => {
		// Regression: the budget was measured on compact JSON while indented JSON was sent,
		// so PASEO's 250KB budget went out as 464KB.
		const { tree, astMap } = manyFiles(400);
		for (const kb of [50, 60, 75, 100]) {
			settingsStore.maxSkeletonKB = kb;

			const sent = formatPayloadPreview(extractSkeleton('repo', tree, astMap));

			expect(byteLength(sent)).toBeLessThanOrEqual(kb * 1000);
			expect(byteLength(sent)).toBeGreaterThan(kb * 1000 - 1000);
		}
	});

	it('sends every file when the budget is unlimited', () => {
		const { tree, astMap } = manyFiles(400);
		settingsStore.maxSkeletonKB = 50;
		settingsStore.skeletonUnlimited = true;

		const skeleton = extractSkeleton('repo', tree, astMap);

		expect(skeleton.totalFiles).toBe(400);
		expect(skeleton.projectName).toBe('repo');
	});

	it('serializes the same project to the same string at different times', () => {
		// Regression: a generatedAt stamp made every request unique, so the response cache never hit
		const { tree, astMap } = manyFiles(3);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const first = formatPayloadPreview(extractSkeleton('repo', tree, astMap));
		vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));

		const second = formatPayloadPreview(extractSkeleton('repo', tree, astMap));

		expect(second).toBe(first);
	});
});

describe('skeleton omissions', () => {
	afterEach(() => {
		settingsStore.maxSkeletonKB = 250;
		settingsStore.skeletonUnlimited = false;
	});

	it('names every parsed file it leaves out, with the reason', () => {
		const { tree, astMap } = manyFiles(400);
		tree.children!.push(
			{ name: 'types.ts', path: 'src/types.ts', kind: 'file', language: 'typescript' },
			{ name: 'run.py', path: 'scripts/run.py', kind: 'file', language: 'python' }
		);
		astMap.set('src/types.ts', [{ name: 'Config', kind: 'interface', lineStart: 1, lineEnd: 3 }]);
		astMap.set('scripts/run.py', [{ name: 'main', kind: 'function', lineStart: 1, lineEnd: 3 }]);
		settingsStore.maxSkeletonKB = 50;

		const { payload, omitted } = selectSkeleton('repo', tree, astMap);

		const reasonOf = new Map(omitted.map((o) => [o.path, o.reason]));
		expect(reasonOf.get('src/types.ts')).toBe('no-symbols');
		expect(reasonOf.get('scripts/run.py')).toBe('excluded-path');
		const overBudget = omitted.filter((o) => o.reason === 'over-budget');
		expect(payload.totalFiles + overBudget.length).toBe(400);
		expect(overBudget.length).toBeGreaterThan(0);
		const sent = new Set(payload.files.map((f) => f.path));
		expect(omitted.some((o) => sent.has(o.path))).toBe(false);
	});

	it('sends the same payload as extractSkeleton', () => {
		const { tree, astMap } = manyFiles(400);
		settingsStore.maxSkeletonKB = 50;

		expect(selectSkeleton('repo', tree, astMap).payload).toEqual(
			extractSkeleton('repo', tree, astMap)
		);
	});
});

describe('drill-down budget', () => {
	afterEach(() => {
		settingsStore.maxSkeletonKB = 250;
		settingsStore.skeletonUnlimited = false;
	});

	it('never sends a drill-down larger than the budget', () => {
		// Regression: the drill-down request had no byte budget at all
		const { tree, astMap } = manyFiles(400);
		const paths = [...astMap.keys()];
		settingsStore.maxSkeletonKB = 50;

		const { payload, omitted } = selectSubSkeleton(paths, tree, astMap);

		expect(byteLength(formatPayloadPreview(payload))).toBeLessThanOrEqual(50_000);
		expect(payload.totalFiles + omitted.length).toBe(400);
		expect(omitted.every((o) => o.reason === 'over-budget')).toBe(true);
	});

	it('keeps the node file order, so a drill-down that fits is sent unchanged', () => {
		const { tree, astMap } = manyFiles(5);
		const paths = [...astMap.keys()].reverse();

		const { payload, omitted } = selectSubSkeleton(paths, tree, astMap);

		expect(payload.files.map((f) => f.path)).toEqual(paths);
		expect(omitted).toEqual([]);
	});

	it('keeps the largest outlines when the budget is short', () => {
		const { tree, astMap } = manyFiles(400);
		const big = 'src/module7/service7.ts';
		astMap.set(
			big,
			Array.from({ length: 40 }, (_, j) => ({
				name: `bigHandler${j}`,
				kind: 'function' as const,
				lineStart: j,
				lineEnd: j
			}))
		);
		settingsStore.maxSkeletonKB = 50;

		const { payload } = selectSubSkeleton([...astMap.keys()].reverse(), tree, astMap);

		expect(payload.files.map((f) => f.path)).toContain(big);
	});
});

describe('drill-down with a file over the budget', () => {
	afterEach(() => {
		settingsStore.maxSkeletonKB = 250;
	});

	const functions = (prefix: string, count: number): ASTSymbol[] =>
		Array.from({ length: count }, (_, j) => ({
			name: `${prefix}Handler${j}`,
			kind: 'function' as const,
			lineStart: j,
			lineEnd: j
		}));

	function nodeFiles(sizes: Record<string, number>) {
		const astMap = new Map<string, ASTSymbol[]>();
		for (const [path, count] of Object.entries(sizes)) astMap.set(path, functions(path, count));
		const children: FileNode[] = Object.keys(sizes).map((path) => ({
			name: path,
			path,
			kind: 'file',
			language: 'typescript'
		}));
		return { tree: { name: 'repo', path: '', kind: 'directory', children } as FileNode, astMap };
	}

	it('still sends the smaller files when the largest one alone is over the budget', () => {
		// Regression: the first file that did not fit ended the selection, so a node whose
		// largest outline was over the budget sent nothing and could not be drilled into
		const { tree, astMap } = nodeFiles({ 'big.ts': 1500, 'a.ts': 5, 'b.ts': 5, 'c.ts': 5 });
		settingsStore.maxSkeletonKB = 50;

		const { payload, omitted, exceedsBudget } = selectSubSkeleton([...astMap.keys()], tree, astMap);

		expect(payload.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
		expect(omitted).toEqual([{ path: 'big.ts', reason: 'over-budget' }]);
		expect(exceedsBudget).toBe(false);
		expect(byteLength(formatPayloadPreview(payload))).toBeLessThanOrEqual(50_000);
	});

	it('sends the smallest file, flagged, when no file fits the budget', () => {
		const { tree, astMap } = nodeFiles({ 'large.ts': 1600, 'small.ts': 1200, 'medium.ts': 1400 });
		settingsStore.maxSkeletonKB = 50;

		const { payload, omitted, exceedsBudget } = selectSubSkeleton([...astMap.keys()], tree, astMap);

		expect(payload.files.map((f) => f.path)).toEqual(['small.ts']);
		expect(payload.totalFiles).toBe(1);
		expect(omitted).toEqual([
			{ path: 'large.ts', reason: 'over-budget' },
			{ path: 'medium.ts', reason: 'over-budget' }
		]);
		expect(exceedsBudget).toBe(true);
		expect(byteLength(formatPayloadPreview(payload))).toBeGreaterThan(50_000);
	});

	it('keeps the top level stopping at the first file that does not fit', () => {
		// The top-level string is a cache key, so it must not change shape
		const { tree, astMap } = nodeFiles({ 'src/big.ts': 1500, 'src/a.ts': 5 });
		settingsStore.maxSkeletonKB = 50;

		const { payload, omitted, exceedsBudget } = selectSkeleton('repo', tree, astMap);

		expect(payload.files).toEqual([]);
		expect(omitted.map((o) => o.path).sort()).toEqual(['src/a.ts', 'src/big.ts']);
		expect(exceedsBudget).toBe(false);
	});
});

describe('estimatePayloadSize', () => {
	it('reports the UTF-8 bytes of the string that is sent', () => {
		const payload: SkeletonPayload = {
			projectName: '프로젝트',
			totalFiles: 1,
			totalSymbols: 1,
			files: [
				{
					path: 'src/한글.ts',
					language: 'typescript',
					symbols: [{ name: 'run', kind: 'function' }],
					imports: []
				}
			]
		};
		const sent = formatPayloadPreview(payload);

		const { bytes } = estimatePayloadSize(payload);

		expect(bytes).toBe(byteLength(sent));
		expect(bytes).toBeGreaterThan(sent.length);
	});

	it('formats sizes in the same decimal KB as the budget setting', () => {
		const { tree, astMap } = manyFiles(400);
		settingsStore.maxSkeletonKB = 50;
		const skeleton = extractSkeleton('repo', tree, astMap);

		const { bytes, formatted } = estimatePayloadSize(skeleton);

		expect(formatted).toBe(`${(bytes / 1000).toFixed(1)} KB`);
		settingsStore.maxSkeletonKB = 250;
	});

	it('shows a small payload in bytes', () => {
		const payload: SkeletonPayload = {
			projectName: 'x',
			totalFiles: 0,
			totalSymbols: 0,
			files: []
		};

		const { bytes, formatted } = estimatePayloadSize(payload);

		expect(formatted).toBe(`${bytes} B`);
	});
});

describe('formatPayloadPreview', () => {
	it('returns the skeleton as compact JSON', () => {
		const payload: SkeletonPayload = {
			projectName: 'test',
			totalFiles: 1,
			totalSymbols: 2,
			files: []
		};

		const preview = formatPayloadPreview(payload);

		expect(JSON.parse(preview)).toEqual(payload);
		expect(preview).not.toMatch(/\n/);
	});
});

describe('skeleton v2 code map', () => {
	it('keeps the line range and every kind the wire drops', () => {
		const record = fileFromAst('utils.ts', makeAstMap().get('utils.ts')!);

		expect(record.symbols.map((s) => [s.name, s.kind, s.lines])).toEqual([
			['formatDate', 'function', { start: 3, end: 8 }],
			['IConfig', 'interface', { start: 10, end: 15 }],
			['ConfigType', 'type', { start: 17, end: 17 }]
		]);
	});

	it('records each import with its line, waiting for a resolver', () => {
		const record = fileFromAst('lib.go', makeAstMap().get('lib.go')!);

		expect(record.imports).toEqual([
			{ line: 3, text: 'import "fmt"', module: { state: 'pending' }, specifiers: null }
		]);
		expect(record.reexports).toEqual([]);
		expect(record.refs).toEqual([]);
		expect(record.lines).toEqual({ start: 1, end: null });
	});

	it('keeps an export-from statement out of the imports the wire sends', () => {
		const imported: ASTSymbol = {
			name: "import { a } from './a'",
			kind: 'import',
			lineStart: 1,
			lineEnd: 1
		};
		const reexported: ASTSymbol = {
			name: "export * from './b'",
			kind: 'import',
			lineStart: 2,
			lineEnd: 2
		};

		const record = fileFromAst('index.ts', [imported, reexported]);

		expect(record.imports.map((site) => site.text)).toEqual([imported.name]);
		expect(record.reexports).toEqual([
			{ line: 2, text: reexported.name, module: { state: 'pending' }, specifiers: null }
		]);
		expect(toWireFile('index.ts', record)).toEqual(
			toWireFile('index.ts', fileFromAst('index.ts', [imported]))
		);
	});

	it('names symbols by file and nesting, numbering duplicates', () => {
		const record = fileFromAst('svc.ts', [
			{
				name: 'Server',
				kind: 'class',
				lineStart: 1,
				lineEnd: 9,
				children: [
					{ name: 'start', kind: 'method', lineStart: 2, lineEnd: 4 },
					{ name: 'start', kind: 'method', lineStart: 5, lineEnd: 8 }
				]
			},
			{ name: 'Stop', kind: 'method', lineStart: 11, lineEnd: 12, parentName: 'Server' }
		]);

		const ids = (symbols: FileRecord['symbols']): string[] =>
			symbols.flatMap((s) => [s.id, ...ids(s.children)]);
		expect(ids(record.symbols)).toEqual([
			'svc.ts#Server',
			'svc.ts#Server.start',
			'svc.ts#Server.start~2',
			'svc.ts#Server.Stop'
		]);
	});

	it('builds a record for every parsed file, empty ones included, in parser order', () => {
		const astMap = makeAstMap();
		astMap.set('empty.ts', []);

		const map = buildCodeMap(astMap, null);

		expect(map.version).toBe(2);
		expect([...map.files.keys()]).toEqual(['main.py', 'utils.ts', 'lib.go', 'empty.ts']);
	});

	it('sends the same wire file whatever sites and bindings are filled in', () => {
		const record = fileFromAst('main.py', makeAstMap().get('main.py')!);
		const flask = { kind: 'external', module: 'flask', name: 'Flask' } as const;
		const resolved: FileRecord = {
			...record,
			lines: { start: 1, end: 12 },
			imports: record.imports.map((site) => ({
				...site,
				module: {
					state: 'bound',
					candidates: [
						{
							to: { kind: 'external', module: 'flask', name: null },
							provenance: { source: 'resolver', confidence: 'EXTRACTED' }
						}
					]
				},
				specifiers: [
					{
						kind: 'named',
						name: 'Flask',
						local: 'Flask',
						typeOnly: false,
						target: {
							state: 'bound',
							candidates: [
								{ to: flask, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }
							]
						}
					}
				]
			})),
			reexports: [
				{
					line: 2,
					text: "export * from './routes'",
					module: { state: 'unresolved' },
					specifiers: []
				}
			],
			refs: [
				{
					kind: 'calls',
					line: 4,
					from: 'main.py#create_app' as SymbolId,
					written: 'Flask',
					target: {
						state: 'bound',
						candidates: [{ to: flask, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }]
					}
				}
			]
		};

		expect(JSON.stringify(toWireFile('main.py', resolved))).toBe(
			JSON.stringify(toWireFile('main.py', record))
		);
	});

	it('names the file on the wire by the path the request uses', () => {
		const record = fileFromAst('project/src/a.ts', [
			{ name: 'run', kind: 'function', lineStart: 1, lineEnd: 2 }
		]);

		const wire = toWireFile('src/a.ts', record);

		expect(record.path).toBe('project/src/a.ts' as FilePath);
		expect(wire?.path).toBe('src/a.ts');
	});

	it('sends nothing for a file of local-only kinds', () => {
		const record = fileFromAst('types.ts', [
			{ name: 'Only', kind: 'interface', lineStart: 1, lineEnd: 3 }
		]);

		expect(toWireFile('types.ts', record)).toBeNull();
		expect(record.symbols).toHaveLength(1);
	});
});
