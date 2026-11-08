import { handleCors, callGemini, jsonResponse } from './shared';

interface Env {
	GEMINI_API_KEY: string;
	ALLOWED_ORIGINS: string;
	RATE_LIMIT_PER_MIN: string;
	DAILY_LIMIT_TOTAL: string;
	DEMO_MODEL: string;
}

const DEFAULT_DEMO_MODEL = 'gemini-flash-latest';
/** Upstream statuses worth retrying with the next model: gone, per-model quota, or overloaded. */
const RETRY_NEXT_MODEL = new Set([404, 429, 500, 503]);

// --- Rate Limiter (IP별 분당) ---
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string, limit: number): boolean {
	const now = Date.now();
	const entry = ipCounts.get(ip);
	if (!entry || now > entry.resetAt) {
		ipCounts.set(ip, { count: 1, resetAt: now + 60_000 });
		return true;
	}
	if (entry.count >= limit) return false;
	entry.count++;
	return true;
}

// --- Daily Global Cap ---
let dailyCount = 0;
let dailyResetAt = 0;

function checkDailyLimit(limit: number): boolean {
	const now = Date.now();
	if (now > dailyResetAt) {
		dailyCount = 0;
		const tomorrow = new Date();
		tomorrow.setUTCHours(24, 0, 0, 0);
		dailyResetAt = tomorrow.getTime();
	}
	if (dailyCount >= limit) return false;
	dailyCount++;
	return true;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsResult = handleCors(request, env.ALLOWED_ORIGINS);
		if (corsResult instanceof Response) return corsResult;
		const { headers } = corsResult;

		// Rate limit (IP별 분당)
		const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
		const perMinLimit = parseInt(env.RATE_LIMIT_PER_MIN || '10');
		if (!checkIpRateLimit(ip, perMinLimit)) {
			return jsonResponse({ error: 'demo_rate_limited', message: 'Rate limit exceeded. Try again in a minute.' }, 429, headers);
		}

		// Daily global cap
		const dailyLimit = parseInt(env.DAILY_LIMIT_TOTAL || '200');
		if (!checkDailyLimit(dailyLimit)) {
			return jsonResponse({ error: 'demo_daily_limit', message: 'Daily demo limit reached. Please try again tomorrow.' }, 429, headers);
		}

		let messages: Array<{ role: string; content: string }>;
		let systemPrompt: string | undefined;
		try {
			const body = (await request.json()) as Record<string, unknown>;
			messages = body.messages as Array<{ role: string; content: string }>;
			systemPrompt = body.system as string | undefined;
		} catch {
			return jsonResponse({ error: 'invalid_request' }, 400, headers);
		}

		// Comma-separated list: the next model is tried when one is out of quota or gone,
		// since free-tier quotas are counted per model.
		const models = (env.DEMO_MODEL || DEFAULT_DEMO_MODEL)
			.split(',')
			.map((m) => m.trim())
			.filter(Boolean);

		let lastStatus = 0;
		try {
			for (const model of models) {
				const response = await callGemini(env.GEMINI_API_KEY, model, messages, systemPrompt);
				if (response.ok) {
					return new Response(await response.text(), {
						status: 200,
						headers: { ...headers, 'Content-Type': 'application/json' },
					});
				}
				lastStatus = response.status;
				// The upstream body can name the billing project, so it stays in the worker log.
				console.error(`Gemini API error (${model}, ${response.status}):`, await response.text());
				if (!RETRY_NEXT_MODEL.has(response.status)) break;
			}
		} catch (err) {
			console.error('Demo upstream request failed:', err);
		}

		const error = lastStatus === 429 ? 'demo_upstream_quota' : 'demo_unavailable';
		return jsonResponse({ error, upstreamStatus: lastStatus }, 503, headers);
	},
};
