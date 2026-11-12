import type { ASTSymbol } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { formatPayloadPreview, selectSkeleton, selectSubSkeleton } from '../skeletonExtractor';

const PROJECT = 'fixture';

const line = (lineStart: number, lineEnd = lineStart) => ({ lineStart, lineEnd });

/** Parser output covering every shape the wire projection handles, keyed like the local loader. */
export const FIXTURE_AST: ReadonlyMap<string, ASTSymbol[]> = new Map<string, ASTSymbol[]>([
	[
		'fixture/src/app.ts',
		[
			{ name: 'import { z } from "zod";', kind: 'import', ...line(1) },
			{ name: "import './polyfill';", kind: 'import', ...line(2) },
			{ name: "import Default, { a, b } from './lib';", kind: 'import', ...line(3) },
			{ name: 'main', kind: 'function', ...line(5, 12), badges: ['async', 'export_default'] },
			{
				name: 'Server',
				kind: 'class',
				...line(14, 40),
				badges: ['abstract'],
				children: [
					{ name: 'port', kind: 'variable', ...line(15) },
					{
						name: 'start',
						kind: 'method',
						...line(17, 25),
						badges: ['static'],
						parentName: 'Server'
					},
					{ name: 'start', kind: 'method', ...line(27, 30), parentName: 'Server' }
				]
			},
			{ name: 'Config', kind: 'interface', ...line(42, 45) },
			{ name: 'Id', kind: 'type', ...line(47) },
			{ name: 'x', kind: 'variable', ...line(49), code: 'const x = 1;' }
		]
	],
	[
		'fixture/src/py/main.py',
		[
			{ name: 'from flask import Flask, request', kind: 'import', ...line(1) },
			{ name: 'import os', kind: 'import', ...line(2) },
			{ name: 'create_app', kind: 'function', ...line(4, 9), badges: ['decorator', 'route'] },
			{ name: 'handler', kind: 'function', ...line(11, 12) },
			{ name: 'handler', kind: 'function', ...line(14, 15) },
			{
				name: 'App',
				kind: 'class',
				...line(17, 30),
				children: [
					{ name: 'run', kind: 'method', ...line(18, 20), badges: ['generator'] },
					{
						name: 'Inner',
						kind: 'class',
						...line(22, 29),
						children: [{ name: 'go', kind: 'method', ...line(23, 28) }]
					}
				]
			}
		]
	],
	[
		'fixture/pkg/lib.go',
		[
			{ name: 'lib', kind: 'import', ...line(1) },
			{ name: 'import "fmt"', kind: 'import', ...line(3) },
			{
				name: 'Handler',
				kind: 'class',
				...line(5, 8),
				children: [{ name: 'Name', kind: 'variable', ...line(6) }]
			},
			{ name: 'ServeHTTP', kind: 'method', ...line(10, 14), parentName: 'Handler' }
		]
	],
	[
		'fixture/README.md',
		[
			{ name: 'name: fixture', kind: 'frontmatter', ...line(1, 3) },
			{
				name: 'Fixture',
				kind: 'heading',
				...line(5),
				children: [{ name: 'Usage', kind: 'heading', ...line(7) }]
			},
			{ name: 'docs/guide.md', kind: 'import', ...line(1) }
		]
	],
	[
		'fixture/src/nested.ts',
		[
			{
				name: 'Outer',
				kind: 'class',
				...line(1, 20),
				children: [
					{ name: 'import x from "y"', kind: 'import', ...line(2) },
					{ name: 'Helper', kind: 'interface', ...line(3, 5) }
				]
			}
		]
	],
	['fixture/src/types.ts', [{ name: 'Only', kind: 'interface', ...line(1, 3) }]],
	[
		'fixture/src/only-imports.ts',
		[{ name: "import '@scope/side-effect';", kind: 'import', ...line(1) }]
	],
	[
		'fixture/src/한글.ts',
		[{ name: '함수_이름', kind: 'function', ...line(1, 4), badges: ['async'] }]
	],
	['fixture/src/empty.ts', []],
	['fixture/tests/app.test.ts', [{ name: 'it_works', kind: 'function', ...line(1, 3) }]]
]);

/** Files that only fill the byte budget, so the budget scenarios cut and skip. */
function fillerAst(): Map<string, ASTSymbol[]> {
	const filler = new Map<string, ASTSymbol[]>();
	for (let i = 0; i < 40; i++) {
		const symbols: ASTSymbol[] = [
			{ name: `import { dep${i} } from './dep${i}';`, kind: 'import', ...line(1) }
		];
		for (let j = 0; j < 20 + i; j++) {
			symbols.push({
				name: `generatedFunction_${i}_${j}`,
				kind: 'function',
				...line(j * 3 + 2, j * 3 + 4)
			});
		}
		filler.set(`fixture/src/gen/file${i}.ts`, symbols);
	}
	return filler;
}

/** One file larger than the smallest budget on its own. */
function hugeAst(): Map<string, ASTSymbol[]> {
	const huge: ASTSymbol[] = [];
	for (let j = 0; j < 1800; j++)
		huge.push({ name: `hugeSymbol_${j}`, kind: 'function', ...line(j + 1) });
	return new Map([['fixture/src/huge.ts', huge]]);
}

function treeOf(paths: Iterable<string>): FileNode {
	return {
		name: PROJECT,
		path: PROJECT,
		kind: 'directory',
		children: [...paths, 'fixture/src/unparsed.rs'].map((path) => ({
			name: path.split('/').pop()!,
			path,
			kind: 'file' as const
		}))
	};
}

const SUB_PATHS = [
	'src/app.ts',
	'fixture/src/py/main.py',
	'pkg/lib.go',
	'src/missing.ts',
	'src/한글.ts'
];

interface Scenario {
	budgetKB: number | null;
	astMap: Map<string, ASTSymbol[]>;
	/** Top level when absent, else a drill-down over these paths */
	subPaths?: string[];
}

function scenarios(): Record<string, Scenario> {
	const shapes = new Map(FIXTURE_AST);
	const all = new Map([...FIXTURE_AST, ...fillerAst()]);
	const withHuge = new Map([...all, ...hugeAst()]);
	const genPaths = [...fillerAst().keys()].map((path) => path.slice(PROJECT.length + 1));
	return {
		'top/shapes': { budgetKB: null, astMap: shapes },
		'sub/shapes': { budgetKB: null, astMap: shapes, subPaths: SUB_PATHS },
		'top/all-unlimited': { budgetKB: null, astMap: all },
		'top/all-50KB': { budgetKB: 50, astMap: all },
		'top/huge-first-50KB': { budgetKB: 50, astMap: withHuge },
		'sub/all-50KB': {
			budgetKB: 50,
			astMap: withHuge,
			subPaths: [...SUB_PATHS, ...genPaths, 'src/huge.ts']
		},
		'sub/huge-only-50KB': { budgetKB: 50, astMap: withHuge, subPaths: ['src/huge.ts'] }
	};
}

/** Wires above this many bytes are pinned by hash, so the golden file stays reviewable. */
const INLINE_WIRE_BYTES = 8_000;

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The wire string and omissions of each request the app builds from the fixtures. */
export async function wireScenarios(): Promise<Record<string, unknown>> {
	const result: Record<string, unknown> = {};
	const saved = { kb: settingsStore.maxSkeletonKB, unlimited: settingsStore.skeletonUnlimited };
	try {
		for (const [name, { budgetKB, astMap, subPaths }] of Object.entries(scenarios())) {
			settingsStore.skeletonUnlimited = budgetKB === null;
			settingsStore.maxSkeletonKB = budgetKB ?? 250;
			const tree = treeOf(astMap.keys());
			const selection = subPaths
				? selectSubSkeleton(subPaths, tree, astMap)
				: selectSkeleton(PROJECT, tree, astMap);
			const wire = formatPayloadPreview(selection.payload);
			const bytes = new TextEncoder().encode(wire).byteLength;
			result[name] = {
				...(bytes <= INLINE_WIRE_BYTES ? { wire } : { bytes, sha256: await sha256(wire) }),
				totalFiles: selection.payload.totalFiles,
				omitted: selection.omitted,
				exceedsBudget: selection.exceedsBudget
			};
		}
	} finally {
		settingsStore.maxSkeletonKB = saved.kb;
		settingsStore.skeletonUnlimited = saved.unlimited;
	}
	return result;
}
