<script lang="ts">
	import { layoutStore } from '$lib/stores/layoutStore.svelte';

	function handlePointerDown(e: PointerEvent) {
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);

		const container = target.parentElement;
		if (!container) return;

		const isVertical = layoutStore.splitDirection === 'vertical';

		function handlePointerMove(ev: PointerEvent) {
			const rect = container!.getBoundingClientRect();
			let ratio: number;
			if (isVertical) {
				ratio = (ev.clientX - rect.left) / rect.width;
			} else {
				ratio = (ev.clientY - rect.top) / rect.height;
			}
			layoutStore.splitRatio = ratio;
		}

		function handlePointerUp() {
			target.removeEventListener('pointermove', handlePointerMove);
			target.removeEventListener('pointerup', handlePointerUp);
		}

		target.addEventListener('pointermove', handlePointerMove);
		target.addEventListener('pointerup', handlePointerUp);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="resize-handle"
	class:vertical={layoutStore.splitDirection === 'vertical'}
	class:horizontal={layoutStore.splitDirection === 'horizontal'}
	onpointerdown={handlePointerDown}
></div>

<style>
	.resize-handle {
		flex-shrink: 0;
		background: var(--color-border);
		transition: background-color 0.15s ease;
		touch-action: none;
		z-index: 10;
	}

	.resize-handle:hover,
	.resize-handle:active {
		background: var(--color-accent);
	}

	.resize-handle.vertical {
		width: 4px;
		cursor: col-resize;
		/* 12px hit area */
		margin: 0 -4px;
		padding: 0 4px;
		background-clip: content-box;
	}

	.resize-handle.horizontal {
		height: 4px;
		cursor: row-resize;
		margin: -4px 0;
		padding: 4px 0;
		background-clip: content-box;
	}
</style>
