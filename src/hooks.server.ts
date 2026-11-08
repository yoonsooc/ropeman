import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

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

	return resolve(event, {
		// `app.html` provides a static <title>Ropeman</title> as the SPA fallback
		// (needed because the landing page runs with ssr=false and produces no
		// SSR head). When a route also emits a <title> via <svelte:head> (e.g.
		// /docs/* with ssr=true), we end up with two title tags. Strip the first
		// one so the page-specific title is the only survivor.
		transformPageChunk: ({ html, done }) => {
			if (!done) return html;
			const titles = html.match(/<title>[^<]*<\/title>/g);
			if (titles && titles.length > 1) {
				return html.replace(/<title>[^<]*<\/title>/, '');
			}
			return html;
		}
	});
};
