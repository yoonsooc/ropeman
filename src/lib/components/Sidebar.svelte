<script lang="ts">
	import { untrack } from 'svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import FileExplorer from './FileExplorer.svelte';
	import SemanticTree from './SemanticTree.svelte';
	import SidebarResizeHandle from './SidebarResizeHandle.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { layoutStore } from '$lib/stores/layoutStore.svelte';
	import type { SemanticNode } from '$lib/types/semantic';

	let {
		mobile = false,
		ontogglecontent,
		onexpand
	}: {
		mobile?: boolean;
		ontogglecontent?: () => void;
		/** Bridge mode: the semantic tree opens uncached levels through serve, as the canvas does */
		onexpand?: (node: SemanticNode) => void;
	} = $props();

	let activePanel = $state<'files' | 'semantic'>('files');
	// A phone that mounts the sidebar beside a diagram (Bridge mode) came to see the diagram.
	// Read once: later changes follow the auto-switch below
	let contentOpen = $state(untrack(() => !(mobile && semanticStore.cache.size > 0)));

	const hasSemanticData = $derived(semanticStore.cache.size > 0);
	const railButtons: Partial<Record<'files' | 'semantic', HTMLButtonElement>> = {};

	// Auto-switch to semantic panel when first analysis completes. On mobile the panel would
	// cover the new diagram, so it stays as the user left it.
	let autoSwitched = $state(false);
	$effect(() => {
		if (hasSemanticData && !autoSwitched) {
			activePanel = 'semantic';
			if (!mobile) contentOpen = true;
			autoSwitched = true;
		}
	});

	export function toggleContent() {
		contentOpen = !contentOpen;
	}

	export function showFiles() {
		activePanel = 'files';
		contentOpen = true;
	}

	export function togglePanel() {
		if (activePanel === 'files' && hasSemanticData) {
			activePanel = 'semantic';
			contentOpen = true;
		} else {
			activePanel = 'files';
			contentOpen = true;
		}
	}

	function handleIconClick(panel: 'files' | 'semantic') {
		if (panel === 'semantic' && !hasSemanticData) return;
		if (activePanel === panel) {
			// Toggle content open/close when clicking the active icon
			contentOpen = !contentOpen;
		} else {
			activePanel = panel;
			contentOpen = true;
		}
	}

	function handleMobileClose() {
		contentOpen = false;
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !mobile || !contentOpen) return;
		// A modal over the drawer owns this Escape
		if (e.target instanceof Element && e.target.closest('[aria-modal="true"], dialog')) return;
		handleMobileClose();
		railButtons[activePanel]?.focus();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if mobile && contentOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="mobile-overlay" onclick={handleMobileClose}></div>
{/if}
<aside class="sidebar" class:mobile class:content-closed={!contentOpen}>
	<div class="sidebar-icons">
		<button
			bind:this={railButtons.files}
			class="icon-btn"
			class:active={activePanel === 'files' && contentOpen}
			onclick={() => handleIconClick('files')}
			title={i18nStore.t('sidebar.fileExplorer')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">folder</span>
		</button>
		<button
			bind:this={railButtons.semantic}
			class="icon-btn"
			class:active={activePanel === 'semantic' && contentOpen}
			class:disabled={!hasSemanticData}
			onclick={() => handleIconClick('semantic')}
			title={hasSemanticData
				? i18nStore.t('sidebar.semanticTree')
				: i18nStore.t('sidebar.semanticTreeNeedsAnalysis')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">account_tree</span>
		</button>
	</div>
	{#if contentOpen}
		<div class="sidebar-content" style:width={mobile ? undefined : `${layoutStore.sidebarWidth}px`}>
			{#if activePanel === 'files'}
				<FileExplorer
					collapsed={false}
					mobile={false}
					ontoggle={() => (contentOpen = false)}
					onfileopen={mobile ? handleMobileClose : undefined}
				/>
			{:else}
				<div class="semantic-panel" data-tour-step="4">
					<div class="panel-header">
						<span class="panel-title">{i18nStore.t('sidebar.semanticTree')}</span>
						<button
							class="panel-toggle"
							onclick={() => (contentOpen = false)}
							title={i18nStore.t('sidebar.hidePanel')}
						>
							<span aria-hidden="true" class="material-symbols-outlined">chevron_left</span>
						</button>
					</div>
					<SemanticTree {onexpand} />
				</div>
			{/if}
		</div>
		{#if !mobile}
			<SidebarResizeHandle />
		{/if}
	{/if}
</aside>

<style>
	.sidebar {
		display: flex;
		background: var(--color-background-sidebar-content);
		overflow: hidden;
		--focus-outline-offset: -2px;
		flex-shrink: 0;
		border-right: 1px solid var(--color-border);
	}

	.sidebar-icons {
		width: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-4);
		padding: var(--spacing-4) 0;
		background: var(--color-background-sidebar-icon);
	}

	.sidebar.content-closed .sidebar-icons {
		/* No border needed — tonal shift only */
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-element);
		color: var(--color-text-tertiary);
		background: none;
		border: none;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.icon-btn:hover:not(.disabled) {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.icon-btn.active {
		color: var(--color-text-primary);
		background: var(--color-background-muted);
	}

	.icon-btn.disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.sidebar-content {
		min-width: 160px;
		max-width: 480px;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-background-sidebar-content);
	}

	.semantic-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-2) var(--spacing-3);
		border-bottom: 1px solid var(--color-border);
	}

	.panel-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.panel-toggle .material-symbols-outlined {
		font-size: 16px;
	}

	.panel-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-inner);
		color: var(--color-text-tertiary);
		background: none;
		border: none;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.panel-toggle:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	/* Mobile overlay mode */
	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		z-index: 29;
	}

	/* The icon rail stays in the layout; only the open panel floats over the canvas */
	.sidebar.mobile {
		position: relative;
		z-index: 30;
		overflow: visible;
		padding-left: env(safe-area-inset-left);
	}

	.sidebar.mobile .sidebar-content {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 100%;
		width: 80vw;
		padding-bottom: env(safe-area-inset-bottom);
		border-right: 1px solid var(--color-border);
		animation: slideIn var(--duration-fast) var(--ease-standard);
	}

	@keyframes slideIn {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(0);
		}
	}
</style>
