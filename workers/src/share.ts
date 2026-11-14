import { getAllowedOrigin, corsHeaders, jsonResponse } from './shared';

interface Env {
	ALLOWED_ORIGINS: string;
	ROPEMAN_SHARE_STORE: KVNamespace;
}

// --- Slug generation (base62, 8 chars) ---
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateSlug(length = 8): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let slug = '';
	for (let i = 0; i < length; i++) {
		slug += BASE62[bytes[i] % BASE62.length];
	}
	return slug;
}

// --- Rate limiting (IP-based, 10 req/hour for POST) ---
const ipHourlyCounts = new Map<string, { count: number; resetAt: number }>();

function pruneExpired(map: Map<string, { count: number; resetAt: number }>, now: number) {
	if (map.size > 5000) {
		for (const [key, entry] of map) {
			if (now > entry.resetAt) map.delete(key);
		}
	}
}

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	pruneExpired(ipHourlyCounts, now);

	const entry = ipHourlyCounts.get(ip);
	if (!entry || now > entry.resetAt) {
		ipHourlyCounts.set(ip, { count: 1, resetAt: now + 3_600_000 });
		return true;
	}
	if (entry.count >= 10) return false;
	entry.count++;
	return true;
}

// --- Constants ---
const MAX_BODY_SIZE = 1_048_576; // 1MB
const KV_TTL = 1_209_600; // 14 days
const BASE_URL = 'https://ropeman.dev/share';

// --- CORS (GET + POST) ---
function shareCorsHeaders(origin: string): Record<string, string> {
	return {
		...corsHeaders(origin),
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const requestOrigin = request.headers.get('Origin');
		const origin = getAllowedOrigin(requestOrigin, env.ALLOWED_ORIGINS);
		if (!origin) {
			return new Response('Origin not allowed', { status: 403 });
		}
		const cors = shareCorsHeaders(origin);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors });
		}

		const url = new URL(request.url);
		const path = url.pathname;

		// POST /share
		if (request.method === 'POST' && path === '/share') {
			return handleCreate(request, env, cors);
		}

		// GET /share/{slug}
		const slugMatch = path.match(/^\/share\/([A-Za-z0-9]{8})$/);
		if (request.method === 'GET' && slugMatch) {
			return handleGet(env, slugMatch[1], cors);
		}

		return jsonResponse({ error: 'Not found' }, 404, cors);
	},
};

async function handleCreate(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
	// Rate limit
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	if (!checkRateLimit(ip)) {
		return jsonResponse({ error: 'Rate limit exceeded' }, 429, cors);
	}

	// Size check
	const contentLength = request.headers.get('Content-Length');
	if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
		return jsonResponse({ error: 'Payload too large (max 1MB)' }, 413, cors);
	}

	let body: unknown;
	try {
		const text = await request.text();
		if (text.length > MAX_BODY_SIZE) {
			return jsonResponse({ error: 'Payload too large (max 1MB)' }, 413, cors);
		}
		body = JSON.parse(text);
	} catch {
		return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
	}

	if (!body || typeof body !== 'object') {
		return jsonResponse({ error: 'Invalid payload' }, 400, cors);
	}

	// Generate unique slug (retry on collision)
	let slug: string;
	let attempts = 0;
	do {
		slug = generateSlug();
		const existing = await env.ROPEMAN_SHARE_STORE.get(slug);
		if (!existing) break;
		attempts++;
	} while (attempts < 5);

	if (attempts >= 5) {
		return jsonResponse({ error: 'Failed to generate unique slug' }, 500, cors);
	}

	// Store in KV with 14-day TTL
	await env.ROPEMAN_SHARE_STORE.put(slug, JSON.stringify(body), { expirationTtl: KV_TTL });

	return jsonResponse(
		{
			slug,
			url: `${BASE_URL}/${slug}`,
		},
		201,
		cors,
	);
}

async function handleGet(env: Env, slug: string, cors: Record<string, string>): Promise<Response> {
	const data = await env.ROPEMAN_SHARE_STORE.get(slug);
	if (!data) {
		return jsonResponse({ error: 'Not found' }, 404, cors);
	}

	return new Response(data, {
		status: 200,
		headers: { ...cors, 'Content-Type': 'application/json' },
	});
}
