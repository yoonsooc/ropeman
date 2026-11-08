export interface AIModel {
	id: string;
	label: string;
	contextWindow?: number;
}

export interface AIProvider {
	id: string;
	label: string;
	models: AIModel[];
	requiresBridge?: boolean;
}

/**
 * Fallback lists shown before a key is entered or when the provider's model list cannot
 * be fetched. With a key, modelCatalogStore replaces them with what the provider serves.
 * Gemini uses Google's `-latest` aliases so the fallback does not go stale.
 */
export const AI_PROVIDERS: AIProvider[] = [
	{
		id: 'google',
		label: 'Google Gemini',
		models: [
			{ id: 'gemini-flash-latest', label: 'Gemini Flash (latest)' },
			{ id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (latest)' }
		]
	},
	{
		id: 'anthropic',
		label: 'Anthropic Claude',
		requiresBridge: true,
		models: [
			{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
			{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
			{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
			{ id: 'claude-fable-5-1', label: 'Claude Fable 5.1' }
		]
	},
	{
		id: 'openai',
		label: 'OpenAI',
		models: [
			{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
			{ id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
			{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }
		]
	}
];

export function getProvider(providerId: string): AIProvider | undefined {
	return AI_PROVIDERS.find((p) => p.id === providerId);
}

export function getDefaultModel(providerId: string): string {
	const provider = getProvider(providerId);
	return provider?.models[0]?.id ?? '';
}
