<script lang="ts">
	import { scrollBehavior } from '$lib/utils/motion';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import type { FileNode } from '$lib/types/fileTree';
	import type { ASTSymbol } from '$lib/types/ast';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { detectLanguage } from '$lib/utils/languageDetector';
	import Prism from 'prismjs';
	import 'prismjs/components/prism-python';
	import 'prismjs/components/prism-javascript';
	import 'prismjs/components/prism-typescript';
	import 'prismjs/components/prism-go';
	import 'prismjs/components/prism-rust';
	import 'prismjs/components/prism-java';
	import 'prismjs/components/prism-c';
	import 'prismjs/components/prism-cpp';

	let { filePath: propFilePath }: { filePath?: string } = $props();

	// Prism language name mapping (our detector names → Prism grammar keys)
	const PRISM_LANG_MAP: Record<string, string> = {
		python: 'python',
		javascript: 'javascript',
		typescript: 'typescript',
		go: 'go',
		rust: 'rust',
		java: 'java',
		c: 'c',
		cpp: 'cpp'
	};

	let fileContent = $state('');
	let currentFilePath = $state('');
	let isLoadingFile = $state(false);
	let loadError = $state('');

	// Determine the file path to display
	// If prop filePath is provided, use it directly; otherwise fall back to stores
	const targetFilePath = $derived.by(() => {
		if (propFilePath) return propFilePath;

		// From direct file/symbol selection (File Explorer click, SearchBar, etc.)
		const sel = selectionStore.selectedNode;
		if (sel?.filePath) {
			return sel.filePath;
		}

		// Fallback: from semantic node's representative file
		const semNode = semanticStore.selectedSemanticNode;
		if (semNode && semNode.filePaths.length > 0) {
			return semNode.filePaths[0];
		}

		return '';
	});

	// Get symbols for current file
	const fileSymbols = $derived.by(() => {
		if (!currentFilePath) return [];
		return projectStore.astMap.get(currentFilePath) ?? [];
	});

	// Detect language for current file
	const detectedLang = $derived.by(() => {
		if (!currentFilePath) return null;
		const lang = detectLanguage(currentFilePath);
		if (!lang) return null;
		const prismKey = PRISM_LANG_MAP[lang];
		if (!prismKey || !Prism.languages[prismKey]) return null;
		return prismKey;
	});

	const LANG_LABELS: Record<string, string> = {
		javascript: 'JavaScript',
		typescript: 'TypeScript',
		python: 'Python',
		go: 'Go',
		rust: 'Rust',
		java: 'Java',
		c: 'C',
		cpp: 'C++',
		csharp: 'C#',
		ruby: 'Ruby',
		php: 'PHP',
		swift: 'Swift',
		kotlin: 'Kotlin',
		scala: 'Scala',
		json: 'JSON',
		css: 'CSS',
		html: 'HTML',
		markup: 'HTML',
		bash: 'Shell',
		yaml: 'YAML',
		toml: 'TOML',
		markdown: 'Markdown',
		jsx: 'JSX',
		tsx: 'TSX'
	};

	const langLabel = $derived(detectedLang ? (LANG_LABELS[detectedLang] ?? detectedLang) : null);

	// Highlighted lines (split per line, with HTML)
	const highlightedLines = $derived.by(() => {
		if (!fileContent) return [];
		if (detectedLang) {
			const html = Prism.highlight(fileContent, Prism.languages[detectedLang], detectedLang);
			return html.split('\n');
		}
		// Plain text fallback — escape HTML
		return fileContent
			.split('\n')
			.map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
	});

	// Load file content when target changes
	$effect(() => {
		const path = targetFilePath;
		if (!path || path === currentFilePath) return;

		loadFileContent(path);
	});

	function findFileNode(tree: FileNode, path: string): FileNode | null {
		if (tree.kind === 'file' && tree.path === path) return tree;
		if (tree.kind === 'directory' && tree.children) {
			for (const child of tree.children) {
				const found = findFileNode(child, path);
				if (found) return found;
			}
		}
		return null;
	}

	async function loadFileContent(path: string) {
		isLoadingFile = true;
		loadError = '';
		fileContent = '';

		try {
			const tree = projectStore.fileTree;
			if (!tree) throw new Error('No project loaded');

			const fileNode = findFileNode(tree, path) as (FileNode & { _absolutePath?: string }) | null;

			// Try FileSystemFileHandle (local folder mode)
			if (fileNode?.handle && fileNode.handle.kind === 'file') {
				const file = await (fileNode.handle as FileSystemFileHandle).getFile();
				fileContent = await file.text();
				currentFilePath = path;
				return;
			}

			// Try GitHub on-demand fetch
			const gh = projectStore.githubInfo;
			if (gh) {
				// path format: "repo/src/file.ts" → strip repo prefix
				const repoPrefix = gh.repo + '/';
				const relativePath = path.startsWith(repoPrefix) ? path.slice(repoPrefix.length) : path;
				const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${gh.ref}/${relativePath}`;
				const res = await fetch(rawUrl);
				if (res.ok) {
					fileContent = await res.text();
					currentFilePath = path;
					return;
				}
			}

			// Try dev mode API with absolute path
			if (import.meta.env.DEV) {
				const absPath = fileNode?._absolutePath;
				if (absPath) {
					const res = await fetch(`/__dev/read?file=${encodeURIComponent(absPath)}`);
					if (res.ok) {
						fileContent = await res.text();
						currentFilePath = path;
						return;
					}
				}
			}

			throw new Error('File not accessible');
		} catch (err) {
			loadError = `Failed to load file: ${(err as Error).message}`;
		} finally {
			isLoadingFile = false;
		}
	}

	function handleSymbolClick(sym: ASTSymbol) {
		// Scroll to line
		const lineEl = document.querySelector(`[data-line="${sym.lineStart}"]`);
		if (lineEl) {
			lineEl.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
		}
	}

	const _fileName = $derived(currentFilePath.split('/').pop() ?? '');
</script>

<div class="code-viewer">
	{#if !currentFilePath && !targetFilePath}
		<div class="code-empty">
			<div class="empty-icon">&#128196;</div>
			<p class="empty-text">Select a file from the Explorer or a semantic node to view code</p>
		</div>
	{:else if isLoadingFile}
		<div class="code-loading">
			<div class="loading-spinner"></div>
			<span>Loading...</span>
		</div>
	{:else if loadError}
		<div class="code-error">
			<p>{loadError}</p>
		</div>
	{:else}
		<div class="code-header">
			<span class="code-filepath" title={currentFilePath}>{currentFilePath}</span>
			{#if langLabel}
				<span class="code-lang-badge">{langLabel}</span>
			{/if}
			<span class="code-line-count">{highlightedLines.length} lines</span>
		</div>

		<div class="code-layout">
			<!-- Symbol sidebar -->
			{#if settingsStore.showSymbols && fileSymbols.length > 0}
				<div class="symbol-sidebar">
					<div class="symbol-header">Symbols</div>
					{#each fileSymbols as sym}
						<button
							class="symbol-item"
							onclick={() => handleSymbolClick(sym)}
							title="{sym.kind}: {sym.name} (L{sym.lineStart})"
						>
							<span
								class="symbol-kind-icon"
								class:fn={sym.kind === 'function' || sym.kind === 'method'}
								class:cls={sym.kind === 'class'}
								class:var={sym.kind === 'variable'}
								class:type={sym.kind === 'interface' || sym.kind === 'type'}
							>
								{#if sym.kind === 'function' || sym.kind === 'method'}f
								{:else if sym.kind === 'class'}C
								{:else if sym.kind === 'variable'}v
								{:else if sym.kind === 'interface' || sym.kind === 'type'}T
								{:else if sym.kind === 'import'}I
								{:else if sym.kind === 'heading'}#
								{:else if sym.kind === 'frontmatter'}M
								{:else}S{/if}
							</span>
							<span class="symbol-name">{sym.name}</span>
							<span class="symbol-line">L{sym.lineStart}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Code content -->
			<div class="code-content" style="font-size: {settingsStore.codeFontSize}px;">
				<div class="code-lines">
					{#each highlightedLines as line, i}
						<div class="code-line" data-line={i + 1}>
							<span class="line-number">{i + 1}</span>
							<pre class="line-text">{@html line}</pre>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.code-viewer {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
		overflow: hidden;
	}

	.code-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: var(--text-muted);
	}

	.empty-icon {
		font-size: 48px;
		opacity: 0.3;
	}

	.empty-text {
		font-size: 14px;
		max-width: 300px;
		text-align: center;
		line-height: 1.5;
	}

	.code-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.loading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--text-muted);
		border-top-color: var(--accent, #3b82f6);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.code-error {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-error);
		font-size: 13px;
	}

	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		height: 40px;
		background: var(--sidebar-content-bg, #151a21);
		border-bottom: 1px solid var(--ghost-border);
		flex-shrink: 0;
		gap: 8px;
	}

	.code-filepath {
		font-size: 11px;
		font-family: var(--font-code);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.code-lang-badge {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		background: var(--bg-tertiary);
		border: 1px solid var(--ghost-border);
		padding: 2px 8px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.code-line-count {
		font-size: 11px;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.code-layout {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.symbol-sidebar {
		width: 240px;
		flex-shrink: 0;
		overflow-y: auto;
		background: var(--sidebar-content-bg, #151a21);
		border-left: 1px solid var(--ghost-border);
	}

	.symbol-header {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-muted);
		padding: 16px;
		border-bottom: 1px solid var(--border);
	}

	.symbol-item {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 12px;
		font-size: 11px;
		font-family: var(--font-code);
		color: var(--text-secondary);
		cursor: pointer;
		border: none;
		background: none;
		text-align: left;
		transition: background-color 0.1s ease;
	}

	.symbol-item:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.symbol-kind-icon {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0;
		font-size: 10px;
		font-weight: 700;
		font-family: var(--font-code);
		flex-shrink: 0;
		background: none;
		color: var(--text-muted);
	}

	.symbol-kind-icon.fn {
		color: var(--text-secondary);
	}
	.symbol-kind-icon.cls {
		color: var(--color-warning);
	}
	.symbol-kind-icon.var {
		color: var(--color-success);
	}
	.symbol-kind-icon.type {
		color: var(--accent);
	}

	.symbol-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-code);
	}

	.symbol-line {
		font-size: 10px;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.code-content {
		flex: 1;
		overflow: auto;
		min-width: 0;
	}

	.code-lines {
		padding: 16px 0;
	}

	.code-line {
		display: flex;
		line-height: 1.625;
	}

	.code-line:hover {
		background: var(--bg-tertiary);
	}

	.line-number {
		width: 48px;
		flex-shrink: 0;
		text-align: right;
		padding-right: 12px;
		color: var(--text-muted);
		user-select: none;
		font-family: var(--font-code);
		font-size: 11px;
	}

	.line-text {
		flex: 1;
		margin: 0;
		padding: 0 24px 0 0;
		font-family: var(--font-code);
		font-size: inherit;
		line-height: 1.625;
		white-space: pre;
		tab-size: 4;
		min-width: 0;
	}

	.code-content::-webkit-scrollbar {
		width: 4px;
		height: 4px;
	}

	.code-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.code-content::-webkit-scrollbar-thumb {
		background: var(--bg-bright, #262c36);
		border-radius: 4px;
	}

	.symbol-sidebar::-webkit-scrollbar {
		width: 4px;
	}

	.symbol-sidebar::-webkit-scrollbar-track {
		background: transparent;
	}

	.symbol-sidebar::-webkit-scrollbar-thumb {
		background: var(--bg-highest, #20262f);
		border-radius: 3px;
	}
</style>
