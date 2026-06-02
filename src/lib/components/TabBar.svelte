<script lang="ts">
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import type { Tab } from '$lib/types/tab';

	let {
		paneId = 'primary',
		tabs = tabStore.tabs,
		activeTabId = tabStore.activeTabId,
		onactivate = (id: string) => tabStore.activateTab(id),
		onclose = (id: string) => tabStore.closeTab(id),
		ondroptab
	}: {
		paneId?: 'primary' | 'secondary';
		tabs?: Tab[];
		activeTabId?: string | null;
		onactivate?: (id: string) => void;
		onclose?: (id: string) => void;
		ondroptab?: (tabId: string, fromPane: string) => void;
	} = $props();

	let dropTarget = $state(false);
	let tabBarEl = $state<HTMLDivElement | undefined>(undefined);

	// M3: keep the active tab visible on overflow (mobile horizontal scroll)
	$effect(() => {
		const id = activeTabId;
		const root = tabBarEl;
		if (!id || !root) return;
		queueMicrotask(() => {
			const el = root.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`);
			el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
		});
	});

	function handleMouseDown(e: MouseEvent, tabId: string) {
		// Middle-click to close
		if (e.button === 1) {
			e.preventDefault();
			onclose(tabId);
		}
	}

	function handleDblClick(tabId: string) {
		tabStore.pinTab(tabId);
	}

	function handleDragStart(e: DragEvent, tab: Tab) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/x-tab-id', tab.id);
		e.dataTransfer.setData('text/x-tab-pane', tab.paneId ?? 'primary');
	}

	function handleDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('text/x-tab-id')) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		dropTarget = true;
	}

	function handleDragLeave() {
		dropTarget = false;
	}

	function handleDrop(e: DragEvent) {
		dropTarget = false;
		if (!e.dataTransfer) return;
		e.preventDefault();
		const tabId = e.dataTransfer.getData('text/x-tab-id');
		const fromPane = e.dataTransfer.getData('text/x-tab-pane');
		if (tabId && ondroptab) {
			ondroptab(tabId, fromPane);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if tabs.length > 0 || dropTarget}
	<div
		class="tab-bar"
		class:drop-target={dropTarget}
		bind:this={tabBarEl}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		<div class="tab-list">
			{#each tabs as tab (tab.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tab"
					class:active={tab.id === activeTabId}
					class:preview={tab.preview}
					data-tab-id={tab.id}
					draggable="true"
					onclick={() => onactivate(tab.id)}
					onmousedown={(e) => handleMouseDown(e, tab.id)}
					ondblclick={() => handleDblClick(tab.id)}
					ondragstart={(e) => handleDragStart(e, tab)}
					title={tab.type === 'code' ? (tab.filePath ?? tab.label) : tab.label}
					role="tab"
					tabindex="0"
					aria-selected={tab.id === activeTabId}
				>
					<span class="tab-icon">
						{#if tab.type === 'diagram'}
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="2" y1="12" x2="22" y2="12" />
								<path
									d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
								/>
							</svg>
						{:else}
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="16 18 22 12 16 6" />
								<polyline points="8 6 2 12 8 18" />
							</svg>
						{/if}
					</span>
					<span class="tab-label">{tab.label}</span>
					<button
						class="tab-close"
						onclick={(e) => {
							e.stopPropagation();
							onclose(tab.id);
						}}
						title="Close"
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.tab-bar {
		display: flex;
		align-items: stretch;
		background: var(--sidebar-icon-bg, #0f141a);
		border-bottom: 1px solid var(--ghost-border);
		flex-shrink: 0;
		min-height: 36px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.tab-bar.drop-target {
		background: var(--accent-bg, rgba(59, 130, 246, 0.12));
		outline: 2px dashed var(--accent, #3b82f6);
		outline-offset: -2px;
	}

	.tab-bar::-webkit-scrollbar {
		height: 0;
	}

	.tab-list {
		display: flex;
		align-items: stretch;
		gap: 0;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		height: 36px;
		font-size: 11px;
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color 0.1s ease,
			color 0.1s ease;
		min-width: 0;
		max-width: 200px;
	}

	.tab:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.tab.active {
		background: var(--bg-secondary, #151a21);
		color: var(--text-primary);
		border-top: 2px solid var(--accent);
		border-bottom: none;
	}

	.tab.preview .tab-label {
		font-style: italic;
	}

	.tab-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.tab.active .tab-icon {
		color: var(--accent, #3b82f6);
	}

	.tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.tab-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 3px;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0;
		transition:
			opacity 0.1s ease,
			background-color 0.1s ease;
	}

	.tab:hover .tab-close,
	.tab.active .tab-close {
		opacity: 1;
	}

	.tab-close:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	/* M3: mobile/tablet — keep tabs scannable on narrow viewports and
	   always reveal the close affordance (no hover on touch). */
	@media (max-width: 768px) {
		.tab {
			max-width: 140px;
			padding: 0 10px;
		}
		.tab-close {
			opacity: 1;
			width: 24px;
			height: 24px;
		}
	}
</style>
