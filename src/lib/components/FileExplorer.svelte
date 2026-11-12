<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { scrollBehavior } from '$lib/utils/motion';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import type { FileNode } from '$lib/types/fileTree';
	import type { GraphNode } from '$lib/types/graph';
	import { getFileIcon, getFolderIcon } from '$lib/utils/fileIcons';

	let {
		collapsed = false,
		mobile = false,
		ontoggle,
		onfileopen
	}: {
		collapsed?: boolean;
		mobile?: boolean;
		ontoggle?: () => void;
		onfileopen?: () => void;
	} = $props();

	let searchQuery = $state('');
	let expandedDirs = $state<Set<string>>(new Set());
	let treeContainer: HTMLElement | undefined = $state();

	const highlightedPaths = $derived(semanticStore.highlightedFilePaths);
	const highlightedDirPaths = $derived(semanticStore.highlightedDirPaths);

	function toggleDir(path: string) {
		const next = new Set(expandedDirs);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		expandedDirs = next;
	}

	// Double-click detection for file items
	let lastFileClickPath = '';
	let lastFileClickTime = 0;
	const DBLCLICK_MS = 400;

	function handleFileClick(node: FileNode) {
		const now = Date.now();
		const isDoubleClick = node.path === lastFileClickPath && now - lastFileClickTime < DBLCLICK_MS;
		lastFileClickPath = node.path;
		lastFileClickTime = now;

		const lang = inferLang(node.path);
		const syntheticNode: GraphNode = {
			id: `file:${node.path}`,
			kind: 'file',
			label: node.name,
			filePath: node.path,
			parentId: null,
			childCount: 0,
			language: lang ?? undefined,
			isExpanded: false
		};

		if (isDoubleClick) {
			// Double-click: change selectedSemanticNode to the node containing this file (or null)
			const ownerNode = semanticStore.findSemanticNodeForFile(node.path);
			semanticStore.selectedSemanticNode = ownerNode;
			// Pin the tab
			tabStore.openCodeTab(node.path, node.name, false);
		} else {
			// Single-click: keep selectedSemanticNode as-is (preserve analysis flow), preview tab
			tabStore.openCodeTab(node.path, node.name, true);
		}

		selectionStore.selectedNode = syntheticNode;
		selectionStore.breadcrumb = [syntheticNode];
		onfileopen?.();
	}

	function matchesSearch(node: FileNode, query: string): boolean {
		if (!query) return true;
		const lowerQuery = query.toLowerCase();
		if (node.name.toLowerCase().includes(lowerQuery)) return true;
		if (node.kind === 'directory' && node.children) {
			return node.children.some((c) => matchesSearch(c, query));
		}
		return false;
	}

	function isHighlighted(path: string): boolean {
		return highlightedPaths.includes(path) || highlightedDirPaths.includes(path);
	}

	function inferLang(path: string): string | null {
		const ext = path.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'py':
				return 'python';
			case 'js':
				return 'javascript';
			case 'ts':
				return 'typescript';
			case 'jsx':
				return 'jsx';
			case 'tsx':
				return 'tsx';
			case 'svelte':
				return 'svelte';
			case 'css':
				return 'css';
			case 'html':
				return 'html';
			case 'json':
				return 'json';
			case 'md':
				return 'markdown';
			default:
				return null;
		}
	}

	// Collect all directory paths containing matching files
	function collectMatchingDirs(node: FileNode, query: string): string[] {
		if (!query || node.kind !== 'directory') return [];
		const dirs: string[] = [];
		if (node.children) {
			for (const child of node.children) {
				if (matchesSearch(child, query)) {
					dirs.push(node.path);
					dirs.push(...collectMatchingDirs(child, query));
				}
			}
		}
		return dirs;
	}

	// Auto-expand directories containing search matches
	$effect(() => {
		if (searchQuery && projectStore.fileTree) {
			const matchDirs = collectMatchingDirs(projectStore.fileTree, searchQuery);
			if (matchDirs.length > 0) {
				expandedDirs = new Set(matchDirs);
			}
		}
	});

	// Auto-expand root directory
	$effect(() => {
		const tree = projectStore.fileTree;
		if (tree && tree.kind === 'directory' && !expandedDirs.has(tree.path)) {
			expandedDirs = new Set([tree.path]);
		}
	});

	// Auto-expand parent directories when highlighted paths change
	$effect(() => {
		if (highlightedDirPaths.length > 0) {
			const next = new Set(expandedDirs);
			let changed = false;
			for (const dir of highlightedDirPaths) {
				if (!next.has(dir)) {
					next.add(dir);
					changed = true;
				}
			}
			if (changed) {
				expandedDirs = next;
			}
		}
	});

	// Auto-scroll to highlighted files
	$effect(() => {
		if (highlightedPaths.length > 0 && treeContainer) {
			const firstHighlighted = treeContainer.querySelector('.file-item.highlighted');
			if (firstHighlighted) {
				firstHighlighted.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
			}
		}
	});
</script>

{#if !collapsed}
	{#if mobile}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mobile-overlay"
			onclick={ontoggle}
			onkeydown={(e) => {
				if (e.key === 'Escape') ontoggle?.();
			}}
		></div>
	{/if}
	<aside class="file-explorer" class:mobile data-tour-step="7">
		<div class="explorer-header">
			<span class="explorer-title">{i18nStore.t('explorer.title')}</span>
			<button class="explorer-toggle" onclick={ontoggle} title={i18nStore.t('explorer.hide')}>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="11 17 6 12 11 7" />
				</svg>
			</button>
		</div>

		<div class="explorer-search">
			<div class="search-wrapper">
				<svg
					class="search-icon"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="text"
					placeholder={i18nStore.t('explorer.filterPlaceholder')}
					bind:value={searchQuery}
					class="search-input"
				/>
				{#if searchQuery}
					<button
						class="search-clear"
						onclick={() => (searchQuery = '')}
						title={i18nStore.t('explorer.clearFilter')}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				{/if}
			</div>
		</div>

		<div class="explorer-tree" bind:this={treeContainer}>
			{#if projectStore.fileTree}
				{@render treeNode(projectStore.fileTree, 0)}
			{/if}
		</div>
	</aside>
{:else}
	<button class="explorer-collapsed-toggle" onclick={ontoggle} title={i18nStore.t('explorer.show')}>
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="13 17 18 12 13 7" />
		</svg>
	</button>
{/if}

{#snippet treeNode(node: FileNode, depth: number)}
	{#if matchesSearch(node, searchQuery)}
		{#if node.kind === 'directory'}
			<button
				class="tree-item dir-item"
				class:highlighted={isHighlighted(node.path)}
				style="padding-left: {12 + depth * 16}px;"
				onclick={() => toggleDir(node.path)}
			>
				<span class="tree-chevron" class:expanded={expandedDirs.has(node.path)}>
					<span class="material-symbols-outlined"
						>{expandedDirs.has(node.path) ? 'expand_more' : 'chevron_right'}</span
					>
				</span>
				<span class="tree-icon" class:expanded={expandedDirs.has(node.path)}>
					<span
						class="material-symbols-outlined"
						style="color:{getFolderIcon(expandedDirs.has(node.path)).color}"
						>{getFolderIcon(expandedDirs.has(node.path)).icon}</span
					>
				</span>
				<span class="tree-label">{node.name}</span>
				{#if node.children}
					<span class="tree-count">{node.children.length}</span>
				{/if}
			</button>
			{#if expandedDirs.has(node.path) && node.children}
				{#each [...node.children].sort((a, b) => {
					if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
					return a.name.localeCompare(b.name);
				}) as child}
					{@render treeNode(child, depth + 1)}
				{/each}
			{/if}
		{:else}
			<button
				class="tree-item file-item"
				class:highlighted={isHighlighted(node.path)}
				class:selected={selectionStore.selectedNode?.filePath === node.path}
				style="padding-left: {12 + depth * 16}px;"
				onclick={() => handleFileClick(node)}
			>
				<span
					class="tree-file-icon"
					class:selected={selectionStore.selectedNode?.filePath === node.path}
				>
					<span
						class="material-symbols-outlined"
						style={getFileIcon(node.name).color ? `color:${getFileIcon(node.name).color}` : ''}
						>{getFileIcon(node.name).icon}</span
					>
				</span>
				<span class="tree-label">{node.name}</span>
			</button>
		{/if}
	{/if}
{/snippet}

<style>
	.file-explorer {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--color-background-sidebar-content);
		border-right: 1px solid var(--color-border);
		overflow: hidden;
		flex-shrink: 0;
	}

	.explorer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-2) var(--spacing-3);
		border-bottom: 1px solid var(--color-border);
		overflow: visible;
		flex-shrink: 0;
	}

	.explorer-title {
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.explorer-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		border-radius: var(--radius-inner);
		color: var(--color-text-tertiary);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.explorer-toggle:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.explorer-collapsed-toggle {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-left: none;
		border-radius: 0 var(--radius-element) var(--radius-element) 0;
		color: var(--color-text-tertiary);
		cursor: pointer;
		z-index: 5;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.explorer-collapsed-toggle:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.explorer-search {
		padding: var(--spacing-2);
		border-bottom: 1px solid var(--color-border);
	}

	.search-wrapper {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1) var(--spacing-2);
		border: none;
		border-radius: var(--radius-inner);
		background: var(--color-background-canvas);
		transition: box-shadow var(--duration-fast) var(--ease-standard);
	}

	.search-wrapper:focus-within {
		outline: var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);
		outline-offset: -2px;
	}

	.search-icon {
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		min-width: 0;
		padding: var(--spacing-0-5) 0;
		font-size: var(--font-size-sm);
		border: none;
		background: transparent;
		color: var(--color-text-primary);
		outline: none;
	}

	.search-input::placeholder {
		color: var(--color-text-tertiary);
	}

	.search-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-inner);
		color: var(--color-text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
		transition: color var(--duration-fast) var(--ease-standard);
	}

	.search-clear:hover {
		color: var(--color-text-primary);
	}

	.explorer-tree {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: var(--spacing-1) 0;
	}

	.explorer-tree::-webkit-scrollbar {
		width: 4px;
	}

	.explorer-tree::-webkit-scrollbar-track {
		background: transparent;
	}

	.explorer-tree::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: var(--radius-full);
	}

	.tree-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		width: 100%;
		padding: var(--spacing-1) var(--spacing-2);
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: none;
		background: none;
		text-align: left;
		white-space: nowrap;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.dir-item {
		color: var(--color-text-primary);
	}

	.file-item {
		color: var(--color-text-secondary);
	}

	.tree-item:hover {
		background: var(--color-background-muted);
	}

	.tree-item:hover .tree-label {
		color: var(--color-text-primary);
	}

	.tree-item.selected {
		background: var(--color-background-muted);
		border-left: 2px solid var(--color-accent);
	}

	.tree-item.selected .tree-label {
		color: var(--color-text-primary);
	}

	.tree-item.highlighted {
		background: color-mix(in srgb, var(--color-warning-muted) 50%, transparent);
	}

	.tree-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		flex-shrink: 0;
		color: var(--color-text-tertiary);
		transition: none;
	}

	.tree-chevron .material-symbols-outlined {
		font-size: 16px;
	}

	.tree-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-text-tertiary);
	}

	.tree-icon .material-symbols-outlined {
		font-size: 16px;
	}

	.tree-icon.expanded {
		color: color-mix(in srgb, var(--color-accent) 70%, transparent);
	}

	.tree-label {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.tree-count {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.tree-file-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-text-tertiary);
	}

	.tree-file-icon .material-symbols-outlined {
		font-size: 16px;
	}

	.tree-file-icon.selected {
		color: var(--color-accent);
	}

	.file-item .tree-label {
		font-family: var(--font-code);
	}

	/* Mobile overlay mode */
	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		z-index: 29;
	}

	.file-explorer.mobile {
		position: fixed;
		top: 0;
		left: 0;
		width: 80vw;
		height: 100vh;
		z-index: 30;
		animation: slideIn var(--duration-fast) var(--ease-standard);
	}

	@keyframes slideIn {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(0);
		}
	}
</style>
