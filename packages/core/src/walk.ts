import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage } from '$lib/utils/languageDetector';
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
 * Walk `root` with the browser loader's skip rules (`shouldSkipPath`, include entries,
 * MAX_DEPTH) and no file cap. A symbolic link is followed only when its target is inside the
 * root, and a folder reached twice through links is read once.
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
	const seen = new Set<string>([rootReal]);
	const inside = (real: string) => real === rootReal || real.startsWith(rootReal + sep);

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
			const kind = await kindOf(entry, absolute);
			if (kind === 'directory') {
				if (shouldSkipPath(entryPath + '/', filter) && !isIncludeAncestor(entryPath, filter)) {
					continue;
				}
				const real = await realpath(absolute);
				if (!inside(real) || seen.has(real)) continue;
				seen.add(real);
				const child: FileNode = {
					name: entry.name,
					path: entryPath,
					kind: 'directory',
					children: []
				};
				node.children!.push(child);
				await walk(absolute, entryPath, child, depth + 1);
			} else if (kind === 'file') {
				if (shouldSkipPath(entryPath, filter, true)) continue;
				if (entry.isSymbolicLink() && !inside(await realpath(absolute))) continue;
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

async function kindOf(
	entry: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
	absolute: string
): Promise<'directory' | 'file' | null> {
	if (entry.isDirectory()) return 'directory';
	if (entry.isFile()) return 'file';
	if (!entry.isSymbolicLink()) return null;
	try {
		const target = await stat(absolute);
		return target.isDirectory() ? 'directory' : target.isFile() ? 'file' : null;
	} catch {
		// A dangling link
		return null;
	}
}
