/**
 * Size checks for an analysis request before it is sent: the demo's request body in bytes,
 * and a BYOK prompt in tokens against the selected model's context window.
 */

import { contextWindowFor } from '$lib/data/aiProviders';
import type { AIProviderId } from '$lib/stores/settingsStore.svelte';

export interface Prompt {
	system: string;
	user: string;
}

/**
 * Bytes of prompt per model token, for the approximate count shown before analysis.
 * OpenAI's o200k_base tokenizer counted PASEO's 249,195-byte skeleton as 59,996 tokens,
 * 4.2 bytes each (2026-11-12). Gemini and Claude tokenizers differ, so it is a rough guide.
 */
const BYTES_PER_TOKEN = 4;

/**
 * Output tokens each BYOK path asks for, which the context window must leave room for.
 * Gemini is called from aiAdapter.ts; Anthropic (max_tokens) and OpenAI
 * (max_completion_tokens) go through edge-proxy/src/proxy.ts.
 */
export const OUTPUT_RESERVE_TOKENS: Record<AIProviderId, number> = {
	google: 16_384,
	anthropic: 4_096,
	openai: 16_384
};

/**
 * Demo request body above which the request is likely to fail. Not measured. The demo proxy
 * gives each Gemini model 40 s (MODEL_TIMEOUT_MS in edge-proxy/src/demo.ts), and the default
 * 250 KB skeleton is the largest size the app ships with. JSON escaping and the system prompt
 * add about 15% on top of the skeleton (PASEO: 249,195 B skeleton, 285,955 B body), so the
 * limit leaves the default skeleton room.
 */
export const DEMO_MAX_BODY_BYTES = 300_000;

/** The exact body the demo track posts. aiAdapter sends this string, so measuring it is exact. */
export function demoRequestBody(prompt: Prompt): string {
	return JSON.stringify({
		messages: [{ role: 'user', content: prompt.user }],
		system: prompt.system
	});
}

export function byteLength(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}

export function estimateTokens(prompt: Prompt): number {
	return Math.round((byteLength(prompt.system) + byteLength(prompt.user)) / BYTES_PER_TOKEN);
}

export function demoBudget(prompt: Prompt): { bytes: number; limit: number; over: boolean } {
	const bytes = byteLength(demoRequestBody(prompt));
	return { bytes, limit: DEMO_MAX_BODY_BYTES, over: bytes > DEMO_MAX_BODY_BYTES };
}

export interface ByokBudget {
	tokens: number;
	/** Input tokens the model can take: its context window minus the output reservation. */
	limit: number;
	/** False when the model is missing from the table and a fallback window was assumed. */
	known: boolean;
	window: number;
	over: boolean;
}

export function byokBudget(provider: AIProviderId, model: string, prompt: Prompt): ByokBudget {
	const tokens = estimateTokens(prompt);
	const { tokens: window, known } = contextWindowFor(provider, model);
	const limit = window - OUTPUT_RESERVE_TOKENS[provider];
	return { tokens, limit, known, window, over: tokens > limit };
}
