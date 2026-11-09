<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import { fetchExploreSnapshot } from '$lib/services/exploreService';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let loading = $state(true);
	let status = $state<'ok' | 'not-analyzed' | 'error'>('ok');
	let errorMessage = $state('');

	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null && !semanticStore.panelDismissed
	);

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
	<title>{data.entry.title} architecture | Ropeman Explore</title>
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
			← {i18nStore.locale === 'ko' ? '갤러리' : 'Explore'}
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
				{i18nStore.locale === 'ko' ? '내 프로젝트 분석' : 'Analyze your own'}
			</button>
		</div>
	</header>

	<div class="explore-content">
		{#if loading}
			<div class="state state-loading">
				<div class="loading-ring"></div>
				<p>
					{i18nStore.locale === 'ko'
						? `${data.entry.title} 아키텍처 불러오는 중...`
						: `Loading ${data.entry.title} architecture...`}
				</p>
			</div>
		{:else if status === 'not-analyzed'}
			<div class="state state-empty">
				<span class="material-symbols-outlined state-icon">hourglass_empty</span>
				<h2>
					{i18nStore.locale === 'ko' ? '아직 분석되지 않았습니다' : 'Not analyzed yet'}
				</h2>
				<p>
					{i18nStore.locale === 'ko'
						? `${data.entry.title}의 아키텍처 스냅샷은 곧 추가됩니다. 그동안 홈에서 GitHub URL로 직접 분석해보세요.`
						: `The architecture snapshot for ${data.entry.title} will be added soon. You can analyze it yourself by pasting the GitHub URL on the home page.`}
				</p>
				<div class="state-actions">
					<a href={resolve('/')} class="cta">
						{i18nStore.locale === 'ko' ? '홈에서 분석하기' : 'Analyze from home'}
					</a>
					<a
						href={`https://github.com/${data.entry.owner}/${data.entry.repo}`}
						target="_blank"
						rel="noopener noreferrer"
						class="cta cta-secondary"
					>
						{i18nStore.locale === 'ko' ? 'GitHub에서 보기' : 'View on GitHub'} ↗
					</a>
				</div>
			</div>
		{:else if status === 'error'}
			<div class="state state-error">
				<span class="material-symbols-outlined state-icon">error</span>
				<h2>{i18nStore.locale === 'ko' ? '오류' : 'Error'}</h2>
				<p>{errorMessage}</p>
				<a href={resolve('/explore')} class="cta">
					{i18nStore.locale === 'ko' ? '갤러리로' : 'Back to Explore'}
				</a>
			</div>
		{:else}
			<div class="canvas-breadcrumb">
				<Breadcrumb />
			</div>
			<div class="canvas-area">
				<ZUICanvas />
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
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.explore-header {
		display: flex;
		align-items: center;
		gap: 12px;
		height: var(--header-height, 48px);
		padding: 0 16px;
		background: var(--sidebar-icon-bg, #0f141a);
		border-bottom: 1px solid var(--ghost-border);
	}

	.explore-logo {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
		color: var(--accent);
		text-decoration: none;
	}

	.back-link {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 12px;
	}
	.back-link:hover {
		color: var(--text-primary);
	}

	.project-name {
		font-family: var(--font-code);
		font-size: 13px;
		color: var(--text-secondary);
	}

	.badge {
		font-size: 12px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 9999px;
		background: var(--accent-bg);
		color: var(--accent);
	}

	.header-actions {
		margin-left: auto;
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.repo-link {
		font-size: 12px;
		color: var(--text-secondary);
		text-decoration: none;
	}
	.repo-link:hover {
		color: var(--text-primary);
	}

	.cta {
		display: inline-flex;
		align-items: center;
		padding: 6px 14px;
		background: var(--accent);
		color: var(--on-accent);
		border: none;
		border-radius: 6px;
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		text-decoration: none;
	}
	.cta:hover {
		opacity: 0.85;
	}

	.cta-secondary {
		background: transparent;
		color: var(--text-primary);
		border: 1px solid var(--ghost-border);
	}

	.cta-secondary:hover {
		background: var(--ghost-bg, rgba(255, 255, 255, 0.05));
		opacity: 1;
	}

	.state-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 8px;
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
		padding: 8px 16px;
	}

	.canvas-area {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.detail-panel {
		width: 320px;
		border-left: 1px solid var(--ghost-border);
		overflow-y: auto;
	}

	.state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 24px;
		text-align: center;
		color: var(--text-secondary);
	}

	.state h2 {
		font-family: var(--font-display);
		font-size: 22px;
		color: var(--text-primary);
		margin: 0;
	}

	.state p {
		max-width: 460px;
		font-size: 14px;
		line-height: 1.6;
	}

	.state-icon {
		font-size: 56px;
		color: var(--text-muted, var(--text-secondary));
	}

	.loading-ring {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 2px solid rgba(163, 166, 255, 0.1);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.detail-panel {
			display: none;
		}
	}
</style>
