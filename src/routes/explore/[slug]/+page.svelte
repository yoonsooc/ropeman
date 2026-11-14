<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import CodeViewer from '$lib/components/CodeViewer.svelte';
	import {
		exploreFileUrl,
		exploreSource,
		fetchExploreFile,
		fetchExploreSnapshot,
		type ExploreSource
	} from '$lib/services/exploreService';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let loading = $state(true);
	let status = $state<'ok' | 'not-analyzed' | 'error'>('ok');
	let errorMessage = $state('');
	let source = $state<ExploreSource | null>(null);

	const breakpoint = useBreakpoint();
	const openFile = $derived(
		tabStore.activeTab?.type === 'code' ? (tabStore.activeTab.filePath ?? null) : null
	);
	// On phones the detail is a bottom sheet that would cover the open file
	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null &&
			!semanticStore.panelDismissed &&
			!(openFile && !breakpoint.isDesktop)
	);

	async function readSnapshotFile(from: ExploreSource, path: string) {
		const got = await fetchExploreFile(from, path);
		if (got.ok) return got;
		return {
			ok: false as const,
			message:
				got.status === null
					? i18nStore.t('codeViewer.notAccessible')
					: i18nStore.t('codeViewer.loadFailed', { error: `HTTP ${got.status}` })
		};
	}

	const ldJson = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SoftwareSourceCode',
			name: data.entry.title,
			description: data.entry.description,
			programmingLanguage: data.entry.language,
			codeRepository: `https://github.com/${data.entry.owner}/${data.entry.repo}`,
			url: `https://ropeman.dev/explore/${data.entry.slug}`
		})
	);

	onMount(async () => {
		// Mark the store as a read-only snapshot viewer BEFORE injecting data,
		// so the first render already shows nodes as "snapshot-unavailable"
		// where appropriate (ADR-19 follow-up).
		semanticStore.readOnlyMode = 'snapshot';
		semanticStore.snapshotMeta = {
			owner: data.entry.owner,
			repo: data.entry.repo,
			title: data.entry.title
		};

		const result = await fetchExploreSnapshot(data.entry.slug);
		if (!result.ok) {
			status = result.status;
			errorMessage = result.message;
			loading = false;
			return;
		}

		const snapshot = result.snapshot;
		projectStore.projectName = snapshot.projectName;
		source = exploreSource(data.entry, snapshot);

		const cacheEntries = Object.entries(snapshot.semanticLevels);
		for (const [key, level] of cacheEntries) {
			semanticStore.setCachedLevel(key, level);
		}

		const root =
			snapshot.semanticLevels['__root__'] ??
			cacheEntries.map(([, lvl]) => lvl).find((l) => l.parentId === null);
		if (root) {
			semanticStore.currentLevel = root;
		}
		// The diagram is a tab, so a file opened from the detail panel has a tab to return to
		tabStore.clear();
		tabStore.openDiagramTab([], 'Project');

		loading = false;
	});

	onDestroy(() => {
		// Full reset when leaving the gallery viewer so the main app lands
		// clean — otherwise the header would keep the snapshot project name
		// (e.g. "react") and the semantic cache would bleed into the next
		// analysis. clear() also resets readOnlyMode/snapshotMeta.
		semanticStore.clear();
		projectStore.projectName = '';
		projectStore.githubInfo = null;
	});
</script>

<svelte:head>
	<title>{i18nStore.t('explore.entryTitle', { title: data.entry.title })}</title>
	<meta
		name="description"
		content={`${data.entry.title} (${data.entry.owner}/${data.entry.repo}) — AI-generated architecture diagram. ${data.entry.description}`}
	/>
	<meta property="og:title" content={`${data.entry.title} architecture | Ropeman Explore`} />
	<meta property="og:description" content={data.entry.description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={`https://ropeman.dev/explore/${data.entry.slug}`} />
	<link rel="canonical" href={`https://ropeman.dev/explore/${data.entry.slug}`} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html '<scr' + 'ipt type="application/ld+json">' + ldJson + '</scr' + 'ipt>'}
</svelte:head>

<div class="explore-page" data-theme={themeStore.current}>
	<header class="explore-header">
		<a href={resolve('/')} class="explore-logo">Ropeman</a>
		<a href={resolve('/explore')} class="back-link">
			← {i18nStore.t('explore.navLabel')}
		</a>
		<span class="project-name">{data.entry.owner}/{data.entry.repo}</span>
		<span class="badge">{data.entry.language}</span>
		<div class="header-actions">
			<a
				href={`https://github.com/${data.entry.owner}/${data.entry.repo}`}
				target="_blank"
				rel="noopener noreferrer"
				class="repo-link"
			>
				GitHub →
			</a>
			<button class="cta" onclick={() => (window.location.href = resolve('/'))}>
				{i18nStore.t('explore.analyzeOwn')}
			</button>
		</div>
	</header>

	<div class="explore-content">
		{#if loading}
			<div class="state state-loading">
				<div class="loading-ring"></div>
				<p>
					{i18nStore.t('explore.loadingEntry', { title: data.entry.title })}
				</p>
			</div>
		{:else if status === 'not-analyzed'}
			<div class="state state-empty">
				<span class="material-symbols-outlined state-icon">hourglass_empty</span>
				<h2>
					{i18nStore.t('explore.notAnalyzedTitle')}
				</h2>
				<p>
					{i18nStore.t('explore.notAnalyzedDesc', { title: data.entry.title })}
				</p>
				<div class="state-actions">
					<a href={resolve('/')} class="cta">
						{i18nStore.t('explore.analyzeFromHome')}
					</a>
					<a
						href={`https://github.com/${data.entry.owner}/${data.entry.repo}`}
						target="_blank"
						rel="noopener noreferrer"
						class="cta cta-secondary"
					>
						{i18nStore.t('explore.viewOnGithub')} ↗
					</a>
				</div>
			</div>
		{:else if status === 'error'}
			<div class="state state-error">
				<span class="material-symbols-outlined state-icon">error</span>
				<h2>{i18nStore.t('common.error')}</h2>
				<p>{errorMessage}</p>
				<a href={resolve('/explore')} class="cta">
					{i18nStore.t('explore.backToGallery')}
				</a>
			</div>
		{:else}
			<div class="canvas-area">
				<TabBar
					tabs={tabStore.tabs}
					activeTabId={tabStore.activeTabId}
					onactivate={(id) => tabStore.activateTab(id)}
					onclose={(id) => tabStore.closeTab(id)}
				/>
				<div class="canvas-content">
					{#if openFile && source}
						{@const from = source}
						<div class="file-view">
							<div class="source-bar">
								<a
									href={exploreFileUrl(from, openFile, 'blob')}
									target="_blank"
									rel="external noopener noreferrer"
									class="source-link"
								>
									{i18nStore.t('explore.viewOnGithub')} ↗
								</a>
							</div>
							<div class="file-body">
								<CodeViewer filePath={openFile} read={(path) => readSnapshotFile(from, path)} />
							</div>
						</div>
					{:else}
						<div class="canvas-breadcrumb">
							<Breadcrumb />
						</div>
						<ZUICanvas />
					{/if}
				</div>
			</div>
			{#if hasSemanticSelection}
				<aside class="detail-panel">
					<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
				</aside>
			{/if}
		{/if}
	</div>
</div>

<style>
	.explore-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--color-background-body);
		color: var(--color-text-primary);
	}

	.explore-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		height: var(--header-height);
		padding: 0 var(--spacing-4);
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
	}

	.explore-logo {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
		text-decoration: none;
	}

	.back-link {
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: var(--font-size-sm);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.back-link:hover {
		color: var(--color-text-primary);
	}

	.project-name {
		font-family: var(--font-code);
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	.header-actions {
		margin-left: auto;
		flex-shrink: 0;
		display: flex;
		gap: var(--spacing-3);
		align-items: center;
	}

	.repo-link {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	.repo-link:hover {
		color: var(--color-text-primary);
	}

	.cta {
		display: inline-flex;
		align-items: center;
		padding: var(--spacing-1-5) var(--spacing-3);
		background: var(--color-accent);
		color: var(--color-on-accent);
		border: none;
		border-radius: var(--radius-element);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		text-decoration: none;
	}
	.cta:hover {
		opacity: 0.85;
	}

	.cta-secondary {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.cta-secondary:hover {
		background: var(--color-background-muted);
		opacity: 1;
	}

	.state-actions {
		display: flex;
		gap: var(--spacing-3);
		flex-wrap: wrap;
		justify-content: center;
		margin-top: var(--spacing-2);
	}

	.explore-content {
		flex: 1;
		display: flex;
		position: relative;
		overflow: hidden;
	}

	.canvas-breadcrumb {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: var(--spacing-2) var(--spacing-4);
	}

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

	.file-view {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}

	.source-bar {
		display: flex;
		justify-content: flex-end;
		padding: var(--spacing-1-5) var(--spacing-4);
		border-bottom: 1px solid var(--color-border);
	}

	.source-link {
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

	.state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-4);
		padding: var(--spacing-6);
		text-align: center;
		color: var(--color-text-secondary);
	}

	.state h2 {
		font-family: var(--font-display);
		font-size: 22px;
		color: var(--color-text-primary);
		margin: 0;
	}

	.state p {
		max-width: 460px;
		font-size: var(--font-size-base);
		line-height: 1.6;
	}

	.state-icon {
		font-size: 56px;
		color: var(--color-text-tertiary);
	}

	.loading-ring {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 2px solid var(--color-accent-muted);
		border-top-color: var(--color-accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Phones: the detail opens as a bottom sheet over the canvas */
	/* Phones: logo, back, repo name and the one action; the rest steps aside */
	@media (max-width: 640px) {
		.explore-header {
			gap: var(--spacing-2);
			padding: 0 var(--spacing-3);
		}

		.badge,
		.repo-link {
			display: none;
		}
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
