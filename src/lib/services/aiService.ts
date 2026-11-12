import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { authStore } from '$lib/stores/authStore.svelte';
import { callAI } from '$lib/services/aiAdapter';
import { buildContext } from '$lib/utils/contextBuilder';
import type { GraphNode } from '$lib/types/graph';
import type { AIResult } from '$lib/types/ai';
import { searchCache, addToCache, initCache } from '$lib/services/cacheService';
import { getEmbedding } from '$lib/services/embeddingService';

function getGeminiEndpoint(model: string): string {
	return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export interface AIResponse {
	content: string;
	relatedNodes: string[];
	fromCache?: boolean;
}

interface GeminiContent {
	role: string;
	parts: { text: string }[];
}

function buildRequestBody(
	message: string,
	systemPrompt: string,
	history: { role: string; content: string }[]
) {
	const contents: GeminiContent[] = [];

	for (const msg of history) {
		contents.push({
			role: msg.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: msg.content }]
		});
	}

	contents.push({
		role: 'user',
		parts: [{ text: message }]
	});

	return {
		system_instruction: {
			parts: [{ text: systemPrompt }]
		},
		contents,
		generationConfig: {
			temperature: 0.7,
			topP: 0.9,
			maxOutputTokens: 2048
		}
	};
}

export async function sendMessage(
	message: string,
	nodeContext: GraphNode | null,
	history: { role: string; content: string }[] = []
): Promise<AIResult<AIResponse>> {
	const track = authStore.activeTrack;

	if (track === 'none') {
		return {
			ok: false,
			error: 'AI not connected. Please set up an API key.',
			code: 'NO_TRACK'
		};
	}

	// Non-Gemini BYOK tracks: delegate to AI adapter
	if (
		track === 'webgpu' ||
		track === 'edge' ||
		(track === 'byok' && settingsStore.aiProvider === 'anthropic') ||
		(track === 'byok' && settingsStore.aiProvider === 'openai')
	) {
		try {
			const contextPrefix = nodeContext
				? `[Context: ${nodeContext.label} (${nodeContext.kind}) in ${nodeContext.filePath}]\n\n`
				: '';
			const content = await callAI({
				system: buildContext(nodeContext),
				user: contextPrefix + message
			});
			return {
				ok: true,
				data: {
					content: content || 'No response received.',
					relatedNodes: nodeContext ? [nodeContext.id] : []
				}
			};
		} catch (error) {
			return {
				ok: false,
				error: (error as Error).message,
				code: 'AI_ERROR'
			};
		}
	}

	// BYOK track: Gemini REST API (with cache + retry)
	const apiKey = settingsStore.geminiApiKey;
	const model =
		settingsStore.aiProvider === 'google' ? settingsStore.aiModel : 'gemini-flash-lite-latest';
	const endpoint = getGeminiEndpoint(model);

	// Cache lookup (only for first messages without history for simplicity)
	// Chat cache is always-on (independent of settingsStore.cacheEnabled which controls semantic cache)
	if (history.length === 0) {
		try {
			await initCache();
			const embedding = await getEmbedding(message);
			if (embedding) {
				const cached = await searchCache(message, embedding);
				if (cached) {
					return {
						ok: true,
						data: {
							content: cached.response,
							relatedNodes: cached.nodeId ? [cached.nodeId] : [],
							fromCache: true
						}
					};
				}
			}
		} catch {
			// cache miss, proceed to API
		}
	}

	const systemPrompt = buildContext(nodeContext);
	const body = buildRequestBody(message, systemPrompt, history);
	const maxRetries = 3;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await fetch(`${endpoint}?key=${apiKey}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (response.status === 429) {
				const waitMs = Math.pow(2, attempt) * 1000;
				await new Promise((resolve) => setTimeout(resolve, waitMs));
				continue;
			}

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const errorMessage =
					(errorData as { error?: { message?: string } })?.error?.message ||
					`HTTP ${response.status}`;
				throw new Error(`Gemini API error: ${errorMessage}`);
			}

			const data = await response.json();
			const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
			const relatedNodes = nodeContext ? [nodeContext.id] : [];

			// Store in chat cache (always-on)
			if (history.length === 0) {
				try {
					const embedding = await getEmbedding(message);
					if (embedding) {
						await addToCache(
							nodeContext?.id ?? '',
							message,
							content,
							nodeContext?.code ?? '',
							embedding
						);
					}
				} catch {
					// cache write failed, non-critical
				}
			}

			return { ok: true, data: { content, relatedNodes } };
		} catch (error) {
			if (attempt === maxRetries - 1) {
				return {
					ok: false,
					error: (error as Error).message,
					code: 'GEMINI_ERROR'
				};
			}
		}
	}

	return {
		ok: false,
		error: 'Rate limit exceeded. Please try again later.',
		code: 'RATE_LIMIT'
	};
}
