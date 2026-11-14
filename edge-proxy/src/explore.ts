/**
 * explore — public gallery snapshot store (SH4 / ADR-19)
 *
 * Differences vs share.ts (intentional):
 *   - KV entries have NO TTL (curated, refreshed manually).
 *   - Slugs are caller-provided fixed identifiers (e.g. "react", "vue").
 *   - POST requires an EXPLORE_ADMIN_TOKEN secret — only the maintainer
 *     refreshes entries (no public writes).
 *   - GET is fully public, no rate limit.
 */
import { getAllowedOrigin, corsHeaders, jsonResponse } from './shared';
import { MAX_BODY_SIZE } from './explore.limits';

interface Env {
	ALLOWED_ORIGINS: string;
	ROPEMAN_EXPLORE_STORE: KVNamespace;
	EXPLORE_ADMIN_TOKEN: string;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Defensive structural validation of admin-uploaded snapshot payloads.
 *
 * Even though POST is admin-only, we still validate at the storage boundary
 * (AP-8): a typo in a curl command or a stale snapshot from a refactored
 * exporter could otherwise corrupt KV with garbage that the gallery viewer
 * can't render. We mirror the shape that `exploreService.validateSnapshot`
 * enforces on the read side.
 */
function isValidSnapshot(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false;
	const obj = body as Record<string, unknown>;
	if (typeof obj.projectName !== 'string') return false;
	if (!obj.semanticLevels || typeof obj.semanticLevels !== 'object') return false;

	const levels = obj.semanticLevels as Record<string, unknown>;
	const keys = Object.keys(levels);
	if (keys.length === 0) return false;

	for (const key of keys) {
		const lvl = levels[key];
		if (!lvl || typeof lvl !== 'object') return false;
		const l = lvl as Record<string, unknown>;
		if (!Array.isArray(l.nodes)) return false;
		if (!Array.isArray(l.edges)) return false;
		if (typeof l.breadcrumbLabel !== 'string') return false;
		if (l.parentId !== null && typeof l.parentId !== 'string') return false;
	}
	return true;
}

function exploreCorsHeaders(origin: string): Record<string, string> {
	return {
		...corsHeaders(origin),
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// CORS policy (ADR-19 follow-up):
		//   - When the caller is a browser, the `Origin` header must be in the
		//     allowlist; otherwise the browser would reject the response anyway
		//     and responding with 403 here is a clearer failure.
		//   - Non-browser callers (curl, CI, admin CLI) do not send `Origin`.
		//     Those are permitted through — the Bearer token on admin methods
		//     (POST/DELETE) is the real authorization layer, and GET is fully
		//     public. The allowlist is a browser-side protection, not a
		//     server-side access control.
		const requestOrigin = request.headers.get('Origin');
		let cors: Record<string, string> = {};
		if (requestOrigin) {
			const origin = getAllowedOrigin(requestOrigin, env.ALLOWED_ORIGINS);
			if (!origin) {
				return new Response('Origin not allowed', { status: 403 });
			}
			cors = exploreCorsHeaders(origin);
		}

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors });
		}

		const url = new URL(request.url);
		const path = url.pathname;

		// GET /explore — list slugs (debug / verification)
		if (request.method === 'GET' && path === '/explore') {
			return handleList(env, cors);
		}

		const slugMatch = path.match(/^\/explore\/([a-z0-9][a-z0-9_-]{0,63})$/);

		// GET /explore/{slug}
		if (request.method === 'GET' && slugMatch) {
			return handleGet(env, slugMatch[1], cors);
		}

		// POST /explore/{slug} — admin only
		if (request.method === 'POST' && slugMatch) {
			return handleUpsert(request, env, slugMatch[1], cors);
		}

		// DELETE /explore/{slug} — admin only
		if (request.method === 'DELETE' && slugMatch) {
			return handleDelete(request, env, slugMatch[1], cors);
		}

		return jsonResponse({ error: 'Not found' }, 404, cors);
	},
};

function isAuthorized(request: Request, env: Env): boolean {
	const auth = request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Bearer ')) return false;
	const token = auth.slice(7);
	return Boolean(env.EXPLORE_ADMIN_TOKEN) && token === env.EXPLORE_ADMIN_TOKEN;
}

async function handleGet(env: Env, slug: string, cors: Record<string, string>): Promise<Response> {
	const data = await env.ROPEMAN_EXPLORE_STORE.get(slug);
	if (!data) {
		return jsonResponse({ error: 'Not found' }, 404, cors);
	}
	return new Response(data, {
		status: 200,
		headers: {
			...cors,
			'Content-Type': 'application/json',
			// Public, immutable until admin overwrites — let CDNs cache aggressively.
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
		},
	});
}

async function handleList(env: Env, cors: Record<string, string>): Promise<Response> {
	const list = await env.ROPEMAN_EXPLORE_STORE.list();
	return jsonResponse(
		{
			slugs: list.keys.map((k) => k.name),
		},
		200,
		cors,
	);
}

async function handleUpsert(request: Request, env: Env, slug: string, cors: Record<string, string>): Promise<Response> {
	if (!isAuthorized(request, env)) {
		return jsonResponse({ error: 'Unauthorized' }, 401, cors);
	}

	if (!SLUG_PATTERN.test(slug)) {
		return jsonResponse({ error: 'Invalid slug' }, 400, cors);
	}

	const tooLarge = () => jsonResponse({ error: `Payload too large (max ${MAX_BODY_SIZE} bytes)` }, 413, cors);
	const contentLength = request.headers.get('Content-Length');
	if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
		return tooLarge();
	}

	let body: unknown;
	try {
		// Bytes, not UTF-16 units: a Korean character is one unit but three bytes
		const bytes = await request.arrayBuffer();
		if (bytes.byteLength > MAX_BODY_SIZE) {
			return tooLarge();
		}
		body = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
	}

	if (!isValidSnapshot(body)) {
		return jsonResponse({ error: 'Invalid snapshot structure' }, 400, cors);
	}

	// No TTL — explore entries persist until manually overwritten.
	await env.ROPEMAN_EXPLORE_STORE.put(slug, JSON.stringify(body));

	return jsonResponse({ slug, ok: true }, 200, cors);
}

async function handleDelete(request: Request, env: Env, slug: string, cors: Record<string, string>): Promise<Response> {
	if (!isAuthorized(request, env)) {
		return jsonResponse({ error: 'Unauthorized' }, 401, cors);
	}
	await env.ROPEMAN_EXPLORE_STORE.delete(slug);
	return jsonResponse({ slug, deleted: true }, 200, cors);
}
