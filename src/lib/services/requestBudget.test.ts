import { describe, it, expect } from 'vitest';
import {
	byokBudget,
	byteLength,
	demoBudget,
	demoRequestBody,
	DEMO_MAX_BODY_BYTES,
	estimateTokens,
	OUTPUT_RESERVE_TOKENS,
	type Prompt
} from './requestBudget';
import { FALLBACK_CONTEXT_TOKENS } from '$lib/data/aiProviders';

const SYSTEM = 'You are a software architect. '.repeat(100);

/** A prompt whose user part is a skeleton-like JSON string of about `bytes` bytes. */
function promptOf(bytes: number, system = SYSTEM): Prompt {
	const entry = '{"path":"src/a.ts","symbols":[{"name":"run","kind":"function"}]},';
	const files = entry.repeat(Math.ceil(bytes / entry.length));
	return { system, user: `Analyze this project:\n\n{"files":[${files.slice(0, bytes)}]}` };
}

describe('demoBudget', () => {
	it('measures the request body, which JSON escaping makes larger than the skeleton', () => {
		// The skeleton fits under the limit, but every quote is escaped in the body
		// (PASEO: 249,195 B skeleton, 285,955 B body)
		const prompt = promptOf(270_000);
		expect(byteLength(prompt.user)).toBeLessThan(DEMO_MAX_BODY_BYTES);

		const result = demoBudget(prompt);

		expect(result.bytes).toBe(byteLength(demoRequestBody(prompt)));
		expect(result.bytes).toBeGreaterThan(DEMO_MAX_BODY_BYTES);
		expect(result.over).toBe(true);
	});

	it('does not warn for a small request', () => {
		expect(demoBudget(promptOf(10_000)).over).toBe(false);
	});
});

describe('estimateTokens', () => {
	it('counts the system prompt as well as the user prompt', () => {
		const withSystem = promptOf(100_000);
		const withoutSystem = promptOf(100_000, '');

		expect(estimateTokens(withSystem) - estimateTokens(withoutSystem)).toBe(
			Math.round(byteLength(SYSTEM) / 4)
		);
	});
});

describe('byokBudget', () => {
	it('does not warn for the default Gemini model at 300 KB', () => {
		const result = byokBudget('google', 'gemini-flash-lite-latest', promptOf(300_000));

		expect(result.known).toBe(true);
		expect(result.over).toBe(false);
	});

	it('warns for a 128K-window OpenAI model at 500 KB', () => {
		const result = byokBudget('openai', 'gpt-4o', promptOf(500_000));

		expect(result.limit).toBe(128_000 - OUTPUT_RESERVE_TOKENS.openai);
		expect(result.over).toBe(true);
	});

	it('changes the warning when the provider or model changes', () => {
		const prompt = promptOf(500_000);

		expect(byokBudget('openai', 'gpt-4o', prompt).over).toBe(true);
		expect(byokBudget('openai', 'gpt-5.6-sol', prompt).over).toBe(false);
		expect(byokBudget('google', 'gemini-flash-latest', prompt).over).toBe(false);
		expect(byokBudget('anthropic', 'claude-haiku-4-5', promptOf(900_000)).over).toBe(true);
		expect(byokBudget('anthropic', 'claude-haiku-5-5', promptOf(900_000)).over).toBe(false);
	});

	it.each([
		['google', 'gemini-2.5-pro', 1_048_576],
		['anthropic', 'claude-opus-5-5', 1_000_000],
		['anthropic', 'claude-fable-5-1', 1_000_000],
		['anthropic', 'claude-sonnet-4-6', 1_000_000],
		['anthropic', 'claude-opus-4-5', 200_000],
		['anthropic', 'claude-3-5-haiku-latest', 200_000],
		['openai', 'gpt-6.1-sol', 1_050_000],
		['openai', 'gpt-5.6-luna', 1_050_000],
		['openai', 'gpt-5.2', 400_000],
		['openai', 'gpt-5', 400_000],
		['openai', 'gpt-4.1-mini', 1_047_576],
		['openai', 'gpt-4o-mini', 128_000],
		['openai', 'gpt-4-turbo', 128_000],
		['openai', 'o3', 200_000],
		['openai', 'gpt-4', 8_192],
		['openai', 'gpt-3.5-turbo', 16_385]
	] as const)('takes the %s %s window as %i tokens', (provider, model, window) => {
		const result = byokBudget(provider, model, promptOf(1_000));

		expect(result.window).toBe(window);
		expect(result.limit).toBe(window - OUTPUT_RESERVE_TOKENS[provider]);
	});

	it('assumes the fallback window for a model it does not know, and says so', () => {
		const result = byokBudget('openai', 'some-new-model', promptOf(1_000));

		expect(result.known).toBe(false);
		expect(result.window).toBe(FALLBACK_CONTEXT_TOKENS);
	});
});
