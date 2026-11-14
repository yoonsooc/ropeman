import type { Handle, RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { LANGUAGE_COOKIE, requestLocale } from '$lib/utils/locale';

export const handle: Handle = async ({ event, resolve }) => {
	// Redirect the production pages.dev alias to the custom domain. This only runs for
	// routes that are not prerendered (e.g. /share/[slug]); app.html covers the rest.
	const host = event.url.hostname;
	if (host === 'ropeman.pages.dev') {
		const target = new URL(event.url);
		target.hostname = 'ropeman.dev';
		target.port = '';
		redirect(301, target.toString());
	}

	if (event.url.pathname === '/' && ['GET', 'HEAD'].includes(event.request.method)) {
		return serveLanding(event);
	}

	return resolve(event, {
		// `app.html` provides a static <title>Ropeman</title> for the client-only
		// routes (ssr=false), which produce no SSR head. When a route also emits a
		// <title> via <svelte:head> (e.g. /docs/* with ssr=true), we end up with two
		// title tags. Strip the first one so the page-specific title is the only survivor.
		transformPageChunk: ({ html, done }) => {
			if (!done) return html;
			const titles = html.match(/<title>[^<]*<\/title>/g);
			if (titles && titles.length > 1) {
				html = html.replace(/<title>[^<]*<\/title>/, '');
			}
			// app.html says English. Pages built in Korean (`/ko`, `/docs/ko/*`) say so before the
			// app boots, for crawlers and screen readers.
			if (event.params.lang === 'ko') {
				html = html.replace('<html lang="en"', '<html lang="ko"');
			}
			return html;
		}
	});
};

/**
 * `/` is the landing in the visitor's language: the one saved in the app (its cookie), else
 * the browser's Accept-Language. Both languages are prerendered, as `/en` and `/ko`. The
 * adapter's worker serves prerendered paths from static assets before any hook runs, so `/`
 * itself is left out of the build and picks one of the two files here.
 */
async function serveLanding(event: RequestEvent): Promise<Response> {
	// SvelteKit answers 204 while prerendering a page that is not prerenderable, and the
	// prerenderer then writes no file. Doing the same keeps `/` reaching this hook.
	if (building) return new Response(undefined, { status: 204 });

	const locale = requestLocale(
		event.cookies.get(LANGUAGE_COOKIE),
		event.request.headers.get('accept-language')
	);
	const target = new URL(`/${locale}`, event.url);
	// `vite dev` has no built files and no ASSETS binding, and renders `/en` or `/ko` on request
	const platform = event.platform as { env?: { ASSETS?: { fetch: typeof fetch } } } | undefined;
	const assets = platform?.env?.ASSETS;
	// Only the headers that shape a whole-page answer: a 304 for an unchanged file, compression.
	// A Range or If-Modified-Since could get a slice, or a 304 that keeps the other language.
	const headers = new Headers();
	for (const name of ['if-none-match', 'accept-encoding']) {
		const value = event.request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const landing = assets
		? await assets.fetch(new Request(target, { headers }))
		: await event.fetch(target);

	const response = new Headers(landing.headers);
	// The body depends on the visitor, so no shared cache may keep it under `/`. The adapter's
	// worker would otherwise put a cacheable response in caches.default, keyed by URL alone.
	response.set('Cache-Control', 'private, no-cache');
	response.set('Vary', 'Accept-Language, Cookie');
	return new Response(landing.body, { status: landing.status, headers: response });
}
