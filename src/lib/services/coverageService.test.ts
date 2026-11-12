import { describe, it, expect, afterEach } from 'vitest';
import { buildCoverage, currentCoverage, type CoverageInput } from './coverageService';
import { selectSkeleton } from './skeletonExtractor';
import { CONFIG_PARSERS } from './configParsers';
import { detectLanguage, type ConfigLanguage } from '$lib/utils/languageDetector';
import type { ASTSymbol } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import type { SemanticLevel, SemanticNode } from '$lib/types/semantic';
import type { SkeletonSelection } from '$lib/types/skeleton';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { semanticStore } from '$lib/stores/semanticStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';

const fn = (name: string): ASTSymbol => ({ name, kind: 'function', lineStart: 1, lineEnd: 1 });

function file(path: string, language?: string): FileNode {
	return { name: path.split('/').pop()!, path, kind: 'file', language };
}

function tree(root: string, files: FileNode[]): FileNode {
	return { name: root, path: root, kind: 'directory', children: files };
}

function node(id: string, filePaths: string[], depth = 0): SemanticNode {
	return {
		id,
		label: id,
		description: '',
		color: '',
		filePaths,
		keySymbols: [],
		parentId: null,
		depth,
		fileCount: filePaths.length
	};
}

function input(overrides: Partial<CoverageInput>): CoverageInput {
	const fileTree = overrides.fileTree ?? null;
	const astMap = overrides.astMap ?? new Map();
	return {
		projectName: 'repo',
		fileTree,
		astMap,
		cutFiles: [],
		parseSkips: [],
		skeleton: selectSkeleton('repo', fileTree, astMap),
		levels: new Map(),
		drilldownSkeleton: () => ({
			payload: { projectName: 'sub-skeleton', totalFiles: 0, totalSymbols: 0, files: [] },
			omitted: [],
			exceedsBudget: false
		}),
		...overrides
	};
}

describe('buildCoverage', () => {
	it('gives every file of the project one reason', () => {
		const fileTree = tree('repo', [
			file('repo/src/app.ts', 'typescript'),
			file('repo/src/types.ts', 'typescript'),
			file('repo/scripts/build.py', 'python'),
			file('repo/src/broken.ts', 'typescript'),
			file('repo/src/huge.ts', 'typescript'),
			file('repo/package.json'),
			file('repo/src/lost.go', 'go')
		]);
		const astMap = new Map<string, ASTSymbol[]>([
			['repo/src/app.ts', [fn('main')]],
			['repo/src/types.ts', [{ name: 'Config', kind: 'interface', lineStart: 1, lineEnd: 2 }]],
			['repo/scripts/build.py', [fn('build')]]
		]);

		const report = buildCoverage(
			input({
				fileTree,
				astMap,
				cutFiles: [{ path: 'vendor/big.ts', reason: 'file-limit' }],
				parseSkips: [
					{ path: 'repo/src/broken.ts', reason: 'parse-failed' },
					{ path: 'repo/src/huge.ts', reason: 'file-size' }
				]
			})
		);

		expect(Object.fromEntries(report.files.map((f) => [f.path, f.reason]))).toEqual({
			'src/app.ts': 'sent',
			'src/types.ts': 'no-symbols',
			'scripts/build.py': 'excluded-path',
			'src/broken.ts': 'parse-failed',
			'src/huge.ts': 'file-size',
			'package.json': 'unsupported',
			'src/lost.go': 'unreadable',
			'vendor/big.ts': 'file-limit'
		});
		expect(report.read).toBe(3);
		expect(report.byStatus.sent).toHaveLength(1);
		expect(report.byStatus['not-sent']).toHaveLength(1);
		expect(report.byStatus.cut).toHaveLength(1);
		expect(report.byStatus.skipped).toHaveLength(3);
		expect(report.byStatus.failed).toHaveLength(2);
	});

	it('reads config files like code, and reports real env files as never opened', () => {
		// Regression: Dockerfile, .tf, .env and Makefile were all reported as unsupported
		const sources: Record<string, string> = {
			'repo/Dockerfile': 'FROM node:20\nEXPOSE 3000',
			'repo/infra/main.tf': 'resource "aws_s3_bucket" "logs" {\n}',
			'repo/.env.example': 'DATABASE_URL=',
			'repo/.env.sample': '# no keys yet',
			'repo/Makefile': 'build:\n\tnpm run build'
		};
		const unread = ['repo/logo.png', 'repo/.env', 'repo/.env.production'];
		const fileTree = tree(
			'repo',
			[...Object.keys(sources), ...unread].map((path) =>
				file(path, detectLanguage(path) ?? undefined)
			)
		);
		const astMap = new Map(
			Object.entries(sources).map(([path, content]) => [
				path,
				CONFIG_PARSERS[detectLanguage(path) as ConfigLanguage](content)
			])
		);

		const report = buildCoverage(input({ fileTree, astMap }));

		expect(Object.fromEntries(report.files.map((f) => [f.path, f.reason]))).toEqual({
			Dockerfile: 'sent',
			'infra/main.tf': 'sent',
			'.env.example': 'sent',
			'.env.sample': 'no-symbols',
			'.env': 'env-values',
			'.env.production': 'env-values',
			Makefile: 'sent',
			'logo.png': 'unsupported'
		});
	});

	it('reports files the budget kept out as read but not sent', () => {
		const fileTree = tree('repo', [
			file('repo/src/a.ts', 'typescript'),
			file('repo/src/b.ts', 'typescript')
		]);
		const astMap = new Map([
			['repo/src/a.ts', [fn('a')]],
			['repo/src/b.ts', [fn('b')]]
		]);
		const skeleton: SkeletonSelection = {
			payload: {
				projectName: 'repo',
				totalFiles: 1,
				totalSymbols: 1,
				files: [{ path: 'repo/src/a.ts', language: 'typescript', symbols: [], imports: [] }]
			},
			omitted: [{ path: 'repo/src/b.ts', reason: 'over-budget' }],
			exceedsBudget: false
		};

		const report = buildCoverage(input({ fileTree, astMap, skeleton }));

		expect(report.byStatus.sent.map((f) => f.path)).toEqual(['src/a.ts']);
		expect(report.byStatus['not-sent']).toEqual([{ path: 'src/b.ts', reason: 'over-budget' }]);
		expect(report.read).toBe(2);
	});

	it('keeps the loader reason for a file that is also in the tree', () => {
		// The GitHub loader keeps cut files in the tree, under the repository name
		const fileTree = tree('repo', [file('repo/src/big.ts', 'typescript')]);

		const report = buildCoverage(
			input({ fileTree, cutFiles: [{ path: 'src/big.ts', reason: 'total-size' }] })
		);

		expect(report.files).toEqual([{ path: 'src/big.ts', reason: 'total-size' }]);
	});

	it('lists each diagram level with its assignment counts and budget cut', () => {
		const auth = node('sem:auth', ['src/a.ts', 'src/b.ts']);
		const root: SemanticLevel = {
			parentId: null,
			nodes: [auth],
			edges: [],
			breadcrumbLabel: 'Project',
			assignment: { leftOut: 2, duplicated: 1, invented: 3, emptied: 0 }
		};
		const child: SemanticLevel = {
			parentId: 'sem:auth',
			nodes: [],
			edges: [],
			breadcrumbLabel: 'auth'
		};
		const skeleton: SkeletonSelection = {
			payload: { projectName: 'repo', totalFiles: 0, totalSymbols: 0, files: [] },
			omitted: [{ path: 'x.ts', reason: 'over-budget' }],
			exceedsBudget: false
		};

		const report = buildCoverage(
			input({
				skeleton,
				levels: new Map([
					['sem:auth', child],
					['__root__', root]
				]),
				drilldownSkeleton: (parent) => ({
					payload: { projectName: 'sub-skeleton', totalFiles: 1, totalSymbols: 1, files: [] },
					omitted: Array.from({ length: parent.id === 'sem:auth' ? 4 : 0 }, (_, i) => ({
						path: `big${i}.ts`,
						reason: 'over-budget' as const
					})),
					exceedsBudget: parent.id === 'sem:auth'
				})
			})
		);

		expect(report.levels).toEqual([
			{
				key: '__root__',
				label: 'Project',
				depth: 0,
				assignment: { leftOut: 2, duplicated: 1, invented: 3, emptied: 0 },
				overBudget: 1,
				exceedsBudget: false
			},
			{
				key: 'sem:auth',
				label: 'sem:auth',
				depth: 1,
				assignment: null,
				overBudget: 4,
				exceedsBudget: true
			}
		]);
	});
});

describe('currentCoverage', () => {
	afterEach(() => {
		projectStore.reset();
		semanticStore.clear();
		settingsStore.maxSkeletonKB = 250;
	});

	it('counts the files a drill-down request leaves out for the budget', () => {
		const paths = Array.from({ length: 300 }, (_, i) => `src/m${i}/service${i}.ts`);
		projectStore.projectName = 'repo';
		projectStore.fileTree = tree(
			'repo',
			paths.map((p) => file(p, 'typescript'))
		);
		projectStore.astMap = new Map(
			paths.map((p, i) => [p, Array.from({ length: 8 }, (_, j) => fn(`handle${i}_${j}`))])
		);
		settingsStore.maxSkeletonKB = 20;
		const big = node('sem:all', paths);
		semanticStore.setCachedLevel('__root__', {
			parentId: null,
			nodes: [big],
			edges: [],
			breadcrumbLabel: 'Project'
		});
		semanticStore.setCachedLevel('sem:all', {
			parentId: 'sem:all',
			nodes: [],
			edges: [],
			breadcrumbLabel: 'all'
		});

		const report = currentCoverage();

		const root = report.levels.find((l) => l.key === '__root__')!;
		const drill = report.levels.find((l) => l.key === 'sem:all')!;
		expect(root.overBudget).toBe(report.byStatus['not-sent'].length);
		expect(root.overBudget).toBeGreaterThan(0);
		expect(drill.overBudget).toBeGreaterThan(0);
		expect(report.byStatus.sent.length + root.overBudget).toBe(300);
	});

	it('marks a drill-down whose only file is over the budget', () => {
		// Arrange
		const small = 'src/small.ts';
		const huge = 'src/huge.ts';
		projectStore.projectName = 'repo';
		projectStore.fileTree = tree('repo', [file(small, 'typescript'), file(huge, 'typescript')]);
		projectStore.astMap = new Map([
			[small, [fn('tiny')]],
			[huge, Array.from({ length: 3000 }, (_, j) => fn(`handler_with_a_long_name_${j}`))]
		]);
		settingsStore.maxSkeletonKB = 20;
		semanticStore.setCachedLevel('__root__', {
			parentId: null,
			nodes: [node('sem:small', [small]), node('sem:huge', [huge])],
			edges: [],
			breadcrumbLabel: 'Project'
		});
		for (const id of ['sem:small', 'sem:huge']) {
			semanticStore.setCachedLevel(id, {
				parentId: id,
				nodes: [],
				edges: [],
				breadcrumbLabel: id
			});
		}

		// Act
		const report = currentCoverage();

		// Assert
		const exceeds = Object.fromEntries(report.levels.map((l) => [l.key, l.exceedsBudget]));
		expect(exceeds).toEqual({ __root__: false, 'sem:small': false, 'sem:huge': true });
	});
});
