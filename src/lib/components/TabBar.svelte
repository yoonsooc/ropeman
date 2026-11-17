<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { scrollBehavior } from '$lib/utils/motion';
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

	// The root diagram tab stores 'Project' as data; show it in the current language
	function tabLabel(tab: Tab): string {
		return tab.type === 'diagram' && !tab.drilldownPath?.length
			? i18nStore.t('common.project')
			: tab.label;
	}

	let dropTarget = $state(false);
	let tabBarEl = $state<HTMLDivElement | undefined>(undefined);

	// M3: keep the active tab visible on overflow (mobile horizontal scroll)
	$effect(() => {
		const id = activeTabId;
		const root = tabBarEl;
		if (!id || !root) return;
		queueMicrotask(() => {
			const el = root.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`);
			el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: scrollBehavior() });
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
					title={tab.type === 'code' ? (tab.filePath ?? tab.label) : tabLabel(tab)}
					role="tab"
					tabindex="0"
					aria-selected={tab.id === activeTabId}
				>
					<span aria-hidden="true" class="material-symbols-outlined tab-icon"
						>{tab.type === 'diagram' ? 'account_tree' : 'code'}</span
					>
					<span class="tab-label">{tabLabel(tab)}</span>
					<button
						class="tab-close"
						onclick={(e) => {
							e.stopPropagation();
							onclose(tab.id);
						}}
						title={i18nStore.t('common.close')}
					>
						<span aria-hidden="true" class="material-symbols-outlined">close</span>
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
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
		min-height: 36px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.tab-bar.drop-target {
		background: var(--color-accent-muted);
		outline: 2px dashed var(--color-accent);
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
		gap: var(--spacing-1-5);
		padding: 0 var(--spacing-3);
		height: 36px;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-normal);
		color: var(--color-text-secondary);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
		min-width: 0;
		max-width: 200px;
	}

	.tab:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.tab.active {
		background: var(--color-background-surface);
		color: var(--color-text-primary);
		border-bottom-color: var(--color-accent);
	}

	.tab.preview .tab-label {
		font-style: italic;
	}

	.tab-icon {
		font-size: 14px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-text-tertiary);
	}

	.tab.active .tab-icon {
		color: var(--color-text-secondary);
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
		border-radius: var(--radius-inner);
		color: var(--color-text-tertiary);
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0;
		transition:
			opacity var(--duration-fast) var(--ease-standard),
			background-color var(--duration-fast) var(--ease-standard);
	}

	.tab:hover .tab-close,
	.tab.active .tab-close {
		opacity: 1;
	}

	.tab-close .material-symbols-outlined {
		font-size: 14px;
	}

	.tab-close:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	/* M3: mobile/tablet — keep tabs scannable on narrow viewports and
	   always reveal the close affordance (no hover on touch). */
	@media (max-width: 768px) {
		.tab {
			max-width: 140px;
			padding: 0 var(--spacing-2);
		}
		.tab-close {
			opacity: 1;
			width: 24px;
			height: 24px;
		}
	}
</style>
