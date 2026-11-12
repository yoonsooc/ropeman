import { openAsBlob } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { ParseSkip } from '$lib/types/ast';
import type { CodeMap } from '$lib/types/codeMap';
import type { FileNode } from '$lib/types/fileTree';
import { createGrammarParser } from '$lib/workers/grammarParser';
import { parseSources, supportedFiles, type ParseProgress } from '$lib/services/sourceExtraction';
import { collectResolverConfigs } from '$lib/services/importResolver';
import { buildCodeMap } from '$lib/services/codeMapBuilder';
import { summarizeHierarchy, type HierarchyGroup } from '$lib/services/hierarchySummary';
import { DEFAULT_PATH_FILTER, type PathFilter } from '$lib/utils/filePriority';
import { isReadableTarget, walkDirectory } from './walk';

/**
 * The per-file guard in place of the browser's MAX_FILE_SIZE (500 KB): a source file larger
 * than this is generated or minified output, not code to map. Binary files never reach it,
 * because only files whose name maps to a supported language are read.
 */
export const NODE_MAX_FILE_SIZE = 2_000_000;

export interface ExtractOptions {
	/** Folder holding `tree-sitter.wasm` and the grammar `.wasm` files */
	wasmDir: string;
	filter?: PathFilter;
	maxFileSize?: number;
	onProgress?: (progress: ParseProgress) => void;
}

/** Everything one extraction read: the code map, its folder summary, and what it left out. */
export interface Extraction {
	map: CodeMap;
	hierarchy: HierarchyGroup;
	/** Every file the walk listed, read or not */
	listed: number;
	/** Supported files the parser read nothing from, with the reason */
	skipped: ParseSkip[];
	/** Every folder the walk entered, repo-relative, '' for the root: what a watcher watches */
	folders: string[];
}

/** Extract the code map of the folder at `root` the way the browser does, without its file cap. */
export async function extractDirectory(root: string, options: ExtractOptions): Promise<Extraction> {
	const { wasmDir, filter = DEFAULT_PATH_FILTER, maxFileSize = NODE_MAX_FILE_SIZE } = options;
	const { tree, paths, rootReal } = await walkDirectory(root, filter);
	// The path is resolved again at read time, so a file swapped for a link after the walk is
	// not followed out of the root. The gap between this check and the open is left open.
	const open = async (path: string) => {
		const real = await realpath(join(rootReal, path));
		if (!isReadableTarget(rootReal, real, filter))
			throw new Error(`${path} changed after the walk`);
		return openAsBlob(real);
	};

	const configs = await collectResolverConfigs(paths, async (path) => {
		try {
			const blob = await open(path);
			return blob.size > maxFileSize ? null : await blob.text();
		} catch {
			return null;
		}
	});
	const grammar = await createGrammarParser((file) => join(wasmDir, file));
	const { astMap, refs, skipped } = await parseSources(
		supportedFiles(tree),
		{ open: (file) => open(file.path), grammar, fileSize: maxFileSize, totalSize: Infinity },
		options.onProgress
	);
	const map = buildCodeMap(astMap, null, { refs, configs });
	return {
		map,
		hierarchy: summarizeHierarchy(map),
		listed: paths.length,
		skipped,
		folders: foldersOf(tree)
	};
}

function foldersOf(root: FileNode): string[] {
	const folders = [''];
	const visit = (node: FileNode) => {
		for (const child of node.children ?? []) {
			if (child.kind !== 'directory') continue;
			folders.push(child.path);
			visit(child);
		}
	};
	visit(root);
	return folders;
}
