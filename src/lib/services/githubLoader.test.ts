import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('$lib/utils/languageDetector', () => ({
	detectLanguage: (filename: string) => {
		if (filename.endsWith('.ts')) return 'typescript';
		if (filename.endsWith('.js')) return 'javascript';
		if (filename.endsWith('.py')) return 'python';
		return null;
	},
	isSupported: (lang: string) => ['typescript', 'javascript', 'python'].includes(lang)
}));

vi.mock('$lib/services/parserService', () => ({
	parseFile: vi.fn().mockResolvedValue([{ name: 'mockSymbol', kind: 'function' }])
}));

vi.mock('$lib/stores/projectStore.svelte', () => {
	const store = {
		fileTree: null,
		astMap: new Map(),
		isLoading: false,
		projectName: '',
		parsingProgress: { done: 0, total: 0 },
		githubInfo: null
	};
	return { projectStore: store };
});

vi.mock('$lib/config', () => ({
	GITHUB_PROXY_URL: ''
}));

import { loadGitHubRepo, GitHubLoadError, githubLoadErrorKey } from './githubLoader';
import { projectStore } from '$lib/stores/projectStore.svelte';

const mockTreeResponse = {
	sha: 'abc123',
	url: 'https://api.github.com/repos/owner/repo/git/trees/abc123',
	tree: [
		{ path: 'src', mode: '040000', type: 'tree' as const, sha: 'dir1', url: '' },
		{ path: 'src/index.ts', mode: '100644', type: 'blob' as const, sha: 'f1', url: '', size: 500 },
		{ path: 'src/utils.ts', mode: '100644', type: 'blob' as const, sha: 'f2', url: '', size: 300 },
		{ path: 'README.md', mode: '100644', type: 'blob' as const, sha: 'f3', url: '', size: 200 },
		{ path: 'image.png', mode: '100644', type: 'blob' as const, sha: 'f4', url: '', size: 1000 }
	],
	truncated: false
};

describe('loadGitHubRepo', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		projectStore.fileTree = null;
		projectStore.astMap = new Map();
		projectStore.isLoading = false;
		projectStore.parsingProgress = { done: 0, total: 0 };
	});

	it('loads repo, builds file tree, and parses supported files', async () => {
		const fetchMock = vi.fn() as Mock;

		// Tree API response
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => mockTreeResponse
		});

		// Raw file responses for 2 supported .ts files
		fetchMock.mockResolvedValueOnce({
			ok: true,
			text: async () => 'export const x = 1;'
		});
		fetchMock.mockResolvedValueOnce({
			ok: true,
			text: async () => 'export function util() {}'
		});

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		// File tree was built
		expect(projectStore.fileTree).not.toBeNull();
		expect(projectStore.fileTree!.name).toBe('repo');
		expect(projectStore.fileTree!.children).toHaveLength(3); // src dir + README.md + image.png

		// AST map has parsed files
		expect(projectStore.astMap.size).toBe(2); // 2 .ts files
		expect(projectStore.astMap.has('repo/src/index.ts')).toBe(true);
		expect(projectStore.astMap.has('repo/src/utils.ts')).toBe(true);

		// Loading was set to false
		expect(projectStore.isLoading).toBe(false);
	});

	it('throws GitHubLoadError on 404', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404
			})
		);

		try {
			await loadGitHubRepo({ owner: 'owner', repo: 'nonexistent' });
			expect.unreachable('should have thrown');
		} catch (e: any) {
			expect(e).toBeInstanceOf(GitHubLoadError);
			expect(e.status).toBe(404);
		}
	});

	it('throws GitHubLoadError on 403 rate limit', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 403
			})
		);

		await expect(loadGitHubRepo({ owner: 'owner', repo: 'repo' })).rejects.toThrow(GitHubLoadError);
	});

	it('throws GitHubLoadError on 401 private repo', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 401
			})
		);

		await expect(loadGitHubRepo({ owner: 'owner', repo: 'private-repo' })).rejects.toThrow(
			GitHubLoadError
		);
	});

	it('skips files larger than 500KB', async () => {
		const largeTree = {
			...mockTreeResponse,
			tree: [
				{
					path: 'big.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'b1',
					url: '',
					size: 600_000
				},
				{ path: 'small.ts', mode: '100644', type: 'blob' as const, sha: 'b2', url: '', size: 100 }
			]
		};

		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => largeTree });
		fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'const x = 1;' });

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		// Only small.ts should be parsed
		expect(projectStore.astMap.size).toBe(1);
		expect(projectStore.astMap.has('repo/small.ts')).toBe(true);
	});

	it('skips unsupported file types', async () => {
		const mixedTree = {
			...mockTreeResponse,
			tree: [
				{ path: 'app.ts', mode: '100644', type: 'blob' as const, sha: 's1', url: '', size: 100 },
				{ path: 'style.css', mode: '100644', type: 'blob' as const, sha: 's2', url: '', size: 100 },
				{ path: 'data.json', mode: '100644', type: 'blob' as const, sha: 's3', url: '', size: 100 }
			]
		};

		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mixedTree });
		fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'const x = 1;' });

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		// Only .ts file parsed
		expect(projectStore.astMap.size).toBe(1);
	});

	it('handles failed individual file downloads gracefully', async () => {
		const tree = {
			...mockTreeResponse,
			tree: [
				{ path: 'a.ts', mode: '100644', type: 'blob' as const, sha: 'a1', url: '', size: 100 },
				{ path: 'b.ts', mode: '100644', type: 'blob' as const, sha: 'a2', url: '', size: 100 }
			]
		};

		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => tree });
		fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'const a = 1;' });
		fetchMock.mockResolvedValueOnce({ ok: false, status: 500 }); // b.ts fails

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		// Only a.ts was parsed successfully
		expect(projectStore.astMap.size).toBe(1);
		expect(projectStore.astMap.has('repo/a.ts')).toBe(true);
	});

	it('excludes files in skip directories (tests, examples, docs, hidden)', async () => {
		const skipTree = {
			...mockTreeResponse,
			tree: [
				{ path: 'src', mode: '040000', type: 'tree' as const, sha: 'd1', url: '' },
				{
					path: 'src/main.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f1',
					url: '',
					size: 100
				},
				{ path: 'tests', mode: '040000', type: 'tree' as const, sha: 'd2', url: '' },
				{
					path: 'tests/main.test.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f2',
					url: '',
					size: 100
				},
				{ path: 'examples', mode: '040000', type: 'tree' as const, sha: 'd3', url: '' },
				{
					path: 'examples/demo.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f3',
					url: '',
					size: 100
				},
				{ path: 'docs', mode: '040000', type: 'tree' as const, sha: 'd4', url: '' },
				{
					path: 'docs/guide.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f4',
					url: '',
					size: 100
				},
				{ path: '.github', mode: '040000', type: 'tree' as const, sha: 'd5', url: '' },
				{
					path: '.github/ci.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f5',
					url: '',
					size: 100
				},
				{
					path: 'pkg/core.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f6',
					url: '',
					size: 100
				}
			]
		};

		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => skipTree });
		// Only 2 supported files should be downloaded: src/main.ts and pkg/core.ts
		fetchMock.mockResolvedValue({ ok: true, text: async () => 'const x = 1;' });

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		expect(projectStore.astMap.size).toBe(2);
		expect(projectStore.astMap.has('repo/src/main.ts')).toBe(true);
		expect(projectStore.astMap.has('repo/pkg/core.ts')).toBe(true);
		expect(projectStore.astMap.has('repo/tests/main.test.ts')).toBe(false);
		expect(projectStore.astMap.has('repo/examples/demo.ts')).toBe(false);
		expect(projectStore.astMap.has('repo/docs/guide.ts')).toBe(false);
		expect(projectStore.astMap.has('repo/.github/ci.ts')).toBe(false);

		// File tree should also exclude skip directories
		const topNames = projectStore.fileTree!.children!.map((c) => c.name);
		expect(topNames).toContain('src');
		expect(topNames).toContain('pkg');
		expect(topNames).not.toContain('tests');
		expect(topNames).not.toContain('examples');
		expect(topNames).not.toContain('docs');
		expect(topNames).not.toContain('.github');
	});

	it('keeps directories with hyphenated skip-word names (tests-integration)', async () => {
		const hyphenTree = {
			...mockTreeResponse,
			tree: [
				{ path: 'tests-integration', mode: '040000', type: 'tree' as const, sha: 'd1', url: '' },
				{
					path: 'tests-integration/macro.ts',
					mode: '100644',
					type: 'blob' as const,
					sha: 'f1',
					url: '',
					size: 100
				}
			]
		};

		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => hyphenTree });
		fetchMock.mockResolvedValue({ ok: true, text: async () => 'const x = 1;' });

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo' });

		expect(projectStore.astMap.size).toBe(1);
		expect(projectStore.astMap.has('repo/tests-integration/macro.ts')).toBe(true);
	});

	it('uses branch from info when provided', async () => {
		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ ...mockTreeResponse, tree: [] })
		});

		vi.stubGlobal('fetch', fetchMock);

		await loadGitHubRepo({ owner: 'owner', repo: 'repo', branch: 'develop' });

		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('develop'));
	});
});

describe('loadGitHubRepo beforeApply (New project dialog)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		projectStore.fileTree = null;
		projectStore.astMap = new Map();
		projectStore.githubInfo = null;
	});

	it('runs after the tree is fetched and before any store is written', async () => {
		// Arrange
		const fetchMock = vi.fn() as Mock;
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => mockTreeResponse });
		fetchMock.mockResolvedValue({ ok: true, text: async () => 'export const x = 1;' });
		vi.stubGlobal('fetch', fetchMock);
		const seen: Array<{ fileTree: unknown; githubInfo: unknown }> = [];

		// Act
		await loadGitHubRepo(
			{ owner: 'owner', repo: 'repo' },
			{
				beforeApply: () =>
					seen.push({ fileTree: projectStore.fileTree, githubInfo: projectStore.githubInfo })
			}
		);

		// Assert
		expect(seen).toEqual([{ fileTree: null, githubInfo: null }]);
		expect(projectStore.fileTree).not.toBeNull();
	});

	it('is not called when the repository cannot be fetched, so the open project stays', async () => {
		// Regression: the New button used to have no GitHub path; a wrong URL must not clear the project
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		const beforeApply = vi.fn();

		await expect(
			loadGitHubRepo({ owner: 'owner', repo: 'missing' }, { beforeApply })
		).rejects.toBeInstanceOf(GitHubLoadError);

		expect(beforeApply).not.toHaveBeenCalled();
	});
});

describe('githubLoadErrorKey', () => {
	it('maps GitHub statuses to the landing messages', () => {
		expect(githubLoadErrorKey(404)).toBe('landing.githubNotFound');
		expect(githubLoadErrorKey(403)).toBe('landing.githubRateLimit');
		expect(githubLoadErrorKey(401)).toBe('landing.githubPrivate');
		expect(githubLoadErrorKey(500)).toBe('landing.githubLoadError');
		expect(githubLoadErrorKey(undefined)).toBe('landing.githubLoadError');
	});
});
