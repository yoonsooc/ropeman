<script lang="ts">
	let {
		text = '',
		visible = false,
		x = 0,
		y = 0
	}: {
		text?: string;
		visible?: boolean;
		x?: number;
		y?: number;
	} = $props();
</script>

{#if visible}
	<div class="tooltip" style="left: {x + 12}px; top: {y + 12}px;">
		{text}
	</div>
{/if}

<style>
	.tooltip {
		position: fixed;
		z-index: 100;
		background: var(--color-background-inverted);
		color: var(--color-on-inverted);
		max-width: 280px;
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 12px;
		line-height: 1.4;
		pointer-events: none;
		box-shadow: 0 2px 8px var(--color-shadow);
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
