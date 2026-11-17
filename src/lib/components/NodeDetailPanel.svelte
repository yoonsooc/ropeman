<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import CodePanel from '$lib/components/CodePanel.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const node = $derived(selectionStore.selectedNode);

	const kindColors: Record<string, string> = {
		directory: 'var(--color-directory)',
		file: 'var(--color-file)',
		function: 'var(--color-function)',
		class: 'var(--color-class)',
		method: 'var(--color-method)',
		import: 'var(--color-import)'
	};
</script>

<div class="node-detail-panel">
	{#if node}
		<div class="panel-header">
			<div class="header-info">
				<span class="kind-badge">
					<span
						class="kind-dot"
						style="background: {kindColors[node.kind] ?? 'var(--color-text-tertiary)'}"
					></span>
					{node.kind}
				</span>
				<h3 class="node-name">{node.label}</h3>
			</div>
			<button
				class="close-btn"
				onclick={onclose}
				title={i18nStore.t('common.close')}
				aria-label={i18nStore.t('common.close')}
				><span aria-hidden="true" class="material-symbols-outlined">close</span></button
			>
		</div>

		<div class="panel-content">
			<div class="file-path">
				<span aria-hidden="true" class="material-symbols-outlined">folder</span>
				<span>{node.filePath}</span>
			</div>

			{#if node.code && node.language}
				<section class="code-section">
					<CodePanel
						code={node.code}
						language={node.language}
						lineStart={node.lineStart}
						lineEnd={node.lineEnd}
					/>
				</section>
			{/if}

			<section class="metadata-section">
				<h4 class="section-title">{i18nStore.t('nodeDetail.details')}</h4>
				<div class="meta-grid">
					{#if node.language}
						<div class="meta-item">
							<span class="meta-label">{i18nStore.t('nodeDetail.language')}</span>
							<span class="meta-value">{node.language}</span>
						</div>
					{/if}
					{#if node.lineStart != null && node.lineEnd != null}
						<div class="meta-item">
							<span class="meta-label">{i18nStore.t('nodeDetail.lines')}</span>
							<span class="meta-value">{node.lineStart} - {node.lineEnd}</span>
						</div>
					{/if}
					<div class="meta-item">
						<span class="meta-label">{i18nStore.t('nodeDetail.children')}</span>
						<span class="meta-value">{node.childCount}</span>
					</div>
					{#if node.parentId}
						<div class="meta-item">
							<span class="meta-label">{i18nStore.t('nodeDetail.parent')}</span>
							<span class="meta-value mono">{node.parentId}</span>
						</div>
					{/if}
					<div class="meta-item">
						<span class="meta-label">{i18nStore.t('nodeDetail.id')}</span>
						<span class="meta-value mono">{node.id}</span>
					</div>
				</div>
			</section>
		</div>
	{:else}
		<div class="panel-header">
			<h3 class="node-name">{i18nStore.t('nodeDetail.title')}</h3>
			<button class="close-btn" onclick={onclose} aria-label={i18nStore.t('common.close')}
				><span aria-hidden="true" class="material-symbols-outlined">close</span></button
			>
		</div>
		<div class="panel-content">
			<p class="empty">{i18nStore.t('nodeDetail.empty')}</p>
		</div>
	{/if}
</div>

<style>
	.node-detail-panel {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-background-body);
		animation: slideIn var(--duration-fast) var(--ease-standard);
	}

	@keyframes slideIn {
		from {
			transform: translateX(16px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: var(--spacing-4);
		border-bottom: 1px solid var(--color-border);
		gap: var(--spacing-3);
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-width: 0;
	}

	.kind-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		background: var(--color-background-muted);
		width: fit-content;
	}

	.kind-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.node-name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		word-break: break-word;
	}

	.close-btn {
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: var(--spacing-1);
		border-radius: var(--radius-inner);
		flex-shrink: 0;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.close-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-4);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.file-path {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		word-break: break-all;
	}

	.file-path .material-symbols-outlined {
		font-size: 14px;
		flex-shrink: 0;
	}

	.code-section {
		margin: 0 calc(-1 * var(--spacing-1));
	}

	.metadata-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.section-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-tertiary);
	}

	.meta-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.meta-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-1-5) var(--spacing-2);
		background: var(--color-background-surface);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-base);
	}

	.meta-label {
		color: var(--color-text-secondary);
		font-weight: var(--font-weight-medium);
	}

	.meta-value {
		color: var(--color-text-primary);
		font-weight: var(--font-weight-medium);
	}

	.meta-value.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: var(--font-size-sm);
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		color: var(--color-text-tertiary);
		text-align: center;
		margin-top: var(--spacing-10);
	}
</style>
