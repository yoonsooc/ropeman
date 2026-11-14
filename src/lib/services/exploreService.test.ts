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
	exploreFileUrl,
	fetchExploreFile,
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

	// Files open from the commit the snapshot was analyzed at; HEAD has moved or deleted
	// most of FastAPI's docs_src files since (174 of 206 were 404 on 2026-11-14)
	it('every entry pins the commit its snapshot was analyzed at', () => {
		for (const e of getCuratedManifest().entries) {
			expect(e.ref, e.slug).toMatch(/^[0-9a-f]{40}$/);
		}
	});

	it('slugs are unique', () => {
		const m = getCuratedManifest();
		const slugs = m.entries.map((e) => e.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});
});

function snapshotWithPaths(paths: string[][]): ExploreSnapshot {
	const semanticLevels: ExploreSnapshot['semanticLevels'] = {};
	paths.forEach((filePaths, i) => {
		semanticLevels[`level-${i}`] = {
			parentId: null,
			breadcrumbLabel: 'x',
			edges: [],
			nodes: [{ filePaths }]
		} as unknown as ExploreSnapshot['semanticLevels'][string];
	});
	return { projectName: 'x', semanticLevels };
}

const REACT_ENTRY: CuratedEntry = { ...SAMPLE_ENTRIES[0], ref: 'abc123' };

describe('exploreSource', () => {
	it('drops the repo prefix when every snapshot path carries it', () => {
		const snapshot = snapshotWithPaths([
			['react/packages/react/index.js'],
			['react/packages/react-dom/client.js']
		]);

		const source = exploreSource(REACT_ENTRY, snapshot);

		expect(source).toEqual({
			owner: 'facebook',
			repo: 'react',
			ref: 'abc123',
			pathPrefix: 'react/'
		});
	});

	// Regression: tokio's snapshot holds repository paths, where `tokio/` is a crate folder
	it('keeps paths as they are when some do not start with the repo name', () => {
		const entry: CuratedEntry = { ...SAMPLE_ENTRIES[2], repo: 'tokio', owner: 'tokio-rs' };
		const snapshot = snapshotWithPaths([['tokio/src/runtime/mod.rs', 'tokio-util/src/lib.rs']]);

		const source = exploreSource(entry, snapshot);

		expect(source.pathPrefix).toBe('');
		expect(exploreFileUrl(source, 'tokio/src/runtime/mod.rs', 'raw')).toBe(
			'https://raw.githubusercontent.com/tokio-rs/tokio/HEAD/tokio/src/runtime/mod.rs'
		);
	});

	it('falls back to HEAD when the entry pins no commit', () => {
		const source = exploreSource(SAMPLE_ENTRIES[0], snapshotWithPaths([['react/a.js']]));

		expect(source.ref).toBe('HEAD');
	});
});

describe('exploreFileUrl', () => {
	const source = { owner: 'facebook', repo: 'react', ref: 'abc123', pathPrefix: 'react/' };

	it('points raw and blob views at the pinned commit without the snapshot prefix', () => {
		expect(exploreFileUrl(source, 'react/packages/react/index.js', 'raw')).toBe(
			'https://raw.githubusercontent.com/facebook/react/abc123/packages/react/index.js'
		);
		expect(exploreFileUrl(source, 'react/packages/react/index.js', 'blob')).toBe(
			'https://github.com/facebook/react/blob/abc123/packages/react/index.js'
		);
	});

	it('encodes characters that would end the path', () => {
		expect(exploreFileUrl(source, 'react/docs/a #1?.md', 'raw')).toBe(
			'https://raw.githubusercontent.com/facebook/react/abc123/docs/a%20%231%3F.md'
		);
	});
});

describe('fetchExploreFile', () => {
	const source = { owner: 'facebook', repo: 'react', ref: 'abc123', pathPrefix: 'react/' };

	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the file text from raw GitHub', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('export {};', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchExploreFile(source, 'react/index.js');

		expect(result).toEqual({ ok: true, content: 'export {};' });
		expect(fetchMock).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/facebook/react/abc123/index.js'
		);
	});

	it('reports the HTTP status of a missing file', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('404', { status: 404 })));

		expect(await fetchExploreFile(source, 'react/gone.js')).toEqual({ ok: false, status: 404 });
	});

	it('reports no status when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

		expect(await fetchExploreFile(source, 'react/index.js')).toEqual({ ok: false, status: null });
	});
});
