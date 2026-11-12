export interface AIModel {
	id: string;
	label: string;
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

/**
 * Context windows in tokens, first match wins. Model lists come from each provider at run
 * time, so families are matched by id. Sources, read 2026-11-12:
 * - Gemini: AI Studio model pages (gemini-3.8-flash, gemini-2.5-pro) give an input limit of
 *   1,048,576. The `-latest` aliases point at those families.
 * - Claude: platform.claude.com/docs/en/about-claude/models/overview. 1M for the 5.x line,
 *   Opus 4.6-4.8 and Sonnet 4.6; 200K for Opus 4.5, Sonnet 4.5, Haiku 4.5 and older.
 * - OpenAI: developers.openai.com/api/docs/models/<id>. gpt-5.5 and gpt-5.6-* 1,050,000,
 *   gpt-5 and gpt-5.2 400,000, gpt-4.1 1,047,576, gpt-4o 128,000, o3 200,000.
 *   gpt-4 (8,192) and gpt-3.5-turbo (16,385) are OpenAI's published figures for those models.
 * gpt-5.1, 5.3 and 5.4 were not checked and take the gpt-5 row, the smaller of the two.
 */
const CONTEXT_WINDOWS: ReadonlyArray<{ provider: string; pattern: RegExp; tokens: number }> = [
	{ provider: 'google', pattern: /^gemini-/, tokens: 1_048_576 },
	{
		provider: 'anthropic',
		pattern: /^claude-(opus|sonnet|haiku|fable|mythos)-5/,
		tokens: 1_000_000
	},
	{ provider: 'anthropic', pattern: /^claude-(opus-4-[6-9]|sonnet-4-6)/, tokens: 1_000_000 },
	{ provider: 'anthropic', pattern: /^claude-/, tokens: 200_000 },
	{ provider: 'openai', pattern: /^gpt-(5\.([5-9]|\d{2})|[6-9])/, tokens: 1_050_000 },
	{ provider: 'openai', pattern: /^gpt-5/, tokens: 400_000 },
	{ provider: 'openai', pattern: /^gpt-4\.1/, tokens: 1_047_576 },
	{ provider: 'openai', pattern: /^(gpt-4o|chatgpt-4o|gpt-4-turbo)/, tokens: 128_000 },
	{ provider: 'openai', pattern: /^o\d/, tokens: 200_000 },
	{ provider: 'openai', pattern: /^gpt-4($|-)/, tokens: 8_192 },
	{ provider: 'openai', pattern: /^gpt-3\.5/, tokens: 16_385 }
];

/** Assumed for a model the table does not know: the smallest window among current chat models. */
export const FALLBACK_CONTEXT_TOKENS = 128_000;

export function contextWindowFor(
	providerId: string,
	modelId: string
): { tokens: number; known: boolean } {
	const row = CONTEXT_WINDOWS.find((r) => r.provider === providerId && r.pattern.test(modelId));
	return row
		? { tokens: row.tokens, known: true }
		: { tokens: FALLBACK_CONTEXT_TOKENS, known: false };
}
