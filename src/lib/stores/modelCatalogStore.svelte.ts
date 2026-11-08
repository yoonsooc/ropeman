/**
 * Model list per provider for the BYOK pickers: the provider's own list once a key has
 * been used, otherwise the fallback in aiProviders.ts. Kept for the page session only.
 */

import { getProvider, type AIModel } from '$lib/data/aiProviders';
import { listModels } from '$lib/services/modelCatalogService';

function createModelCatalogStore() {
	let fetched = $state<Record<string, AIModel[]>>({});
	let loading = $state<string | null>(null);
	// Non-reactive: the key each list was fetched with, so reopening a modal does not refetch
	const loadedWith = new Map<string, string>();

	return {
		modelsFor(providerId: string): AIModel[] {
			return fetched[providerId] ?? getProvider(providerId)?.models ?? [];
		},
		isRemote(providerId: string): boolean {
			return providerId in fetched;
		},
		get loading() {
			return loading;
		},
		async load(providerId: string, apiKey: string): Promise<void> {
			if (!apiKey || loadedWith.get(providerId) === apiKey) return;
			loadedWith.set(providerId, apiKey);
			loading = providerId;
			try {
				const models = await listModels(providerId, apiKey);
				// A newer key may have been loaded while this one was in flight; its list wins
				if (loadedWith.get(providerId) !== apiKey) return;
				if (models.length > 0) fetched = { ...fetched, [providerId]: models };
			} catch {
				// Keep the fallback list; the key test reports key problems on its own
				if (loadedWith.get(providerId) === apiKey) loadedWith.delete(providerId);
			} finally {
				if (loading === providerId) loading = null;
			}
		},
		reset() {
			fetched = {};
			loading = null;
			loadedWith.clear();
		}
	};
}

export const modelCatalogStore = createModelCatalogStore();
