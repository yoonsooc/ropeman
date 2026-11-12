import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/stores/authStore.svelte', () => ({
	authStore: { activeTrack: 'byok' }
}));

vi.mock('$lib/stores/architectureStore.svelte', () => ({
	architectureStore: {
		isAnalyzing: false,
		groups: [],
		enabled: false
	}
}));

vi.mock('$lib/stores/settingsStore.svelte', () => ({
	settingsStore: { geminiApiKey: 'test-key' }
}));

vi.mock('$lib/stores/graphStore.svelte', () => ({
	graphStore: {
		nodes: [{ id: 'node:src/main.ts' }, { id: 'node:src/utils.ts' }, { id: 'node:src/api.ts' }]
	}
}));

vi.mock('$lib/stores/projectStore.svelte', () => ({
	projectStore: {
		projectName: 'test-project',
		fileTree: { name: 'root', kind: 'directory', path: '', children: [] },
		astMap: new Map()
	}
}));

vi.mock('./skeletonExtractor', () => ({
	extractSkeleton: vi.fn(() => ({
		files: [{ path: 'src/main.ts' }]
	})),
	formatPayloadPreview: vi.fn(() => 'skeleton preview')
}));

import { analyzeArchitecture } from './architectureService';
import { authStore } from '$lib/stores/authStore.svelte';
import { architectureStore } from '$lib/stores/architectureStore.svelte';

describe('architectureService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(authStore as any).activeTrack = 'byok';
		(architectureStore as any).isAnalyzing = false;
		(architectureStore as any).groups = [];
		(architectureStore as any).enabled = false;
	});

	describe('analyzeArchitecture', () => {
		it('skips if already analyzing', async () => {
			(architectureStore as any).isAnalyzing = true;

			await analyzeArchitecture();

			// Should remain in analyzing state (early return, no reset)
			expect(architectureStore.isAnalyzing).toBe(true);
		});

		it('calls Gemini API for byok track', async () => {
			const groupsResponse = JSON.stringify([{ name: 'API Layer', nodeIds: ['node:src/api.ts'] }]);
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: groupsResponse }] } }]
					})
			});

			await analyzeArchitecture();

			expect(fetch).toHaveBeenCalled();
			expect(architectureStore.groups).toEqual([
				expect.objectContaining({
					name: 'API Layer',
					nodeIds: ['node:src/api.ts']
				})
			]);
		});

		it('filters out groups with no valid nodes', async () => {
			const response = JSON.stringify([
				{ name: 'Valid', nodeIds: ['node:src/main.ts'] },
				{ name: 'Invalid', nodeIds: ['node:nonexistent.ts'] }
			]);
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: response }] } }]
					})
			});

			await analyzeArchitecture();

			expect(architectureStore.groups).toHaveLength(1);
			expect(architectureStore.groups[0].name).toBe('Valid');
		});

		it('handles API error gracefully', async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

			await analyzeArchitecture();

			expect(architectureStore.groups).toEqual([]);
			expect(architectureStore.isAnalyzing).toBe(false);
		});

		it('handles non-connected track', async () => {
			(authStore as any).activeTrack = 'none';

			await analyzeArchitecture();

			expect(architectureStore.groups).toEqual([]);
		});

		it('resets isAnalyzing on completion', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						candidates: [{ content: { parts: [{ text: '[]' }] } }]
					})
			});

			await analyzeArchitecture();

			expect(architectureStore.isAnalyzing).toBe(false);
		});
	});
});
