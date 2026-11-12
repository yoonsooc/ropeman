import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';
import type {
	SkeletonFile,
	SkeletonImport,
	SkeletonPayload,
	SkeletonSymbol
} from '$lib/types/skeleton';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import {
	createPathFilter,
	isMarkdownPath,
	isPathIncluded,
	isPrimaryMarkdown,
	type PathFilter
} from '$lib/utils/filePriority';
import { byteLength } from './requestBudget';

const SKIP_KINDS = new Set(['variable', 'interface', 'type']);

// 기본값 250KB, settingsStore.maxSkeletonKB로 조절 가능
const DEFAULT_MAX_SKELETON_KB = 250;

// 핵심 디렉토리 (우선 포함)
const CORE_DIR_PATTERNS = [
	/^src\//,
	/^lib\//,
	/^app\//,
	/^packages\//,
	/^core\//,
	/^internal\//,
	/^cmd\//,
	/^pkg\//
];

// 제외 디렉토리 (분석 불필요)
const EXCLUDE_DIR_PATTERNS = [
	/^test[s]?\//,
	/\/__tests__\//,
	/\/test[s]?\//,
	/^docs?\//,
	/^examples?\//,
	/^benchmark[s]?\//,
	/^fixtures?\//,
	/^scripts?\//,
	/^\.github\//,
	/^\.circleci\//,
	/^node_modules\//,
	/^dist\//,
	/^build\//,
	/^vendor\//,
	/^i18n\//,
	/^notebooks?\//
];

function filePriority(filePath: string, filter: PathFilter, projectName?: string): number {
	let normalized = filePath;
	if (projectName && normalized.startsWith(projectName + '/')) {
		normalized = normalized.slice(projectName.length + 1);
	}
	// The user's include entries (and agent instruction defaults) win over these exclusions
	if (!isPathIncluded(normalized, filter)) {
		for (const pat of EXCLUDE_DIR_PATTERNS) {
			if (pat.test(normalized)) return 0;
		}
	}
	// Ordinary docs go last so the size budget is spent on code and instruction files first
	if (isMarkdownPath(normalized) && !isPrimaryMarkdown(normalized, filter)) return 1;
	for (const pat of CORE_DIR_PATTERNS) {
		if (pat.test(normalized)) return 3;
	}
	if (!normalized.includes('/')) return 2;
	return 1;
}

export function extractSkeleton(
	projectName: string,
	fileTree: FileNode | null,
	astMap: Map<string, ASTSymbol[]>
): SkeletonPayload {
	const files: SkeletonFile[] = [];
	let totalSymbols = 0;
	let truncated = false;

	const filePaths = collectFilePaths(fileTree);
	const filter = createPathFilter(
		settingsStore.customSkipPatterns,
		settingsStore.customIncludePatterns
	);

	const fileEntries: {
		path: string;
		symbols: SkeletonSymbol[];
		imports: SkeletonImport[];
		language: string | null;
		priority: number;
		symbolCount: number;
	}[] = [];

	for (const filePath of filePaths) {
		const astSymbols = astMap.get(filePath);
		if (!astSymbols || astSymbols.length === 0) continue;

		const symbols: SkeletonSymbol[] = [];
		const imports: SkeletonImport[] = [];

		for (const sym of astSymbols) {
			if (sym.kind === 'import') {
				imports.push(parseImport(sym));
			} else if (!SKIP_KINDS.has(sym.kind)) {
				symbols.push(toSkeletonSymbol(sym));
			}
		}

		if (symbols.length === 0 && imports.length === 0) continue;

		const language = inferLanguage(filePath);
		const priority = filePriority(filePath, filter, projectName);
		fileEntries.push({
			path: filePath,
			symbols,
			imports,
			language,
			priority,
			symbolCount: countSymbols(symbols)
		});
	}

	// 우선순위 높은 파일 먼저, 같은 우선순위면 심볼 수 많은 파일 먼저
	fileEntries.sort((a, b) => b.priority - a.priority || b.symbolCount - a.symbolCount);

	const totalEntries = fileEntries.length;
	const maxBytes = settingsStore.skeletonUnlimited
		? Infinity
		: (settingsStore.maxSkeletonKB ?? DEFAULT_MAX_SKELETON_KB) * 1000;
	// The budget covers the whole sent string, so the envelope is reserved at its largest
	// (truncated name, widest counts) and each file after the first pays for its comma.
	let usedBytes = byteLength(
		formatPayloadPreview({
			projectName: truncatedName(projectName, totalEntries, totalEntries),
			totalFiles: totalEntries,
			totalSymbols: fileEntries.reduce((sum, e) => sum + e.symbolCount, 0),
			files: []
		})
	);

	for (const entry of fileEntries) {
		if (entry.priority === 0) continue; // 제외 디렉토리는 스킵

		const file: SkeletonFile = {
			path: entry.path,
			language: entry.language,
			symbols: entry.symbols,
			imports: entry.imports
		};
		const fileBytes = byteLength(JSON.stringify(file)) + (files.length > 0 ? 1 : 0);
		if (usedBytes + fileBytes > maxBytes) {
			truncated = true;
			break;
		}

		usedBytes += fileBytes;
		totalSymbols += entry.symbolCount;
		files.push(file);
	}

	return {
		projectName: truncated ? truncatedName(projectName, files.length, totalEntries) : projectName,
		totalFiles: files.length,
		totalSymbols,
		files
	};
}

function truncatedName(projectName: string, kept: number, total: number): string {
	return `${projectName} (analyzed ${kept}/${total} files, core directories prioritized)`;
}

export function extractSubSkeleton(
	filePaths: string[],
	fileTree: FileNode | null,
	astMap: Map<string, ASTSymbol[]>
): SkeletonPayload {
	const files: SkeletonFile[] = [];
	let totalSymbols = 0;

	// Build a lookup for astMap keys by suffix to handle path prefix mismatches
	// e.g. AI may return "src/lib/foo.ts" but astMap has "ropeman/src/lib/foo.ts"
	const astKeysBySuffix = new Map<string, string>();
	for (const key of astMap.keys()) {
		astKeysBySuffix.set(key, key);
		// Also index without the root prefix (e.g. "ropeman/src/..." → "src/...")
		const slashIdx = key.indexOf('/');
		if (slashIdx !== -1) {
			astKeysBySuffix.set(key.substring(slashIdx + 1), key);
		}
	}

	for (const filePath of filePaths) {
		// Try exact match first, then suffix match
		const resolvedKey = astMap.has(filePath) ? filePath : astKeysBySuffix.get(filePath);
		const astSymbols = resolvedKey ? astMap.get(resolvedKey) : undefined;
		if (!astSymbols || astSymbols.length === 0) continue;

		const symbols: SkeletonSymbol[] = [];
		const imports: SkeletonImport[] = [];

		for (const sym of astSymbols) {
			if (sym.kind === 'import') {
				imports.push(parseImport(sym));
			} else if (!SKIP_KINDS.has(sym.kind)) {
				symbols.push(toSkeletonSymbol(sym));
			}
		}

		if (symbols.length === 0 && imports.length === 0) continue;

		totalSymbols += countSymbols(symbols);

		const language = inferLanguage(filePath);
		files.push({ path: filePath, language, symbols, imports });
	}

	return {
		projectName: 'sub-skeleton',
		totalFiles: files.length,
		totalSymbols,
		files
	};
}

/** Size of the string `formatPayloadPreview` returns, which is what the AI receives. */
export function estimatePayloadSize(payload: SkeletonPayload): {
	bytes: number;
	formatted: string;
} {
	const bytes = byteLength(formatPayloadPreview(payload));
	return { bytes, formatted: formatBytes(bytes) };
}

/**
 * The skeleton as embedded in the prompt. Compact, because indentation nearly doubled the
 * bytes (464KB against 249KB on PASEO) without telling the model anything new.
 */
export function formatPayloadPreview(payload: SkeletonPayload): string {
	return JSON.stringify(payload);
}

function collectFilePaths(node: FileNode | null): string[] {
	if (!node) return [];
	if (node.kind === 'file') return [node.path];

	const paths: string[] = [];
	if (node.children) {
		for (const child of node.children) {
			paths.push(...collectFilePaths(child));
		}
	}
	return paths;
}

function toSkeletonSymbol(sym: ASTSymbol): SkeletonSymbol {
	const result: SkeletonSymbol = {
		name: sym.name,
		kind: sym.kind as SkeletonSymbol['kind']
	};
	if (sym.badges && sym.badges.length > 0) {
		result.badges = [...sym.badges];
	}
	if (sym.children && sym.children.length > 0) {
		result.children = sym.children.filter((c) => !SKIP_KINDS.has(c.kind)).map(toSkeletonSymbol);
		if (result.children.length === 0) delete result.children;
	}
	return result;
}

function parseImport(sym: ASTSymbol): SkeletonImport {
	// sym.name typically looks like "module_name" or "from module import x, y"
	// We split on common patterns to extract source and specifiers
	const name = sym.name;

	// Pattern: "x, y from module" or just "module"
	const fromMatch = name.match(/^(.+?)\s+from\s+(.+)$/);
	if (fromMatch) {
		return {
			source: fromMatch[2].trim(),
			specifiers: fromMatch[1]
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		};
	}

	return { source: name, specifiers: [] };
}

function countSymbols(symbols: SkeletonSymbol[]): number {
	let count = 0;
	for (const sym of symbols) {
		count++;
		if (sym.children) {
			count += countSymbols(sym.children);
		}
	}
	return count;
}

function inferLanguage(filePath: string): string | null {
	const ext = filePath.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'py':
			return 'python';
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'javascript';
		case 'ts':
		case 'mts':
		case 'cts':
			return 'typescript';
		case 'jsx':
			return 'jsx';
		case 'tsx':
			return 'tsx';
		case 'svelte':
			return 'svelte';
		case 'go':
			return 'go';
		case 'rs':
			return 'rust';
		case 'java':
			return 'java';
		case 'c':
		case 'h':
			return 'c';
		case 'cpp':
		case 'hpp':
		case 'cc':
		case 'cxx':
			return 'cpp';
		case 'rb':
			return 'ruby';
		case 'php':
			return 'php';
		case 'swift':
			return 'swift';
		case 'kt':
		case 'kts':
			return 'kotlin';
		case 'scala':
		case 'sc':
			return 'scala';
		case 'cs':
			return 'csharp';
		case 'md':
		case 'mdc':
			return 'markdown';
		default:
			return null;
	}
}

// Decimal units, matching maxSkeletonKB (1 KB = 1000 bytes)
export function formatBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const kb = bytes / 1000;
	if (kb < 1000) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1000).toFixed(1)} MB`;
}
