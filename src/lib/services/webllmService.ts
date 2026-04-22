import { webgpuStore } from '$lib/stores/webgpuStore.svelte';

let worker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<
	string,
	{ resolve: (value: string) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL('$lib/workers/webllmWorker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = handleMessage;
	}
	return worker;
}

function handleMessage(e: MessageEvent) {
	const { type, id, payload } = e.data;

	switch (type) {
		case 'init-progress':
			webgpuStore.downloadProgress = payload.progress;
			webgpuStore.downloadStage = payload.stage;
			break;

		case 'init-done':
			webgpuStore.status = 'ready';
			webgpuStore.downloadProgress = 100;
			// Defer promise resolution to break synchronous Svelte reactive chain
			queueMicrotask(() => resolvePending(id, 'ok'));
			break;

		case 'generate-result':
			// Defer to prevent stack overflow from synchronous Svelte effect cascades
			queueMicrotask(() => resolvePending(id, payload.text));
			break;

		case 'error':
			queueMicrotask(() => rejectPending(id, new Error(payload.message)));
			break;

		case 'cancel-ack':
			webgpuStore.reset();
			queueMicrotask(() => resolvePending(id, 'cancelled'));
			break;
	}
}

function resolvePending(id: string, value: string) {
	const pending = pendingRequests.get(id);
	if (pending) {
		pendingRequests.delete(id);
		pending.resolve(value);
	}
}

function rejectPending(id: string, err: Error) {
	const pending = pendingRequests.get(id);
	if (pending) {
		pendingRequests.delete(id);
		pending.reject(err);
	}
}

function sendRequest(type: string, payload?: unknown, signal?: AbortSignal): Promise<string> {
	const id = String(++requestId);
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}
		pendingRequests.set(id, { resolve, reject });
		const onAbort = () => {
			rejectPending(id, new DOMException('Aborted', 'AbortError'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		getWorker().postMessage({ type, id, payload });
	});
}

export async function initModel(modelId?: string): Promise<void> {
	webgpuStore.status = 'downloading';
	webgpuStore.downloadProgress = 0;
	webgpuStore.downloadStage = 'Starting model download...';

	try {
		await sendRequest('init', { modelId: modelId ?? webgpuStore.selectedModelId });
	} catch (err) {
		webgpuStore.status = 'error';
		webgpuStore.errorMessage = err instanceof Error ? err.message : String(err);
		throw err;
	}
}

export async function generate(
	system: string,
	prompt: string,
	signal?: AbortSignal
): Promise<string> {
	return sendRequest('generate', { system, prompt }, signal);
}

export function cancelDownload(): void {
	if (worker) {
		const id = String(++requestId);
		worker.postMessage({ type: 'cancel-download', id });
	}
	webgpuStore.reset();
}

export function checkWebGPUSupport(): boolean {
	return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Check if a specific model is already cached in the browser (Cache API).
 * web-llm stores model weights in 'webllm/model' cache with HuggingFace URLs containing the model ID.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
	if (typeof caches === 'undefined') return false;
	try {
		const cache = await caches.open('webllm/model');
		const keys = await cache.keys();
		// Model ID appears in the HuggingFace URL path, e.g. "mlc-ai/Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC"
		return keys.some((req) => req.url.includes(modelId));
	} catch {
		return false;
	}
}
