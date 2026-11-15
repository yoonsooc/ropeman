import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	fetchGitHubFile,
	githubFileUrl,
	isCommitSha,
	parseGitHubSource,
	type GitHubSource
} from './githubSource';

const COMMIT = '5758a9c8347d911444dca97a55b708cc4a8de4f8';
const SOURCE: GitHubSource = { owner: 'o', repo: 'react', commit: COMMIT };

describe('isCommitSha', () => {
	it('accepts a full lowercase SHA only', () => {
		expect(isCommitSha(COMMIT)).toBe(true);
		expect(isCommitSha(COMMIT.toUpperCase())).toBe(false);
		expect(isCommitSha(COMMIT.slice(0, 7))).toBe(false);
		expect(isCommitSha('main')).toBe(false);
		expect(isCommitSha(undefined)).toBe(false);
	});
});

describe('parseGitHubSource', () => {
	it('keeps an owner, a repository and a full commit', () => {
		const source = { owner: 'sveltejs', repo: 'svelte.dev', commit: COMMIT };

		expect(parseGitHubSource(source)).toEqual(source);
		expect(parseGitHubSource({ owner: 'a-b9', repo: 'x_y-z.js', commit: COMMIT })).not.toBeNull();
	});

	it('refuses a missing field, a branch name or an abbreviated commit', () => {
		for (const value of [
			undefined,
			null,
			'o/r',
			[],
			{ owner: 'o', repo: 'r' },
			{ owner: 'o', repo: 'r', commit: 'main' },
			{ owner: 'o', repo: 'r', commit: COMMIT.slice(0, 7) },
			{ owner: 'o', repo: 'r', commit: COMMIT.toUpperCase() }
		]) {
			expect(parseGitHubSource(value), JSON.stringify(value)).toBeNull();
		}
	});

	it('refuses characters GitHub does not allow, which could reshape the file URL', () => {
		for (const [owner, repo] of [
			['o/x', 'r'],
			['-o', 'r'],
			['o.o', 'r'],
			['a'.repeat(40), 'r'],
			['o', 'r/../x'],
			['o', '..'],
			['o', '.'],
			['o', 'r?x'],
			['o', 'r#x'],
			['o', 'r x'],
			['o', 'r'.repeat(101)],
			['', 'r'],
			['o', '']
		]) {
			expect(parseGitHubSource({ owner, repo, commit: COMMIT }), `${owner}/${repo}`).toBeNull();
		}
	});

	it('refuses a field it does not know', () => {
		expect(parseGitHubSource({ ...SOURCE, path: 'src' })).toBeNull();
	});
});

describe('githubFileUrl', () => {
	it('points raw and blob views at the commit', () => {
		expect(githubFileUrl(SOURCE, 'packages/react/index.js', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${COMMIT}/packages/react/index.js`
		);
		expect(githubFileUrl(SOURCE, 'packages/react/index.js', 'blob')).toBe(
			`https://github.com/o/react/blob/${COMMIT}/packages/react/index.js`
		);
	});

	it('encodes `#`, `?`, `%`, spaces and non-ASCII names', () => {
		expect(githubFileUrl(SOURCE, 'docs/a #1?.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${COMMIT}/docs/a%20%231%3F.md`
		);
		expect(githubFileUrl(SOURCE, 'docs/100%.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${COMMIT}/docs/100%25.md`
		);
		expect(githubFileUrl(SOURCE, 'docs/한글/é.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${COMMIT}/docs/%ED%95%9C%EA%B8%80/%C3%A9.md`
		);
	});

	it('rejects empty, `.` and `..` segments', () => {
		for (const path of ['react/../../other/x', 'react/./a.js', 'react//a.js', '..', 'a/', '']) {
			expect(githubFileUrl(SOURCE, path, 'raw'), path).toBeNull();
			expect(githubFileUrl(SOURCE, path, 'blob'), path).toBeNull();
		}
	});
});

describe('fetchGitHubFile', () => {
	const raw = (repoPath: string) =>
		`https://raw.githubusercontent.com/o/react/${COMMIT}/${repoPath}`;

	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches the repository path as given, once, even when it starts with the repo name', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('export {};', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchGitHubFile(SOURCE, 'react/index.js');

		expect(result).toEqual({ ok: true, content: 'export {};' });
		expect(fetchMock.mock.calls).toEqual([[raw('react/index.js')]]);
	});

	it('reports not-found after one request', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('404', { status: 404 }));
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchGitHubFile(SOURCE, 'react/gone.js')).toEqual({
			ok: false,
			reason: 'not-found'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports a rate limit', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('limit', { status: 429 })));

		expect(await fetchGitHubFile(SOURCE, 'react/a.js')).toEqual({
			ok: false,
			reason: 'rate-limited'
		});
	});

	it('treats a 403 as a rate limit', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));

		expect(await fetchGitHubFile(SOURCE, 'react/a.js')).toMatchObject({ reason: 'rate-limited' });
	});

	it('refuses a file whose Content-Length is over 500 KB without reading it', async () => {
		const response = new Response('x', {
			status: 200,
			headers: { 'content-length': '600000' }
		});
		const read = vi.spyOn(response, 'arrayBuffer');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

		expect(await fetchGitHubFile(SOURCE, 'react/big.js')).toEqual({
			ok: false,
			reason: 'too-large'
		});
		expect(read).not.toHaveBeenCalled();
	});

	it('refuses a body over 500 KB even when the header is smaller', async () => {
		const body = 'a'.repeat(500_001);
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(body, { status: 200, headers: { 'content-length': '1000' } })
				)
		);

		expect(await fetchGitHubFile(SOURCE, 'react/big.js')).toMatchObject({ reason: 'too-large' });
	});

	it('refuses binary content', async () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { status: 200 })));

		expect(await fetchGitHubFile(SOURCE, 'react/logo.png')).toEqual({
			ok: false,
			reason: 'binary'
		});
	});

	it('decodes UTF-8 text', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('// 한글 é', { status: 200 })));

		expect(await fetchGitHubFile(SOURCE, 'react/a.js')).toMatchObject({ content: '// 한글 é' });
	});

	it('reports the status of another HTTP failure, and none when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
		expect(await fetchGitHubFile(SOURCE, 'react/a.js')).toEqual({
			ok: false,
			reason: 'unavailable',
			status: 502
		});

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		expect(await fetchGitHubFile(SOURCE, 'react/a.js')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});

	it('rejects a path that would leave the repository without fetching', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchGitHubFile(SOURCE, 'react/../../x')).toEqual({
			ok: false,
			reason: 'invalid-path'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
