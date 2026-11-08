import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/proxy';

const ORIGIN = 'https://ropeman.dev';
const env = {
	ALLOWED_ORIGINS: ORIGIN,
	AI_GATEWAY_BASE: 'https://gateway.test/v1/acct/gw',
	AI_GATEWAY_TOKEN: '',
};

function proxyRequest(body: unknown) {
	return new Request('https://proxy.ropeman.dev/', {
		method: 'POST',
		headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('proxy worker', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("action 'models'", () => {
		it('lists Anthropic models with the key in x-api-key and created as unix seconds', async () => {
			// Arrange
			fetchMock.mockResolvedValue(
				new Response(
					JSON.stringify({
						data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }],
					}),
				),
			);

			// Act
			const response = await worker.fetch(proxyRequest({ action: 'models', provider: 'anthropic', apiKey: 'sk-ant' }), env);

			// Assert
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				models: [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', created: 1788220800 }],
			});
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe('https://api.anthropic.com/v1/models?limit=100');
			expect(init.headers['x-api-key']).toBe('sk-ant');
		});

		it('lists OpenAI models with a bearer token', async () => {
			fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-terra', created: 1754352000 }] })));

			const response = await worker.fetch(proxyRequest({ action: 'models', provider: 'openai', apiKey: 'sk-oa' }), env);

			expect(await response.json()).toEqual({
				models: [{ id: 'gpt-5.6-terra', label: 'gpt-5.6-terra', created: 1754352000 }],
			});
			expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-oa');
		});

		it('passes the provider status through when the key is rejected', async () => {
			fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

			const response = await worker.fetch(proxyRequest({ action: 'models', provider: 'openai', apiKey: 'bad' }), env);

			expect(response.status).toBe(401);
		});

		it('answers 400 without a key or for an unsupported provider', async () => {
			const noKey = await worker.fetch(proxyRequest({ action: 'models', provider: 'openai' }), env);
			const google = await worker.fetch(proxyRequest({ action: 'models', provider: 'google', apiKey: 'k' }), env);

			expect(noKey.status).toBe(400);
			expect(google.status).toBe(400);
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	it('sends max_completion_tokens to OpenAI, which GPT-5 and o-series require', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] })));

		const response = await worker.fetch(
			proxyRequest({
				provider: 'openai',
				apiKey: 'sk-oa',
				model: 'gpt-5.6-terra',
				messages: [{ role: 'user', content: 'hi' }],
			}),
			env,
		);

		expect((await response.json()).text).toBe('done');
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.max_completion_tokens).toBe(16384);
		expect(body).not.toHaveProperty('max_tokens');
	});
});
