/**
 * File loading priority utility for G5 file limit strategy.
 *
 * Used by `fileSystemService`, `githubLoader` and `parserService` to rank files
 * by relevance before applying the MAX_FILES and MAX_TOTAL_SIZE limits.
 *
 * Lower score = higher priority (parsed first).
 */

import { detectLanguage, isEnvFile, isSupported } from '$lib/utils/languageDetector';

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
	const stripped = normalizePath(path, hasRepoPrefix);
	const normalized = stripped.toLowerCase();
	// Low-priority check first — tests/examples override core dir detection
	// (e.g. src/__tests__/foo.ts is a test, not core source)
	if (LOW_PRIORITY_PATTERN.test(normalized)) return 3;
	// Ordinary docs must not push code out of the file limits; instruction files keep their place
	if (isMarkdownPath(normalized) && !isPrimaryMarkdown(stripped)) return 3;
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

/** Why a loader left a file out of the project. */
export type CutReason = 'file-limit' | 'file-size' | 'total-size';

export interface CutFile {
	path: string;
	reason: CutReason;
}

/**
 * Coarse rank for the file limit: code and instruction files, then tests and ordinary docs,
 * then files no parser reads. The finer `pathPriority` scores are not used here, so a
 * folder of scripts or skills still gets its turn beside core source.
 */
function rankBand(path: string): number {
	const language = detectLanguage(path);
	if (!language || !isSupported(language)) return 2;
	return pathPriority(path) === 3 ? 1 : 0;
}

interface RankEntry<T> {
	item: T;
	segments: string[];
}

/**
 * Round-robin over the folders at `depth`, recursing into each, so every folder gets an
 * equal turn and a large sibling cannot use up a cap before a small one is reached.
 * Files sitting directly in the folder share one turn, in name order.
 */
function interleaveByFolder<T>(entries: RankEntry<T>[], depth: number): T[] {
	const looseFiles: RankEntry<T>[] = [];
	const folders = new Map<string, RankEntry<T>[]>();
	for (const entry of entries) {
		if (entry.segments.length - 1 <= depth) {
			looseFiles.push(entry);
			continue;
		}
		const name = entry.segments[depth];
		const group = folders.get(name);
		if (group) group.push(entry);
		else folders.set(name, [entry]);
	}
	looseFiles.sort((a, b) => a.segments[depth].localeCompare(b.segments[depth]));
	const queues = [
		looseFiles.map((entry) => entry.item),
		...[...folders.keys()]
			.sort((a, b) => a.localeCompare(b))
			.map((name) => interleaveByFolder(folders.get(name)!, depth + 1))
	];

	const ordered: T[] = [];
	let open = queues;
	for (let turn = 0; ; turn++) {
		open = open.filter((queue) => turn < queue.length);
		if (open.length === 0) return ordered;
		for (const queue of open) ordered.push(queue[turn]);
	}
}

/**
 * Order files for a count cap. Each band from `rankBand` comes after the one before it;
 * inside a band every folder level takes turns, so one large folder cannot crowd out its
 * siblings. Paths are relative to the project root, without the project name.
 */
export function rankFiles<T>(items: readonly T[], pathOf: (item: T) => string): T[] {
	const bands = new Map<number, RankEntry<T>[]>();
	for (const item of items) {
		const path = pathOf(item);
		const band = rankBand(path);
		const entry = { item, segments: path.split('/') };
		const group = bands.get(band);
		if (group) group.push(entry);
		else bands.set(band, [entry]);
	}
	return [...bands.keys()]
		.sort((a, b) => a - b)
		.flatMap((band) => interleaveByFolder(bands.get(band)!, 0));
}

/** Rank the files, keep the first `limit` and report the rest as cut by the file limit. */
export function capFiles<T>(
	items: readonly T[],
	pathOf: (item: T) => string,
	limit = MAX_FILES
): { kept: T[]; cut: CutFile[] } {
	const ranked = rankFiles(items, pathOf);
	return {
		kept: ranked.slice(0, limit),
		cut: ranked.slice(limit).map((item) => ({ path: pathOf(item), reason: 'file-limit' }))
	};
}

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
 * Agent instruction locations kept by default even though their folder is hidden
 * (`.claude`, `.github`, ...). An entry without a slash matches a folder or file name
 * at any depth; an entry with a slash matches that path from the project root.
 * `.claude` is listed by subfolder so local worktrees and caches under it stay out.
 */
export const DEFAULT_INCLUDE_PATHS: readonly string[] = [
	'.agents',
	'.claude-plugin',
	'.codex',
	'.codex-plugin',
	'.cursor',
	'.gemini',
	'.windsurf',
	'.clinerules',
	'.kiro',
	'.opencode',
	'.roo',
	'.claude/skills',
	'.claude/agents',
	'.claude/commands',
	'.claude/rules',
	'.claude/hooks',
	'.claude/output-styles',
	'.claude/settings.json',
	'.claude/CLAUDE.md',
	'.github/copilot-instructions.md',
	'.github/instructions',
	'.github/prompts',
	'.github/skills',
	'.github/agents',
	'.github/chatmodes'
];

/** Folder names to skip plus include entries that override the skip rules. */
export interface PathFilter {
	skip: Set<string>;
	skipPaths: string[];
	includeNames: Set<string>;
	includePaths: string[];
}

function normalizeEntry(raw: string): string {
	return raw
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/\/+$/, '');
}

/**
 * Merge the defaults with the user's extra exclude and include entries.
 * Include wins over exclude, including the hidden-folder rule.
 */
export function createPathFilter(
	customSkipPatterns: string[] = [],
	customIncludePatterns: string[] = []
): PathFilter {
	const skip = new Set(SKIP_DIRS);
	const skipPaths: string[] = [];
	for (const raw of customSkipPatterns) {
		const entry = normalizeEntry(raw);
		if (!entry) continue;
		if (entry.includes('/')) skipPaths.push(entry);
		else skip.add(entry);
	}
	const includeNames = new Set<string>();
	const includePaths: string[] = [];
	for (const raw of [...DEFAULT_INCLUDE_PATHS, ...customIncludePatterns]) {
		const entry = normalizeEntry(raw);
		if (!entry) continue;
		if (entry.includes('/')) includePaths.push(entry);
		else includeNames.add(entry);
	}
	return { skip, skipPaths, includeNames, includePaths };
}

export const DEFAULT_PATH_FILTER: PathFilter = createPathFilter();

function isExcludedSegment(seg: string, prefix: string, filter: PathFilter): boolean {
	if (filter.skip.has(seg) || filter.skipPaths.includes(prefix)) return true;
	if (seg.startsWith('.') && !isEnvFile(seg)) return true;
	return seg.endsWith('.egg-info');
}

function withinPath(path: string, entry: string): boolean {
	return path === entry || path.startsWith(entry + '/');
}

/**
 * Check if a path should be skipped. A segment is excluded when it is in the skip set,
 * its path from the root is a path exclude entry, or it is hidden or an `.egg-info` folder, unless an include entry covers it: a name entry equal
 * to the segment, or a path entry at or below that segment that contains the whole path.
 * Only folder segments are checked unless `checkName` is set; a trailing slash marks a
 * folder path so its own name is checked.
 */
export function shouldSkipPath(
	filePath: string,
	filter: PathFilter = DEFAULT_PATH_FILTER,
	checkName = false
): boolean {
	const segments = filePath.split('/');
	const fullPath = filePath.replace(/\/+$/, '');
	const last = checkName ? segments.length : segments.length - 1;
	let prefix = '';
	for (let i = 0; i < last; i++) {
		const seg = segments[i];
		if (!seg) continue;
		prefix = prefix ? `${prefix}/${seg}` : seg;
		if (!isExcludedSegment(seg, prefix, filter)) continue;
		if (filter.includeNames.has(seg)) continue;
		const covered = filter.includePaths.some(
			(entry) => entry.length >= prefix.length && withinPath(fullPath, entry)
		);
		if (!covered) return true;
	}
	return false;
}

/**
 * True when a skipped folder still has to be walked because an include path lies inside it
 * (for example `.github` for `.github/instructions`).
 */
export function isIncludeAncestor(
	dirPath: string,
	filter: PathFilter = DEFAULT_PATH_FILTER
): boolean {
	const dir = dirPath.replace(/\/+$/, '');
	return filter.includePaths.some((entry) => entry.startsWith(dir + '/'));
}

/**
 * True when an include entry explicitly covers the path, so later exclusions should not drop it.
 * A name entry anywhere in the path counts; callers only use this against root-anchored
 * exclusions, which an excluded folder nested under the include cannot match.
 */
export function isPathIncluded(path: string, filter: PathFilter = DEFAULT_PATH_FILTER): boolean {
	const segments = path.split('/');
	if (segments.some((seg) => filter.includeNames.has(seg))) return true;
	return filter.includePaths.some((entry) => withinPath(path, entry));
}

const PRIMARY_MARKDOWN_NAMES = new Set([
	'skill.md',
	'agents.md',
	'claude.md',
	'gemini.md',
	'readme.md'
]);

export function isMarkdownPath(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.mdc');
}

/**
 * Markdown that describes how the project or its agents work: skill and agent instruction
 * files, READMEs, Cursor rules and anything under an include entry. Other Markdown (docs,
 * changelogs) is outlined too but ranked last so it never displaces code.
 */
export function isPrimaryMarkdown(path: string, filter: PathFilter = DEFAULT_PATH_FILTER): boolean {
	const name = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
	if (PRIMARY_MARKDOWN_NAMES.has(name) || name.endsWith('.mdc')) return true;
	return isPathIncluded(path, filter);
}
