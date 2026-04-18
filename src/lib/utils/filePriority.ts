/**
 * File loading priority utility for G5 file limit strategy.
 *
 * Used by both `githubLoader` and `parserService` to sort source files
 * by relevance before applying MAX_TOTAL_SIZE limit.
 *
 * Lower score = higher priority (parsed first).
 */

const CORE_DIR_PATTERN = /(^|\/)(src|lib|app|pkg|internal|cmd)\//;
const LOW_PRIORITY_PATTERN =
	/(^|\/)(tests?|__tests__|spec|e2e|examples?|benchmarks?|docs?|fixtures?|mocks?)\//;

/**
 * Normalize path by stripping a leading project/repo name segment if present.
 * Local parser paths: "repoName/src/foo.ts" → "src/foo.ts"
 * GitHub tree paths: "src/foo.ts" → "src/foo.ts" (unchanged)
 */
function normalizePath(path: string, hasRepoPrefix: boolean): string {
	if (!hasRepoPrefix) return path;
	const slash = path.indexOf('/');
	return slash === -1 ? path : path.slice(slash + 1);
}

/**
 * Compute loading priority for a file path.
 *
 * Scores:
 *   0 — core source directories (src/, lib/, app/, pkg/, internal/, cmd/)
 *   1 — root-level source files
 *   2 — other paths
 *   3 — tests/examples/docs/benchmarks/fixtures/mocks
 *
 * @param path   File path to score
 * @param hasRepoPrefix  true if path is prefixed with repo/project name
 *                       (local FileNode paths), false for GitHub tree paths
 */
export function pathPriority(path: string, hasRepoPrefix = false): number {
	const normalized = normalizePath(path, hasRepoPrefix).toLowerCase();
	// Low-priority check first — tests/examples override core dir detection
	// (e.g. src/__tests__/foo.ts is a test, not core source)
	if (LOW_PRIORITY_PATTERN.test(normalized)) return 3;
	if (CORE_DIR_PATTERN.test(normalized)) return 0;
	if (!normalized.includes('/')) return 1;
	return 2;
}

/** Maximum total size (bytes) of files to parse. */
export const MAX_TOTAL_SIZE = 50_000_000; // 50MB

/** Maximum individual file size for AST parsing. */
export const MAX_FILE_SIZE = 500_000; // 500KB

/** Maximum file count safety cap. */
export const MAX_FILES = 2000;

/**
 * Directory names to exclude from file collection.
 * Shared by fileSystemService (local) and githubLoader (remote).
 */
export const SKIP_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'__pycache__',
	'.svelte-kit',
	'.next',
	'.nuxt',
	'.venv',
	'venv',
	'.tox',
	'.mypy_cache',
	'.pytest_cache',
	'.ruff_cache',
	'.eggs',
	'tests',
	'test',
	'docs',
	'doc',
	'examples',
	'benchmarks',
	'benchmark',
	'benchmark_v2',
	'notebooks',
	'fixtures',
	'coverage',
	'.coverage',
	'htmlcov',
	'.idea',
	'.vscode',
	'vendor'
]);

/**
 * Sort FileNode children: directories first, then alphabetically.
 * Recurses into all subdirectories.
 */
export function sortFileTree(root: import('$lib/types/fileTree').FileNode): void {
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (!node.children) continue;
		node.children.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const child of node.children) {
			if (child.kind === 'directory') stack.push(child);
		}
	}
}

/**
 * Check if a file path should be skipped based on directory skip patterns.
 * Returns true if any path segment matches skipSet or is hidden.
 */
export function shouldSkipPath(filePath: string, skipSet: Set<string> = SKIP_DIRS): boolean {
	const segments = filePath.split('/');
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i];
		if (skipSet.has(seg)) return true;
		if (seg.startsWith('.') && seg !== '.env') return true;
		if (seg.endsWith('.egg-info')) return true;
	}
	return false;
}

/**
 * Merge default SKIP_DIRS with user-provided custom patterns.
 * Trims whitespace and removes empty entries. Pure function — no store dependency.
 */
export function getEffectiveSkipDirs(customPatterns: string[]): Set<string> {
	const merged = new Set(SKIP_DIRS);
	for (const raw of customPatterns) {
		const trimmed = raw.trim();
		if (trimmed) merged.add(trimmed);
	}
	return merged;
}
