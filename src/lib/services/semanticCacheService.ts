/**
 * Persists AI answers to semantic analysis requests in the Cache API.
 *
 * An entry is keyed by a SHA-256 of the exact request: model, system prompt and
 * user prompt (which embeds the skeleton payload). A different file set, model,
 * prompt text or locale therefore misses instead of returning another input's
 * diagram. The raw response is stored, not the parsed level, so parser changes
 * apply to cached answers too.
 */

const CACHE_NAME = 'ropeman/semantic-v2';
const KEY_PREFIX = 'https://ropeman.local/semantic/';

// v1 keyed entries by project name, so any project with the same folder name got
// the same diagram. Those entries are never read again; drop them.
const LEGACY_CACHE_NAMES = ['ropeman/semantic'];
try {
	indexedDB.deleteDatabase('ropeman-semantic-cache');
	for (const name of LEGACY_CACHE_NAMES) caches.delete(name).catch(() => {});
} catch {
	/* ignore */
}

export interface SemanticRequest {
	/** Track and model answering the request, e.g. `byok:anthropic:claude-sonnet-4-5`. */
	model: string;
	/** System prompt as sent, locale instruction included. */
	system: string;
	/** User prompt as sent, skeleton payload included. */
	user: string;
}

async function requestUrl(req: SemanticRequest): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify([req.model, req.system, req.user]));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
	return KEY_PREFIX + hex;
}

export async function loadCachedResponse(req: SemanticRequest): Promise<string | null> {
	try {
		const cache = await caches.open(CACHE_NAME);
		const resp = await cache.match(new Request(await requestUrl(req)));
		return resp ? await resp.text() : null;
	} catch {
		return null;
	}
}

export async function saveCachedResponse(req: SemanticRequest, response: string): Promise<void> {
	try {
		const cache = await caches.open(CACHE_NAME);
		await cache.put(
			new Request(await requestUrl(req)),
			new Response(response, { headers: { 'Content-Type': 'text/plain' } })
		);
	} catch {
		// silent fail
	}
}

export async function clearSemanticCache(): Promise<void> {
	try {
		await caches.delete(CACHE_NAME);
	} catch {
		// silent fail
	}
}

export async function getSemanticCacheSize(): Promise<number> {
	try {
		const cache = await caches.open(CACHE_NAME);
		const keys = await cache.keys();
		return keys.length;
	} catch {
		return 0;
	}
}
