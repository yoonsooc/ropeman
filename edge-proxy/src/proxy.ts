import { handleCors, callGemini, jsonResponse } from './shared';

interface Env {
	ALLOWED_ORIGINS: string;
	AI_GATEWAY_BASE: string;
	AI_GATEWAY_TOKEN: string;
}

type Provider = 'google' | 'anthropic' | 'openai';

interface ProxyRequest {
	provider: Provider;
	apiKey: string;
	model: string;
	messages: Array<{ role: string; content: string }>;
	system?: string;
}

interface ModelsRequest {
	action: 'models';
	provider: Provider;
	apiKey: string;
}

// --- Provider별 API 호출 (AI Gateway 경유) ---

let gatewayBase = '';
let gatewayToken = '';

async function callAnthropic(
	apiKey: string,
	model: string,
	messages: Array<{ role: string; content: string }>,
	systemPrompt?: string,
): Promise<Response> {
	const body: Record<string, unknown> = {
		model,
		max_tokens: 4096,
		messages: messages.map((m) => ({ role: m.role, content: m.content })),
	};

	if (systemPrompt) {
		body.system = systemPrompt;
	}

	return fetch(gatewayBase + '/anthropic/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			...(gatewayToken ? { 'cf-aig-authorization': `Bearer ${gatewayToken}` } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function callOpenAI(
	apiKey: string,
	model: string,
	messages: Array<{ role: string; content: string }>,
	systemPrompt?: string,
): Promise<Response> {
	const msgs: Array<{ role: string; content: string }> = [];

	if (systemPrompt) {
		msgs.push({ role: 'system', content: systemPrompt });
	}
	msgs.push(...messages);

	return fetch(gatewayBase + '/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			...(gatewayToken ? { 'cf-aig-authorization': `Bearer ${gatewayToken}` } : {}),
		},
		body: JSON.stringify({
			model,
			messages: msgs,
			// GPT-5 and o-series reject max_tokens, and their reasoning tokens count against this budget
			max_completion_tokens: 16384,
		}),
	});
}

// --- 모델 목록 (사용자 키로 조회, 채팅 모델 고르기는 클라이언트 몫) ---

async function listModels(provider: Provider, apiKey: string, headers: Record<string, string>): Promise<Response> {
	if (!apiKey) {
		return jsonResponse({ error: 'Missing required field: apiKey' }, 400, headers);
	}

	let response: Response;
	if (provider === 'anthropic') {
		response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
			headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
		});
	} else if (provider === 'openai') {
		response = await fetch('https://api.openai.com/v1/models', {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
	} else {
		return jsonResponse({ error: `Model list not supported for ${provider}` }, 400, headers);
	}

	const data: any = await response.json().catch(() => ({}));
	if (!response.ok) {
		return jsonResponse({ error: `${provider} model list error: ${response.status}` }, response.status, headers);
	}

	const models = (Array.isArray(data?.data) ? data.data : []).map((m: any) => ({
		id: m.id,
		label: m.display_name ?? m.id,
		// OpenAI: unix seconds; Anthropic: ISO timestamp
		created: m.created ?? (m.created_at ? Math.floor(Date.parse(m.created_at) / 1000) : undefined),
	}));
	return jsonResponse({ models }, 200, headers);
}

// --- 응답 정규화 (각 provider → 통일 형식) ---

function normalizeResponse(provider: Provider, data: any): string {
	if (provider === 'google') {
		return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
	}
	if (provider === 'anthropic') {
		const blocks = data?.content;
		if (Array.isArray(blocks)) {
			return blocks
				.filter((b: any) => b.type === 'text')
				.map((b: any) => b.text)
				.join('');
		}
		return '';
	}
	if (provider === 'openai') {
		return data?.choices?.[0]?.message?.content || '';
	}
	return '';
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsResult = handleCors(request, env.ALLOWED_ORIGINS);
		if (corsResult instanceof Response) return corsResult;
		const { headers } = corsResult;

		try {
			gatewayBase = env.AI_GATEWAY_BASE;
			gatewayToken = env.AI_GATEWAY_TOKEN || '';
			const body = (await request.json()) as ProxyRequest | ModelsRequest;
			if ('action' in body && body.action === 'models') {
				return await listModels(body.provider, body.apiKey, headers);
			}
			const { provider, apiKey, model, messages, system } = body as ProxyRequest;

			if (!provider || !apiKey || !model || !messages) {
				return jsonResponse({ error: 'Missing required fields: provider, apiKey, model, messages' }, 400, headers);
			}

			const MAX_RETRIES = 3;

			function callProvider(): Promise<Response> {
				switch (provider) {
					case 'google':
						return callGemini(apiKey, model, messages, system);
					case 'anthropic':
						return callAnthropic(apiKey, model, messages, system);
					case 'openai':
						return callOpenAI(apiKey, model, messages, system);
					default:
						throw new Error(`Unsupported provider: ${provider}`);
				}
			}

			let response: Response;
			let result: any;

			for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
				response = await callProvider();
				result = await response.json();

				if (response.status === 429) {
					// insufficient_quota는 재시도 불필요
					const code = result?.error?.code || result?.error?.type || '';
					if (code === 'insufficient_quota') break;

					const retryAfter = response.headers.get('retry-after');
					const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
					await new Promise((r) => setTimeout(r, waitMs));
					continue;
				}
				break;
			}

			if (!response!.ok) {
				console.error(`${provider} API error (${response!.status}):`, JSON.stringify(result));
				return jsonResponse({ error: `${provider} API error: ${response!.status}`, detail: result }, response!.status, headers);
			}

			// 정규화된 텍스트 + 원본 모두 반환
			const text = normalizeResponse(provider, result);
			return jsonResponse({ text, raw: result }, 200, headers);
		} catch (err) {
			return jsonResponse({ error: 'Proxy error' }, 500, headers);
		}
	},
};
