import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage } from '$lib/utils/languageDetector';
import {
	DEFAULT_PATH_FILTER,
	isIncludeAncestor,
	shouldSkipPath,
	sortFileTree,
	type PathFilter
} from '$lib/utils/filePriority';

export async function openDirectory(): Promise<FileSystemDirectoryHandle> {
	if (!('showDirectoryPicker' in window)) {
		throw new Error('File System Access API not supported in this browser');
	}
	return await window.showDirectoryPicker({ mode: 'read' });
}

const MAX_DEPTH = 30;
const MAX_FILES = 2000;

interface ScanContext {
	fileCount: number;
	filter: PathFilter;
}

export async function readDirectoryRecursive(
	dirHandle: FileSystemDirectoryHandle,
	basePath = '',
	filter: PathFilter = DEFAULT_PATH_FILTER,
	depth = 0,
	ctx?: ScanContext
): Promise<FileNode> {
	if (!ctx) {
		ctx = { fileCount: 0, filter };
	}

	const children: FileNode[] = [];

	if (depth >= MAX_DEPTH || ctx.fileCount >= MAX_FILES) {
		return {
			name: dirHandle.name,
			path: basePath || dirHandle.name,
			kind: 'directory',
			children: [],
			handle: dirHandle
		};
	}

	for await (const entry of dirHandle.values()) {
		if (ctx.fileCount >= MAX_FILES) break;
		const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

		if (entry.kind === 'directory') {
			// A skipped folder is still walked when an include path lies inside it;
			// its files are then checked one by one below
			if (
				shouldSkipPath(entryPath + '/', ctx.filter) &&
				!isIncludeAncestor(entryPath, ctx.filter)
			) {
				continue;
			}
			const child = await readDirectoryRecursive(
				entry as FileSystemDirectoryHandle,
				entryPath,
				ctx.filter,
				depth + 1,
				ctx
			);
			children.push(child);
		} else {
			// Hidden files are skipped too unless an include entry covers them
			if (shouldSkipPath(entryPath, ctx.filter, true)) continue;
			ctx.fileCount++;
			const language = detectLanguage(entry.name);
			children.push({
				name: entry.name,
				path: entryPath,
				kind: 'file',
				handle: entry as FileSystemFileHandle,
				language: language ?? undefined
			});
		}
	}

	const dirNode: FileNode = {
		name: dirHandle.name,
		path: basePath || dirHandle.name,
		kind: 'directory',
		children,
		handle: dirHandle
	};
	if (depth === 0) sortFileTree(dirNode);
	return dirNode;
}

export async function readFileContent(fileHandle: FileSystemFileHandle): Promise<string> {
	const file = await fileHandle.getFile();
	return await file.text();
}

export function handleFallbackInput(
	files: FileList,
	filter: PathFilter = DEFAULT_PATH_FILTER
): FileNode {
	const root: FileNode = {
		name: extractProjectName(files),
		path: '',
		kind: 'directory',
		children: []
	};

	const dirMap = new Map<string, FileNode>();
	dirMap.set('', root);

	for (const file of Array.from(files)) {
		const relativePath = file.webkitRelativePath;
		const parts = relativePath.split('/');
		// Skip the root dir name from webkitRelativePath
		const pathParts = parts.slice(1);
		if (shouldSkipPath(pathParts.join('/'), filter, true)) continue;

		let currentPath = '';
		let parentNode = root;

		for (let i = 0; i < pathParts.length - 1; i++) {
			const dirName = pathParts[i];
			const dirPath = currentPath ? `${currentPath}/${dirName}` : dirName;

			if (!dirMap.has(dirPath)) {
				const dirNode: FileNode = {
					name: dirName,
					path: dirPath,
					kind: 'directory',
					children: []
				};
				dirMap.set(dirPath, dirNode);
				parentNode.children!.push(dirNode);
			}

			parentNode = dirMap.get(dirPath)!;
			currentPath = dirPath;
		}

		const fileName = pathParts[pathParts.length - 1];

		const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
		const language = detectLanguage(fileName);

		parentNode.children!.push({
			name: fileName,
			path: filePath,
			kind: 'file',
			language: language ?? undefined,
			size: file.size,
			// Wrap the File object as a handle-like for parseAllFiles compatibility
			handle: {
				kind: 'file' as const,
				name: fileName,
				getFile: () => Promise.resolve(file)
			} as unknown as FileSystemFileHandle
		});
	}

	sortFileTree(root);
	return root;
}

function extractProjectName(files: FileList): string {
	if (files.length === 0) return 'project';
	const first = files[0].webkitRelativePath;
	return first.split('/')[0] || 'project';
}
