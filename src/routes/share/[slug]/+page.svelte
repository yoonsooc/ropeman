<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import SnapshotViewer from '$lib/components/SnapshotViewer.svelte';
	import { resolve } from '$app/paths';
	import { SHARE_URL } from '$lib/config';
	import type { GitHubSource } from '$lib/services/githubSource';
	import { parseSharePayload, readSharedFile, sharedFileUrl } from '$lib/services/shareService';

	let loading = $state(true);
	let error = $state('');
	let snapshotMeta = $state<{ projectName: string; fileCount: number } | null>(null);
	let source = $state<GitHubSource | null>(null);

	const slug = $derived($page.params.slug);

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

			const shared = parseSharePayload(await res.json());
			if (!shared) throw new Error('Invalid snapshot');

			const projectName = shared.projectName ?? i18nStore.t('shareView.projectFallback');
			projectStore.projectName = projectName;
			const rootLevel =
				shared.levels.get('__root__') ??
				[...shared.levels.values()].find((l) => l.parentId === null);
			if (rootLevel) {
				semanticStore.currentLevel = rootLevel;
			}
			for (const [key, level] of shared.levels) {
				semanticStore.setCachedLevel(key, level);
			}
			source = shared.source;
			snapshotMeta = { projectName, fileCount: shared.fileCount };
		} catch {
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
			<SnapshotViewer
				read={(path) => readSharedFile(source, path)}
				githubUrl={(path) => sharedFileUrl(source, path)}
			/>
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
		gap: var(--spacing-3);
		height: var(--header-height);
		padding: 0 var(--spacing-4);
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
	}

	.share-logo {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
		text-decoration: none;
	}

	.share-project-name {
		font-family: var(--font-code);
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
	}

	.share-badge {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	.share-header-actions {
		margin-left: auto;
	}

	.share-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
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
		transition: opacity var(--duration-fast) var(--ease-standard);
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

	.share-loading {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-4);
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
		gap: var(--spacing-3);
		text-align: center;
		color: var(--color-text-secondary);
	}

	.share-error-icon {
		font-size: 48px;
		color: var(--color-text-tertiary);
	}

	.share-error h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		color: var(--color-text-primary);
	}

	.share-error p {
		max-width: 400px;
		font-size: var(--font-size-base);
		line-height: 1.6;
	}
</style>
