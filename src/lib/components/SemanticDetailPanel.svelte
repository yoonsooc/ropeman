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
		background: var(--sidebar-content-bg, #151a21);
		overflow-y: auto;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.panel-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-right: 10px;
	}

	.panel-label {
		font-size: 16px;
		font-weight: 600;
		font-family: var(--font-display);
		line-height: 1.3;
		color: var(--text-primary);
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
		border-radius: 4px;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
		transition: background-color 0.15s ease;
	}

	.panel-close:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.panel-section {
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		color: var(--text-muted);
		margin-bottom: 16px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.file-count {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		padding: 1px 6px;
		border-radius: 8px;
	}

	.panel-description {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.625;
		margin: 0;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
		border: none;
		background: none;
		text-align: left;
		border-radius: 4px;
		transition: background-color 0.1s ease;
		width: 100%;
	}

	.file-item:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.file-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.file-name {
		font-family: var(--font-code);
		font-size: 12px;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		flex-shrink: 1;
	}

	/* The folder trails the file name and gives way first when space runs out */
	.file-dir {
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		flex: 1;
	}

	.symbol-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.symbol-tag {
		font-size: 11px;
		font-family: var(--font-code, 'JetBrains Mono', monospace);
		color: var(--text-secondary);
		background: var(--bg-tertiary, #1b2028);
		padding: 4px 8px;
		border-radius: 4px;
	}
</style>
