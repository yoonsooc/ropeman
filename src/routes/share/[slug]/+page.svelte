<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import { resolve } from '$app/paths';
	import { SHARE_URL } from '$lib/config';
	import type { SemanticLevel } from '$lib/types/semantic';

	let loading = $state(true);
	let error = $state('');
	let snapshotMeta = $state<{ projectName: string; fileCount: number } | null>(null);

	const slug = $derived($page.params.slug);
	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null && !semanticStore.panelDismissed
	);

	onMount(async () => {
		// Mark the store as a read-only snapshot viewer so drilldowns into
		// non-cached nodes route to the "analyze it yourself" prompt instead
		// of triggering AI calls on the visitor's credentials (ADR-19 follow-up).
		semanticStore.readOnlyMode = 'snapshot';
		try {
			const shareBase = SHARE_URL || '';
			const res = await fetch(`${shareBase}/share/${slug}`);
			if (!res.ok) {
				if (res.status === 404) {
					error = i18nStore.t('shareView.notFound');
				} else {
					error = i18nStore.t('shareView.loadFailed');
				}
				return;
			}

			const snapshot = await res.json();

			// Validate snapshot shape
			if (!snapshot || typeof snapshot !== 'object' || !snapshot.semanticLevels) {
				throw new Error('Invalid snapshot');
			}

			const projectName =
				typeof snapshot.projectName === 'string'
					? snapshot.projectName
					: i18nStore.t('shareView.projectFallback');

			// Inject into stores (read-only mode)
			projectStore.projectName = projectName;

			// Restore semantic cache levels with structural validation
			const cacheMap = new Map<string, SemanticLevel>();
			for (const [key, value] of Object.entries(snapshot.semanticLevels)) {
				const level = value as Record<string, unknown>;
				if (
					level &&
					typeof level === 'object' &&
					Array.isArray(level.nodes) &&
					Array.isArray(level.edges) &&
					typeof level.breadcrumbLabel === 'string' &&
					(level.parentId === null || typeof level.parentId === 'string')
				) {
					cacheMap.set(key, level as unknown as SemanticLevel);
				}
			}

			// Find root level
			const rootLevel =
				cacheMap.get('__root__') ?? [...cacheMap.values()].find((l) => l.parentId === null);
			if (rootLevel) {
				semanticStore.currentLevel = rootLevel;
			}

			// Restore cache for drill-down
			for (const [key, level] of cacheMap) {
				semanticStore.setCachedLevel(key, level);
			}

			const filePaths = Array.isArray(snapshot.filePaths) ? snapshot.filePaths : [];
			snapshotMeta = {
				projectName,
				fileCount: filePaths.length
			};
		} catch (err) {
			error = i18nStore.t('shareView.loadFailed');
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		// Full reset when leaving the share viewer so the main app lands
		// clean — otherwise the header would keep the shared project name
		// and the semantic cache would bleed into the next analysis.
		// clear() also resets readOnlyMode/snapshotMeta.
		semanticStore.clear();
		projectStore.projectName = '';
		projectStore.githubInfo = null;
	});
</script>

<svelte:head>
	<title>{snapshotMeta?.projectName ?? i18nStore.t('shareView.pageTitleFallback')} | Ropeman</title>
	<meta
		name="description"
		content={snapshotMeta
			? `${snapshotMeta.projectName} — AI semantic architecture diagram (${snapshotMeta.fileCount} files)`
			: 'Shared code architecture diagram'}
	/>
	<meta property="og:title" content={`${snapshotMeta?.projectName ?? 'Shared'} | Ropeman`} />
	<meta property="og:description" content="AI-powered code architecture visualization" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="share-page" data-theme={themeStore.current}>
	<!-- Header -->
	<header class="share-header">
		<a href={resolve('/')} class="share-logo">Ropeman</a>
		<span class="share-project-name">{snapshotMeta?.projectName ?? ''}</span>
		<span class="share-badge">
			{i18nStore.t('shareView.badge')}
		</span>
		<div class="share-header-actions">
			<button class="share-cta" onclick={() => (window.location.href = resolve('/'))}>
				<span class="material-symbols-outlined" style="font-size: 16px;">add</span>
				{i18nStore.t('shareView.analyzeOwn')}
			</button>
		</div>
	</header>

	<!-- Content -->
	<div class="share-content">
		{#if loading}
			<div class="share-loading">
				<div class="loading-ring"></div>
				<p>{i18nStore.t('shareView.loading')}</p>
			</div>
		{:else if error}
			<div class="share-error">
				<span class="material-symbols-outlined share-error-icon">link_off</span>
				<h2>{i18nStore.t('shareView.notFoundTitle')}</h2>
				<p>{error}</p>
				<a href={resolve('/')} class="share-cta">
					{i18nStore.t('shareView.goHome')}
				</a>
			</div>
		{:else}
			<div class="share-breadcrumb">
				<Breadcrumb />
			</div>
			<div class="share-canvas-area">
				<ZUICanvas />
			</div>
			{#if hasSemanticSelection}
				<div class="share-detail-panel">
					<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.share-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--color-background-body);
		color: var(--color-text-primary);
	}

	.share-header {
		display: flex;
		align-items: center;
		gap: 12px;
		height: var(--header-height);
		padding: 0 16px;
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
	}

	.share-logo {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
		color: var(--color-accent);
		text-decoration: none;
	}

	.share-project-name {
		font-family: var(--font-code);
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.share-badge {
		font-size: 12px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 9999px;
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	.share-header-actions {
		margin-left: auto;
	}

	.share-cta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		border: none;
		border-radius: 6px;
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.share-cta:hover {
		opacity: 0.85;
	}

	.share-content {
		flex: 1;
		display: flex;
		position: relative;
		overflow: hidden;
	}

	.share-breadcrumb {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: 8px 16px;
	}

	.share-canvas-area {
		--canvas-toolbar-top: 56px;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	/* Sits above the floating breadcrumb so the node title stays visible */
	.share-detail-panel {
		position: relative;
		z-index: 11;
		width: 320px;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.share-loading {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--color-text-secondary);
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

	.share-error {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.share-error-icon {
		font-size: 48px;
		color: var(--color-text-tertiary);
	}

	.share-error h2 {
		font-family: var(--font-display);
		font-size: 24px;
		color: var(--color-text-primary);
	}

	.share-error p {
		max-width: 400px;
		font-size: 14px;
		line-height: 1.6;
	}

	/* Phones: the detail opens as a bottom sheet over the canvas */
	@media (max-width: 768px) {
		.share-detail-panel {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 55dvh;
			z-index: 30;
			border-left: none;
			border-top: 1px solid var(--color-border);
			border-radius: 12px 12px 0 0;
			box-shadow: 0 -8px 24px var(--color-shadow);
			padding-bottom: env(safe-area-inset-bottom);
		}
	}
</style>
