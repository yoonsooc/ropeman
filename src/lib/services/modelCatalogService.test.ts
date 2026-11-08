import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/config', () => ({
	PROXY_URL: 'https://proxy.test'
}));

import {
	listModels,
	pickAnthropicModels,
	pickGeminiModels,
	pickOpenAIModels
} from './modelCatalogService';

describe('modelCatalogService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('pickGeminiModels', () => {
		it('keeps text models that support generateContent, aliases first', () => {
			// Arrange
			const models = [
				{
					name: 'models/gemini-2.5-flash',
					displayName: 'Gemini 2.5 Flash',
					supportedGenerationMethods: ['generateContent']
				},
				{ name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
				{
					name: 'models/gemini-2.5-flash-preview-tts',
					supportedGenerationMethods: ['generateContent']
				},
				{
					name: 'models/gemini-flash-latest',
					displayName: 'Gemini Flash Latest',
					supportedGenerationMethods: ['generateContent']
				},
				{
					name: 'models/gemini-3.1-pro',
					displayName: 'Gemini 3.1 Pro',
					supportedGenerationMethods: ['generateContent']
				},
				{ name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] }
			];

			// Act
			const picked = pickGeminiModels(models);

			// Assert
			expect(picked.map((m) => m.id)).toEqual([
				'gemini-flash-latest',
				'gemini-3.1-pro',
				'gemini-2.5-flash'
			]);
			expect(picked[0].label).toBe('Gemini Flash Latest');
		});
	});

	describe('pickOpenAIModels', () => {
		it('drops media, embedding and dated snapshot ids, newest first', () => {
			const models = [
				{ id: 'gpt-4o-mini', created: 100 },
				{ id: 'gpt-4o-mini-2024-07-18', created: 101 },
				{ id: 'gpt-5.6-terra', created: 300 },
				{ id: 'gpt-image-1', created: 250 },
				{ id: 'text-embedding-3-large', created: 200 },
				{ id: 'gpt-realtime', created: 260 },
				{ id: 'gpt-4-0613', created: 50 },
				{ id: 'o4-mini', created: 150 },
				{ id: 'whisper-1', created: 10 }
			];

			const picked = pickOpenAIModels(models);

			expect(picked.map((m) => m.id)).toEqual(['gpt-5.6-terra', 'o4-mini', 'gpt-4o-mini']);
		});
	});

	describe('pickAnthropicModels', () => {
		it('keeps the API order and the display name', () => {
			const picked = pickAnthropicModels([
				{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
				{ id: 'claude-haiku-5-5' }
			]);

			expect(picked).toEqual([
				{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
				{ id: 'claude-haiku-5-5', label: 'claude-haiku-5-5' }
			]);
		});
	});

	describe('listModels', () => {
		it('asks Google directly for Gemini with the key in the query', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						models: [
							{
								name: 'models/gemini-flash-latest',
								supportedGenerationMethods: ['generateContent']
							}
						]
					})
			});

			const models = await listModels('google', 'k/ey');

			expect(models.map((m) => m.id)).toEqual(['gemini-flash-latest']);
			const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
			expect(url).toContain('generativelanguage.googleapis.com/v1beta/models');
			expect(url).toContain('key=k%2Fey');
		});

		it('asks the proxy worker for OpenAI and filters the result', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						models: [
							{ id: 'gpt-5.6-luna', created: 2 },
							{ id: 'dall-e-3', created: 3 }
						]
					})
			});

			const models = await listModels('openai', 'sk-test');

			expect(models.map((m) => m.id)).toEqual(['gpt-5.6-luna']);
			expect(fetch).toHaveBeenCalledWith(
				'https://proxy.test',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ action: 'models', provider: 'openai', apiKey: 'sk-test' })
				})
			);
		});

		it('throws when the provider rejects the key', async () => {
			global.fetch = vi
				.fn()
				.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });

			await expect(listModels('anthropic', 'bad')).rejects.toThrow('HTTP 401');
		});
	});
});
