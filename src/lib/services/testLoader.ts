import type { FileNode } from '$lib/types/fileTree';
import type { ASTRef, ParseSkip } from '$lib/types/ast';
import { isSupported } from '$lib/utils/languageDetector';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { parseFile } from '$lib/services/parserService';
import { collectResolverConfigs } from '$lib/services/importResolver';
import { codeMapStore } from '$lib/stores/codeMapStore.svelte';

interface DevFileNode extends FileNode {
	_absolutePath?: string;
}

const BATCH_SIZE = 20;

// Module-level guard: prevents multiple concurrent loads
let _loading = false;

function collectFiles(root: DevFileNode): DevFileNode[] {
	const result: DevFileNode[] = [];
	const stack: DevFileNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.kind === 'file') {
			result.push(node);
		} else if (node.children) {
			for (const child of node.children) {
				stack.push(child as DevFileNode);
			}
		}
	}

	return result;
}

export async function loadTestProject(dirPath: string): Promise<void> {
	if (_loading) return;
	_loading = true;

	projectStore.reset();
	projectStore.isLoading = true;

	try {
		// 1. Scan directory via dev middleware
		const scanRes = await fetch(`/__dev/scan?dir=${encodeURIComponent(dirPath)}`);
		if (!scanRes.ok) {
			throw new Error(`Scan failed: ${scanRes.status} ${await scanRes.text()}`);
		}
		const fileTree: DevFileNode = await scanRes.json();

		projectStore.projectName = fileTree.name;
		projectStore.fileTree = fileTree;

		// 2. Collect supported files
		const listed = collectFiles(fileTree);
		const files = listed.filter((file) => file.language && isSupported(file.language));
		const total = files.length;
		projectStore.parsingProgress = { done: 0, total };

		// 3. Parse each file
		let done = 0;
		const batchMap = new Map(projectStore.astMap);
		const refs = new Map<string, ASTRef[]>();
		let batchCount = 0;
		const skipped: ParseSkip[] = [];

		for (const file of files) {
			try {
				const absPath = file._absolutePath;
				if (!absPath) {
					skipped.push({ path: file.path, reason: 'unreadable' });
					done++;
					projectStore.parsingProgress = { done, total };
					continue;
				}

				const readRes = await fetch(`/__dev/read?file=${encodeURIComponent(absPath)}`);
				if (!readRes.ok) {
					skipped.push({ path: file.path, reason: 'unreadable' });
					done++;
					projectStore.parsingProgress = { done, total };
					continue;
				}

				const content = await readRes.text();
				if (!content) {
					skipped.push({ path: file.path, reason: 'unreadable' });
					done++;
					projectStore.parsingProgress = { done, total };
					continue;
				}

				const parsed = await parseFile(file.path, content, file.language!);
				batchMap.set(file.path, parsed.symbols);
				refs.set(file.path, parsed.refs);
				batchCount++;

				if (batchCount >= BATCH_SIZE) {
					projectStore.astMap = new Map(batchMap);
					batchCount = 0;
				}
			} catch (err) {
				console.warn(`[testLoader] Failed to parse ${file.path}:`, err);
				skipped.push({ path: file.path, reason: 'parse-failed' });
			}

			done++;
			projectStore.parsingProgress = { done, total };
		}

		// Final flush
		if (batchCount > 0) {
			projectStore.astMap = new Map(batchMap);
		}
		projectStore.parseSkips = skipped;

		const absolute = new Map(listed.map((file) => [file.path, file._absolutePath]));
		const configs = await collectResolverConfigs(absolute.keys(), async (path) => {
			const res = await fetch(`/__dev/read?file=${encodeURIComponent(absolute.get(path) ?? '')}`);
			return res.ok ? await res.text() : null;
		});
		codeMapStore.build({ astMap: projectStore.astMap, root: fileTree.name, refs, configs });
	} catch (err) {
		console.error('[testLoader] Failed to load test project:', err);
	} finally {
		projectStore.isLoading = false;
		_loading = false;
	}
}
