import type { GitHubRepoInfo } from '$lib/utils/githubUrl';
import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage, isSupported } from '$lib/utils/languageDetector';
import { parseFile } from '$lib/services/parserService';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { GITHUB_PROXY_URL } from '$lib/config';
import {
	pathPriority,
	MAX_FILES,
	MAX_FILE_SIZE,
	MAX_TOTAL_SIZE,
	shouldSkipPath,
	sortFileTree,
	getEffectiveSkipDirs,
	SKIP_DIRS
} from '$lib/utils/filePriority';
import { settingsStore } from '$lib/stores/settingsStore.svelte';

interface GitHubTreeItem {
	path: string;
	mode: string;
	type: 'blob' | 'tree';
	sha: string;
	size?: number;
	url: string;
}

interface GitHubTreeResponse {
	sha: string;
	url: string;
	tree: GitHubTreeItem[];
	truncated: boolean;
}

export class GitHubLoadError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'GitHubLoadError';
		this.status = status;
	}
}

const BATCH_SIZE = 20;

function buildTreeUrl(info: GitHubRepoInfo): string {
	const ref = info.branch || 'HEAD';
	if (GITHUB_PROXY_URL) {
		return `${GITHUB_PROXY_URL}/github/tree/${info.owner}/${info.repo}/${ref}`;
	}
	return `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${ref}?recursive=1`;
}

function buildRawUrl(info: GitHubRepoInfo, path: string, ref: string): string {
	if (GITHUB_PROXY_URL) {
		return `${GITHUB_PROXY_URL}/github/file/${info.owner}/${info.repo}/${ref}/${path}`;
	}
	return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${ref}/${path}`;
}

/**
 * Build a FileNode tree from flat GitHub tree API paths.
 */
function buildFileTree(
	repoName: string,
	items: GitHubTreeItem[],
	skipSet: Set<string> = SKIP_DIRS
): FileNode {
	const root: FileNode = {
		name: repoName,
		path: repoName,
		kind: 'directory',
		children: []
	};

	const dirMap = new Map<string, FileNode>();
	dirMap.set('', root);

	// Ensure all parent directories exist
	function ensureDir(dirPath: string): FileNode {
		if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;

		const parts = dirPath.split('/');
		const parentPath = parts.slice(0, -1).join('/');
		const parent = ensureDir(parentPath);

		const dirNode: FileNode = {
			name: parts[parts.length - 1],
			path: `${repoName}/${dirPath}`,
			kind: 'directory',
			children: []
		};
		parent.children!.push(dirNode);
		dirMap.set(dirPath, dirNode);
		return dirNode;
	}

	for (const item of items) {
		// Trailing slash ensures shouldSkipPath checks the dir name itself (not just parents)
		if (shouldSkipPath(item.path + '/', skipSet)) continue;
		if (item.type === 'tree') {
			ensureDir(item.path);
		} else if (item.type === 'blob') {
			const parts = item.path.split('/');
			const parentPath = parts.slice(0, -1).join('/');
			const parent = ensureDir(parentPath);

			const language = detectLanguage(item.path) ?? undefined;
			const fileNode: FileNode = {
				name: parts[parts.length - 1],
				path: `${repoName}/${item.path}`,
				kind: 'file',
				language,
				size: item.size
			};
			parent.children!.push(fileNode);
		}
	}

	sortFileTree(root);
	return root;
}

/**
 * Collect all supported files from tree items, respecting limits.
 */
function collectSupportedItems(
	items: GitHubTreeItem[],
	skipSet: Set<string> = SKIP_DIRS
): GitHubTreeItem[] {
	const supported = items
		.filter(
			(item) =>
				item.type === 'blob' &&
				!shouldSkipPath(item.path, skipSet) &&
				(item.size ?? 0) <= MAX_FILE_SIZE &&
				detectLanguage(item.path) !== null &&
				isSupported(detectLanguage(item.path)!)
		)
		.sort((a, b) => {
			const pa = pathPriority(a.path);
			const pb = pathPriority(b.path);
			if (pa !== pb) return pa - pb;
			// Within same priority, smaller files first (more files covered)
			return (a.size ?? 0) - (b.size ?? 0);
		});

	// Apply both file count and total size limits
	const result: GitHubTreeItem[] = [];
	let totalSize = 0;
	for (const item of supported) {
		if (result.length >= MAX_FILES) break;
		const size = item.size ?? 0;
		if (totalSize + size > MAX_TOTAL_SIZE) break;
		totalSize += size;
		result.push(item);
	}
	return result;
}

/**
 * Load a GitHub repository: fetch tree, download files, parse ASTs.
 */
export async function loadGitHubRepo(info: GitHubRepoInfo): Promise<void> {
	// 1. Fetch tree
	const treeUrl = buildTreeUrl(info);
	const treeRes = await fetch(treeUrl);

	if (!treeRes.ok) {
		throw new GitHubLoadError(`GitHub API error: ${treeRes.status}`, treeRes.status);
	}

	const treeData: GitHubTreeResponse = await treeRes.json();
	const ref = info.branch || treeData.sha;

	// Store GitHub info for on-demand file fetching by CodeViewer
	projectStore.githubInfo = { owner: info.owner, repo: info.repo, ref };

	// Compute effective skip set once (defaults + user custom patterns)
	const skipSet = getEffectiveSkipDirs(settingsStore.customSkipPatterns);

	// 2. Collect files to parse + set progress before fileTree (so isParsing is true when Header appears)
	const supportedItems = collectSupportedItems(treeData.tree, skipSet);
	const total = supportedItems.length;
	projectStore.parsingProgress = { done: 0, total };

	// 3. Build file tree (triggers hasProject → Header with ANALYZE button)
	const fileTree = buildFileTree(info.repo, treeData.tree, skipSet);
	projectStore.fileTree = fileTree;

	// 4. Download + parse in batches
	let done = 0;
	const astMap = new Map(projectStore.astMap);

	for (let i = 0; i < supportedItems.length; i += BATCH_SIZE) {
		const batch = supportedItems.slice(i, i + BATCH_SIZE);

		const results = await Promise.allSettled(
			batch.map(async (item) => {
				const rawUrl = buildRawUrl(info, item.path, ref);
				const res = await fetch(rawUrl);
				if (!res.ok) return null;

				const content = await res.text();
				if (!content) return null;

				const language = detectLanguage(item.path)!;
				const filePath = `${info.repo}/${item.path}`;
				const symbols = await parseFile(filePath, content, language);
				return { filePath, symbols };
			})
		);

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value) {
				astMap.set(result.value.filePath, result.value.symbols);
			}
		}

		done += batch.length;
		projectStore.parsingProgress = { done, total };
		projectStore.astMap = new Map(astMap);
	}

	projectStore.isLoading = false;
}
