import { describe, it, expect } from 'vitest';
import { env as bindings } from 'cloudflare:test';
import worker from '../src/explore';

const ORIGIN = 'https://ropeman.dev';
const TOKEN = 'admin-secret';
const env = {
	ALLOWED_ORIGINS: ORIGIN,
	ROPEMAN_EXPLORE_STORE: bindings.ROPEMAN_EXPLORE_STORE,
	EXPLORE_ADMIN_TOKEN: TOKEN,
};

function exploreRequest(method: string, path: string, init: { body?: string; origin?: string; token?: string } = {}) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (init.origin) headers.Origin = init.origin;
	if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`;
	return new Request(`https://explore.ropeman.dev${path}`, { method, headers, body: init.body });
}

const snapshot = {
	projectName: 'react',
	semanticLevels: { root: { nodes: [], edges: [], breadcrumbLabel: 'react', parentId: null } },
};

describe('explore worker', () => {
	it('lets the admin store a snapshot that anyone can then read', async () => {
		// Arrange
		const upsert = exploreRequest('POST', '/explore/react', { body: JSON.stringify(snapshot), token: TOKEN });

		// Act
		const stored = await worker.fetch(upsert, env);
		const fetched = await worker.fetch(exploreRequest('GET', '/explore/react', { origin: ORIGIN }), env);
		const listed = await worker.fetch(exploreRequest('GET', '/explore'), env);

		// Assert
		expect(stored.status).toBe(200);
		expect(await stored.json()).toEqual({ slug: 'react', ok: true });
		expect(fetched.status).toBe(200);
		expect(fetched.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
		expect(fetched.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
		expect(await fetched.json()).toEqual(snapshot);
		expect(await listed.json()).toEqual({ slugs: ['react'] });
	});

	it('answers 401 to writes without the admin token, including when no token is configured', async () => {
		const body = JSON.stringify(snapshot);

		const noToken = await worker.fetch(exploreRequest('POST', '/explore/react', { body }), env);
		const wrongToken = await worker.fetch(exploreRequest('POST', '/explore/react', { body, token: 'nope' }), env);
		const unconfigured = await worker.fetch(exploreRequest('POST', '/explore/react', { body, token: '' }), {
			...env,
			EXPLORE_ADMIN_TOKEN: '',
		});
		const deleteNoToken = await worker.fetch(exploreRequest('DELETE', '/explore/react'), env);

		expect([noToken.status, wrongToken.status, unconfigured.status, deleteNoToken.status]).toEqual([401, 401, 401, 401]);
		expect((await bindings.ROPEMAN_EXPLORE_STORE.list()).keys).toHaveLength(0);
	});

	it('answers 400 to a body that is not valid JSON or not a snapshot', async () => {
		const broken = await worker.fetch(exploreRequest('POST', '/explore/react', { body: '{oops', token: TOKEN }), env);
		const noLevels = await worker.fetch(
			exploreRequest('POST', '/explore/react', { body: JSON.stringify({ projectName: 'react' }), token: TOKEN }),
			env,
		);

		expect(broken.status).toBe(400);
		expect(noLevels.status).toBe(400);
	});

	it('deletes a snapshot for the admin', async () => {
		await bindings.ROPEMAN_EXPLORE_STORE.put('vue', JSON.stringify(snapshot));

		const deleted = await worker.fetch(exploreRequest('DELETE', '/explore/vue', { token: TOKEN }), env);

		expect(await deleted.json()).toEqual({ slug: 'vue', deleted: true });
		expect(await bindings.ROPEMAN_EXPLORE_STORE.get('vue')).toBeNull();
	});

	it('answers 404 for a missing slug and for slugs outside the pattern', async () => {
		const missing = await worker.fetch(exploreRequest('GET', '/explore/svelte'), env);
		const upper = await worker.fetch(exploreRequest('GET', '/explore/React'), env);

		expect(missing.status).toBe(404);
		expect(upper.status).toBe(404);
	});

	it('rejects an unlisted browser origin and serves callers that send none', async () => {
		const unlisted = await worker.fetch(exploreRequest('GET', '/explore', { origin: 'https://evil.example' }), env);
		const noOrigin = await worker.fetch(exploreRequest('GET', '/explore'), env);
		const preflight = await worker.fetch(exploreRequest('OPTIONS', '/explore/react', { origin: ORIGIN }), env);

		expect(unlisted.status).toBe(403);
		expect(noOrigin.status).toBe(200);
		expect(noOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
	});
});
