import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage } from '$lib/utils/languageDetector';
import {
	capFiles,
	DEFAULT_PATH_FILTER,
	isIncludeAncestor,
	shouldSkipPath,
	sortFileTree,
	type PathFilter
} from '$lib/utils/filePriority';
import { projectStore } from '$lib/stores/projectStore.svelte';

export async function openDirectory(): Promise<FileSystemDirectoryHandle> {
	if (!('showDirectoryPicker' in window)) {
		throw new Error('File System Access API not supported in this browser');
	}
	return await window.showDirectoryPicker({ mode: 'read' });
}

const MAX_DEPTH = 30;

/** A file seen during the walk. Its handle is fetched again only if it survives the cap. */
interface FoundFile {
	path: string;
	name: string;
	parent: FileNode;
}

/**
 * Read the folder tree, then keep the MAX_FILES highest ranked files. Every path is collected
 * before the cap so folder order cannot decide which packages are kept. The files that do not
 * fit are recorded in `projectStore.cutFiles`.
 */
export async function readDirectoryRecursive(
	dirHandle: FileSystemDirectoryHandle,
	basePath = '',
	filter: PathFilter = DEFAULT_PATH_FILTER
): Promise<FileNode> {
	const found: FoundFile[] = [];
	const root = await walkDirectory(dirHandle, basePath, filter, 0, found);
	const { kept, cut } = capFiles(found, (file) => file.path);

	await Promise.all(
		kept.map(async ({ path, name, parent }) => {
			try {
				const handle = await (parent.handle as FileSystemDirectoryHandle).getFileHandle(name);
				parent.children!.push({
					name,
					path,
					kind: 'file',
					handle,
					language: detectLanguage(name) ?? undefined
				});
			} catch {
				// Deleted or renamed since the walk: nothing left to show
			}
		})
	);

	projectStore.cutFiles = cut;
	sortFileTree(root);
	return root;
}

async function walkDirectory(
	dirHandle: FileSystemDirectoryHandle,
	basePath: string,
	filter: PathFilter,
	depth: number,
	found: FoundFile[]
): Promise<FileNode> {
	const dirNode: FileNode = {
		name: dirHandle.name,
		path: basePath || dirHandle.name,
		kind: 'directory',
		children: [],
		handle: dirHandle
	};
	if (depth >= MAX_DEPTH) return dirNode;

	for await (const entry of dirHandle.values()) {
		const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

		if (entry.kind === 'directory') {
			// A skipped folder is still walked when an include path lies inside it;
			// its files are then checked one by one below
			if (shouldSkipPath(entryPath + '/', filter) && !isIncludeAncestor(entryPath, filter)) {
				continue;
			}
			dirNode.children!.push(
				await walkDirectory(entry as FileSystemDirectoryHandle, entryPath, filter, depth + 1, found)
			);
		} else {
			// Hidden files are skipped too unless an include entry covers them
			if (shouldSkipPath(entryPath, filter, true)) continue;
			found.push({ path: entryPath, name: entry.name, parent: dirNode });
		}
	}
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

	// Skip the root dir name from webkitRelativePath
	const candidates = Array.from(files)
		.map((file) => ({ file, path: file.webkitRelativePath.split('/').slice(1).join('/') }))
		.filter(({ path }) => !shouldSkipPath(path, filter, true));
	const { kept, cut } = capFiles(candidates, (candidate) => candidate.path);
	projectStore.cutFiles = cut;

	for (const { file, path } of kept) {
		const pathParts = path.split('/');

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
		const language = detectLanguage(fileName);

		parentNode.children!.push({
			name: fileName,
			path,
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
