import type { FileNode } from '$lib/types/fileTree';

/**
 * A file tree from repo-relative paths alone, for a viewer that has a map's file list and no
 * folder handle (Bridge mode). The root's path is `''`, so every other path is the repo path the
 * map's nodes name. Nodes carry no size, language or handle: the paths do not say them.
 */
export function fileTreeFromPaths(rootName: string, paths: readonly string[]): FileNode {
	const root: FileNode = { name: rootName, path: '', kind: 'directory', children: [] };
	const dirs = new Map<string, FileNode>([['', root]]);
	const files = new Set<string>();

	function dirAt(dirPath: string): FileNode {
		const found = dirs.get(dirPath);
		if (found) return found;
		const cut = dirPath.lastIndexOf('/');
		const parent = dirAt(cut < 0 ? '' : dirPath.slice(0, cut));
		const dir: FileNode = {
			name: dirPath.slice(cut + 1),
			path: dirPath,
			kind: 'directory',
			children: []
		};
		parent.children!.push(dir);
		dirs.set(dirPath, dir);
		return dir;
	}

	for (const path of paths) {
		if (!path || files.has(path)) continue;
		files.add(path);
		const cut = path.lastIndexOf('/');
		dirAt(cut < 0 ? '' : path.slice(0, cut)).children!.push({
			name: path.slice(cut + 1),
			path,
			kind: 'file'
		});
	}
	return root;
}
