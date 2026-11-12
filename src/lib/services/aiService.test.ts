import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('$lib/stores/settingsStore.svelte', () => ({
	settingsStore: {
		geminiApiKey: 'test-gemini-key',
		aiProvider: 'google',
		aiModel: 'gemini-2.5-flash-lite',
		cacheEnabled: true
	}
}));

vi.mock('$lib/stores/authStore.svelte', () => ({
	authStore: {
		activeTrack: 'byok'
	}
}));

vi.mock('$lib/services/aiAdapter', () => ({
	callAI: vi.fn()
}));

vi.mock('$lib/utils/contextBuilder', () => ({
	buildContext: vi.fn(() => 'system prompt')
}));

vi.mock('$lib/services/cacheService', () => ({
	searchCache: vi.fn(),
	addToCache: vi.fn(),
	initCache: vi.fn()
}));

vi.mock('$lib/services/embeddingService', () => ({
	getEmbedding: vi.fn()
}));

import { sendMessage } from './aiService';
import { authStore } from '$lib/stores/authStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { callAI } from '$lib/services/aiAdapter';
import { searchCache, addToCache, initCache } from '$lib/services/cacheService';
import { getEmbedding } from '$lib/services/embeddingService';

describe('aiService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(authStore as any).activeTrack = 'byok';
		(settingsStore as any).aiProvider = 'google';
		(settingsStore as any).geminiApiKey = 'test-gemini-key';
		(settingsStore as any).aiModel = 'gemini-2.5-flash-lite';
	});

	describe('sendMessage — track none', () => {
		it('returns error result when track is none', async () => {
			(authStore as any).activeTrack = 'none';

			const result = await sendMessage('hello', null);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe('NO_TRACK');
			}
		});
	});

	describe('sendMessage — non-Gemini tracks delegate to callAI', () => {
		it('delegates to edge track', async () => {
			(authStore as any).activeTrack = 'edge';
			(callAI as ReturnType<typeof vi.fn>).mockResolvedValue('edge answer');

			const result = await sendMessage('explain', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('edge answer');
			}
		});

		it('delegates to webgpu track', async () => {
			(authStore as any).activeTrack = 'webgpu';
			(callAI as ReturnType<typeof vi.fn>).mockResolvedValue('local answer');

			const result = await sendMessage('explain', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('local answer');
			}
		});

		it('delegates to anthropic byok track', async () => {
			(authStore as any).activeTrack = 'byok';
			(settingsStore as any).aiProvider = 'anthropic';
			(callAI as ReturnType<typeof vi.fn>).mockResolvedValue('claude answer');

			const result = await sendMessage('explain', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('claude answer');
			}
		});

		it('delegates to openai byok track', async () => {
			(authStore as any).activeTrack = 'byok';
			(settingsStore as any).aiProvider = 'openai';
			(callAI as ReturnType<typeof vi.fn>).mockResolvedValue('openai answer');

			const result = await sendMessage('explain', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('openai answer');
			}
		});

		it('includes node context in related nodes', async () => {
			(authStore as any).activeTrack = 'edge';
			(callAI as ReturnType<typeof vi.fn>).mockResolvedValue('answer');

			const node = {
				id: 'node:file.ts',
				label: 'myFunc',
				kind: 'function',
				filePath: 'src/file.ts'
			} as any;

			const result = await sendMessage('explain', node);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.relatedNodes).toContain('node:file.ts');
			}
		});

		it('returns error result when callAI throws', async () => {
			(authStore as any).activeTrack = 'edge';
			(callAI as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Proxy unreachable'));

			const result = await sendMessage('explain', null);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe('Proxy unreachable');
				expect(result.code).toBe('AI_ERROR');
			}
		});
	});

	describe('sendMessage — Gemini BYOK track', () => {
		it('returns cached result when cache hit', async () => {
			(initCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(getEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([0.1, 0.2]);
			(searchCache as ReturnType<typeof vi.fn>).mockResolvedValue({
				response: 'cached response',
				code: 'function x() {}',
				nodeId: 'node:x'
			});

			const result = await sendMessage('what does x do?', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('cached response');
				expect(result.data.fromCache).toBe(true);
			}
		});

		it('calls Gemini API on cache miss', async () => {
			(initCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(getEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([0.1]);
			(searchCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const mockResponse = {
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: 'gemini response' }] } }]
					})
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const result = await sendMessage('explain code', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('gemini response');
			}
			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining('generativelanguage.googleapis.com'),
				expect.any(Object)
			);
		});

		it('stores response in cache after successful API call', async () => {
			(initCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(getEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([0.1]);
			(searchCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: 'new response' }] } }]
					})
			});

			await sendMessage('explain', null);

			expect(addToCache).toHaveBeenCalledWith('', 'explain', 'new response', '', [0.1]);
		});

		it('skips cache for messages with history', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: 'response' }] } }]
					})
			});

			const history = [{ role: 'user', content: 'previous' }];
			await sendMessage('follow up', null, history);

			expect(initCache).not.toHaveBeenCalled();
		});

		it('returns error on non-429 HTTP error', async () => {
			(initCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(getEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ error: { message: 'Internal server error' } })
			});

			const result = await sendMessage('test', null);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain('Internal server error');
			}
		});

		it('retries on 429 with exponential backoff', async () => {
			(initCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
			(getEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			let callCount = 0;
			global.fetch = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					return Promise.resolve({ ok: false, status: 429 });
				}
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							candidates: [{ content: { parts: [{ text: 'eventually ok' }] } }]
						})
				});
			});

			const result = await sendMessage('test', null);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.content).toBe('eventually ok');
			}
			expect(fetch).toHaveBeenCalledTimes(3);
		});
	});
});
