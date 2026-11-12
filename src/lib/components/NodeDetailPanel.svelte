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

	const kindIcons: Record<string, string> = {
		directory: '\uD83D\uDCC1',
		file: '\uD83D\uDCC4',
		function: 'f\u2099',
		class: '\u25C7',
		method: '\u2192',
		import: '\u21E5'
	};
</script>

<div class="node-detail-panel">
	{#if node}
		<div class="panel-header">
			<div class="header-info">
				<span
					class="kind-badge"
					style="background: {kindColors[node.kind] ?? 'var(--color-accent)'}"
				>
					<span class="kind-icon">{kindIcons[node.kind] ?? ''}</span>
					{node.kind}
				</span>
				<h3 class="node-name">{node.label}</h3>
			</div>
			<button class="close-btn" onclick={onclose} title={i18nStore.t('common.close')}
				>&#10005;</button
			>
		</div>

		<div class="panel-content">
			<div class="file-path">
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
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
				</svg>
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
			<button class="close-btn" onclick={onclose}>&#10005;</button>
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
		animation: slideIn 0.2s ease;
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
		padding: 16px;
		border-bottom: 1px solid var(--color-border);
		gap: 12px;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.kind-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-on-accent);
		width: fit-content;
	}

	.kind-icon {
		font-size: 11px;
	}

	.node-name {
		font-size: 16px;
		font-weight: 600;
		color: var(--color-text-primary);
		word-break: break-word;
	}

	.close-btn {
		font-size: 16px;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		flex-shrink: 0;
		transition:
			background-color var(--transition),
			color var(--transition);
	}

	.close-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.file-path {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--color-text-secondary);
		word-break: break-all;
	}

	.file-path svg {
		flex-shrink: 0;
	}

	.code-section {
		margin: 0 -4px;
	}

	.metadata-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.section-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-tertiary);
	}

	.meta-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.meta-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 10px;
		background: var(--color-background-surface);
		border-radius: 6px;
		font-size: 13px;
	}

	.meta-label {
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.meta-value {
		color: var(--color-text-primary);
		font-weight: 500;
	}

	.meta-value.mono {
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 11px;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		color: var(--color-text-tertiary);
		text-align: center;
		margin-top: 40px;
	}
</style>
