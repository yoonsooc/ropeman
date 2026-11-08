/**
 * Model lists fetched with the user's own key, so the model picker follows what each
 * provider serves today instead of a list frozen in the code.
 *
 * Gemini allows browser calls, so it is asked directly. Anthropic and OpenAI lists go
 * through the proxy worker, the same path their generation requests already take.
 */

import { PROXY_URL } from '$lib/config';
import type { AIModel } from '$lib/data/aiProviders';

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_MODELS = 20;

/** Model ids that cannot answer a plain text prompt (media, embeddings, agents, search). */
const NOT_TEXT_CHAT =
	/embedding|tts|audio|image|realtime|transcribe|moderation|search|aqa|live|robotics|computer-use|codex|instruct/i;
/** OpenAI pinned snapshots such as gpt-4o-2024-08-06 or gpt-4-0613; the aliases are enough. */
const DATED_SNAPSHOT = /-\d{4}-\d{2}-\d{2}$|-\d{4}$/;
/** OpenAI models served only by the Responses API; the proxy calls /chat/completions. */
const RESPONSES_ONLY = /-pro\b|deep-research/;
/**
 * The first entry becomes the default when the provider changes. Flash first: it has the
 * largest free-tier quota, which matters for keys without billing.
 */
const GEMINI_ALIAS_ORDER = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];

export interface GeminiModel {
	name: string;
	displayName?: string;
	supportedGenerationMethods?: string[];
}

/** Shape the proxy worker returns for Anthropic and OpenAI. */
export interface RemoteModel {
	id: string;
	label?: string;
	created?: number;
}

export function pickGeminiModels(models: GeminiModel[]): AIModel[] {
	return models
		.filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
		.map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
		.filter((m) => m.id.startsWith('gemini') && !NOT_TEXT_CHAT.test(m.id))
		.sort((a, b) => {
			// Known aliases in a fixed order, then newer versions before older ones
			const rank = (id: string) => {
				const i = GEMINI_ALIAS_ORDER.indexOf(id);
				return i === -1 ? GEMINI_ALIAS_ORDER.length : i;
			};
			return rank(a.id) - rank(b.id) || b.id.localeCompare(a.id, undefined, { numeric: true });
		})
		.slice(0, MAX_MODELS);
}

export function pickOpenAIModels(models: RemoteModel[]): AIModel[] {
	return models
		.filter(
			(m) =>
				/^(gpt-|o\d|chatgpt-)/.test(m.id) &&
				!NOT_TEXT_CHAT.test(m.id) &&
				!DATED_SNAPSHOT.test(m.id) &&
				!RESPONSES_ONLY.test(m.id)
		)
		.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
		.slice(0, MAX_MODELS)
		.map((m) => ({ id: m.id, label: m.id }));
}

export function pickAnthropicModels(models: RemoteModel[]): AIModel[] {
	// The API already returns newest first
	return models
		.filter((m) => m.id.startsWith('claude'))
		.slice(0, MAX_MODELS)
		.map((m) => ({ id: m.id, label: m.label || m.id }));
}

export async function listModels(
	provider: string,
	apiKey: string,
	signal?: AbortSignal
): Promise<AIModel[]> {
	if (provider === 'google') {
		const url = `${GEMINI_MODELS_URL}?pageSize=1000&key=${encodeURIComponent(apiKey)}`;
		const response = await fetch(url, { signal });
		if (!response.ok) throw new Error(`Model list failed: HTTP ${response.status}`);
		const data = (await response.json()) as { models?: GeminiModel[] };
		return pickGeminiModels(data.models ?? []);
	}

	const response = await fetch(PROXY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		signal,
		body: JSON.stringify({ action: 'models', provider, apiKey })
	});
	if (!response.ok) throw new Error(`Model list failed: HTTP ${response.status}`);
	const data = (await response.json()) as { models?: RemoteModel[] };
	const models = data.models ?? [];
	return provider === 'openai' ? pickOpenAIModels(models) : pickAnthropicModels(models);
}
