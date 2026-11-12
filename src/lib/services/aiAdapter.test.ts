import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('$lib/stores/authStore.svelte', () => ({
	authStore: {
		activeTrack: 'none',
		isReady: false
	}
}));

vi.mock('$lib/stores/settingsStore.svelte', () => ({
	settingsStore: {
		aiProvider: 'google',
		geminiApiKey: 'test-key',
		anthropicApiKey: '',
		aiModel: 'gemini-2.5-flash',
		bridgeCli: 'auto'
	}
}));

vi.mock('$lib/services/bridgeService', () => ({
	sendViaBridge: vi.fn()
}));

vi.mock('$lib/services/webllmService', () => ({
	generate: vi.fn()
}));

vi.mock('$lib/config', () => ({
	DEMO_URL: 'https://demo.test',
	PROXY_URL: 'https://proxy.test'
}));

import { callAI, isTrackReady, getActiveTrack, demoFailureMessage } from './aiAdapter';
import { demoRequestBody } from './requestBudget';
import { authStore } from '$lib/stores/authStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { sendViaBridge } from '$lib/services/bridgeService';
import { generate as webllmGenerate } from '$lib/services/webllmService';

describe('aiAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(authStore as any).activeTrack = 'none';
		(authStore as any).isReady = false;
	});

	describe('callAI', () => {
		it('throws when track is none', async () => {
			(authStore as any).activeTrack = 'none';
			await expect(callAI({ system: 'sys', user: 'msg' })).rejects.toThrow('AI not connected');
		});

		it('delegates to bridge when track is bridge', async () => {
			(authStore as any).activeTrack = 'bridge';
			(sendViaBridge as ReturnType<typeof vi.fn>).mockResolvedValue('bridge response');

			const result = await callAI({ system: 'sys', user: 'msg' });
			expect(result).toBe('bridge response');
			expect(sendViaBridge).toHaveBeenCalledWith('sys\n\nmsg', undefined, undefined);
		});

		it('passes abort signal to bridge', async () => {
			(authStore as any).activeTrack = 'bridge';
			(sendViaBridge as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
			const controller = new AbortController();
			await callAI({ system: 'sys', user: 'msg', signal: controller.signal });
			expect(sendViaBridge).toHaveBeenCalledWith('sys\n\nmsg', undefined, controller.signal);
		});

		it('delegates to webllm when track is webgpu', async () => {
			(authStore as any).activeTrack = 'webgpu';
			(webllmGenerate as ReturnType<typeof vi.fn>).mockResolvedValue('local model response');

			const result = await callAI({ system: 'sys', user: 'msg' });
			expect(result).toBe('local model response');
			expect(webllmGenerate).toHaveBeenCalledWith('sys', 'msg', undefined);
		});

		it('passes abort signal to webllm', async () => {
			(authStore as any).activeTrack = 'webgpu';
			(webllmGenerate as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
			const controller = new AbortController();
			await callAI({ system: 'sys', user: 'msg', signal: controller.signal });
			expect(webllmGenerate).toHaveBeenCalledWith('sys', 'msg', controller.signal);
		});

		it('calls demo URL when track is edge', async () => {
			(authStore as any).activeTrack = 'edge';
			const mockResponse = {
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: 'demo response' }] } }]
					})
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const result = await callAI({ system: 'sys', user: 'msg' });
			expect(result).toBe('demo response');
			expect(fetch).toHaveBeenCalledWith(
				'https://demo.test',
				expect.objectContaining({
					method: 'POST'
				})
			);
		});

		it('posts the demo body the analyze modal measures', async () => {
			(authStore as any).activeTrack = 'edge';
			global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
			const prompt = { system: 'sys "quoted"', user: '{"files":[]}' };

			await callAI(prompt);

			const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
			expect(body).toBe(demoRequestBody(prompt));
		});

		it('calls proxy URL for anthropic byok', async () => {
			(authStore as any).activeTrack = 'byok';
			(settingsStore as any).aiProvider = 'anthropic';
			(settingsStore as any).anthropicApiKey = 'sk-test';
			const mockResponse = {
				ok: true,
				json: () => Promise.resolve({ text: 'claude response' })
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const result = await callAI({ system: 'sys', user: 'msg' });
			expect(result).toBe('claude response');
			expect(fetch).toHaveBeenCalledWith(
				'https://proxy.test',
				expect.objectContaining({
					method: 'POST'
				})
			);
		});

		it('calls gemini directly for google byok', async () => {
			(authStore as any).activeTrack = 'byok';
			(settingsStore as any).aiProvider = 'google';
			(settingsStore as any).geminiApiKey = 'test-key';
			const mockResponse = {
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: 'gemini response' }] } }]
					})
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const result = await callAI({ system: 'sys', user: 'msg' });
			expect(result).toBe('gemini response');
			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining('generativelanguage.googleapis.com'),
				expect.any(Object)
			);
		});

		it('turns a failed demo response into a demo-unavailable error', async () => {
			// Regression: depleted demo credits surfaced as a bare "Gemini API error: 402"
			(authStore as any).activeTrack = 'edge';
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 402,
				json: () => Promise.resolve({ error: 'Gemini API error: 402' })
			});

			await expect(callAI({ system: 'sys', user: 'msg' })).rejects.toThrow(
				'Demo unavailable (Gemini API error: 402)'
			);
		});

		it('throws on proxy worker HTTP error', async () => {
			(authStore as any).activeTrack = 'byok';
			(settingsStore as any).aiProvider = 'anthropic';
			(settingsStore as any).anthropicApiKey = 'sk-test';
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: () => Promise.resolve({ error: 'Invalid API key' })
			});

			await expect(callAI({ system: 'sys', user: 'msg' })).rejects.toThrow('Invalid API key');
		});

		it('passes abort signal to fetch', async () => {
			(authStore as any).activeTrack = 'edge';
			const controller = new AbortController();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
			});

			await callAI({ system: 'sys', user: 'msg', signal: controller.signal });
			expect(fetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ signal: controller.signal })
			);
		});
	});

	describe('isTrackReady', () => {
		it('returns false when not ready', () => {
			(authStore as any).isReady = false;
			expect(isTrackReady()).toBe(false);
		});

		it('returns true when ready', () => {
			(authStore as any).isReady = true;
			expect(isTrackReady()).toBe(true);
		});
	});

	describe('getActiveTrack', () => {
		it('returns current active track', () => {
			(authStore as any).activeTrack = 'edge';
			expect(getActiveTrack()).toBe('edge');
		});
	});

	describe('demoFailureMessage', () => {
		it('keeps the per-IP minute limit retryable', () => {
			expect(demoFailureMessage(429, 'demo_rate_limited')).toMatch(/^Demo rate limit exceeded/);
			// older workers sent this text instead of a code
			expect(demoFailureMessage(429, 'Rate limit exceeded. Try again in a minute.')).toMatch(
				/^Demo rate limit exceeded/
			);
		});

		it('reports every other failure as unavailable', () => {
			expect(demoFailureMessage(429, 'demo_daily_limit')).toBe(
				'Demo unavailable (demo_daily_limit)'
			);
			expect(demoFailureMessage(503, 'demo_upstream_quota')).toBe(
				'Demo unavailable (demo_upstream_quota)'
			);
			expect(demoFailureMessage(500)).toBe('Demo unavailable (HTTP 500)');
		});
	});
});
