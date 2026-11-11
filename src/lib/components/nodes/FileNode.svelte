<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data } = $props();

	const langColors: Record<string, string> = {
		python: '#22c55e',
		javascript: '#eab308',
		typescript: '#3b82f6',
		svelte: '#ff3e00',
		css: '#a855f7',
		html: '#f97316',
		json: '#6b7280',
		markdown: '#6b7280'
	};

	const langColor = $derived(langColors[data.language ?? ''] ?? '#6b7280');
</script>

<div class="file-node" style="border-left-color: {langColor};">
	<Handle type="target" position={Position.Top} />

	<div class="node-content">
		<span class="file-icon">&#128196;</span>
		<div class="info">
			<span class="label">{data.label}</span>
			<div class="meta">
				{#if data.language}
					<span class="lang-badge" style="background: {langColor};">{data.language}</span>
				{/if}
				{#if data.childCount > 0}
					<span class="symbol-count"
						>{i18nStore.t('common.symbolCount', { n: data.childCount })}</span
					>
				{/if}
			</div>
		</div>
	</div>

	<Handle type="source" position={Position.Bottom} />
</div>

<style>
	.file-node {
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-left: 4px solid #6b7280;
		border-radius: 6px;
		padding: 8px 12px;
		min-width: 160px;
		font-size: 12px;
		color: #1f2937;
		cursor: pointer;
		transition:
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}

	.file-node:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	}

	.node-content {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.file-icon {
		font-size: 14px;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.label {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
	}

	.lang-badge {
		color: white;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 3px;
		text-transform: uppercase;
	}

	.symbol-count {
		font-size: 10px;
		color: #6b7280;
	}
</style>
