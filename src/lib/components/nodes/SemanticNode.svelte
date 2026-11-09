<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';

	let { data } = $props();

	const maxSymbols = 4;
	const displaySymbols = $derived(data.keySymbols?.slice(0, maxSymbols) ?? []);
	const moreCount = $derived((data.keySymbols?.length ?? 0) - maxSymbols);
	const isLeaf = $derived(data.fileCount === 1);
	const isCached: boolean = $derived(data.isCached ?? false);
	const snapshotUnavailable: boolean = $derived(data.snapshotUnavailable ?? false);

	const targetHandleCount: number = $derived(data.targetHandleCount ?? 1);
	const sourceHandleCount: number = $derived(data.sourceHandleCount ?? 1);
	const vertical = $derived(data.direction === 'TB');

	function handleOpen(e: MouseEvent) {
		e.stopPropagation();
		data.onOpen?.(data.nodeId);
	}

	function handleReanalyze(e: MouseEvent) {
		e.stopPropagation();
		data.onReanalyze?.(data.nodeId);
	}
</script>

{#each Array(targetHandleCount) as _, i}
	<Handle
		type="target"
		position={vertical ? Position.Top : Position.Left}
		id="target-{i}"
		style="{vertical ? 'left' : 'top'}: {((i + 1) / (targetHandleCount + 1)) * 100}%;"
	/>
{/each}

<div
	class="semantic-node"
	class:highlighted={data.highlighted}
	class:dimmed={data.dimmed}
	class:selected={data.selected}
	class:snapshot-unavailable={snapshotUnavailable}
	title={snapshotUnavailable ? i18nStore.t('node.notInSnapshot') : undefined}
	style="--node-color: {data.color};"
>
	<div class="node-header">
		<span class="node-dot" aria-hidden="true"></span>
		<span class="node-label">{data.label}</span>
		<span class="node-badge"
			>{i18nStore
				.t(data.fileCount === 1 ? 'node.fileOne' : 'node.fileMany')
				.replace('{n}', String(data.fileCount))}</span
		>
	</div>

	{#if data.description}
		<p class="node-description">{data.description}</p>
	{/if}

	{#if displaySymbols.length > 0}
		<div class="node-symbols">
			{#each displaySymbols as sym}
				<span class="symbol-tag">{sym}</span>
			{/each}
			{#if moreCount > 0}
				<span class="symbol-more">+{moreCount}</span>
			{/if}
		</div>
	{/if}

	<div class="node-footer">
		{#if !isLeaf && isCached}
			<button
				type="button"
				class="reanalyze-btn nodrag"
				title={i18nStore.t('node.reanalyze')}
				aria-label={i18nStore.t('node.reanalyze')}
				onclick={handleReanalyze}
			>
				&#x21BB;
			</button>
		{/if}
		<button type="button" class="open-btn nodrag" onclick={handleOpen}>
			{isLeaf
				? i18nStore.t('node.openCode')
				: snapshotUnavailable
					? i18nStore.t('node.notInSnapshotShort')
					: i18nStore.t('node.openInside')}
			<span aria-hidden="true">&#x203A;</span>
		</button>
	</div>
</div>

{#each Array(sourceHandleCount) as _, i}
	<Handle
		type="source"
		position={vertical ? Position.Bottom : Position.Right}
		id="source-{i}"
		style="{vertical ? 'left' : 'top'}: {((i + 1) / (sourceHandleCount + 1)) * 100}%;"
	/>
{/each}

<style>
	/* Node card: tinted by its domain color, three type steps (15 / 12 / 11) */
	.semantic-node {
		width: 256px;
		min-height: 176px;
		background: color-mix(in srgb, var(--node-color) 7%, var(--bg-secondary));
		border: 1px solid color-mix(in srgb, var(--node-color) 30%, transparent);
		border-radius: 10px;
		padding: 14px 16px 10px;
		cursor: pointer;
		position: relative;
		transition:
			background-color 0.15s ease-out,
			opacity 0.2s ease-out;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	@media (hover: hover) {
		.semantic-node:hover {
			background: color-mix(in srgb, var(--node-color) 12%, var(--bg-secondary));
		}
	}

	.semantic-node.highlighted {
		background: color-mix(in srgb, var(--node-color) 14%, var(--bg-secondary));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color) 55%, transparent);
	}

	.semantic-node.selected {
		border-color: var(--node-color);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--node-color) 55%, transparent),
			0 8px 24px rgba(0, 0, 0, 0.2);
	}

	/* Unrelated nodes step back but stay readable; neighbors of the selection stay lit */
	.semantic-node.dimmed {
		opacity: 0.6;
	}

	/* Snapshot viewers (share/explore): the curated data has no deeper level
	   for this node. Dashed border sets the expectation; still clickable. */
	.semantic-node.snapshot-unavailable {
		border-style: dashed;
		opacity: 0.85;
	}

	/* Handles stay invisible; edges attach without dots on the card */
	.semantic-node :global(.svelte-flow__handle) {
		width: 6px;
		height: 6px;
		background: var(--node-color);
		border: none;
		opacity: 0;
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.node-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--node-color);
		flex-shrink: 0;
	}

	.node-label {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--text-primary);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-display);
	}

	.node-badge {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.node-description {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.node-symbols {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.symbol-tag {
		font-size: 11px;
		font-family: var(--font-code);
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--node-color) 10%, transparent);
		padding: 1px 6px;
		border-radius: 4px;
		max-width: 112px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.symbol-more {
		font-size: 11px;
		color: var(--text-muted);
		align-self: center;
	}

	.node-footer {
		margin-top: auto;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 4px;
	}

	.open-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 500;
		color: color-mix(in srgb, var(--node-color) 70%, var(--text-primary));
		padding: 2px 6px;
		border-radius: 4px;
		transition: background-color 0.15s ease-out;
	}

	.snapshot-unavailable .open-btn {
		color: var(--text-muted);
	}

	.reanalyze-btn {
		width: 24px;
		height: 24px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		color: var(--text-muted);
		font-size: 14px;
		line-height: 1;
		opacity: 0;
		transition:
			opacity 0.15s ease-out,
			background-color 0.15s ease-out;
	}

	.semantic-node:focus-within .reanalyze-btn {
		opacity: 1;
	}

	@media (hover: hover) {
		.semantic-node:hover .reanalyze-btn {
			opacity: 1;
		}

		.open-btn:hover,
		.reanalyze-btn:hover {
			background: color-mix(in srgb, var(--node-color) 16%, transparent);
		}
	}

	/* Zoomed out: titles and descriptions carry the map, symbol chips step aside */
	:global(.zui-canvas[data-zoom='far']) .node-symbols {
		display: none;
	}
</style>
