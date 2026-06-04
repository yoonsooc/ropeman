<script lang="ts">
	import Header from '$lib/components/Header.svelte';
	import Dropzone from '$lib/components/Dropzone.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import CodeViewer from '$lib/components/CodeViewer.svelte';
	import NodeDetailPanel from '$lib/components/NodeDetailPanel.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatPopup from '$lib/components/ChatPopup.svelte';
	// import StatusBar from '$lib/components/StatusBar.svelte'; // hidden — reserved for future use
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import HelpModal from '$lib/components/HelpModal.svelte';
	import AnalyzeModal from '$lib/components/AnalyzeModal.svelte';
	import OnboardingTour from '$lib/components/OnboardingTour.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore, setSemanticCacheDeps } from '$lib/stores/semanticStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { layoutStore } from '$lib/stores/layoutStore.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import SplitPane from '$lib/components/SplitPane.svelte';
	import { analyzeTopLevel } from '$lib/services/semanticAnalysisService';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { loadTestProject } from '$lib/services/testLoader';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import {
		openDirectory,
		readDirectoryRecursive,
		handleFallbackInput
	} from '$lib/services/fileSystemService';
	import { parseAllFiles } from '$lib/services/parserService';
	import { setBridgeCallbacks } from '$lib/services/bridgeService';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { getEffectiveSkipDirs } from '$lib/utils/filePriority';
	import { analysisUiStore } from '$lib/stores/analysisUiStore.svelte';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import { onMount, onDestroy } from 'svelte';

	// Wire semantic cache deps (avoids circular import in semanticStore)
	setSemanticCacheDeps(() => ({
		cacheEnabled: settingsStore.cacheEnabled,
		projectName: projectStore.projectName
	}));

	// Wire bridgeService callbacks to authStore (stateless service pattern)
	setBridgeCallbacks({
		onStatusChange: (s) => {
			authStore.bridgeStatus = s;
		},
		onError: (e) => {
			authStore.bridgeError = e;
		},
		onPortChange: (p) => {
			authStore.bridgePort = p;
		}
	});

	let showSettings = $state(false);
	let showHelp = $state(false);
	let showAnalyze = $state(false);
	let showShare = $state(false);
	// explorerCollapsed removed — sidebar icon bar is always visible,
	// content panel is managed internally by Sidebar component
	const breakpoint = useBreakpoint();
	const isMobile = $derived(breakpoint.isMobile || breakpoint.isTablet);
	let zuiCanvasRef: ZUICanvas | undefined = $state(undefined);
	let sidebarRef: Sidebar | undefined = $state(undefined);

	function handleTrackSelect(track: 'edge' | 'byok' | 'bridge' | 'webgpu') {
		showAnalyze = false;
		if (track === 'edge') {
			authStore.edgeEnabled = true;
		} else {
			authStore.edgeEnabled = false;
		}
		analyzeTopLevel();
	}

	let fallbackInput: HTMLInputElement | undefined = $state(undefined);
	const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

	function resetAllStores() {
		projectStore.reset();
		graphStore.clear();
		selectionStore.clear();
		semanticStore.clear();
	}

	async function handleNewProject() {
		if (supportsDirectoryPicker) {
			try {
				const dirHandle = await openDirectory();
				resetAllStores();
				projectStore.isLoading = true;
				projectStore.projectName = dirHandle.name;
				const skipSet = getEffectiveSkipDirs(settingsStore.customSkipPatterns);
				const tree = await readDirectoryRecursive(dirHandle, '', skipSet);
				projectStore.fileTree = tree;
				const astMap = await parseAllFiles(tree, projectStore.astMap, (progress) => {
					projectStore.parsingProgress = progress;
				});
				projectStore.astMap = astMap;
				projectStore.isLoading = false;
			} catch (err: unknown) {
				if (err instanceof Error && err.name === 'AbortError') return;
				console.error('Failed to open project:', err);
			}
		} else {
			fallbackInput?.click();
		}
	}

	async function handleFallbackFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		try {
			resetAllStores();
			const skipSet = getEffectiveSkipDirs(settingsStore.customSkipPatterns);
			const tree = handleFallbackInput(input.files, skipSet);
			projectStore.projectName = tree.name;
			projectStore.fileTree = tree;
			projectStore.isLoading = true;
			const astMap = await parseAllFiles(tree, projectStore.astMap, (progress) => {
				projectStore.parsingProgress = progress;
			});
			projectStore.astMap = astMap;
			projectStore.isLoading = false;
		} catch (err) {
			console.error('Failed to process files:', err);
			projectStore.isLoading = false;
		}
	}

	const hasProject = $derived(projectStore.fileTree !== null);
	// Code-mode file detail panel disabled — info already visible in code header & breadcrumb
	const hasSelection = $derived(false);
	const hasSemanticSelection = $derived(
		(tabStore.viewMode === 'semantic' ||
			(layoutStore.isSplit &&
				tabStore.viewModeForTab(layoutStore.secondaryActiveTabId) === 'semantic')) &&
			semanticStore.selectedSemanticNode !== null &&
			!semanticStore.panelDismissed
	);
	const isSnippetMode = $derived(projectStore.isSnippetMode);

	// Restore semantic cache from IndexedDB when project loads
	$effect(() => {
		if (projectStore.fileTree && !projectStore.isLoading && projectStore.projectName) {
			semanticStore.restoreCache(projectStore.projectName);
		}
	});

	// Auto-trigger semantic analysis when snippet mode is active and AI becomes ready
	$effect(() => {
		if (
			isSnippetMode &&
			hasProject &&
			!projectStore.isLoading &&
			authStore.isReady &&
			!semanticStore.isAnalyzing &&
			semanticStore.currentLevel === null
		) {
			analyzeTopLevel();
		}
	});

	// Tab switch: restore state when the active tab changes
	let prevActiveTabId = $state<string | null>(null);
	$effect(() => {
		const tab = tabStore.activeTab;
		const tabId = tab?.id ?? null;
		if (tabId === prevActiveTabId) return;
		prevActiveTabId = tabId;
		if (!tab) return;

		if (tab.type === 'diagram' && tab.drilldownPath) {
			// Restore the drilldown path and level from cache
			const targetPath = tab.drilldownPath;
			const currentPath = semanticStore.drilldownPath;

			// Only update if the path actually differs
			const pathKey = targetPath.map((p) => p.nodeId).join('/');
			const currentKey = currentPath.map((p) => p.nodeId).join('/');
			if (pathKey !== currentKey) {
				const levelKey =
					targetPath.length > 0 ? targetPath[targetPath.length - 1].nodeId : '__root__';
				const cached = semanticStore.getCachedLevel(levelKey);
				if (cached) {
					semanticStore.currentLevel = cached;
				}
				semanticStore.drilldownPath = [...targetPath];
			}
		} else if (tab.type === 'code' && tab.filePath) {
			// Sync the selection to match the active code tab's file
			const fileName = tab.filePath.split('/').pop() ?? tab.filePath;
			selectionStore.selectedNode = {
				id: `file:${tab.filePath}`,
				kind: 'file',
				label: fileName,
				filePath: tab.filePath,
				parentId: null,
				childCount: 0,
				isExpanded: false
			};
			selectionStore.breadcrumb = [selectionStore.selectedNode];
		}
	});

	// Auto-show onboarding when snippet parsing completes but AI is not connected
	let snippetOnboardingShown = $state(false);
	$effect(() => {
		if (
			isSnippetMode &&
			hasProject &&
			!projectStore.isLoading &&
			!authStore.isReady &&
			!snippetOnboardingShown
		) {
			snippetOnboardingShown = true;
			showAnalyze = true;
		}
		if (!isSnippetMode) {
			snippetOnboardingShown = false;
		}
	});

	// Drag-to-split: track drop zone state for non-split mode
	let splitDropZone = $state<'none' | 'right'>('none');

	function handleCanvasDragOver(e: DragEvent) {
		if (layoutStore.isSplit || isMobile) return;
		if (!e.dataTransfer?.types.includes('text/x-tab-id')) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const relX = (e.clientX - rect.left) / rect.width;
		splitDropZone = relX > 0.5 ? 'right' : 'none';
	}

	function handleCanvasDragLeave() {
		splitDropZone = 'none';
	}

	function handleCanvasDrop(e: DragEvent) {
		if (layoutStore.isSplit || isMobile) return;
		if (splitDropZone === 'none') return;
		if (!e.dataTransfer) return;
		e.preventDefault();
		const tabId = e.dataTransfer.getData('text/x-tab-id');
		if (!tabId) {
			splitDropZone = 'none';
			return;
		}
		// Move tab to secondary pane and activate split
		tabStore.moveTabToPane(tabId, 'secondary');
		layoutStore.secondaryActiveTabId = tabId;
		layoutStore.isSplit = true;
		layoutStore.focusedPane = 'secondary';
		splitDropZone = 'none';
	}

	// When split is toggled off, merge secondary tabs to primary
	let prevIsSplit = $state(false);
	$effect(() => {
		const current = layoutStore.isSplit;
		if (prevIsSplit && !current) {
			tabStore.mergeSecondaryToPrimary();
		}
		prevIsSplit = current;
	});

	// Disable split on mobile
	$effect(() => {
		if (isMobile && layoutStore.isSplit) {
			layoutStore.isSplit = false;
		}
	});

	// Dev-only: auto-load test project from ?testDir= URL parameter
	onMount(() => {
		// Register action handlers so the global AnalysisStatus can open these modals
		// Clear first to avoid stale handlers from any prior mount
		analysisUiStore.clearActionHandlers();
		analysisUiStore.registerActionHandlers({
			openSettings: () => (showSettings = true),
			openAnalyze: () => (showAnalyze = true)
		});

		if (!import.meta.env.DEV) return;
		const params = new URLSearchParams(window.location.search);
		const testDir = params.get('testDir');
		if (testDir) {
			console.log(`[dev] Loading test project from: ${testDir}`);
			loadTestProject(testDir);
		}
	});

	onDestroy(() => {
		analysisUiStore.clearActionHandlers();
	});

	function isInputFocused(): boolean {
		const el = document.activeElement;
		if (!el) return false;
		const tag = el.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showHelp) {
				showHelp = false;
			} else if (showAnalyze) {
				showAnalyze = false;
			} else if (showSettings) {
				showSettings = false;
			} else if (hasSelection) {
				selectionStore.clear();
			}
			return;
		}

		// Skip keyboard shortcuts when input fields are focused
		if (isInputFocused()) return;

		// Ctrl+Shift+D: Toggle theme
		if (e.ctrlKey && e.shiftKey && e.key === 'D') {
			e.preventDefault();
			themeStore.toggle();
			return;
		}

		// Ctrl+W: Close active tab in focused pane
		if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
			e.preventDefault();
			if (layoutStore.isSplit && layoutStore.focusedPane === 'secondary') {
				const secTabId = layoutStore.secondaryActiveTabId;
				if (secTabId) {
					const secTabs = tabStore.tabsForPane('secondary');
					tabStore.closeTab(secTabId);
					if (secTabs.length <= 1) {
						layoutStore.isSplit = false;
					} else {
						const remaining = secTabs.filter((t) => t.id !== secTabId);
						layoutStore.secondaryActiveTabId = remaining.length > 0 ? remaining[0].id : null;
					}
				}
			} else if (tabStore.activeTabId) {
				const primaryTabs = tabStore.tabsForPane('primary');
				tabStore.closeTab(tabStore.activeTabId);
				if (layoutStore.isSplit && primaryTabs.length <= 1) {
					tabStore.mergeSecondaryToPrimary();
					const remaining = tabStore.tabsForPane('primary');
					if (remaining.length > 0) {
						tabStore.activateTab(remaining[0].id);
					}
					layoutStore.isSplit = false;
				}
			}
			return;
		}

		// Ctrl+Tab: Next tab / Ctrl+Shift+Tab: Previous tab (within focused pane)
		if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			const isSecondary = layoutStore.isSplit && layoutStore.focusedPane === 'secondary';
			const paneTabs = isSecondary
				? tabStore.tabsForPane('secondary')
				: tabStore.tabsForPane('primary');
			if (paneTabs.length <= 1) return;
			const currentId = isSecondary ? layoutStore.secondaryActiveTabId : tabStore.activeTabId;
			const currentIdx = paneTabs.findIndex((t) => t.id === currentId);
			const nextIdx = e.shiftKey
				? (currentIdx - 1 + paneTabs.length) % paneTabs.length
				: (currentIdx + 1) % paneTabs.length;
			if (isSecondary) {
				layoutStore.secondaryActiveTabId = paneTabs[nextIdx].id;
			} else {
				tabStore.activateTab(paneTabs[nextIdx].id);
			}
			return;
		}

		// Ctrl+B: Toggle sidebar content panel
		if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
			e.preventDefault();
			sidebarRef?.toggleContent();
			return;
		}

		// Ctrl+Shift+V: Toggle sidebar panel (File Explorer <-> Semantic Tree)
		if (e.ctrlKey && e.shiftKey && e.key === 'V') {
			e.preventDefault();
			sidebarRef?.togglePanel();
			return;
		}

		// Ctrl+Shift+E: Export diagram
		if (e.ctrlKey && e.shiftKey && e.key === 'E') {
			e.preventDefault();
			zuiCanvasRef?.triggerExport();
			return;
		}

		// Ctrl+\: Toggle split
		if (e.ctrlKey && e.key === '\\') {
			e.preventDefault();
			if (!isMobile) {
				layoutStore.toggleSplit();
			}
			return;
		}

		// Ctrl+1: Focus primary pane
		if (e.ctrlKey && e.key === '1') {
			e.preventDefault();
			layoutStore.focusPrimary();
			return;
		}

		// Ctrl+2: Focus secondary pane
		if (e.ctrlKey && e.key === '2') {
			e.preventDefault();
			if (layoutStore.isSplit) {
				layoutStore.focusSecondary();
			}
			return;
		}

		// ? or Ctrl+/: Show help modal
		if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
			e.preventDefault();
			showHelp = true;
			return;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div id="app">
	<Header
		onsettings={() => (showSettings = !showSettings)}
		onhelp={() => (showHelp = !showHelp)}
		onnewproject={handleNewProject}
		onconnect={() => (showAnalyze = true)}
		onanalyze={() => (showAnalyze = true)}
		onshare={() => (showShare = true)}
	/>

	{#if projectStore.isLoading}
		<LoadingOverlay />
	{/if}

	{#if !hasProject && !projectStore.isLoading}
		<Dropzone />
	{:else if hasProject}
		<div class="main-layout">
			{#if !isSnippetMode}
				<Sidebar bind:this={sidebarRef} mobile={isMobile} />
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="canvas-area"
				ondragover={handleCanvasDragOver}
				ondragleave={handleCanvasDragLeave}
				ondrop={handleCanvasDrop}
			>
				{#if splitDropZone === 'right'}
					<div class="split-drop-overlay">
						<div class="split-drop-hint">Drop to split</div>
					</div>
				{/if}
				{#if layoutStore.isSplit && !isMobile}
					<SplitPane
						zuiCanvasBindPrimary={(ref) => {
							zuiCanvasRef = ref;
						}}
					/>
				{:else}
					<TabBar
						paneId="primary"
						tabs={tabStore.tabs}
						activeTabId={tabStore.activeTabId}
						onactivate={(id) => tabStore.activateTab(id)}
						onclose={(id) => tabStore.closeTab(id)}
					/>
					<div class="canvas-content" data-tour-step="8">
						{#if tabStore.activeTab?.type === 'code'}
							<CodeViewer filePath={tabStore.activeTab.filePath} />
						{:else if tabStore.activeTab?.type === 'diagram' || semanticStore.currentLevel}
							<ZUICanvas bind:this={zuiCanvasRef} />
						{:else}
							<CodeViewer />
						{/if}
					</div>
				{/if}
			</div>
			{#if hasSemanticSelection}
				<div class="detail-panel">
					<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
				</div>
			{:else if hasSelection}
				<div class="detail-panel">
					<NodeDetailPanel onclose={() => selectionStore.clear()} />
				</div>
			{/if}
		</div>
		<!-- StatusBar hidden — reserved for future use -->
		<!-- <StatusBar /> -->
		<!-- U11: Analysis progress/error UI moved to AnalysisStatus in +layout.svelte -->

		<ChatPopup onconnect={() => (showAnalyze = true)} />
	{/if}

	{#if showSettings}
		<SettingsModal
			open={showSettings}
			onclose={() => (showSettings = false)}
			onconnect={() => {
				showSettings = false;
				showAnalyze = true;
			}}
		/>
	{/if}

	{#if showHelp}
		<HelpModal open={showHelp} onclose={() => (showHelp = false)} />
	{/if}

	{#if showAnalyze}
		<AnalyzeModal
			open={showAnalyze}
			onclose={() => (showAnalyze = false)}
			onanalyze={handleTrackSelect}
		/>
	{/if}

	{#if showShare}
		<ShareDialog open={showShare} onclose={() => (showShare = false)} />
	{/if}

	{#if !supportsDirectoryPicker}
		<input
			bind:this={fallbackInput}
			type="file"
			webkitdirectory
			multiple
			hidden
			onchange={handleFallbackFiles}
		/>
	{/if}

	<OnboardingTour />
</div>

<style>
	#app {
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.main-layout {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.canvas-area {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.canvas-content {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.split-drop-overlay {
		position: absolute;
		top: 0;
		right: 0;
		width: 50%;
		height: 100%;
		background: rgba(59, 130, 246, 0.08);
		border: 2px dashed var(--accent, #3b82f6);
		border-radius: 8px;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.split-drop-hint {
		font-size: 14px;
		font-weight: 600;
		color: var(--accent, #3b82f6);
		background: var(--bg-secondary);
		padding: 8px 16px;
		border-radius: 8px;
		border: 1px solid var(--accent, #3b82f6);
	}

	.detail-panel {
		width: 300px;
		overflow-y: auto;
		flex-shrink: 0;
		animation: panelSlide 0.2s ease;
		background: var(--bg-secondary);
		border-left: 1px solid rgba(255, 255, 255, 0.05);
	}

	@keyframes panelSlide {
		from {
			width: 0;
			opacity: 0;
		}
		to {
			width: 300px;
			opacity: 1;
		}
	}

	/* U1-1: Analysis progress pill (bottom-right, above chat button) */

	/* M3: mobile — DetailPanel becomes a bottom sheet (50dvh) instead of a
	   full-screen slide. Keeps the canvas visible above for context. */
	@media (max-width: 768px) {
		.detail-panel {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			top: auto;
			width: 100%;
			height: 50dvh;
			z-index: 50;
			background: var(--bg-primary);
			border-left: none;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			border-top-left-radius: 16px;
			border-top-right-radius: 16px;
			box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.25);
			padding-bottom: env(safe-area-inset-bottom);
			animation: bottomSheetSlide 0.2s ease;
		}

		@keyframes bottomSheetSlide {
			from {
				transform: translateY(100%);
			}
			to {
				transform: translateY(0);
			}
		}
	}
</style>
