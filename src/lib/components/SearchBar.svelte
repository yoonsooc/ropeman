<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { buildIndex, searchIndex } from '$lib/services/searchService';
	import type { SearchResult } from '$lib/services/searchService';
	import type { GraphNode } from '$lib/types/graph';

	let open = $state(false);
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let selectedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let indexBuilt = $state(false);

	// Rebuild index when project data changes
	$effect(() => {
		const tree = projectStore.fileTree;
		const ast = projectStore.astMap;
		if (tree) {
			buildIndex(tree, ast);
			indexBuilt = true;
		} else {
			indexBuilt = false;
		}
	});

	// Global keyboard shortcut: Cmd+K / Ctrl+K
	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			open = !open;
			if (open) {
				query = '';
				results = [];
				selectedIndex = 0;
				requestAnimationFrame(() => inputEl?.focus());
			}
		}
	}

	function handleInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			results = searchIndex(query);
			selectedIndex = 0;
		}, 150);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (selectedIndex < results.length - 1) selectedIndex++;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (selectedIndex > 0) selectedIndex--;
		} else if (e.key === 'Enter' && results.length > 0) {
			e.preventDefault();
			navigateToResult(results[selectedIndex]);
		}
	}

	function navigateToResult(result: SearchResult) {
		close();
		semanticStore.selectedSemanticNode = null;

		if (result.type === 'file') {
			// Open code tab for the file
			tabStore.openCodeTab(result.path, result.name, false);
			const syntheticNode: GraphNode = {
				id: `file:${result.path}`,
				kind: 'file',
				label: result.name,
				filePath: result.path,
				parentId: null,
				childCount: 0,
				language: result.language,
				isExpanded: false
			};
			selectionStore.selectedNode = syntheticNode;
			selectionStore.breadcrumb = [syntheticNode];
		} else {
			// Symbol: try to find existing graph node, or create synthetic one
			const existingNode = graphStore.nodes.find(
				(n) =>
					n.filePath === result.path && n.label === result.name && n.lineStart === result.lineStart
			);

			if (existingNode) {
				selectionStore.select(existingNode);
			} else {
				tabStore.openCodeTab(result.path, result.name, false);
				const syntheticNode: GraphNode = {
					id: `symbol:${result.path}:${result.name}:${result.lineStart}`,
					kind: (result.kind as GraphNode['kind']) ?? 'function',
					label: result.name,
					filePath: result.path,
					lineStart: result.lineStart,
					parentId: null,
					childCount: 0,
					isExpanded: false
				};
				selectionStore.selectedNode = syntheticNode;
				selectionStore.breadcrumb = [syntheticNode];
			}
		}
	}

	function close() {
		open = false;
		query = '';
		results = [];
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			close();
		}
	}

	function getResultIcon(result: SearchResult): string {
		if (result.type === 'file') return '\u{1F4C4}';
		switch (result.kind) {
			case 'function':
			case 'method':
				return '\u0192';
			case 'class':
				return 'C';
			case 'interface':
				return 'I';
			case 'variable':
				return 'V';
			case 'type':
				return 'T';
			case 'import':
				return '\u2192';
			default:
				return '\u25CB';
		}
	}

	function getIconClass(result: SearchResult): string {
		if (result.type === 'file') return 'icon-file';
		return `icon-${result.kind ?? 'default'}`;
	}

	function shortenPath(path: string): string {
		const parts = path.split('/');
		if (parts.length <= 3) return path;
		return '.../' + parts.slice(-3).join('/');
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open && indexBuilt}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="search-overlay" onkeydown={handleKeydown} onclick={handleBackdropClick}>
		<div class="search-modal">
			<div class="search-input-wrapper">
				<svg
					class="search-icon"
					width="16"
					height="16"
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
					class="search-field"
					placeholder={i18nStore.t('search.placeholder')}
					bind:value={query}
					bind:this={inputEl}
					oninput={handleInput}
				/>
				<kbd class="search-hint">ESC</kbd>
			</div>

			{#if results.length > 0}
				<ul class="search-results">
					{#each results as result, i}
						<li>
							<button
								class="result-item"
								class:selected={i === selectedIndex}
								onclick={() => navigateToResult(result)}
								onmouseenter={() => (selectedIndex = i)}
							>
								<span class="result-icon {getIconClass(result)}">{getResultIcon(result)}</span>
								<span class="result-info">
									<span class="result-name">{result.name}</span>
									<span class="result-path"
										>{shortenPath(result.path)}{#if result.lineStart}:{result.lineStart}{/if}</span
									>
								</span>
								<span class="result-badge"
									>{result.type === 'file' ? i18nStore.t('search.file') : result.kind}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.length > 0}
				<div class="no-results">{i18nStore.t('search.noResults')}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.search-overlay {
		position: fixed;
		inset: 0;
		background: var(--modal-backdrop);
		display: flex;
		justify-content: center;
		padding-top: 20vh;
		z-index: 100;
	}

	.search-modal {
		width: 560px;
		max-height: 420px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		align-self: flex-start;
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.search-icon {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.search-field {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 15px;
		outline: none;
	}

	.search-field::placeholder {
		color: var(--text-muted);
	}

	.search-hint {
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--bg-tertiary);
		color: var(--text-muted);
		border: 1px solid var(--border);
		flex-shrink: 0;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: 4px;
		overflow-y: auto;
	}

	.search-results::-webkit-scrollbar {
		width: 6px;
	}

	.search-results::-webkit-scrollbar-track {
		background: transparent;
	}

	.search-results::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 3px;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
		border-radius: 6px;
		text-align: left;
		font-size: 13px;
		transition: background-color 0.1s ease;
	}

	.result-item:hover,
	.result-item.selected {
		background: var(--bg-tertiary);
	}

	.result-icon {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 700;
		flex-shrink: 0;
		background: var(--bg-primary);
		color: var(--text-secondary);
	}

	.icon-file {
		font-size: 14px;
	}

	.icon-function,
	.icon-method {
		color: #a78bfa;
		background: rgba(167, 139, 250, 0.1);
	}

	.icon-class {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.1);
	}

	.icon-interface,
	.icon-type {
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.1);
	}

	.icon-variable {
		color: #10b981;
		background: rgba(16, 185, 129, 0.1);
	}

	.result-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.result-name {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-path {
		font-size: 11px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-badge {
		font-size: 12px;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--bg-primary);
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.no-results {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		font-size: 13px;
	}

	@media (max-width: 640px) {
		.search-modal {
			width: calc(100% - 32px);
		}
	}
</style>
