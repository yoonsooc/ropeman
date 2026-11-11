import { describe, it, expect, beforeEach } from 'vitest';
import { AIErrorType, classifyAIError, getAIErrorInfo } from './ai';
import { i18nStore } from '$lib/stores/i18nStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';

const t = (key: string) => i18nStore.t(key);

describe('classifyAIError', () => {
	// --- Demo failures (regression: the demo showed raw "Gemini API error: 402") ---
	it('classifies a demo failure as DEMO_UNAVAILABLE even when it carries a 402 or 403', () => {
		expect(classifyAIError('Demo unavailable (Gemini API error: 402)')).toBe(
			AIErrorType.DEMO_UNAVAILABLE
		);
		expect(classifyAIError('Demo unavailable (HTTP 403)', 403)).toBe(AIErrorType.DEMO_UNAVAILABLE);
	});

	it('keeps the demo minute limit as RATE_LIMIT', () => {
		expect(classifyAIError('Demo rate limit exceeded. Try again in a minute.')).toBe(
			AIErrorType.RATE_LIMIT
		);
	});

	// --- Network errors ---
	it('classifies "Failed to fetch" as NETWORK_ERROR', () => {
		expect(classifyAIError('Failed to fetch')).toBe(AIErrorType.NETWORK_ERROR);
	});

	it('classifies "NetworkError" as NETWORK_ERROR', () => {
		expect(classifyAIError('NetworkError when attempting to fetch resource')).toBe(
			AIErrorType.NETWORK_ERROR
		);
	});

	it('classifies DNS errors as NETWORK_ERROR', () => {
		expect(classifyAIError('getaddrinfo ENOTFOUND api.example.com')).toBe(
			AIErrorType.NETWORK_ERROR
		);
	});

	it('classifies timeout as NETWORK_ERROR', () => {
		expect(classifyAIError('The operation was aborted due to timeout')).toBe(
			AIErrorType.NETWORK_ERROR
		);
	});

	it('classifies ECONNREFUSED as NETWORK_ERROR', () => {
		expect(classifyAIError('connect ECONNREFUSED 127.0.0.1:443')).toBe(AIErrorType.NETWORK_ERROR);
	});

	// --- Auth errors ---
	it('classifies HTTP 401 by status code as AUTH_ERROR', () => {
		expect(classifyAIError('Some error', 401)).toBe(AIErrorType.AUTH_ERROR);
	});

	it('classifies HTTP 403 by status code as AUTH_ERROR', () => {
		expect(classifyAIError('Forbidden', 403)).toBe(AIErrorType.AUTH_ERROR);
	});

	it('classifies "invalid api key" in message as AUTH_ERROR', () => {
		expect(classifyAIError('Invalid API key provided')).toBe(AIErrorType.AUTH_ERROR);
	});

	it('classifies "API key not valid" as AUTH_ERROR', () => {
		expect(classifyAIError('API key not valid. Please pass a valid API key.')).toBe(
			AIErrorType.AUTH_ERROR
		);
	});

	it('classifies "HTTP 401" in message as AUTH_ERROR', () => {
		expect(classifyAIError('Proxy error: HTTP 401')).toBe(AIErrorType.AUTH_ERROR);
	});

	it('classifies "unauthorized" as AUTH_ERROR', () => {
		expect(classifyAIError('Unauthorized access')).toBe(AIErrorType.AUTH_ERROR);
	});

	it('classifies "permission denied" as AUTH_ERROR', () => {
		expect(classifyAIError('Permission denied for resource')).toBe(AIErrorType.AUTH_ERROR);
	});

	// --- Insufficient quota ---
	it('classifies HTTP 402 as INSUFFICIENT_QUOTA', () => {
		expect(classifyAIError('Payment required', 402)).toBe(AIErrorType.INSUFFICIENT_QUOTA);
	});

	it('classifies "insufficient_quota" in message as INSUFFICIENT_QUOTA', () => {
		expect(classifyAIError('Error: insufficient_quota')).toBe(AIErrorType.INSUFFICIENT_QUOTA);
	});

	it('classifies "billing" in message as INSUFFICIENT_QUOTA', () => {
		expect(classifyAIError('Billing hard limit reached')).toBe(AIErrorType.INSUFFICIENT_QUOTA);
	});

	it('classifies "exceeded your current quota" as INSUFFICIENT_QUOTA', () => {
		expect(classifyAIError('You exceeded your current quota')).toBe(AIErrorType.INSUFFICIENT_QUOTA);
	});

	it('classifies 429 + quota as INSUFFICIENT_QUOTA', () => {
		expect(classifyAIError('Rate limit: quota exceeded', 429)).toBe(AIErrorType.INSUFFICIENT_QUOTA);
	});

	// --- TPM exceeded ---
	it('classifies 429 + token keyword as TPM_EXCEEDED', () => {
		expect(classifyAIError('Rate limit exceeded: too many tokens per minute', 429)).toBe(
			AIErrorType.TPM_EXCEEDED
		);
	});

	it('classifies 429 + TPM as TPM_EXCEEDED', () => {
		expect(classifyAIError('TPM limit reached', 429)).toBe(AIErrorType.TPM_EXCEEDED);
	});

	it('classifies "context length exceeded" without status as TPM_EXCEEDED', () => {
		expect(classifyAIError("This model's maximum context length exceeded")).toBe(
			AIErrorType.TPM_EXCEEDED
		);
	});

	it('classifies "request too large" as TPM_EXCEEDED', () => {
		expect(classifyAIError('Request too large for model')).toBe(AIErrorType.TPM_EXCEEDED);
	});

	// --- Rate limit ---
	it('classifies HTTP 429 without token/quota keywords as RATE_LIMIT', () => {
		expect(classifyAIError('Rate limit exceeded', 429)).toBe(AIErrorType.RATE_LIMIT);
	});

	it('classifies "429" in message without token keywords as RATE_LIMIT', () => {
		expect(classifyAIError('Gemini API error: HTTP 429')).toBe(AIErrorType.RATE_LIMIT);
	});

	it('classifies "rate limit" in message as RATE_LIMIT', () => {
		expect(classifyAIError('Rate limit exceeded, please retry')).toBe(AIErrorType.RATE_LIMIT);
	});

	// --- Unknown ---
	it('classifies unrecognized error as UNKNOWN', () => {
		expect(classifyAIError('Something went wrong')).toBe(AIErrorType.UNKNOWN);
	});

	it('classifies empty message as UNKNOWN', () => {
		expect(classifyAIError('')).toBe(AIErrorType.UNKNOWN);
	});

	it('classifies JSON parse error as UNKNOWN', () => {
		expect(classifyAIError('Unexpected token < in JSON at position 0')).toBe(AIErrorType.UNKNOWN);
	});
});

describe('getAIErrorInfo', () => {
	beforeEach(() => {
		settingsStore.language = 'ko';
	});

	it('returns user-friendly message for TPM_EXCEEDED', () => {
		const info = getAIErrorInfo(AIErrorType.TPM_EXCEEDED, undefined, t);
		expect(info.type).toBe(AIErrorType.TPM_EXCEEDED);
		expect(info.message).toContain('토큰 한도');
		expect(info.actions.length).toBeGreaterThan(0);
	});

	it('returns actions targeting analyze modal for TPM_EXCEEDED', () => {
		const info = getAIErrorInfo(AIErrorType.TPM_EXCEEDED, undefined, t);
		expect(info.actions.some((a) => a.target === 'analyze')).toBe(true);
	});

	it('returns user-friendly message for AUTH_ERROR with action', () => {
		const info = getAIErrorInfo(AIErrorType.AUTH_ERROR, undefined, t);
		expect(info.message).toContain('API Key');
		expect(info.actions.length).toBeGreaterThan(0);
		expect(info.actions[0].target).toBe('analyze');
	});

	it('returns no actions for RATE_LIMIT', () => {
		const info = getAIErrorInfo(AIErrorType.RATE_LIMIT, undefined, t);
		expect(info.actions).toHaveLength(0);
	});

	it('returns no actions for INSUFFICIENT_QUOTA', () => {
		const info = getAIErrorInfo(AIErrorType.INSUFFICIENT_QUOTA, undefined, t);
		expect(info.actions).toHaveLength(0);
	});

	it('returns no actions for NETWORK_ERROR', () => {
		const info = getAIErrorInfo(AIErrorType.NETWORK_ERROR, undefined, t);
		expect(info.actions).toHaveLength(0);
	});

	it('uses raw message for UNKNOWN type when provided', () => {
		const rawMsg = 'Custom error message from API';
		const info = getAIErrorInfo(AIErrorType.UNKNOWN, rawMsg, t);
		expect(info.message).toBe(rawMsg);
	});

	it('uses default message for UNKNOWN type when no raw message', () => {
		const info = getAIErrorInfo(AIErrorType.UNKNOWN, undefined, t);
		expect(info.message).toContain('오류');
	});

	it('returns a new actions array (not shared reference)', () => {
		const info1 = getAIErrorInfo(AIErrorType.TPM_EXCEEDED, undefined, t);
		const info2 = getAIErrorInfo(AIErrorType.TPM_EXCEEDED, undefined, t);
		expect(info1.actions).not.toBe(info2.actions);
	});
});

describe('getAIErrorInfo for the demo', () => {
	beforeEach(() => {
		settingsStore.language = 'ko';
	});

	it('resolves every message and label through i18n', () => {
		for (const type of Object.values(AIErrorType)) {
			const info = getAIErrorInfo(type, undefined, t);
			expect(info.message).not.toMatch(/^aiError\./);
			for (const action of info.actions) expect(action.label).not.toMatch(/^aiError\./);
		}
	});

	it('points to Explore and another AI connection', () => {
		const info = getAIErrorInfo(AIErrorType.DEMO_UNAVAILABLE, undefined, t);
		expect(info.message).toContain('무료 데모');
		expect(info.actions.map((a) => a.target)).toEqual(['explore', 'analyze']);
	});

	it('returns English text when the locale is en', () => {
		settingsStore.language = 'en';
		const info = getAIErrorInfo(AIErrorType.DEMO_UNAVAILABLE, undefined, t);
		expect(info.message).toContain('free demo is unavailable');
		expect(info.actions[0].label).toBe('Open Explore');
	});

	it('still shows the raw message for UNKNOWN in either locale', () => {
		settingsStore.language = 'en';
		expect(getAIErrorInfo(AIErrorType.UNKNOWN, 'boom', t).message).toBe('boom');
	});
});
