import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage } from '$lib/utils/languageDetector';
import { SKIP_DIRS, sortFileTree } from '$lib/utils/filePriority';

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
	skipPatterns: Set<string>;
}

export async function readDirectoryRecursive(
	dirHandle: FileSystemDirectoryHandle,
	basePath = '',
	skipPatterns = SKIP_DIRS,
	depth = 0,
	ctx?: ScanContext
): Promise<FileNode> {
	if (!ctx) {
		ctx = { fileCount: 0, skipPatterns };
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
		if (ctx.skipPatterns.has(entry.name)) continue;
		if (entry.name.endsWith('.egg-info')) continue;
		// Skip hidden files/dirs (except common config)
		if (entry.name.startsWith('.') && entry.name !== '.env') continue;

		const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

		if (entry.kind === 'directory') {
			const child = await readDirectoryRecursive(
				entry as FileSystemDirectoryHandle,
				entryPath,
				ctx.skipPatterns,
				depth + 1,
				ctx
			);
			children.push(child);
		} else {
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

export function handleFallbackInput(files: FileList, skipSet: Set<string> = SKIP_DIRS): FileNode {
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

		let currentPath = '';
		let parentNode = root;

		for (let i = 0; i < pathParts.length - 1; i++) {
			const dirName = pathParts[i];
			const dirPath = currentPath ? `${currentPath}/${dirName}` : dirName;

			if (skipSet.has(dirName)) break;

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
		// Check if any ancestor was skipped
		if (pathParts.slice(0, -1).some((p) => skipSet.has(p))) continue;

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
