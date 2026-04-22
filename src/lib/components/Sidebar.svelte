<script lang="ts">
	import FileExplorer from './FileExplorer.svelte';
	import SemanticTree from './SemanticTree.svelte';
	import SidebarResizeHandle from './SidebarResizeHandle.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { layoutStore } from '$lib/stores/layoutStore.svelte';

	let {
		mobile = false,
		ontogglecontent
	}: {
		mobile?: boolean;
		ontogglecontent?: () => void;
	} = $props();

	let activePanel = $state<'files' | 'semantic'>('files');
	let contentOpen = $state(true);

	const hasSemanticData = $derived(semanticStore.cache.size > 0);

	// Auto-switch to semantic panel when first analysis completes
	let autoSwitched = $state(false);
	$effect(() => {
		if (hasSemanticData && !autoSwitched) {
			activePanel = 'semantic';
			contentOpen = true;
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
</script>

{#if mobile && contentOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="mobile-overlay"
		onclick={handleMobileClose}
		onkeydown={(e) => {
			if (e.key === 'Escape') handleMobileClose();
		}}
	></div>
{/if}
<aside class="sidebar" class:mobile class:content-closed={!contentOpen}>
	<div class="sidebar-icons">
		<button
			class="icon-btn"
			class:active={activePanel === 'files' && contentOpen}
			onclick={() => handleIconClick('files')}
			title="File Explorer"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
			</svg>
		</button>
		<button
			class="icon-btn"
			class:active={activePanel === 'semantic' && contentOpen}
			class:disabled={!hasSemanticData}
			onclick={() => handleIconClick('semantic')}
			title={hasSemanticData ? 'Semantic Tree' : 'Semantic Tree (run AI analysis first)'}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="5" r="3" />
				<line x1="12" y1="8" x2="12" y2="14" />
				<circle cx="6" cy="19" r="3" />
				<circle cx="18" cy="19" r="3" />
				<line x1="12" y1="14" x2="6" y2="16" />
				<line x1="12" y1="14" x2="18" y2="16" />
			</svg>
		</button>
	</div>
	{#if contentOpen}
		<div class="sidebar-content" style:width="{layoutStore.sidebarWidth}px">
			{#if activePanel === 'files'}
				<FileExplorer collapsed={false} mobile={false} ontoggle={() => (contentOpen = false)} />
			{:else}
				<div class="semantic-panel" data-tour-step="4">
					<div class="panel-header">
						<span class="panel-title">Semantic Tree</span>
						<button class="panel-toggle" onclick={() => (contentOpen = false)} title="Hide Panel">
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
								<polyline points="11 17 6 12 11 7" />
							</svg>
						</button>
					</div>
					<SemanticTree />
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
		background: var(--sidebar-content-bg, var(--bg-primary));
		overflow: hidden;
		flex-shrink: 0;
		border-right: 1px solid var(--ghost-border);
	}

	.sidebar-icons {
		width: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 16px 0;
		background: var(--sidebar-icon-bg, var(--bg-secondary));
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
		border-radius: 6px;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.icon-btn:hover:not(.disabled) {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.icon-btn.active {
		color: var(--accent);
		background: var(--bg-tertiary);
		border-left: 2px solid var(--accent);
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
		background: var(--sidebar-content-bg, var(--bg-primary));
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
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}

	.panel-title {
		font-family: var(--font-display, inherit);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
	}

	.panel-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.panel-toggle:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	/* Mobile overlay mode */
	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: var(--modal-backdrop);
		z-index: 29;
	}

	.sidebar.mobile {
		position: fixed;
		top: 0;
		left: 0;
		width: calc(44px + 80vw);
		height: 100vh;
		z-index: 30;
		animation: slideIn 0.2s ease;
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
