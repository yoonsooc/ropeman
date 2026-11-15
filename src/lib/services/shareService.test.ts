import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import type { SemanticLevel } from '$lib/types/semantic';
import type { GitHubInfo } from '$lib/types/github';
import {
	buildSharePayload,
	parseSharePayload,
	readSharedFile,
	sharedFileUrl,
	shareRepoPath,
	shareSource
} from './shareService';

const COMMIT = 'e129e22125d397b272c6c3a84bf9d11c35e3d8cc';
const SOURCE = { owner: 'sveltejs', repo: 'svelte', commit: COMMIT };

const ROOT: SemanticLevel = {
	parentId: null,
	nodes: [],
	edges: [],
	breadcrumbLabel: 'svelte',
	assignment: { leftOut: 0, duplicated: 0, invented: 0, emptied: 0 }
};

function build(github: GitHubInfo | null) {
	return buildSharePayload({
		projectName: 'svelte',
		levels: [['__root__', ROOT]],
		filePaths: ['svelte/src/index.ts', 'svelte/src/a.ts', 'svelte/README.md'],
		github,
		now: new Date('2026-11-15T00:00:00Z')
	});
}

describe('buildSharePayload', () => {
	it('names the repository and commit of a project read from GitHub', () => {
		const payload = build({ owner: 'sveltejs', repo: 'svelte', ref: COMMIT, commit: COMMIT });

		expect(payload.source).toEqual(SOURCE);
		expect(payload).toMatchObject({
			projectName: 'svelte',
			filePaths: ['svelte/src/index.ts', 'svelte/src/a.ts', 'svelte/README.md'],
			metadata: { fileCount: 3, languageBreakdown: { ts: 2, md: 1 } },
			createdAt: '2026-11-15T00:00:00.000Z'
		});
	});

	it('names nothing for a folder', () => {
		const payload = build(null);

		expect('source' in payload).toBe(false);
		expect(JSON.stringify(payload)).not.toContain('source');
	});

	it('names nothing when the project was read at a branch rather than a commit', () => {
		expect(
			'source' in build({ owner: 'sveltejs', repo: 'svelte', ref: 'main', commit: null })
		).toBe(false);
	});

	it('names nothing for an owner the share worker would refuse', () => {
		expect(
			shareSource({ owner: 'odd.owner', repo: 'svelte', ref: COMMIT, commit: COMMIT })
		).toBeNull();
	});

	it('keeps the level fields the viewer reads, and no more', () => {
		expect(build(null).semanticLevels).toEqual({
			__root__: { parentId: null, nodes: [], edges: [], breadcrumbLabel: 'svelte' }
		});
	});
});

describe('parseSharePayload', () => {
	it('reads back what buildSharePayload wrote', () => {
		const shared = parseSharePayload(
			JSON.parse(
				JSON.stringify(build({ owner: 'sveltejs', repo: 'svelte', ref: COMMIT, commit: COMMIT }))
			)
		);

		expect(shared).toMatchObject({ projectName: 'svelte', fileCount: 3, source: SOURCE });
		expect(shared?.levels.get('__root__')?.breadcrumbLabel).toBe('svelte');
	});

	it('reads a share without a source', () => {
		const shared = parseSharePayload({
			projectName: 'shop',
			semanticLevels: { __root__: ROOT },
			filePaths: ['shop/a.ts']
		});

		expect(shared).toMatchObject({ projectName: 'shop', fileCount: 1, source: null });
	});

	it('drops a malformed source and malformed levels, and keeps the rest', () => {
		const shared = parseSharePayload({
			semanticLevels: { __root__: ROOT, broken: { nodes: 'x' } },
			source: { owner: 'o', repo: '../x', commit: COMMIT }
		});

		expect(shared?.source).toBeNull();
		expect(shared?.projectName).toBeNull();
		expect([...shared!.levels.keys()]).toEqual(['__root__']);
	});

	it('refuses something that is not a share', () => {
		expect(parseSharePayload(null)).toBeNull();
		expect(parseSharePayload({ projectName: 'x' })).toBeNull();
		expect(parseSharePayload('x')).toBeNull();
	});
});

describe('shareRepoPath', () => {
	it('drops the repository name githubLoader puts in front', () => {
		expect(shareRepoPath(SOURCE, 'svelte/packages/svelte/src/index.js')).toBe(
			'packages/svelte/src/index.js'
		);
		expect(shareRepoPath(SOURCE, 'svelte/svelte/x.js')).toBe('svelte/x.js');
	});

	it('is null for a path outside the repository folder', () => {
		expect(shareRepoPath(SOURCE, 'other/x.js')).toBeNull();
		expect(shareRepoPath(SOURCE, 'sveltex/x.js')).toBeNull();
	});
});

describe('readSharedFile', () => {
	beforeEach(() => {
		settingsStore.language = 'en';
		vi.unstubAllGlobals();
	});

	it('reads the file from GitHub at the shared commit', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('export {};', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const got = await readSharedFile(SOURCE, 'svelte/src/index.ts');

		expect(got).toEqual({ ok: true, content: 'export {};' });
		expect(fetchMock.mock.calls).toEqual([
			[`https://raw.githubusercontent.com/sveltejs/svelte/${COMMIT}/src/index.ts`]
		]);
	});

	it('says the code is not in a share without a source, and fetches nothing', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const got = await readSharedFile(null, 'shop/src/a.ts');

		expect(got).toEqual({
			ok: false,
			message: expect.stringContaining('original code is not included in this share')
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses a path that leaves the repository, and fetches nothing', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		for (const path of ['svelte/../other/x', 'other/x.js']) {
			expect(await readSharedFile(SOURCE, path), path).toEqual({
				ok: false,
				message: 'This file path is not valid, so it cannot be opened.'
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('words a GitHub refusal', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

		expect(await readSharedFile(SOURCE, 'svelte/gone.ts')).toEqual({
			ok: false,
			message: 'This file is not in the repository at the analyzed commit.'
		});
	});
});

describe('sharedFileUrl', () => {
	it('links the file on GitHub at the shared commit', () => {
		expect(sharedFileUrl(SOURCE, 'svelte/src/index.ts')).toBe(
			`https://github.com/sveltejs/svelte/blob/${COMMIT}/src/index.ts`
		);
		expect(sharedFileUrl(null, 'svelte/src/index.ts')).toBeNull();
		expect(sharedFileUrl(SOURCE, 'svelte/../x')).toBeNull();
	});
});
