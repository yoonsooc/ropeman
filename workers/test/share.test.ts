import { describe, it, expect } from 'vitest';
import { env as bindings } from 'cloudflare:test';
import worker from '../src/share';

const ORIGIN = 'https://ropeman.dev';
const env = { ALLOWED_ORIGINS: ORIGIN, ROPEMAN_SHARE_STORE: bindings.ROPEMAN_SHARE_STORE };

// Each request gets its own IP unless a test pins one: the per-IP limiter is module state
let ipCounter = 0;
function shareRequest(
	method: string,
	path: string,
	init: { body?: string; origin?: string | null; ip?: string; headers?: Record<string, string> } = {},
) {
	ipCounter += 1;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'CF-Connecting-IP': init.ip ?? `10.1.0.${ipCounter}`,
		...init.headers,
	};
	if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
	return new Request(`https://share.ropeman.dev${path}`, { method, headers, body: init.body });
}

const snapshot = { projectName: 'ropeman', nodes: [] };

describe('share worker', () => {
	it('stores a snapshot for 14 days and serves it back by its slug', async () => {
		// Arrange
		const before = Math.floor(Date.now() / 1000);

		// Act
		const created = await worker.fetch(shareRequest('POST', '/share', { body: JSON.stringify(snapshot) }), env);
		const { slug, url } = (await created.json()) as { slug: string; url: string };
		const fetched = await worker.fetch(shareRequest('GET', `/share/${slug}`), env);

		// Assert
		expect(created.status).toBe(201);
		expect(slug).toMatch(/^[A-Za-z0-9]{8}$/);
		expect(url).toBe(`https://ropeman.dev/share/${slug}`);
		expect(fetched.status).toBe(200);
		expect(fetched.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
		expect(await fetched.json()).toEqual(snapshot);
		const { keys } = await bindings.ROPEMAN_SHARE_STORE.list();
		expect(keys[0].expiration! - before).toBeGreaterThanOrEqual(1_209_600);
		expect(keys[0].expiration! - before).toBeLessThan(1_209_600 + 60);
	});

	it('answers a preflight with 204 and allows GET and POST', async () => {
		const response = await worker.fetch(shareRequest('OPTIONS', '/share'), env);

		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
	});

	it('rejects a missing or unlisted origin with 403', async () => {
		const unlisted = await worker.fetch(shareRequest('GET', '/share/abcdEFGH', { origin: 'https://evil.example' }), env);
		const missing = await worker.fetch(shareRequest('GET', '/share/abcdEFGH', { origin: null }), env);

		expect(unlisted.status).toBe(403);
		expect(missing.status).toBe(403);
	});

	it('answers 404 for an unknown slug and for other routes', async () => {
		const unknownSlug = await worker.fetch(shareRequest('GET', '/share/abcdEFGH'), env);
		const shortSlug = await worker.fetch(shareRequest('GET', '/share/abc'), env);
		const getList = await worker.fetch(shareRequest('GET', '/share'), env);

		expect(unknownSlug.status).toBe(404);
		expect(shortSlug.status).toBe(404);
		expect(getList.status).toBe(404);
	});

	it('answers 400 for a body that is not a JSON object', async () => {
		const broken = await worker.fetch(shareRequest('POST', '/share', { body: '{oops' }), env);
		const scalar = await worker.fetch(shareRequest('POST', '/share', { body: '42' }), env);

		expect(broken.status).toBe(400);
		expect(scalar.status).toBe(400);
		expect((await bindings.ROPEMAN_SHARE_STORE.list()).keys).toHaveLength(0);
	});

	it('answers 413 for a body over 1MB', async () => {
		const body = JSON.stringify({ blob: 'x'.repeat(1_048_576) });

		const response = await worker.fetch(shareRequest('POST', '/share', { body }), env);

		expect(response.status).toBe(413);
	});

	it('answers 429 after 10 shares from one IP in an hour', async () => {
		const send = () => worker.fetch(shareRequest('POST', '/share', { body: JSON.stringify(snapshot), ip: '10.2.0.1' }), env);
		for (let i = 0; i < 10; i++) expect((await send()).status).toBe(201);

		const response = await send();

		expect(response.status).toBe(429);
	});
});
