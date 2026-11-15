// `wrangler types` declares the whole worker runtime, whose globals clash with the DOM types,
// so only the binding hooks.server.ts reads is declared here.
declare module 'cloudflare:workers' {
	export const env: { ASSETS?: { fetch: typeof fetch } };
}
