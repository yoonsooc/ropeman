/**
 * Split a repository path into the file name and its nearest folders.
 * Long prefixes such as `transformers/src/transformers/models` are identical
 * across a node's files, so only the last two folders are kept.
 */
export function splitFilePath(path: string, keepDirs = 2): { name: string; dir: string } {
	const parts = path.split('/').filter(Boolean);
	const name = parts.pop() ?? path;
	if (parts.length === 0) return { name, dir: '' };
	const kept = parts.slice(-keepDirs).join('/');
	return { name, dir: parts.length > keepDirs ? `…/${kept}` : kept };
}
