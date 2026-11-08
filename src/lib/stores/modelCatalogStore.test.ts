import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/modelCatalogService', () => ({
	listModels: vi.fn()
}));

import { modelCatalogStore } from './modelCatalogStore.svelte';
import { listModels } from '$lib/services/modelCatalogService';
import { getProvider } from '$lib/data/aiProviders';

const mockedList = vi.mocked(listModels);

describe('modelCatalogStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		modelCatalogStore.reset();
	});

	it('falls back to the static list before any key is used', () => {
		expect(modelCatalogStore.modelsFor('anthropic')).toEqual(getProvider('anthropic')?.models);
		expect(modelCatalogStore.isRemote('anthropic')).toBe(false);
	});

	it('replaces the list with the provider response', async () => {
		// Arrange
		mockedList.mockResolvedValue([{ id: 'claude-new', label: 'Claude New' }]);

		// Act
		await modelCatalogStore.load('anthropic', 'sk-1');

		// Assert
		expect(modelCatalogStore.modelsFor('anthropic')).toEqual([
			{ id: 'claude-new', label: 'Claude New' }
		]);
		expect(modelCatalogStore.isRemote('anthropic')).toBe(true);
		expect(modelCatalogStore.loading).toBeNull();
	});

	it('does not refetch for the same key', async () => {
		mockedList.mockResolvedValue([{ id: 'm', label: 'm' }]);

		await modelCatalogStore.load('openai', 'sk-1');
		await modelCatalogStore.load('openai', 'sk-1');

		expect(mockedList).toHaveBeenCalledTimes(1);
	});

	it('keeps the fallback and allows a retry when the request fails', async () => {
		mockedList
			.mockRejectedValueOnce(new Error('HTTP 401'))
			.mockResolvedValueOnce([{ id: 'ok', label: 'ok' }]);

		await modelCatalogStore.load('google', 'key');
		expect(modelCatalogStore.modelsFor('google')).toEqual(getProvider('google')?.models);

		await modelCatalogStore.load('google', 'key');
		expect(modelCatalogStore.modelsFor('google')).toEqual([{ id: 'ok', label: 'ok' }]);
	});

	it('ignores an empty key and an empty result', async () => {
		mockedList.mockResolvedValue([]);

		await modelCatalogStore.load('google', '');
		await modelCatalogStore.load('google', 'key');

		expect(mockedList).toHaveBeenCalledTimes(1);
		expect(modelCatalogStore.isRemote('google')).toBe(false);
	});
});
