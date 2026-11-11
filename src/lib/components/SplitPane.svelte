<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { layoutStore } from '$lib/stores/layoutStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import TabBar from './TabBar.svelte';
	import ResizeHandle from './ResizeHandle.svelte';
	import ZUICanvas from './ZUICanvas.svelte';
	import CodeViewer from './CodeViewer.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';

	let {
		zuiCanvasBindPrimary,
		zuiCanvasBindSecondary
	}: {
		zuiCanvasBindPrimary?: (ref: ZUICanvas) => void;
		zuiCanvasBindSecondary?: (ref: ZUICanvas) => void;
	} = $props();

	let primaryCanvasRef: ZUICanvas | undefined = $state(undefined);
	let secondaryCanvasRef: ZUICanvas | undefined = $state(undefined);

	$effect(() => {
		if (primaryCanvasRef && zuiCanvasBindPrimary) {
			zuiCanvasBindPrimary(primaryCanvasRef);
		}
	});

	$effect(() => {
		if (secondaryCanvasRef && zuiCanvasBindSecondary) {
			zuiCanvasBindSecondary(secondaryCanvasRef);
		}
	});

	const primaryTabs = $derived(tabStore.tabsForPane('primary'));
	const secondaryTabs = $derived(tabStore.tabsForPane('secondary'));

	const primaryActiveTab = $derived(
		tabStore.activeTabId
			? tabStore.tabs.find(
					(t) => t.id === tabStore.activeTabId && (t.paneId ?? 'primary') === 'primary'
				)
			: null
	);
	const secondaryActiveTab = $derived(
		layoutStore.secondaryActiveTabId
			? tabStore.tabs.find((t) => t.id === layoutStore.secondaryActiveTabId)
			: null
	);

	const isVertical = $derived(layoutStore.splitDirection === 'vertical');
	const ratio = $derived(layoutStore.splitRatio);

	function handlePrimaryActivate(tabId: string) {
		tabStore.activateTab(tabId);
		layoutStore.focusedPane = 'primary';
	}

	function handleSecondaryActivate(tabId: string) {
		layoutStore.secondaryActiveTabId = tabId;
		layoutStore.focusedPane = 'secondary';
		// Update lastAccessed
		const tab = tabStore.tabs.find((t) => t.id === tabId);
		if (tab) tab.lastAccessed = Date.now();
	}

	function handlePrimaryClose(tabId: string) {
		const tabCount = tabStore.tabsForPane('primary').length;
		tabStore.closeTab(tabId);
		if (tabCount <= 1) {
			// Merge remaining secondary tabs to primary before closing split
			tabStore.mergeSecondaryToPrimary();
			const remaining = tabStore.tabsForPane('primary');
			if (remaining.length > 0) {
				tabStore.activateTab(remaining[0].id);
			}
			layoutStore.isSplit = false;
		}
	}

	function handleSecondaryClose(tabId: string) {
		const tabCount = tabStore.tabsForPane('secondary').length;
		tabStore.closeTab(tabId);
		if (tabCount <= 1) {
			layoutStore.isSplit = false;
		}
	}

	function handlePaneFocus(pane: 'primary' | 'secondary') {
		layoutStore.focusedPane = pane;
	}

	function handleDropOnPrimary(tabId: string, fromPane: string) {
		if (fromPane === 'primary') return; // already in primary
		tabStore.moveTabToPane(tabId, 'primary');
		tabStore.activateTab(tabId);
		layoutStore.focusedPane = 'primary';
		// If secondary has no more tabs, close split
		if (tabStore.tabsForPane('secondary').length === 0) {
			layoutStore.isSplit = false;
		}
	}

	function handleDropOnSecondary(tabId: string, fromPane: string) {
		if (fromPane === 'secondary') return; // already in secondary
		tabStore.moveTabToPane(tabId, 'secondary');
		layoutStore.secondaryActiveTabId = tabId;
		layoutStore.focusedPane = 'secondary';
		// If primary has no more tabs, close split and merge all to primary
		if (tabStore.tabsForPane('primary').length === 0) {
			tabStore.mergeSecondaryToPrimary();
			tabStore.activateTab(tabId);
			layoutStore.isSplit = false;
		}
	}
</script>

<div class="split-container" class:vertical={isVertical} class:horizontal={!isVertical}>
	<!-- Primary Pane -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="pane primary"
		class:focused={layoutStore.focusedPane === 'primary'}
		style="flex: {ratio}"
		onclick={() => handlePaneFocus('primary')}
	>
		<TabBar
			paneId="primary"
			tabs={primaryTabs}
			activeTabId={tabStore.activeTabId}
			onactivate={handlePrimaryActivate}
			onclose={handlePrimaryClose}
			ondroptab={handleDropOnPrimary}
		/>
		<div class="pane-content">
			{#if primaryActiveTab?.type === 'diagram'}
				<ZUICanvas bind:this={primaryCanvasRef} />
			{:else if primaryActiveTab?.type === 'code'}
				<CodeViewer filePath={primaryActiveTab.filePath} />
			{:else if semanticStore.currentLevel}
				<ZUICanvas bind:this={primaryCanvasRef} />
			{:else}
				<CodeViewer />
			{/if}
		</div>
	</div>

	<ResizeHandle />

	<!-- Secondary Pane -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="pane secondary"
		class:focused={layoutStore.focusedPane === 'secondary'}
		style="flex: {1 - ratio}"
		onclick={() => handlePaneFocus('secondary')}
	>
		<TabBar
			paneId="secondary"
			tabs={secondaryTabs}
			activeTabId={layoutStore.secondaryActiveTabId}
			onactivate={handleSecondaryActivate}
			onclose={handleSecondaryClose}
			ondroptab={handleDropOnSecondary}
		/>
		<div class="pane-content">
			{#if secondaryActiveTab?.type === 'diagram'}
				<ZUICanvas bind:this={secondaryCanvasRef} />
			{:else if secondaryActiveTab?.type === 'code'}
				<CodeViewer filePath={secondaryActiveTab.filePath} />
			{:else}
				<div class="empty-pane">
					<p>{i18nStore.t('pane.empty')}</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.split-container {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.split-container.vertical {
		flex-direction: row;
	}

	.split-container.horizontal {
		flex-direction: column;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		position: relative;
	}

	.pane.focused {
		outline: 2px solid var(--accent, #3b82f6);
		outline-offset: -2px;
	}

	.pane-content {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.empty-pane {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
