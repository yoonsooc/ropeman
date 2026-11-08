import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/demo';

const ORIGIN = 'https://ropeman.dev';

function env(overrides: Record<string, string> = {}) {
	return {
		GEMINI_API_KEY: 'test-key',
		ALLOWED_ORIGINS: ORIGIN,
		RATE_LIMIT_PER_MIN: '100',
		DAILY_LIMIT_TOTAL: '100000',
		DEMO_MODEL: 'model-a,model-b',
		...overrides,
	};
}

// Each test gets its own IP: the per-IP limiter is module state and survives between tests
let ipCounter = 0;
function demoRequest(body: unknown, init: { origin?: string; ip?: string } = {}) {
	ipCounter += 1;
	return new Request('https://demo.ropeman.dev/', {
		method: 'POST',
		headers: {
			Origin: init.origin ?? ORIGIN,
			'Content-Type': 'application/json',
			'CF-Connecting-IP': init.ip ?? `10.0.0.${ipCounter}`,
		},
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

const prompt = { messages: [{ role: 'user', content: 'hi' }] };

function geminiOk(text: string) {
	return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
		status: 200,
	});
}

function modelOf(url: string) {
	return url.match(/models\/([^:]+):generateContent/)?.[1];
}

describe('demo worker', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('rejects requests from other origins', async () => {
		const response = await worker.fetch(demoRequest(prompt, { origin: 'https://evil.test' }), env());
		expect(response.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('answers 400 for a body that is not JSON or has no messages', async () => {
		expect((await worker.fetch(demoRequest('not json'), env())).status).toBe(400);
		expect((await worker.fetch(demoRequest({ system: 'x' }), env())).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('falls back to the next model when the first is overloaded', async () => {
		// Arrange: the 2026-11-08 case, first model answers 503 "high demand"
		fetchMock.mockImplementation(async (url: string) =>
			modelOf(url) === 'model-a' ? new Response('high demand', { status: 503 }) : geminiOk('OK'),
		);

		// Act
		const response = await worker.fetch(demoRequest(prompt), env());

		// Assert
		expect(response.status).toBe(200);
		expect((await response.json()).candidates[0].content.parts[0].text).toBe('OK');
		expect(fetchMock.mock.calls.map(([url]) => modelOf(url))).toEqual(['model-a', 'model-b']);
	});

	it('falls back when a model holds the request past the per-model wait', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation((url: string) =>
			modelOf(url) === 'model-a' ? new Promise(() => {}) : Promise.resolve(geminiOk('late OK')),
		);

		const pending = worker.fetch(demoRequest(prompt), env());
		await vi.advanceTimersByTimeAsync(40_000);
		const response = await pending;

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('stops at a non-retryable status and never forwards the upstream body', async () => {
		// Regression: the demo used to pass Google's billing message straight to the page
		fetchMock.mockResolvedValue(new Response('Your prepayment credits are depleted. project 1234', { status: 402 }));

		const response = await worker.fetch(demoRequest(prompt), env());
		const text = await response.text();

		expect(response.status).toBe(503);
		expect(JSON.parse(text)).toEqual({ error: 'demo_unavailable', upstreamStatus: 402 });
		expect(text).not.toContain('prepayment');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports quota when every model is rate limited', async () => {
		fetchMock.mockImplementation(async () => new Response('quota', { status: 429 }));

		const response = await worker.fetch(demoRequest(prompt), env());

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'demo_upstream_quota', upstreamStatus: 429 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('limits each IP per minute with a code the app can tell apart', async () => {
		fetchMock.mockImplementation(async () => geminiOk('OK'));
		const limited = env({ RATE_LIMIT_PER_MIN: '1' });

		await worker.fetch(demoRequest(prompt, { ip: '192.0.2.7' }), limited);
		const second = await worker.fetch(demoRequest(prompt, { ip: '192.0.2.7' }), limited);

		expect(second.status).toBe(429);
		expect((await second.json()).error).toBe('demo_rate_limited');
	});
});
