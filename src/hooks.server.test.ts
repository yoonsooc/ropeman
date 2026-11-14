import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';

const environment = vi.hoisted(() => ({ building: false }));
vi.mock('$app/environment', () => environment);

const { handle } = await import('./hooks.server');

const HTML = { en: '<html lang="en"><h1>Map a repo</h1>', ko: '<html lang="ko"><h1>지도</h1>' };

function makeEvent(path: string, headers: Record<string, string> = {}, params = {}) {
	const assets = {
		fetch: vi.fn(async (request: Request) => {
			const locale = new URL(request.url).pathname.slice(1) as 'en' | 'ko';
			return new Response(HTML[locale], {
				headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=0' }
			});
		})
	};
	const request = new Request(`https://ropeman.dev${path}`, { headers });
	const cookies = new Map(
		(headers.cookie ?? '').split('; ').map((pair) => pair.split('=') as [string, string])
	);
	const event = {
		url: new URL(request.url),
		request,
		params,
		cookies: { get: (name: string) => cookies.get(name) },
		platform: { env: { ASSETS: assets } },
		fetch: vi.fn()
	} as unknown as RequestEvent;
	return { event, assets };
}

describe('handle', () => {
	beforeEach(() => {
		environment.building = false;
	});

	describe('/', () => {
		it('serves the Korean landing to a Korean browser', async () => {
			// Arrange
			const { event, assets } = makeEvent('/', { 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' });

			// Act
			const response = await handle({ event, resolve: vi.fn() });

			// Assert
			expect(new URL(assets.fetch.mock.calls[0][0].url).pathname).toBe('/ko');
			expect(await response.text()).toBe(HTML.ko);
		});

		it('serves the language saved in the app over the browser one', async () => {
			// Arrange
			const { event, assets } = makeEvent('/', {
				'accept-language': 'ko-KR,ko;q=0.9',
				cookie: 'theme=dark; ropeman-lang=en'
			});

			// Act
			const response = await handle({ event, resolve: vi.fn() });

			// Assert
			expect(new URL(assets.fetch.mock.calls[0][0].url).pathname).toBe('/en');
			expect(await response.text()).toBe(HTML.en);
		});

		it('keeps the per-visitor response out of shared caches', async () => {
			// Arrange
			const { event } = makeEvent('/', { 'accept-language': 'en-US' });

			// Act
			const response = await handle({ event, resolve: vi.fn() });

			// Assert
			expect(response.headers.get('cache-control')).toBe('private, no-cache');
			expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
			expect(response.headers.get('content-type')).toBe('text/html');
		});

		it('passes the conditional request headers on, so an unchanged page answers 304', async () => {
			// Arrange
			const { event, assets } = makeEvent('/', { 'if-none-match': '"abc"' });

			// Act
			await handle({ event, resolve: vi.fn() });

			// Assert
			expect(assets.fetch.mock.calls[0][0].headers.get('if-none-match')).toBe('"abc"');
		});

		it('asks for the whole page, never a slice or a date-based 304', async () => {
			// Arrange
			const { event, assets } = makeEvent('/', {
				range: 'bytes=0-99',
				'if-modified-since': 'Fri, 13 Nov 2026 00:00:00 GMT',
				'accept-encoding': 'gzip, br'
			});

			// Act
			await handle({ event, resolve: vi.fn() });

			// Assert
			const sent = assets.fetch.mock.calls[0][0].headers;
			expect(sent.get('range')).toBeNull();
			expect(sent.get('if-modified-since')).toBeNull();
			expect(sent.get('accept-encoding')).toBe('gzip, br');
		});

		it('stays out of the prerendered files, so the edge keeps choosing', async () => {
			// Arrange
			environment.building = true;
			const { event, assets } = makeEvent('/');

			// Act
			const response = await handle({ event, resolve: vi.fn() });

			// Assert
			expect(response.status).toBe(204);
			expect(assets.fetch).not.toHaveBeenCalled();
		});
	});

	describe('other pages', () => {
		async function render(path: string, params: Record<string, string>) {
			const { event } = makeEvent(path, {}, params);
			let options: ResolveOptions | undefined;
			await handle({
				event,
				resolve: vi.fn(async (_event, opts) => {
					options = opts;
					return new Response('');
				})
			});
			const html = '<html lang="en" data-theme="dark"><title>Ropeman</title><title>Page</title>';
			return options!.transformPageChunk!({ html, done: true });
		}

		it('marks a page built in Korean as Korean', async () => {
			// Arrange
			const params = { lang: 'ko' };

			// Act
			const html = await render('/ko', params);

			// Assert
			expect(html).toBe('<html lang="ko" data-theme="dark"><title>Page</title>');
		});

		it('leaves an English page in English', async () => {
			// Arrange
			const params = { lang: 'en' };

			// Act
			const html = await render('/docs/en/faq', params);

			// Assert
			expect(html).toBe('<html lang="en" data-theme="dark"><title>Page</title>');
		});
	});
});
