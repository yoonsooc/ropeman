<script lang="ts">
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import type { GraphNode } from '$lib/types/graph';
	import { getFileIcon } from '$lib/utils/fileIcons';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { splitFilePath } from '$lib/utils/filePath';

	let { ondismiss }: { ondismiss?: () => void } = $props();

	const node = $derived(semanticStore.selectedSemanticNode);

	function handleFileClick(filePath: string) {
		const fileName = filePath.split('/').pop() ?? filePath;
		const syntheticNode: GraphNode = {
			id: `file:${filePath}`,
			kind: 'file',
			label: fileName,
			filePath,
			parentId: null,
			childCount: 0,
			isExpanded: false
		};
		// Keep selectedSemanticNode (S6: preserve analysis flow when clicking files in detail panel)
		selectionStore.selectedNode = syntheticNode;
		selectionStore.breadcrumb = [syntheticNode];
		tabStore.openCodeTab(filePath, fileName, true);
	}

	function handleClose() {
		ondismiss?.();
	}
</script>

{#if node}
	<div class="semantic-detail-panel">
		<div class="panel-header">
			<span class="panel-dot" style="background: {node.color};" aria-hidden="true"></span>
			<h2 class="panel-label">{node.label}</h2>
			<button
				type="button"
				class="panel-close"
				onclick={handleClose}
				title={i18nStore.t('panel.close')}
				aria-label={i18nStore.t('panel.close')}
			>
				<svg
					aria-hidden="true"
					width="14"
					height="14"
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
		</div>

		{#if node.description}
			<div class="panel-section">
				<h3 class="section-title">{i18nStore.t('panel.description')}</h3>
				<p class="panel-description">{node.description}</p>
			</div>
		{/if}

		{#if node.filePaths.length > 0}
			<div class="panel-section">
				<h3 class="section-title">
					{i18nStore.t('panel.files')} <span class="file-count">{node.fileCount}</span>
				</h3>
				<div class="file-list">
					{#each node.filePaths as fp}
						{@const parts = splitFilePath(fp)}
						{@const fIcon = getFileIcon(parts.name)}
						<button type="button" class="file-item" title={fp} onclick={() => handleFileClick(fp)}>
							<span
								aria-hidden="true"
								class="file-icon material-symbols-outlined"
								style={fIcon.color ? `color:${fIcon.color}` : ''}>{fIcon.icon}</span
							>
							<span class="file-name">{parts.name}</span>
							{#if parts.dir}<span class="file-dir">{parts.dir}</span>{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if node.keySymbols.length > 0}
			<div class="panel-section">
				<h3 class="section-title">{i18nStore.t('panel.keySymbols')}</h3>
				<div class="symbol-tags">
					{#each node.keySymbols as sym}
						<span class="symbol-tag">{sym}</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.semantic-detail-panel {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-background-sidebar-content);
		overflow-y: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-5);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.panel-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-right: var(--spacing-2);
	}

	.panel-label {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		font-family: var(--font-display);
		line-height: 1.3;
		color: var(--color-text-primary);
		flex: 1;
		min-width: 0;
		word-break: break-word;
	}

	.panel-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-inner);
		color: var(--color-text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.panel-close:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.panel-section {
		padding: var(--spacing-5);
		border-bottom: 1px solid var(--color-border);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-tertiary);
		margin-bottom: var(--spacing-4);
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
	}

	.file-count {
		font-size: var(--font-size-sm);
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-semibold);
		background: var(--color-background-muted);
		color: var(--color-text-secondary);
		padding: 1px var(--spacing-1-5);
		border-radius: var(--radius-element);
	}

	.panel-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.625;
		margin: 0;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-1-5) var(--spacing-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		border: none;
		background: none;
		text-align: left;
		border-radius: var(--radius-inner);
		transition: background-color var(--duration-fast) var(--ease-standard);
		width: 100%;
	}

	.file-item:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.file-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.file-name {
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		flex-shrink: 1;
	}

	/* The folder trails the file name and gives way first when space runs out */
	.file-dir {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		flex: 1;
	}

	.symbol-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-2);
	}

	.symbol-tag {
		font-size: var(--font-size-sm);
		font-family: var(--font-code);
		color: var(--color-text-secondary);
		background: var(--color-background-muted);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-inner);
	}
</style>
