<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	let { data } = $props();

	const maxSymbols = 4;
	const displaySymbols = data.keySymbols?.slice(0, maxSymbols) ?? [];
	const moreCount = (data.keySymbols?.length ?? 0) - maxSymbols;
	const isLeaf = data.fileCount === 1;
	const isCached: boolean = data.isCached ?? false;
	const snapshotUnavailable: boolean = data.snapshotUnavailable ?? false;

	const targetHandleCount: number = data.targetHandleCount ?? 1;
	const sourceHandleCount: number = data.sourceHandleCount ?? 1;

	function handleReanalyze(e: MouseEvent) {
		e.stopPropagation();
		data.onReanalyze?.(data.nodeId);
	}
</script>

{#each Array(targetHandleCount) as _, i}
	<Handle
		type="target"
		position={Position.Left}
		id="target-{i}"
		style="top: {((i + 1) / (targetHandleCount + 1)) * 100}%;"
	/>
{/each}

<div
	class="semantic-node"
	class:highlighted={data.highlighted}
	class:dimmed={data.dimmed}
	class:selected={data.selected}
	class:snapshot-unavailable={snapshotUnavailable}
	title={snapshotUnavailable ? 'Not in this snapshot — double-click for details' : undefined}
	style="
		--node-color: {data.color};
	"
>
	<div class="accent-bar" style="background: {data.color};"></div>
	<div class="node-header">
		<span class="node-label">{data.label}</span>
		<span class="node-badge">
			{data.fileCount}
			{data.fileCount === 1 ? 'file' : 'files'}
		</span>
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

	{#if !isLeaf}
		<div class="drilldown-hint">
			{#if isCached}
				<button class="reanalyze-btn" title="Re-analyze" onclick={handleReanalyze}>
					&#x21BB;
				</button>
			{/if}
			<span class="drilldown-icon">&#x25B6;</span>
		</div>
	{/if}
</div>

{#each Array(sourceHandleCount) as _, i}
	<Handle
		type="source"
		position={Position.Right}
		id="source-{i}"
		style="top: {((i + 1) / (sourceHandleCount + 1)) * 100}%;"
	/>
{/each}

<style>
	.semantic-node {
		width: 256px;
		min-height: 120px;
		background: var(--bg-tertiary, #1b2028);
		border: 1px solid var(--ghost-border);
		border-radius: 8px;
		padding: 16px;
		cursor: pointer;
		position: relative;
		transition: background 0.15s ease;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.accent-bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
		border-radius: 8px 0 0 8px;
	}

	.semantic-node:hover {
		background: var(--bg-highest, #20262f);
	}

	.semantic-node.highlighted {
		background: var(--bg-highest, #20262f);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-color, var(--accent)) 45%, transparent);
	}

	.semantic-node.selected {
		border: 2px solid var(--accent);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	}

	/* Unrelated nodes step back but stay readable; neighbors of the selection stay lit */
	.semantic-node.dimmed {
		opacity: 0.6;
		transition: opacity 0.2s ease-out;
	}

	/* Snapshot viewers (share/explore): node's deeper analysis is not in the
	   curated data. Dashed border + muted to set expectation; still clickable
	   so the user can open the "analyze it yourself" prompt. */
	.semantic-node.snapshot-unavailable {
		border-style: dashed;
		border-color: var(--ghost-border, rgba(148, 163, 184, 0.25));
		opacity: 0.85;
	}
	.semantic-node.snapshot-unavailable:hover {
		opacity: 0.92;
	}
	.semantic-node.snapshot-unavailable .drilldown-icon {
		color: var(--accent);
		opacity: 0.6;
	}
	.semantic-node.snapshot-unavailable:hover .drilldown-icon {
		opacity: 1;
	}

	/* Handles — hidden by default, visible on hover */
	.semantic-node :global(.svelte-flow__handle) {
		width: 6px;
		height: 6px;
		background: var(--accent);
		border: none;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.semantic-node:hover :global(.svelte-flow__handle) {
		opacity: 1;
	}

	.node-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.node-label {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.025em;
		line-height: 1.2;
		color: var(--text-primary, #f1f3fc);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
	}

	.node-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.node-description {
		font-size: 11px;
		font-family: var(--font-body, 'Inter', sans-serif);
		color: var(--text-secondary, #a8abb3);
		line-height: 1.625;
		margin: 0 0 12px 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.node-symbols {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.symbol-tag {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--text-muted, #72757d);
		background: var(--bg-secondary, #151a21);
		padding: 2px 8px;
		border-radius: 4px;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.symbol-more {
		font-size: 10px;
		color: var(--text-muted);
	}

	.drilldown-hint {
		position: absolute;
		bottom: 8px;
		right: 12px;
		opacity: 0.3;
		transition: opacity 0.15s ease;
	}

	.semantic-node:hover .drilldown-hint {
		opacity: 0.7;
	}

	.drilldown-icon {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.reanalyze-btn {
		display: none;
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 4px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.08));
		color: var(--text-secondary);
		font-size: 14px;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.semantic-node:hover .reanalyze-btn {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reanalyze-btn:hover {
		background: var(--accent-bg, rgba(163, 166, 255, 0.12));
		color: var(--accent, #a3a6ff);
	}
</style>
