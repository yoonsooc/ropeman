import { describe, it, expect } from 'vitest';
import {
	pathPriority,
	shouldSkipPath,
	SKIP_DIRS,
	createPathFilter,
	isIncludeAncestor,
	isPathIncluded,
	isPrimaryMarkdown,
	rankFiles,
	capFiles,
	DEFAULT_PATH_FILTER
} from './filePriority';
import { isEnvFile } from './languageDetector';

describe('pathPriority', () => {
	describe('GitHub tree paths (no repo prefix)', () => {
		it('scores core src/ as 0', () => {
			expect(pathPriority('src/index.ts')).toBe(0);
			expect(pathPriority('src/lib/foo.ts')).toBe(0);
		});

		it('scores other core dirs as 0', () => {
			expect(pathPriority('lib/util.ts')).toBe(0);
			expect(pathPriority('app/main.ts')).toBe(0);
			expect(pathPriority('pkg/svc/server.go')).toBe(0);
			expect(pathPriority('internal/core.go')).toBe(0);
			expect(pathPriority('cmd/server/main.go')).toBe(0);
		});

		it('scores root-level files as 1', () => {
			expect(pathPriority('index.ts')).toBe(1);
			expect(pathPriority('main.py')).toBe(1);
		});

		it('scores tests/examples/docs as 3', () => {
			expect(pathPriority('foo/tests/a.ts')).toBe(3);
			expect(pathPriority('foo/test/a.ts')).toBe(3);
			expect(pathPriority('foo/__tests__/a.ts')).toBe(3);
			expect(pathPriority('foo/examples/a.ts')).toBe(3);
			expect(pathPriority('foo/docs/a.ts')).toBe(3);
			expect(pathPriority('foo/benchmarks/a.ts')).toBe(3);
			expect(pathPriority('foo/fixtures/a.ts')).toBe(3);
			expect(pathPriority('foo/mocks/a.ts')).toBe(3);
		});

		it('scores other paths as 2', () => {
			expect(pathPriority('scripts/build.js')).toBe(2);
			expect(pathPriority('config/env.ts')).toBe(2);
		});

		it('is case-insensitive', () => {
			expect(pathPriority('SRC/Index.TS')).toBe(0);
			expect(pathPriority('Foo/TESTS/a.ts')).toBe(3);
		});
	});

	describe('local FileNode paths (with repo prefix)', () => {
		it('strips repo prefix and detects core src/', () => {
			expect(pathPriority('myrepo/src/index.ts', true)).toBe(0);
			expect(pathPriority('my-app/lib/util.ts', true)).toBe(0);
		});

		it('scores root-level files under repo as 1', () => {
			expect(pathPriority('myrepo/index.ts', true)).toBe(1);
		});

		it('scores tests under repo as 3', () => {
			expect(pathPriority('myrepo/tests/a.ts', true)).toBe(3);
			expect(pathPriority('myrepo/src/__tests__/a.ts', true)).toBe(3);
		});

		it('scores other paths as 2', () => {
			expect(pathPriority('myrepo/scripts/build.js', true)).toBe(2);
		});
	});

	describe('prioritization order', () => {
		it('core src < root < other < tests', () => {
			const paths = [
				'tests/a.ts', // 3
				'scripts/a.ts', // 2
				'root.ts', // 1
				'src/core.ts' // 0
			];
			const sorted = [...paths].sort((a, b) => pathPriority(a) - pathPriority(b));
			expect(sorted).toEqual(['src/core.ts', 'root.ts', 'scripts/a.ts', 'tests/a.ts']);
		});
	});
});

describe('SKIP_DIRS', () => {
	it('contains expected directory names', () => {
		expect(SKIP_DIRS.has('tests')).toBe(true);
		expect(SKIP_DIRS.has('test')).toBe(true);
		expect(SKIP_DIRS.has('examples')).toBe(true);
		expect(SKIP_DIRS.has('docs')).toBe(true);
		expect(SKIP_DIRS.has('node_modules')).toBe(true);
		expect(SKIP_DIRS.has('.git')).toBe(true);
		expect(SKIP_DIRS.has('vendor')).toBe(true);
	});

	it('does not contain source directories', () => {
		expect(SKIP_DIRS.has('src')).toBe(false);
		expect(SKIP_DIRS.has('lib')).toBe(false);
		expect(SKIP_DIRS.has('app')).toBe(false);
	});
});

describe('shouldSkipPath', () => {
	it('skips paths with skip-dir segments', () => {
		expect(shouldSkipPath('tests/foo.rs')).toBe(true);
		expect(shouldSkipPath('tokio/tests/io_read.rs')).toBe(true);
		expect(shouldSkipPath('examples/hello.rs')).toBe(true);
		expect(shouldSkipPath('docs/guide.md')).toBe(true);
		expect(shouldSkipPath('node_modules/pkg/index.js')).toBe(true);
	});

	it('skips hidden directories', () => {
		expect(shouldSkipPath('.github/workflows/ci.yml')).toBe(true);
		expect(shouldSkipPath('.vscode/settings.json')).toBe(true);
	});

	it('skips egg-info directories', () => {
		expect(shouldSkipPath('my_pkg.egg-info/PKG-INFO')).toBe(true);
	});

	it('does not skip core source paths', () => {
		expect(shouldSkipPath('src/main.rs')).toBe(false);
		expect(shouldSkipPath('tokio/src/runtime/mod.rs')).toBe(false);
		expect(shouldSkipPath('lib/utils.ts')).toBe(false);
	});

	it('does not skip root-level files', () => {
		expect(shouldSkipPath('Cargo.toml')).toBe(false);
		expect(shouldSkipPath('README.md')).toBe(false);
	});

	it('does not skip directories with hyphenated names containing skip words', () => {
		expect(shouldSkipPath('tests-integration/tests_macro.rs')).toBe(false);
		expect(shouldSkipPath('tests-build/pass/main.rs')).toBe(false);
	});

	it('does not skip .env as hidden', () => {
		expect(shouldSkipPath('.env/something')).toBe(false);
	});

	it('keeps every env file on the map and no other hidden file', () => {
		// Regression: `.env.example` was dropped as a hidden file, so its keys never reached the map.
		// Real env files stay listed so coverage can say they are not analyzed
		const hidden = [
			'.env',
			'packages/server/.env.example',
			'.env.production',
			'.envrc',
			'.env-sample',
			'.eslintrc.json'
		];

		const kept = hidden.filter((path) => !shouldSkipPath(path, DEFAULT_PATH_FILTER, true));

		expect(kept).toEqual(['.env', 'packages/server/.env.example', '.env.production']);
		expect(kept).toEqual(hidden.filter(isEnvFile));
	});

	it('skips root-level skip directories with trailing slash', () => {
		expect(shouldSkipPath('tests/')).toBe(true);
		expect(shouldSkipPath('examples/')).toBe(true);
		expect(shouldSkipPath('docs/')).toBe(true);
		expect(shouldSkipPath('.git/')).toBe(true);
	});

	it('respects custom exclude entries on top of the defaults', () => {
		const filter = createPathFilter(['target', 'generated']);
		expect(shouldSkipPath('target/foo.rs', filter)).toBe(true);
		expect(shouldSkipPath('generated/bar.ts', filter)).toBe(true);
		expect(shouldSkipPath('node_modules/x/y.js', filter)).toBe(true);
	});

	it('checks the file name itself only when asked', () => {
		expect(shouldSkipPath('.eslintrc')).toBe(false);
		expect(shouldSkipPath('.eslintrc', undefined, true)).toBe(true);
	});
});

describe('createPathFilter', () => {
	it('keeps the default skip list when nothing is added', () => {
		const filter = createPathFilter();
		expect(filter.skip.size).toBe(SKIP_DIRS.size);
		expect(filter.skip.has('node_modules')).toBe(true);
	});

	it('trims entries, drops empty lines and strips leading ./ and trailing /', () => {
		const filter = createPathFilter(['  target  ', '', '   '], ['./docs/', ' tools/gen/ ']);
		expect(filter.skip.has('target')).toBe(true);
		expect(filter.skip.has('')).toBe(false);
		expect(filter.includeNames.has('docs')).toBe(true);
		expect(filter.includePaths).toContain('tools/gen');
	});

	it('does not mutate SKIP_DIRS', () => {
		const before = SKIP_DIRS.size;
		createPathFilter(['target']);
		expect(SKIP_DIRS.size).toBe(before);
		expect(SKIP_DIRS.has('target')).toBe(false);
	});
});

describe('include entries', () => {
	it('keeps agent instruction folders by default even though they are hidden', () => {
		// Regression: .agents/skills, .claude/skills and Copilot instructions were dropped as hidden folders
		expect(shouldSkipPath('.agents/skills/review/SKILL.md')).toBe(false);
		expect(shouldSkipPath('.claude/skills/catchup/SKILL.md')).toBe(false);
		expect(shouldSkipPath('.cursor/rules/style.mdc')).toBe(false);
		expect(shouldSkipPath('.github/copilot-instructions.md')).toBe(false);
		expect(shouldSkipPath('.github/instructions/ts.instructions.md')).toBe(false);
	});

	it('keeps the rest of those hidden folders out', () => {
		expect(shouldSkipPath('.github/workflows/ci.yml')).toBe(true);
		expect(shouldSkipPath('.claude/worktrees/feature/src/app.ts')).toBe(true);
		expect(shouldSkipPath('.claude/settings.local.json', undefined, true)).toBe(true);
	});

	it('still skips excluded folders below an included one', () => {
		expect(shouldSkipPath('.agents/skills/x/node_modules/pkg/index.js')).toBe(true);
		expect(shouldSkipPath('.claude/skills/x/node_modules/pkg/index.js')).toBe(true);
	});

	it('supports path excludes from the root and Windows separators', () => {
		const filter = createPathFilter(['src/generated', 'tools\\vendor\\']);
		expect(shouldSkipPath('src/generated/api.ts', filter)).toBe(true);
		expect(shouldSkipPath('lib/src/generated/api.ts', filter)).toBe(false);
		expect(shouldSkipPath('tools/vendor/x.js', filter)).toBe(true);
	});

	it('keeps an include path inside a path exclude', () => {
		const filter = createPathFilter(['src/generated'], ['src/generated/keep']);
		expect(shouldSkipPath('src/generated/keep/a.ts', filter)).toBe(false);
		expect(shouldSkipPath('src/generated/drop/a.ts', filter)).toBe(true);
	});

	it('lets a bare name override the exclude rules at any depth', () => {
		const filter = createPathFilter([], ['docs']);
		expect(shouldSkipPath('docs/guide.md', filter)).toBe(false);
		expect(shouldSkipPath('packages/web/docs/api.md', filter)).toBe(false);
		expect(shouldSkipPath('docs/guide.md')).toBe(true);
	});

	it('lets a path entry override only that path from the root', () => {
		const filter = createPathFilter([], ['.github/workflows']);
		expect(shouldSkipPath('.github/workflows/ci.yml', filter)).toBe(false);
		expect(shouldSkipPath('.github/ISSUE_TEMPLATE/bug.md', filter)).toBe(true);
		expect(shouldSkipPath('sub/.github/workflows/ci.yml', filter)).toBe(true);
	});

	it('wins over a custom exclude of the same name', () => {
		const filter = createPathFilter(['generated'], ['generated']);
		expect(shouldSkipPath('generated/api.ts', filter)).toBe(false);
	});

	it('marks folders that must be walked to reach an include path', () => {
		expect(isIncludeAncestor('.github')).toBe(true);
		expect(isIncludeAncestor('.claude')).toBe(true);
		expect(isIncludeAncestor('.vscode')).toBe(false);
	});

	it('reports whether a path is explicitly included', () => {
		expect(isPathIncluded('.github/instructions/a.md')).toBe(true);
		expect(isPathIncluded('pkg/.agents/skills/a/SKILL.md')).toBe(true);
		expect(isPathIncluded('src/app.ts')).toBe(false);
		expect(isPathIncluded('scripts/build.sh', createPathFilter([], ['scripts']))).toBe(true);
	});
});

describe('markdown priority', () => {
	it('ranks ordinary docs last but keeps instruction files in place', () => {
		// Regression: every README and doc became parseable and could crowd code out of MAX_FILES
		expect(pathPriority('CHANGELOG.md')).toBe(3);
		expect(pathPriority('src/notes.md')).toBe(3);
		expect(pathPriority('README.md')).toBe(1);
		expect(pathPriority('skills/review/SKILL.md')).toBe(2);
		expect(pathPriority('repo/AGENTS.md', true)).toBe(1);
	});

	it('treats instruction names, Cursor rules and included paths as primary', () => {
		expect(isPrimaryMarkdown('skills/x/SKILL.md')).toBe(true);
		expect(isPrimaryMarkdown('.cursor/rules/style.mdc')).toBe(true);
		expect(isPrimaryMarkdown('.claude/commands/sync.md')).toBe(true);
		expect(isPrimaryMarkdown('skills/x/references/checklist.md')).toBe(false);
		expect(isPrimaryMarkdown('docs/guide.md', createPathFilter([], ['docs']))).toBe(true);
	});
});

describe('rankFiles and capFiles', () => {
	const files = (folder: string, count: number) =>
		Array.from({ length: count }, (_, i) => `${folder}/f${String(i).padStart(3, '0')}.ts`);
	const topPackage = (path: string) => path.split('/').slice(0, 2).join('/');

	it('keeps every package when one large package comes first in folder order', () => {
		// Regression (PASEO): a 2000-file cap applied in folder order filled up on packages/app
		const paths = [
			...files('packages/app/src', 50),
			...files('packages/server/src', 12),
			...files('packages/cli/src', 4),
			...files('packages/protocol/src', 3)
		];

		const { kept, cut } = capFiles(paths, (p) => p, 20);

		expect(new Set(kept.map(topPackage))).toEqual(
			new Set(['packages/app', 'packages/server', 'packages/cli', 'packages/protocol'])
		);
		expect(kept.filter((p) => p.startsWith('packages/cli/'))).toHaveLength(4);
		expect(kept.filter((p) => p.startsWith('packages/protocol/'))).toHaveLength(3);
		expect(kept.filter((p) => p.startsWith('packages/app/'))).toHaveLength(7);
		expect(kept.filter((p) => p.startsWith('packages/server/'))).toHaveLength(6);
		expect(cut).toHaveLength(paths.length - 20);
	});

	it('ranks config files with code, ahead of files no parser reads', () => {
		const paths = [
			'assets/logo.png',
			'Dockerfile',
			'infra/main.tf',
			'.env.example',
			'Makefile',
			'src/a.ts'
		];

		const { kept } = capFiles(paths, (p) => p, 5);

		expect(kept).not.toContain('assets/logo.png');
		expect(kept).toEqual(
			expect.arrayContaining(['Dockerfile', 'infra/main.tf', '.env.example', 'Makefile'])
		);
	});

	it('reports every file past the limit once, with the file-limit reason', () => {
		const paths = [...files('a/src', 5), ...files('b/src', 5)];

		const { kept, cut } = capFiles(paths, (p) => p, 6);

		expect(cut.every((c) => c.reason === 'file-limit')).toBe(true);
		expect([...kept, ...cut.map((c) => c.path)].sort()).toEqual([...paths].sort());
	});

	it('keeps nothing cut when the files fit', () => {
		expect(capFiles(['src/a.ts', 'b.png'], (p) => p).cut).toEqual([]);
	});

	it('ranks code before tests and docs, and parseable files before the rest', () => {
		const ranked = rankFiles(
			['assets/logo.png', 'src/__tests__/a.test.ts', 'CHANGELOG.md', 'scripts/run.ts', 'src/a.ts'],
			(p) => p
		);

		expect(ranked).toEqual([
			'scripts/run.ts',
			'src/a.ts',
			'CHANGELOG.md',
			'src/__tests__/a.test.ts',
			'assets/logo.png'
		]);
	});

	it('keeps Svelte and Vue components with code ahead of files no parser reads', () => {
		const { kept } = capFiles(
			['src/styles/app.css', 'src/App.vue', 'assets/logo.png', 'src/lib/Header.svelte'],
			(p) => p,
			2
		);

		expect(kept.sort()).toEqual(['src/App.vue', 'src/lib/Header.svelte']);
	});

	it('keeps instruction files and small code folders when core source alone exceeds the limit', () => {
		// Regression: ranking every src/ file ahead of everything else dropped AGENTS.md,
		// skills/ and scripts/ from PASEO even though they are a handful of files
		const paths = [
			...files('packages/app/src', 30),
			'AGENTS.md',
			'skills/review/SKILL.md',
			'scripts/release.ts'
		];

		const { kept } = capFiles(paths, (p) => p, 10);

		expect(kept).toEqual(
			expect.arrayContaining(['AGENTS.md', 'skills/review/SKILL.md', 'scripts/release.ts'])
		);
	});

	it('gives files directly in a folder one shared turn beside each subfolder', () => {
		const ranked = rankFiles(['src/x.ts', 'src/y.ts', 'src/z.ts', 'src/core/a.ts'], (p) => p);

		expect(ranked.slice(0, 2)).toEqual(['src/x.ts', 'src/core/a.ts']);
	});
});
