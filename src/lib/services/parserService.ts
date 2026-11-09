import type { ASTSymbol } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import { isSupported } from '$lib/utils/languageDetector';
import { extractMarkdownSymbols } from '$lib/services/markdownOutline';
import { pathPriority, MAX_FILE_SIZE, MAX_TOTAL_SIZE, MAX_FILES } from '$lib/utils/filePriority';

interface ParseRequest {
	filePath: string;
	content: string;
	language: string;
	priority: number;
	resolve: (symbols: ASTSymbol[]) => void;
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
			req.resolve(msg.symbols);
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
): Promise<ASTSymbol[]> {
	// Markdown has no tree-sitter grammar here; its outline is cheap enough for the main thread
	if (language === 'markdown') return extractMarkdownSymbols(content);

	await ensureInitialized();

	return new Promise<ASTSymbol[]>((resolve, reject) => {
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

export interface ParseProgress {
	done: number;
	total: number;
}

export async function parseAllFiles(
	fileTree: FileNode,
	existingAstMap: Map<string, ASTSymbol[]>,
	onProgress?: (progress: ParseProgress) => void
): Promise<Map<string, ASTSymbol[]>> {
	const files = collectSupportedFiles(fileTree);
	const total = files.length;

	onProgress?.({ done: 0, total });

	let done = 0;
	let totalParsedSize = 0;
	const resultMap = new Map(existingAstMap);

	for (const file of files) {
		try {
			let content: string;

			if (file.handle && 'getFile' in file.handle) {
				const fileObj = await (file.handle as FileSystemFileHandle).getFile();
				// Skip files that are too large for the parser
				if (fileObj.size > MAX_FILE_SIZE) {
					done++;
					onProgress?.({ done, total });
					continue;
				}
				// Stop if total parsed size exceeds limit
				if (totalParsedSize + fileObj.size > MAX_TOTAL_SIZE) {
					done++;
					onProgress?.({ done, total });
					continue;
				}
				content = await fileObj.text();
				totalParsedSize += fileObj.size;
			} else {
				continue;
			}

			const symbols = await parseFile(file.path, content, file.language!);
			resultMap.set(file.path, symbols);
		} catch (err) {
			console.warn(`[parserService] Failed to parse ${file.path}:`, err);
		}

		done++;
		onProgress?.({ done, total });
	}

	return resultMap;
}

function collectSupportedFiles(root: FileNode): FileNode[] {
	const result: FileNode[] = [];
	const stack: FileNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.kind === 'file') {
			if (node.language && isSupported(node.language)) {
				result.push(node);
			}
		} else if (node.children) {
			for (const child of node.children) {
				stack.push(child);
			}
		}
	}

	// Priority sort: core source first, tests/examples last
	result.sort((a, b) => pathPriority(a.path, true) - pathPriority(b.path, true));

	return result.slice(0, MAX_FILES);
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
