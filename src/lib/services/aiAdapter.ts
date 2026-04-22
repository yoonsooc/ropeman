/**
 * AI Track Adapter — 단일 진입점으로 track별 분기를 캡슐화
 *
 * aiService.ts와 semanticAnalysisService.ts의 중복 분기(AP-3)를 해소.
 * 각 track의 호출 방식을 어댑터로 추상화.
 */

import { authStore, type AuthTrack } from '$lib/stores/authStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { sendViaBridge } from '$lib/services/bridgeService';
import { generate as webllmGenerate } from '$lib/services/webllmService';
import { DEMO_URL, PROXY_URL } from '$lib/config';

// --- 공통 타입 ---

export interface AICallOptions {
	system: string;
	user: string;
	signal?: AbortSignal;
}

/**
 * HTTP 상태 코드를 포함하는 에러.
 * 에러 유형 분류 시 classifyAIError에 httpStatus를 전달할 수 있도록 함.
 */
export class AIHttpError extends Error {
	httpStatus: number;
	constructor(message: string, httpStatus: number) {
		super(message);
		this.name = 'AIHttpError';
		this.httpStatus = httpStatus;
	}
}

// --- Track별 구현 ---

async function callBridge(opts: AICallOptions): Promise<string> {
	const cli = settingsStore.bridgeCli === 'auto' ? undefined : settingsStore.bridgeCli;
	return await sendViaBridge(opts.system + '\n\n' + opts.user, cli, opts.signal);
}

/** WebGPU 소형 모델의 대략적 토큰 한계 (char 기준, ~4 chars/token) */
const WEBGPU_MAX_INPUT_CHARS = 12000; // ~3000 tokens, 4096 context - 1024 output reserve

async function callWebGPU(opts: AICallOptions): Promise<string> {
	const inputLen = (opts.system?.length ?? 0) + (opts.user?.length ?? 0);
	if (inputLen > WEBGPU_MAX_INPUT_CHARS) {
		throw new Error(
			`Input too large for local model (${Math.round(inputLen / 1000)}KB). ` +
				`Browser AI supports ~${Math.round(WEBGPU_MAX_INPUT_CHARS / 1000)}KB max. ` +
				`Reduce code summary size in Settings or use a cloud API (Demo/API Key).`
		);
	}
	return await webllmGenerate(opts.system, opts.user, opts.signal);
}

async function callEdgeProxy(opts: AICallOptions): Promise<string> {
	const response = await fetch(DEMO_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		signal: opts.signal,
		body: JSON.stringify({
			messages: [{ role: 'user', content: opts.user }],
			system: opts.system
		})
	});

	if (!response.ok) {
		const errData = await response.json().catch(() => ({}));
		throw new AIHttpError(
			(errData as { error?: string }).error || `Edge proxy error: HTTP ${response.status}`,
			response.status
		);
	}

	const data = await response.json();
	return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callProxyWorker(
	provider: string,
	apiKey: string,
	model: string,
	opts: AICallOptions
): Promise<string> {
	if (!apiKey) throw new Error(`No ${provider} API key`);

	const response = await fetch(PROXY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		signal: opts.signal,
		body: JSON.stringify({
			provider,
			apiKey,
			model,
			messages: [{ role: 'user', content: opts.user }],
			system: opts.system
		})
	});

	if (!response.ok) {
		const errData = await response.json().catch(() => ({}));
		throw new AIHttpError(
			(errData as { error?: string }).error || `Proxy error: HTTP ${response.status}`,
			response.status
		);
	}

	const data = await response.json();
	return (data as { text?: string }).text || '';
}

async function callGeminiDirect(opts: AICallOptions): Promise<string> {
	const apiKey = settingsStore.geminiApiKey;
	const model = settingsStore.aiModel;
	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

	const contents = [
		{
			role: 'user',
			parts: [{ text: opts.user }]
		}
	];

	const body: Record<string, unknown> = {
		contents,
		generationConfig: { maxOutputTokens: 16384 },
		system_instruction: { parts: [{ text: opts.system }] }
	};

	const response = await fetch(`${endpoint}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		signal: opts.signal,
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errData = await response.json().catch(() => ({}));
		const msg =
			(errData as { error?: { message?: string } })?.error?.message || `HTTP ${response.status}`;
		throw new AIHttpError(`Gemini API error: ${msg}`, response.status);
	}

	const data = await response.json();
	return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// --- 공개 API ---

/**
 * 현재 activeTrack에 맞는 AI 호출을 수행한다.
 * 모든 track 분기를 여기서 처리하므로 호출자는 track을 알 필요 없음.
 */
export async function callAI(opts: AICallOptions): Promise<string> {
	const track = authStore.activeTrack;

	switch (track) {
		case 'bridge':
			return callBridge(opts);
		case 'webgpu':
			return callWebGPU(opts);
		case 'edge':
			return callEdgeProxy(opts);
		case 'byok':
			if (settingsStore.aiProvider === 'anthropic') {
				return callProxyWorker(
					'anthropic',
					settingsStore.anthropicApiKey,
					settingsStore.aiModel,
					opts
				);
			}
			if (settingsStore.aiProvider === 'openai') {
				return callProxyWorker('openai', settingsStore.openaiApiKey, settingsStore.aiModel, opts);
			}
			return callGeminiDirect(opts);
		default:
			throw new Error('AI not connected');
	}
}

/**
 * 현재 track이 AI 호출 가능한 상태인지 확인
 */
export function isTrackReady(): boolean {
	return authStore.isReady;
}

/**
 * 현재 활성 track 반환
 */
export function getActiveTrack(): AuthTrack {
	return authStore.activeTrack;
}
