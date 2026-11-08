export interface GitHubRepoInfo {
	owner: string;
	repo: string;
	branch?: string;
}

const GITHUB_URL_REGEX =
	/^https?:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?(?:\/tree\/([^/]+(?:\/[^/]+)*))?(?:\/)?$/;

/**
 * Parse a GitHub URL into owner, repo, and optional branch.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/feature/nested-branch
 */
export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
	const trimmed = url.trim();
	if (!trimmed) return null;

	const match = trimmed.match(GITHUB_URL_REGEX);
	if (!match) return null;

	const [, owner, repo, branch] = match;
	return { owner, repo, branch: branch || undefined };
}

/**
 * Check if a string looks like a GitHub repository URL.
 */
export function isGitHubUrl(url: string): boolean {
	return parseGitHubUrl(url) !== null;
}

/** i18n key for a failed load, shared by the landing page and the New project dialog.
 * Lives here, not in githubLoader, so importing it does not pull the loader into the main chunk. */
export function githubLoadErrorKey(status?: number): string {
	if (status === 404) return 'landing.githubNotFound';
	if (status === 403) return 'landing.githubRateLimit';
	if (status === 401) return 'landing.githubPrivate';
	return 'landing.githubLoadError';
}
