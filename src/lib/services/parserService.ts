import type { ASTRef, ASTSymbol, ParseSkip, ParseSkipReason } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import { isSupported } from '$lib/utils/languageDetector';
import { extractMarkdownSymbols } from '$lib/services/markdownOutline';
import { CONFIG_PARSERS } from '$lib/services/configParsers';
import { pathPriority, MAX_FILE_SIZE, MAX_TOTAL_SIZE, MAX_FILES } from '$lib/utils/filePriority';

interface ParseRequest {
	filePath: string;
	content: string;
	language: string;
	priority: number;
	resolve: (parsed: ParsedFile) => void;
	reject: (err: Error) => void;
}

/** What the parser read from one file. Line parsers record no reference sites. */
export interface ParsedFile {
	symbols: ASTSymbol[];
	refs: ASTRef[];
}

// Formats with no tree-sitter grammar here; their line parsers are cheap enough for the main thread
const LINE_PARSERS: Partial<Record<string, (content: string) => ASTSymbol[]>> = {
	markdown: extractMarkdownSymbols,
	...CONFIG_PARSERS
};

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
	const lineParser = LINE_PARSERS[language];
	if (lineParser) return { symbols: lineParser(content), refs: [] };

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

export interface ParseProgress {
	done: number;
	total: number;
}

/** The symbols and reference sites read per file, and the files the parser read nothing from. */
export interface ParseResult {
	astMap: Map<string, ASTSymbol[]>;
	refs: Map<string, ASTRef[]>;
	skipped: ParseSkip[];
}

export async function parseAllFiles(
	fileTree: FileNode,
	onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
	const files = collectSupportedFiles(fileTree);
	const total = files.length;

	onProgress?.({ done: 0, total });

	let done = 0;
	let totalParsedSize = 0;
	const astMap = new Map<string, ASTSymbol[]>();
	const refs = new Map<string, ASTRef[]>();
	const skipped: ParseSkip[] = [];

	for (const file of files) {
		const outcome = await parseInto(astMap, refs, file, totalParsedSize);
		if (typeof outcome === 'number') totalParsedSize += outcome;
		else skipped.push({ path: file.path, reason: outcome });
		done++;
		onProgress?.({ done, total });
	}

	return { astMap, refs, skipped };
}

/** Parse one file into `astMap` and `refs`. Returns the bytes read, or why nothing was read. */
async function parseInto(
	astMap: Map<string, ASTSymbol[]>,
	refs: Map<string, ASTRef[]>,
	file: FileNode,
	parsedSoFar: number
): Promise<number | ParseSkipReason> {
	if (!file.handle || !('getFile' in file.handle)) return 'unreadable';
	let fileObj: File;
	let content: string;
	try {
		fileObj = await (file.handle as FileSystemFileHandle).getFile();
		if (fileObj.size > MAX_FILE_SIZE) return 'file-size';
		if (parsedSoFar + fileObj.size > MAX_TOTAL_SIZE) return 'total-size';
		content = await fileObj.text();
	} catch {
		return 'unreadable';
	}
	try {
		const parsed = await parseFile(file.path, content, file.language!);
		astMap.set(file.path, parsed.symbols);
		refs.set(file.path, parsed.refs);
	} catch (err) {
		console.warn(`[parserService] Failed to parse ${file.path}:`, err);
		return 'parse-failed';
	}
	return fileObj.size;
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
