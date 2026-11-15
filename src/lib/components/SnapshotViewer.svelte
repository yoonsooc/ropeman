<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import CodeViewer from '$lib/components/CodeViewer.svelte';
	import type { SourceRead } from '$lib/services/sourceFile';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';

	let {
		read,
		revision = 0,
		githubUrl,
		fileAction = null,
		fileNote = null
	}: {
		read: (path: string) => Promise<SourceRead>;
		revision?: number;
		githubUrl?: (path: string) => string | null;
		fileAction?: { label: string; onclick: () => void; quiet?: boolean } | null;
		fileNote?: string | null;
	} = $props();

	const breakpoint = useBreakpoint();
	const openFile = $derived(
		tabStore.activeTab?.type === 'code' ? (tabStore.activeTab.filePath ?? null) : null
	);
	const sheetCoversFile = $derived(openFile !== null && !breakpoint.isDesktop);
	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null && !semanticStore.panelDismissed && !sheetCoversFile
	);
	const link = $derived(openFile && githubUrl ? githubUrl(openFile) : null);

	onMount(() => {
		tabStore.clear();
		tabStore.openDiagramTab([], 'Project');
	});

	onDestroy(() => tabStore.clear());
</script>

<div class="canvas-area">
	<TabBar
		tabs={tabStore.tabs}
		activeTabId={tabStore.activeTabId}
		onactivate={(id) => tabStore.activateTab(id)}
		onclose={(id) => tabStore.closeTab(id)}
	/>
	<div class="canvas-content">
		<div class="diagram-view" class:covered={openFile !== null}>
			<div class="canvas-breadcrumb">
				<Breadcrumb />
			</div>
			<ZUICanvas />
		</div>
		{#if openFile}
			<div class="file-view">
				{#if link || fileAction || fileNote}
					<div class="source-bar">
						{#if fileNote}
							<span class="source-note" role="status">{fileNote}</span>
						{/if}
						{#if fileAction}
							<button
								type="button"
								class="source-action"
								class:quiet={fileAction.quiet}
								onclick={fileAction.onclick}
							>
								{fileAction.label}
							</button>
						{/if}
						{#if link}
							<a href={link} target="_blank" rel="external noopener noreferrer" class="source-link">
								{i18nStore.t('explore.viewOnGithub')} ↗
							</a>
						{/if}
					</div>
				{/if}
				<div class="file-body">
					<CodeViewer filePath={openFile} {read} {revision} />
				</div>
			</div>
		{/if}
	</div>
</div>
{#if hasSemanticSelection}
	<aside class="detail-panel">
		<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
	</aside>
{/if}

<style>
	.canvas-area {
		--canvas-toolbar-top: 56px;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.canvas-content {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.diagram-view {
		position: absolute;
		inset: 0;
	}

	.diagram-view.covered {
		visibility: hidden;
	}

	.canvas-breadcrumb {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: var(--spacing-2) var(--spacing-4);
	}

	.file-view {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--color-background-body);
	}

	.source-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--spacing-3);
		padding: var(--spacing-1-5) var(--spacing-4);
		border-bottom: 1px solid var(--color-border);
	}

	.source-note {
		margin-right: auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.source-action {
		flex-shrink: 0;
		padding: var(--spacing-1) var(--spacing-3);
		background: var(--color-accent);
		color: var(--color-on-accent);
		border: none;
		border-radius: var(--radius-element);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		white-space: nowrap;
	}
	.source-action:hover {
		opacity: 0.85;
	}
	.source-action.quiet {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.source-link {
		flex-shrink: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	.source-link:hover {
		color: var(--color-text-primary);
	}

	.file-body {
		flex: 1;
		min-height: 0;
	}

	.detail-panel {
		width: 320px;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	@media (max-width: 768px) {
		.detail-panel {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 55dvh;
			z-index: 30;
			border-left: none;
			border-top: 1px solid var(--color-border);
			border-radius: var(--radius-container) var(--radius-container) 0 0;
			box-shadow: 0 -8px 24px var(--color-shadow);
			padding-bottom: env(safe-area-inset-bottom);
		}
	}
</style>
