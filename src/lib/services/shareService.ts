import type { SemanticLevel } from '$lib/types/semantic';
import type { GitHubInfo } from '$lib/types/github';
import { i18nStore } from '$lib/stores/i18nStore.svelte';
import {
	fetchGitHubFile,
	githubFileUrl,
	parseGitHubSource,
	type GitHubSource
} from './githubSource';
import { toSourceRead, type SourceRead } from './sourceFile';

export type ShareLevel = Pick<SemanticLevel, 'parentId' | 'nodes' | 'edges' | 'breadcrumbLabel'>;

export interface SharePayload {
	projectName: string;
	semanticLevels: Record<string, ShareLevel>;
	filePaths: string[];
	metadata: { fileCount: number; languageBreakdown: Record<string, number> };
	createdAt: string;
	source?: GitHubSource;
}

export function shareSource(github: GitHubInfo | null): GitHubSource | null {
	return github?.commit
		? parseGitHubSource({ owner: github.owner, repo: github.repo, commit: github.commit })
		: null;
}

export function buildSharePayload(input: {
	projectName: string;
	levels: Iterable<[string, SemanticLevel]>;
	filePaths: string[];
	github: GitHubInfo | null;
	now: Date;
}): SharePayload {
	const semanticLevels: Record<string, ShareLevel> = {};
	for (const [key, { parentId, nodes, edges, breadcrumbLabel }] of input.levels) {
		semanticLevels[key] = { parentId, nodes, edges, breadcrumbLabel };
	}
	const languageBreakdown: Record<string, number> = {};
	for (const fp of input.filePaths) {
		const ext = fp.split('.').pop()?.toLowerCase() ?? 'unknown';
		languageBreakdown[ext] = (languageBreakdown[ext] ?? 0) + 1;
	}
	const source = shareSource(input.github);
	return {
		projectName: input.projectName,
		semanticLevels,
		filePaths: input.filePaths,
		metadata: { fileCount: input.filePaths.length, languageBreakdown },
		createdAt: input.now.toISOString(),
		...(source && { source })
	};
}

export interface SharedAnalysis {
	projectName: string | null;
	levels: Map<string, SemanticLevel>;
	fileCount: number;
	source: GitHubSource | null;
}

function isLevel(value: unknown): value is SemanticLevel {
	if (!value || typeof value !== 'object') return false;
	const level = value as Record<string, unknown>;
	return (
		Array.isArray(level.nodes) &&
		Array.isArray(level.edges) &&
		typeof level.breadcrumbLabel === 'string' &&
		(level.parentId === null || typeof level.parentId === 'string')
	);
}

export function parseSharePayload(data: unknown): SharedAnalysis | null {
	if (!data || typeof data !== 'object') return null;
	const payload = data as Record<string, unknown>;
	if (!payload.semanticLevels || typeof payload.semanticLevels !== 'object') return null;
	const levels = new Map<string, SemanticLevel>();
	for (const [key, level] of Object.entries(payload.semanticLevels)) {
		if (isLevel(level)) levels.set(key, level);
	}
	return {
		projectName: typeof payload.projectName === 'string' ? payload.projectName : null,
		levels,
		fileCount: Array.isArray(payload.filePaths) ? payload.filePaths.length : 0,
		source: parseGitHubSource(payload.source)
	};
}

export function shareRepoPath(source: GitHubSource, path: string): string | null {
	const prefix = `${source.repo}/`;
	return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export async function readSharedFile(
	source: GitHubSource | null,
	path: string
): Promise<SourceRead> {
	if (!source) return { ok: false, message: i18nStore.t('shareView.noSource') };
	const repoPath = shareRepoPath(source, path);
	if (!repoPath) return toSourceRead({ ok: false, reason: 'invalid-path' }, 'github');
	return toSourceRead(await fetchGitHubFile(source, repoPath), 'github');
}

export function sharedFileUrl(source: GitHubSource | null, path: string): string | null {
	if (!source) return null;
	const repoPath = shareRepoPath(source, path);
	return repoPath ? githubFileUrl(source, repoPath, 'blob') : null;
}
