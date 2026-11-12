import type { FileNode } from '$lib/types/fileTree';
import type { ParsedFile } from '$lib/workers/grammarParser';
import { MAX_FILE_SIZE, MAX_TOTAL_SIZE, MAX_FILES } from '$lib/utils/filePriority';
import {
	parseSource,
	parseSources,
	supportedFiles,
	type ParseProgress,
	type ParseResult
} from './sourceExtraction';

interface ParseRequest {
	filePath: string;
	content: string;
	language: string;
	priority: number;
	resolve: (parsed: ParsedFile) => void;
	reject: (err: Error) => void;
}

let worker: Worker | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
const pendingRequests = new Map<string, ParseRequest>();

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL('$lib/workers/parserWorker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = handleWorkerMessage;
	}
	return worker;
}

function handleWorkerMessage(e: MessageEvent) {
	const msg = e.data;

	if (msg.type === 'init-done') {
		initialized = true;
		return;
	}

	if (msg.type === 'parse-result') {
		const req = pendingRequests.get(msg.filePath);
		if (req) {
			pendingRequests.delete(msg.filePath);
			req.resolve({ symbols: msg.symbols, refs: msg.refs });
		}
		return;
	}

	if (msg.type === 'error') {
		if (msg.filePath) {
			const req = pendingRequests.get(msg.filePath);
			if (req) {
				pendingRequests.delete(msg.filePath);
				req.reject(new Error(msg.error));
			}
		} else {
			console.error('[parserService]', msg.error);
		}
	}
}

async function ensureInitialized(): Promise<void> {
	if (initialized) return;
	if (initPromise) return initPromise;

	initPromise = new Promise<void>((resolve, reject) => {
		const w = getWorker();
		const handler = (e: MessageEvent) => {
			if (e.data.type === 'init-done') {
				initialized = true;
				resolve();
			} else if (e.data.type === 'error') {
				reject(new Error(e.data.error));
			}
		};
		w.addEventListener('message', handler, { once: true });
		w.postMessage({ type: 'init' });
	});

	return initPromise;
}

export async function parseFile(
	filePath: string,
	content: string,
	language: string,
	priority = 0
): Promise<ParsedFile> {
	return parseSource(filePath, content, language, (path, text, lang) =>
		parseInWorker(path, text, lang, priority)
	);
}

async function parseInWorker(
	filePath: string,
	content: string,
	language: string,
	priority: number
): Promise<ParsedFile> {
	await ensureInitialized();

	return new Promise<ParsedFile>((resolve, reject) => {
		pendingRequests.set(filePath, {
			filePath,
			content,
			language,
			priority,
			resolve,
			reject
		});

		getWorker().postMessage({
			type: 'parse',
			filePath,
			content,
			language
		});
	});
}

/** Parse the MAX_FILES highest ranked files of the tree, within MAX_FILE_SIZE and MAX_TOTAL_SIZE. */
export function parseAllFiles(
	fileTree: FileNode,
	onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
	return parseSources(
		supportedFiles(fileTree).slice(0, MAX_FILES),
		{
			open: async (file) => {
				if (!file.handle || !('getFile' in file.handle)) throw new Error('no file handle');
				return file.handle.getFile();
			},
			grammar: (path, text, lang) => parseInWorker(path, text, lang, 0),
			fileSize: MAX_FILE_SIZE,
			totalSize: MAX_TOTAL_SIZE,
			onError: (path, err) => console.warn(`[parserService] Failed to parse ${path}:`, err)
		},
		onProgress
	);
}

export function destroy() {
	if (worker) {
		worker.terminate();
		worker = null;
		initialized = false;
		initPromise = null;
		pendingRequests.clear();
	}
}
