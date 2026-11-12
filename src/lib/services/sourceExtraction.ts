import type { ASTRef, ASTSymbol, ParseSkip, ParseSkipReason } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import type { GrammarParse, ParsedFile } from '$lib/workers/grammarParser';
import { isSupported } from '$lib/utils/languageDetector';
import { pathPriority } from '$lib/utils/filePriority';
import { extractMarkdownSymbols } from './markdownOutline';
import { CONFIG_PARSERS } from './configParsers';

// Formats with no tree-sitter grammar here; their line parsers are cheap enough for the main thread
const LINE_PARSERS: Partial<Record<string, (content: string) => ASTSymbol[]>> = {
	markdown: extractMarkdownSymbols,
	...CONFIG_PARSERS
};

/** One file's outline and reference sites: a line parser when the format has one, else its grammar. */
export async function parseSource(
	filePath: string,
	content: string,
	language: string,
	grammar: GrammarParse
): Promise<ParsedFile> {
	const lineParser = LINE_PARSERS[language];
	if (lineParser) return { symbols: lineParser(content), refs: [] };
	return grammar(filePath, content, language);
}

/** Every file of the tree a parser reads, core source first and tests and examples last. */
export function supportedFiles(root: FileNode): FileNode[] {
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

	result.sort((a, b) => pathPriority(a.path, true) - pathPriority(b.path, true));
	return result;
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

/** How a loader reads and parses its files. Sizes are bytes; a file over `fileSize` is not read. */
export interface SourceReader {
	/** The file's contents, sized before they are read. Throws when the file cannot be opened. */
	open: (file: FileNode) => Promise<Blob>;
	grammar: GrammarParse;
	fileSize: number;
	totalSize: number;
	onError?: (path: string, err: unknown) => void;
}

/** Parse `files` one at a time, in order, so the map lists them in that order. */
export async function parseSources(
	files: readonly FileNode[],
	reader: SourceReader,
	onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
	const total = files.length;
	onProgress?.({ done: 0, total });

	let done = 0;
	let totalParsedSize = 0;
	const result: ParseResult = { astMap: new Map(), refs: new Map(), skipped: [] };

	for (const file of files) {
		const outcome = await parseInto(result, file, reader, totalParsedSize);
		if (typeof outcome === 'number') totalParsedSize += outcome;
		else result.skipped.push({ path: file.path, reason: outcome });
		done++;
		onProgress?.({ done, total });
	}

	return result;
}

/** Parse one file into `result`. Returns the bytes read, or why nothing was read. */
async function parseInto(
	result: ParseResult,
	file: FileNode,
	reader: SourceReader,
	parsedSoFar: number
): Promise<number | ParseSkipReason> {
	let size: number;
	let content: string;
	try {
		const blob = await reader.open(file);
		size = blob.size;
		if (size > reader.fileSize) return 'file-size';
		if (parsedSoFar + size > reader.totalSize) return 'total-size';
		content = await blob.text();
	} catch {
		return 'unreadable';
	}
	try {
		const parsed = await parseSource(file.path, content, file.language!, reader.grammar);
		result.astMap.set(file.path, parsed.symbols);
		result.refs.set(file.path, parsed.refs);
	} catch (err) {
		reader.onError?.(file.path, err);
		return 'parse-failed';
	}
	return size;
}
