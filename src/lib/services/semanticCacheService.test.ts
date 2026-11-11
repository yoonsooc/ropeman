import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory CacheStorage: named caches holding URL -> body
const storage = new Map<string, Map<string, string>>();

function openCache(name: string) {
	if (!storage.has(name)) storage.set(name, new Map());
	const entries = storage.get(name)!;
	return {
		put: async (req: Request, resp: Response) => {
			entries.set(req.url, await resp.text());
		},
		match: async (req: Request) => {
			const body = entries.get(req.url);
			return body === undefined ? undefined : new Response(body);
		},
		keys: async () => [...entries.keys()].map((url) => new Request(url))
	};
}

const fakeCaches = {
	open: vi.fn(async (name: string) => openCache(name)),
	delete: vi.fn(async (name: string) => storage.delete(name))
};

// v1 entry keyed by project name, present before the module loads
storage.set(
	'ropeman/semantic',
	new Map([['https://ropeman.local/semantic/paseo/__root__', '{"nodes":[]}']])
);

vi.stubGlobal('caches', fakeCaches);
vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn() });

const { loadCachedResponse, saveCachedResponse, clearSemanticCache, getSemanticCacheSize } =
	await import('./semanticCacheService');

const request = {
	model: 'byok:anthropic:claude-sonnet-4-5',
	system: 'You are a code architecture analyzer.',
	user: 'Analyze this project:\n\n{"projectName":"paseo","files":[{"path":"a.ts"}]}'
};

describe('semanticCacheService', () => {
	beforeEach(async () => {
		await clearSemanticCache();
	});

	it('returns the saved response for the same request', async () => {
		await saveCachedResponse(request, 'response-A');

		expect(await loadCachedResponse({ ...request })).toBe('response-A');
	});

	it('misses when the skeleton payload changes', async () => {
		await saveCachedResponse(request, 'response-A');

		const otherFiles = { ...request, user: request.user.replace('a.ts', 'b.ts') };

		expect(await loadCachedResponse(otherFiles)).toBeNull();
	});

	it('misses when the model changes', async () => {
		await saveCachedResponse(request, 'response-A');

		expect(
			await loadCachedResponse({ ...request, model: 'byok:google:gemini-2.5-pro' })
		).toBeNull();
	});

	it('misses when the prompt text changes', async () => {
		await saveCachedResponse(request, 'response-A');

		expect(await loadCachedResponse({ ...request, system: request.system + ' v2' })).toBeNull();
	});

	it('keeps requests that differ only in field boundaries apart', async () => {
		await saveCachedResponse({ model: 'm', system: 'ab', user: 'c' }, 'response-A');

		expect(await loadCachedResponse({ model: 'm', system: 'a', user: 'bc' })).toBeNull();
	});

	// Regression: v1 keyed by project name, so a second "paseo" folder got the first one's diagram
	it('misses for a different skeleton under the same project name', async () => {
		await saveCachedResponse(request, 'response-A');

		const sameNameOtherProject = {
			...request,
			user: 'Analyze this project:\n\n{"projectName":"paseo","files":[{"path":"README.md"}]}'
		};

		expect(await loadCachedResponse(sameNameOtherProject)).toBeNull();
	});

	it('evicts the legacy project-name cache on load', () => {
		expect(fakeCaches.delete).toHaveBeenCalledWith('ropeman/semantic');
		expect(storage.has('ropeman/semantic')).toBe(false);
	});

	it('counts and clears saved entries', async () => {
		await saveCachedResponse(request, 'response-A');
		await saveCachedResponse({ ...request, model: 'edge' }, 'response-B');
		expect(await getSemanticCacheSize()).toBe(2);

		await clearSemanticCache();

		expect(await getSemanticCacheSize()).toBe(0);
		expect(await loadCachedResponse(request)).toBeNull();
	});

	it('returns null when the Cache API fails', async () => {
		fakeCaches.open.mockRejectedValueOnce(new Error('SecurityError'));

		expect(await loadCachedResponse(request)).toBeNull();
	});
});
