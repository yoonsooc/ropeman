import { MAX_FILE_SIZE } from '$lib/utils/filePriority';
import { decodeSourceText, pathSegments, type SourceFileResult } from './sourceFile';

export interface GitHubSource {
	owner: string;
	repo: string;
	commit: string;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;
// GitHub's characters: an account is letters, digits and hyphens (39 at most), a repository
// letters, digits, `.`, `_` and `-` (100 at most).
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export const isCommitSha = (value: unknown): value is string =>
	typeof value === 'string' && COMMIT_SHA.test(value);

export function parseGitHubSource(value: unknown): GitHubSource | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const { owner, repo, commit, ...rest } = value as Record<string, unknown>;
	if (Object.keys(rest).length > 0) return null;
	if (typeof owner !== 'string' || !OWNER.test(owner)) return null;
	if (typeof repo !== 'string' || !REPO.test(repo) || repo === '.' || repo === '..') return null;
	if (!isCommitSha(commit)) return null;
	return { owner, repo, commit };
}

export function githubFileUrl(
	source: GitHubSource,
	repoPath: string,
	view: 'raw' | 'blob'
): string | null {
	const segments = pathSegments(repoPath);
	if (!segments) return null;
	const encoded = segments.map(encodeURIComponent).join('/');
	const { owner, repo, commit } = source;
	return view === 'raw'
		? `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${encoded}`
		: `https://github.com/${owner}/${repo}/blob/${commit}/${encoded}`;
}

export async function fetchGitHubFile(
	source: GitHubSource,
	repoPath: string
): Promise<SourceFileResult> {
	const url = githubFileUrl(source, repoPath, 'raw');
	if (!url) return { ok: false, reason: 'invalid-path' };
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
	if (res.status === 404) return { ok: false, reason: 'not-found' };
	if (res.status === 403 || res.status === 429) return { ok: false, reason: 'rate-limited' };
	if (!res.ok) return { ok: false, reason: 'unavailable', status: res.status };
	// The header is the compressed size when GitHub gzips, so the body length decides too
	if (Number(res.headers.get('content-length')) > MAX_FILE_SIZE) {
		return { ok: false, reason: 'too-large' };
	}
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await res.arrayBuffer());
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
	return decodeSourceText(bytes);
}
