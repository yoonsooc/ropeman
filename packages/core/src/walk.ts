import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage, isEnvValueFile } from '$lib/utils/languageDetector';
import {
	DEFAULT_PATH_FILTER,
	MAX_DEPTH,
	isIncludeAncestor,
	shouldSkipPath,
	sortFileTree,
	type PathFilter
} from '$lib/utils/filePriority';

/** A folder read from disk: its tree as the browser loader builds it, and every file path in walk order. */
export interface WalkedTree {
	tree: FileNode;
	paths: string[];
	/** The root with every link resolved; paths are relative to it */
	rootReal: string;
}

/**
 * Whether `real`, a path from realpath, is a file the loader reads under its own name: inside
 * the root, kept by `shouldSkipPath`, and not an env file with real values. A link is checked by
 * its target too, so `notes.ts -> .env` is not read as TypeScript.
 */
export function isReadableTarget(rootReal: string, real: string, filter: PathFilter): boolean {
	if (!real.startsWith(rootReal + sep)) return false;
	const path = relative(rootReal, real).split(sep).join('/');
	// Lowercased because on a case-insensitive disk `.ENV` opens `.env`
	return !shouldSkipPath(path, filter, true) && !isEnvValueFile(path.toLowerCase());
}

/**
 * Walk `root` with the browser loader's skip rules (`shouldSkipPath`, include entries,
 * MAX_DEPTH) and no file cap. A link to a file is followed when `isReadableTarget` accepts its
 * target. A link to a folder is never followed: a folder inside the root is walked under its
 * real path whatever the readdir order, and one outside it or skipped is not read at all.
 */
export async function walkDirectory(
	root: string,
	filter: PathFilter = DEFAULT_PATH_FILTER
): Promise<WalkedTree> {
	const rootReal = await realpath(root);
	if (!(await stat(rootReal)).isDirectory()) throw new Error(`${root} is not a folder`);
	const tree: FileNode = {
		name: basename(rootReal),
		path: basename(rootReal),
		kind: 'directory',
		children: []
	};
	const paths: string[] = [];

	async function isFile(entry: { isFile(): boolean; isSymbolicLink(): boolean }, absolute: string) {
		if (entry.isFile()) return true;
		if (!entry.isSymbolicLink()) return false;
		try {
			const real = await realpath(absolute);
			return (await stat(real)).isFile() && isReadableTarget(rootReal, real, filter);
		} catch {
			// A dangling link
			return false;
		}
	}

	async function walk(dir: string, basePath: string, node: FileNode, depth: number) {
		if (depth >= MAX_DEPTH) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			// A folder the user cannot list, such as one without read permission, maps as empty
			return;
		}
		for (const entry of entries) {
			const absolute = join(dir, entry.name);
			const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (shouldSkipPath(entryPath + '/', filter) && !isIncludeAncestor(entryPath, filter)) {
					continue;
				}
				const child: FileNode = {
					name: entry.name,
					path: entryPath,
					kind: 'directory',
					children: []
				};
				node.children!.push(child);
				await walk(absolute, entryPath, child, depth + 1);
			} else if (await isFile(entry, absolute)) {
				if (shouldSkipPath(entryPath, filter, true)) continue;
				paths.push(entryPath);
				node.children!.push({
					name: entry.name,
					path: entryPath,
					kind: 'file',
					language: detectLanguage(entry.name) ?? undefined
				});
			}
		}
	}

	await walk(rootReal, '', tree, 0);
	sortFileTree(tree);
	return { tree, paths, rootReal };
}
