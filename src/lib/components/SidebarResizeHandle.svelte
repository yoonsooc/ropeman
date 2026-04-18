<script lang="ts">
	import { layoutStore } from '$lib/stores/layoutStore.svelte';

	function handlePointerDown(e: PointerEvent) {
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);

		const sidebar = target.closest('aside.sidebar') as HTMLElement | null;
		if (!sidebar) return;
		const sidebarLeft = sidebar.getBoundingClientRect().left;
		const iconBarWidth = 48;

		function handlePointerMove(ev: PointerEvent) {
			layoutStore.sidebarWidth = ev.clientX - sidebarLeft - iconBarWidth;
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
<div class="sidebar-resize-handle" onpointerdown={handlePointerDown}></div>

<style>
	.sidebar-resize-handle {
		flex-shrink: 0;
		width: 4px;
		cursor: col-resize;
		background: var(--border);
		transition: background-color 0.15s ease;
		touch-action: none;
		z-index: 10;
		/* 12px hit area around the 4px visible bar */
		margin: 0 -4px;
		padding: 0 4px;
		background-clip: content-box;
	}

	.sidebar-resize-handle:hover,
	.sidebar-resize-handle:active {
		background: var(--accent, #3b82f6);
	}
</style>
