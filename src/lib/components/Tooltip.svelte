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
		padding: var(--spacing-2) var(--spacing-3);
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		line-height: 1.4;
		pointer-events: none;
		box-shadow: var(--shadow-low);
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
