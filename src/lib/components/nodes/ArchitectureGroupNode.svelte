<script lang="ts">
	let { data } = $props();
</script>

<div
	class="arch-group"
	style="
		background: {data.color}0d;
		border-left-color: {data.color};
		width: {data.width}px;
		height: {data.height}px;
	"
>
	<div class="arch-group-header">
		<span class="arch-group-label" style="color: {data.color};">{data.label}</span>
		<span class="arch-group-count" style="color: {data.color}80;">
			{data.nodeIds?.length ?? 0}
		</span>
	</div>
</div>

<style>
	.arch-group {
		border: 1px solid var(--ghost-border);
		border-left: 4px solid;
		border-radius: 8px;
		position: relative;
		pointer-events: all;
		cursor: pointer;
		transition: box-shadow 0.2s ease;
	}

	.arch-group:hover {
		box-shadow: 0 0 0 1px var(--ghost-border);
	}

	.arch-group-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	.arch-group-label {
		font-size: 11px;
		font-weight: 700;
	}

	.arch-group-count {
		font-size: 10px;
		font-weight: 500;
	}
</style>
