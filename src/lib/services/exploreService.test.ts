import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	validateManifest,
	validateSnapshot,
	findCuratedEntry,
	filterEntries,
	listLanguages,
	fetchExploreSnapshot,
	uploadExploreSnapshot,
	exploreSource,
	exploreRepoPaths,
	exploreFileUrl,
	fetchExploreFile,
	type ExploreSource,
	getCuratedManifest,
	type CuratedEntry,
	type ExploreSnapshot
} from './exploreService';

const SAMPLE_ENTRIES: CuratedEntry[] = [
	{
		slug: 'react',
		owner: 'facebook',
		repo: 'react',
		title: 'React',
		language: 'JavaScript',
		description: 'A library for UIs.',
		stars: '230k+'
	},
	{
		slug: 'fastapi',
		owner: 'tiangolo',
		repo: 'fastapi',
		title: 'FastAPI',
		language: 'Python',
		description: 'Modern Python web framework.'
	},
	{
		slug: 'gin',
		owner: 'gin-gonic',
		repo: 'gin',
		title: 'Gin',
		language: 'Go',
		description: 'Go HTTP framework.'
	}
];

describe('validateManifest', () => {
	it('keeps an optional Korean description and drops a non-string one', () => {
		const base = {
			slug: 's',
			owner: 'o',
			repo: 'r',
			title: 't',
			language: 'Go',
			description: 'en'
		};
		const result = validateManifest({
			updatedAt: '2026-11-09',
			entries: [
				{ ...base, descriptionKo: '한국어' },
				{ ...base, slug: 's2', descriptionKo: 42 }
			]
		});
		expect(result?.entries[0].descriptionKo).toBe('한국어');
		expect(result?.entries[1].descriptionKo).toBeUndefined();
	});

	it('ships a Korean description for every curated entry', () => {
		// Regression: the Korean gallery showed English card descriptions
		for (const entry of getCuratedManifest().entries) {
			expect(entry.descriptionKo).toMatch(/[가-힣]/);
		}
	});

	it('returns null for non-object input', () => {
		expect(validateManifest(null)).toBeNull();
		expect(validateManifest('string')).toBeNull();
		expect(validateManifest(42)).toBeNull();
	});

	it('returns null when entries is missing or not an array', () => {
		expect(validateManifest({ updatedAt: '2026-04-13' })).toBeNull();
		expect(validateManifest({ updatedAt: '2026-04-13', entries: 'oops' })).toBeNull();
	});

	it('returns null when updatedAt is missing', () => {
		expect(validateManifest({ entries: [] })).toBeNull();
	});

	it('parses a well-formed manifest', () => {
		const out = validateManifest({
			updatedAt: '2026-04-13',
			entries: SAMPLE_ENTRIES
		});
		expect(out).not.toBeNull();
		expect(out!.updatedAt).toBe('2026-04-13');
		expect(out!.entries).toHaveLength(3);
	});

	it('drops entries missing required fields', () => {
		const out = validateManifest({
			updatedAt: '2026-04-13',
			entries: [
				SAMPLE_ENTRIES[0],
				{ slug: 'broken' }, // missing fields
				SAMPLE_ENTRIES[1]
			]
		});
		expect(out!.entries).toHaveLength(2);
		expect(out!.entries.map((e) => e.slug)).toEqual(['react', 'fastapi']);
	});

	it('preserves optional stars field when present', () => {
		const out = validateManifest({
			updatedAt: '2026-04-13',
			entries: SAMPLE_ENTRIES
		});
		expect(out!.entries[0].stars).toBe('230k+');
		expect(out!.entries[1].stars).toBeUndefined();
	});
});

describe('findCuratedEntry', () => {
	it('returns the entry when slug matches', () => {
		const m = { updatedAt: '', entries: SAMPLE_ENTRIES };
		expect(findCuratedEntry(m, 'react')?.title).toBe('React');
	});

	it('returns undefined when slug not found', () => {
		const m = { updatedAt: '', entries: SAMPLE_ENTRIES };
		expect(findCuratedEntry(m, 'unknown')).toBeUndefined();
	});
});

describe('filterEntries', () => {
	it('returns all entries when no filters applied', () => {
		expect(filterEntries(SAMPLE_ENTRIES, {})).toHaveLength(3);
	});

	it('filters by exact language match (case-insensitive)', () => {
		const out = filterEntries(SAMPLE_ENTRIES, { language: 'python' });
		expect(out).toHaveLength(1);
		expect(out[0].slug).toBe('fastapi');
	});

	it('treats language="all" as no language filter', () => {
		expect(filterEntries(SAMPLE_ENTRIES, { language: 'all' })).toHaveLength(3);
	});

	it('filters by free-text query against title, owner, repo, description', () => {
		expect(filterEntries(SAMPLE_ENTRIES, { query: 'facebook' })).toHaveLength(1);
		expect(filterEntries(SAMPLE_ENTRIES, { query: 'modern python' })).toHaveLength(1);
		expect(filterEntries(SAMPLE_ENTRIES, { query: 'GIN' })).toHaveLength(1);
	});

	it('combines language and query filters', () => {
		const out = filterEntries(SAMPLE_ENTRIES, { language: 'go', query: 'http' });
		expect(out).toHaveLength(1);
		expect(out[0].slug).toBe('gin');
	});

	it('returns empty when no entries match', () => {
		expect(filterEntries(SAMPLE_ENTRIES, { query: 'rust' })).toHaveLength(0);
	});
});

describe('listLanguages', () => {
	it('returns distinct sorted languages', () => {
		expect(listLanguages(SAMPLE_ENTRIES)).toEqual(['Go', 'JavaScript', 'Python']);
	});

	it('returns empty array when entries is empty', () => {
		expect(listLanguages([])).toEqual([]);
	});
});

describe('validateSnapshot', () => {
	it('returns null for non-object input', () => {
		expect(validateSnapshot(null)).toBeNull();
		expect(validateSnapshot('string')).toBeNull();
	});

	it('returns null when projectName is missing', () => {
		expect(validateSnapshot({ semanticLevels: {} })).toBeNull();
	});

	it('returns null when semanticLevels is missing', () => {
		expect(validateSnapshot({ projectName: 'demo' })).toBeNull();
	});

	it('drops levels missing required fields', () => {
		const snap = validateSnapshot({
			projectName: 'demo',
			semanticLevels: {
				__root__: {
					parentId: null,
					nodes: [],
					edges: [],
					breadcrumbLabel: 'Project'
				},
				broken: { foo: 'bar' }
			}
		});
		expect(snap).not.toBeNull();
		expect(Object.keys(snap!.semanticLevels)).toEqual(['__root__']);
	});

	it('preserves optional metadata fields', () => {
		const snap = validateSnapshot({
			projectName: 'react',
			owner: 'facebook',
			repo: 'react',
			analyzedAt: '2026-04-13',
			filePaths: ['src/index.ts'],
			semanticLevels: {}
		});
		expect(snap!.owner).toBe('facebook');
		expect(snap!.repo).toBe('react');
		expect(snap!.analyzedAt).toBe('2026-04-13');
		expect(snap!.filePaths).toEqual(['src/index.ts']);
	});
});

describe('fetchExploreSnapshot', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns ok=false with status=not-analyzed on 404', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
		const result = await fetchExploreSnapshot('react');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe('not-analyzed');
		}
	});

	it('returns ok=false with status=error on 5xx', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
		const result = await fetchExploreSnapshot('react');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe('error');
		}
	});

	it('returns ok=false on invalid payload', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ wrong: 'shape' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);
		const result = await fetchExploreSnapshot('react');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe('error');
		}
	});

	it('returns ok=true with parsed snapshot on success', async () => {
		const payload = {
			projectName: 'React',
			semanticLevels: {
				__root__: {
					parentId: null,
					nodes: [],
					edges: [],
					breadcrumbLabel: 'React'
				}
			}
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify(payload), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);
		const result = await fetchExploreSnapshot('react');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.snapshot.projectName).toBe('React');
		}
	});

	it('degrades network errors to not-analyzed (worker unreachable)', async () => {
		// When the explore worker is not deployed or unreachable, the viewer
		// should show the friendly "not analyzed yet" fallback rather than
		// surfacing a raw fetch error to the user.
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
		const result = await fetchExploreSnapshot('react');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe('not-analyzed');
		}
	});
});

describe('uploadExploreSnapshot', () => {
	const VALID_SNAPSHOT: ExploreSnapshot = {
		projectName: 'React',
		owner: 'facebook',
		repo: 'react',
		analyzedAt: '2026-04-16',
		semanticLevels: {
			__root__: {
				parentId: null,
				breadcrumbLabel: 'React',
				nodes: [],
				edges: []
			}
		}
	};

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('requires a non-empty admin token', async () => {
		const result = await uploadExploreSnapshot('react', VALID_SNAPSHOT, '');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain('token');
		}
	});

	it('sends POST with Bearer authorization header', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await uploadExploreSnapshot('react', VALID_SNAPSHOT, 'secret-token');
		expect(result.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('/explore/react');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer secret-token');
		expect(init.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(init.body)).toEqual(VALID_SNAPSHOT);
	});

	it('returns HTTP error message on non-2xx response', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
				)
		);
		const result = await uploadExploreSnapshot('react', VALID_SNAPSHOT, 'bad-token');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain('401');
		}
	});

	it('returns network error message on fetch rejection', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS failure')));
		const result = await uploadExploreSnapshot('react', VALID_SNAPSHOT, 'token');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toContain('DNS failure');
		}
	});
});

describe('getCuratedManifest', () => {
	it('loads bundled curated manifest with the seed entries', () => {
		const m = getCuratedManifest();
		expect(m.entries.length).toBeGreaterThanOrEqual(5);
		// React must be present per the seed data
		expect(m.entries.find((e) => e.slug === 'react')).toBeDefined();
	});

	it('every entry has all required fields', () => {
		const m = getCuratedManifest();
		for (const e of m.entries) {
			expect(typeof e.slug).toBe('string');
			expect(typeof e.owner).toBe('string');
			expect(typeof e.repo).toBe('string');
			expect(typeof e.title).toBe('string');
			expect(typeof e.language).toBe('string');
			expect(typeof e.description).toBe('string');
		}
	});

	// The five snapshots uploaded on 2026-04-16 record no commit, so their entries pin it.
	// At default-branch HEAD 174 of FastAPI's 206 snapshot files were 404 on 2026-11-14.
	it('pins the analyzed commit for every snapshot that does not record one', () => {
		const legacy = ['transformers', 'fastapi', 'gin', 'react', 'tokio'];
		const entries = getCuratedManifest().entries.filter((e) => legacy.includes(e.slug));

		expect(entries).toHaveLength(legacy.length);
		for (const e of entries) expect(e.ref, e.slug).toMatch(/^[0-9a-f]{40}$/);
	});

	it('slugs are unique', () => {
		const m = getCuratedManifest();
		const slugs = m.entries.map((e) => e.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});
});

function snapshotWithPaths(paths: string[], commit?: string): ExploreSnapshot {
	const level = {
		parentId: null,
		breadcrumbLabel: 'x',
		edges: [],
		nodes: [{ filePaths: paths }]
	} as unknown as ExploreSnapshot['semanticLevels'][string];
	return { projectName: 'x', semanticLevels: { __root__: level }, commit };
}

const PINNED = '00f063c31d60308f8e4e0fd349b89ed043b9ea54';
const RECORDED = '2fa00db8581bb4e74b2d00d859c8469b6da296c4';
const REACT_ENTRY: CuratedEntry = { ...SAMPLE_ENTRIES[0], ref: PINNED };
const TOKIO_ENTRY: CuratedEntry = { ...REACT_ENTRY, owner: 'tokio-rs', repo: 'tokio' };

function legacySource(repo: string, prefixed: boolean): ExploreSource {
	return { owner: 'o', repo, commit: PINNED, paths: { kind: 'legacy', prefixed } };
}

describe('validateSnapshot commit', () => {
	it('keeps a 40-hex commit and drops anything else', () => {
		const base = { projectName: 'p', semanticLevels: {} };

		expect(validateSnapshot({ ...base, commit: RECORDED })?.commit).toBe(RECORDED);
		expect(validateSnapshot({ ...base, commit: 'main' })?.commit).toBeUndefined();
		expect(validateSnapshot({ ...base, commit: '../../x' })?.commit).toBeUndefined();
	});
});

describe('exploreSource', () => {
	it('prefers the commit the snapshot records and reads its paths as repository paths', () => {
		const snapshot = snapshotWithPaths(['react/index.js'], RECORDED);

		expect(exploreSource(REACT_ENTRY, snapshot)).toEqual({
			owner: 'facebook',
			repo: 'react',
			commit: RECORDED,
			paths: { kind: 'repo' }
		});
	});

	it('falls back to the curated ref for a snapshot without a commit', () => {
		const snapshot = snapshotWithPaths(['react/packages/a.js', 'react/packages/b.js']);

		expect(exploreSource(REACT_ENTRY, snapshot)).toEqual({
			owner: 'facebook',
			repo: 'react',
			commit: PINNED,
			paths: { kind: 'legacy', prefixed: true }
		});
	});

	it('is null when neither the snapshot nor the entry names a commit', () => {
		expect(exploreSource(SAMPLE_ENTRIES[0], snapshotWithPaths(['react/a.js']))).toBeNull();
	});

	// Regression: tokio's snapshot holds repository paths and has a real `tokio/` folder
	it('marks a legacy snapshot unprefixed when any path lacks the repo prefix', () => {
		const snapshot = snapshotWithPaths(['tokio/src/lib.rs', 'tokio-util/src/lib.rs']);

		expect(exploreSource(TOKIO_ENTRY, snapshot)?.paths).toEqual({
			kind: 'legacy',
			prefixed: false
		});
	});
});

describe('exploreRepoPaths', () => {
	it('never strips a snapshot that records its commit', () => {
		const source: ExploreSource = { ...legacySource('tokio', true), paths: { kind: 'repo' } };

		expect(exploreRepoPaths(source, 'tokio/src/lib.rs')).toEqual(['tokio/src/lib.rs']);
	});

	it('tries the stripped path first in a prefixed legacy snapshot, then the path as given', () => {
		expect(exploreRepoPaths(legacySource('react', true), 'react/packages/a.js')).toEqual([
			'packages/a.js',
			'react/packages/a.js'
		]);
	});

	it('tries a real folder named after the repo first in an unprefixed legacy snapshot', () => {
		expect(exploreRepoPaths(legacySource('tokio', false), 'tokio/src/lib.rs')).toEqual([
			'tokio/src/lib.rs',
			'src/lib.rs'
		]);
		expect(exploreRepoPaths(legacySource('tokio', false), 'tokio-util/src/lib.rs')).toEqual([
			'tokio-util/src/lib.rs'
		]);
	});

	it('reads a single-file legacy snapshot both ways', () => {
		const source = exploreSource(REACT_ENTRY, snapshotWithPaths(['react/README.md']));

		expect(exploreRepoPaths(source!, 'react/README.md')).toEqual(['README.md', 'react/README.md']);
	});

	it('rejects empty, `.` and `..` segments', () => {
		const source = legacySource('react', true);

		for (const path of ['react/../../other/x', 'react/./a.js', 'react//a.js', '..', 'a/']) {
			expect(exploreRepoPaths(source, path), path).toEqual([]);
		}
	});
});

describe('exploreFileUrl', () => {
	const source = legacySource('react', true);

	it('points raw and blob views at the commit', () => {
		expect(exploreFileUrl(source, 'packages/react/index.js', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${PINNED}/packages/react/index.js`
		);
		expect(exploreFileUrl(source, 'packages/react/index.js', 'blob')).toBe(
			`https://github.com/o/react/blob/${PINNED}/packages/react/index.js`
		);
	});

	it('encodes `#`, `?`, `%`, spaces and non-ASCII names', () => {
		expect(exploreFileUrl(source, 'docs/a #1?.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${PINNED}/docs/a%20%231%3F.md`
		);
		expect(exploreFileUrl(source, 'docs/100%.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${PINNED}/docs/100%25.md`
		);
		expect(exploreFileUrl(source, 'docs/한글/é.md', 'raw')).toBe(
			`https://raw.githubusercontent.com/o/react/${PINNED}/docs/%ED%95%9C%EA%B8%80/%C3%A9.md`
		);
	});
});

describe('fetchExploreFile', () => {
	const source = legacySource('react', true);
	const raw = (repoPath: string) =>
		`https://raw.githubusercontent.com/o/react/${PINNED}/${repoPath}`;

	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the text and the repository path it came from', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('export {};', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchExploreFile(source, 'react/index.js');

		expect(result).toEqual({ ok: true, content: 'export {};', repoPath: 'index.js' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(raw('index.js'));
	});

	it('tries the next reading of a legacy path after a 404', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('404', { status: 404 }))
			.mockResolvedValueOnce(new Response('fn main() {}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchExploreFile(source, 'react/react/src/a.rs');

		expect(result).toEqual({ ok: true, content: 'fn main() {}', repoPath: 'react/react/src/a.rs' });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			raw('react/src/a.rs'),
			raw('react/react/src/a.rs')
		]);
	});

	it('reports not-found when no reading exists', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(() => new Response('404', { status: 404 }))
		);

		expect(await fetchExploreFile(source, 'react/gone.js')).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('stops at a rate limit instead of trying the other reading', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('limit', { status: 429 }));
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchExploreFile(source, 'react/a.js')).toEqual({
			ok: false,
			reason: 'rate-limited'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('treats a 403 as a rate limit', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));

		expect(await fetchExploreFile(source, 'react/a.js')).toMatchObject({ reason: 'rate-limited' });
	});

	it('refuses a file whose Content-Length is over 500 KB without reading it', async () => {
		const response = new Response('x', {
			status: 200,
			headers: { 'content-length': '600000' }
		});
		const read = vi.spyOn(response, 'arrayBuffer');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

		expect(await fetchExploreFile(source, 'react/big.js')).toEqual({
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

		expect(await fetchExploreFile(source, 'react/big.js')).toMatchObject({ reason: 'too-large' });
	});

	it('refuses binary content', async () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { status: 200 })));

		expect(await fetchExploreFile(source, 'react/logo.png')).toEqual({
			ok: false,
			reason: 'binary'
		});
	});

	it('decodes UTF-8 text', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('// 한글 é', { status: 200 })));

		expect(await fetchExploreFile(source, 'react/a.js')).toMatchObject({ content: '// 한글 é' });
	});

	it('reports the status of another HTTP failure, and none when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
		expect(await fetchExploreFile(source, 'react/a.js')).toEqual({
			ok: false,
			reason: 'unavailable',
			status: 502
		});

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		expect(await fetchExploreFile(source, 'react/a.js')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});

	it('rejects a path that would leave the repository without fetching', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchExploreFile(source, 'react/../../x')).toEqual({
			ok: false,
			reason: 'invalid-path'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
