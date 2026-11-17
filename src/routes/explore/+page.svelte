<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { filterEntries, listLanguages } from '$lib/services/exploreService';
	import type { PageProps, Snapshot } from './$types';

	let { data }: PageProps = $props();

	let pageEl = $state<HTMLDivElement>();

	// The page scrolls inside its own box, which SvelteKit's scroll restoration does not see
	export const snapshot: Snapshot<number> = {
		capture: () => pageEl?.scrollTop ?? 0,
		restore: (top) => {
			if (pageEl) pageEl.scrollTop = top;
		}
	};

	let query = $state('');
	let language = $state('all');

	const languages = $derived(['all', ...listLanguages(data.manifest.entries)]);
	const filtered = $derived(filterEntries(data.manifest.entries, { query, language }));
</script>

<svelte:head>
	<title>{i18nStore.t('explore.pageTitle')}</title>
	<meta
		name="description"
		content="Browse AI-generated architecture diagrams of popular open-source projects: React, Vue, Svelte, FastAPI, Gin and more."
	/>
	<meta property="og:title" content="Explore — Open-source architectures | Ropeman" />
	<meta
		property="og:description"
		content="Browse AI-generated architecture diagrams of popular open-source projects."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://ropeman.dev/explore" />
	<link rel="canonical" href="https://ropeman.dev/explore" />
</svelte:head>

<!-- Focused on arrival so arrow keys, Page Down and Space scroll the gallery -->
<!-- svelte-ignore a11y_autofocus -->
<div
	class="explore-page"
	data-theme={themeStore.current}
	bind:this={pageEl}
	tabindex="-1"
	autofocus
>
	<header class="explore-header">
		<a href={resolve('')} class="explore-logo"><Wordmark /></a>
		<nav class="explore-nav">
			<a
				class="explore-nav-btn"
				href={resolve('')}
				title={i18nStore.t('explore.home')}
				aria-label={i18nStore.t('explore.home')}
			>
				<span class="material-symbols-outlined">home</span>
			</a>
			<a
				class="explore-nav-btn"
				href={resolve(`docs/${i18nStore.locale}/getting-started`)}
				title={i18nStore.t('docs.headerLink')}
				aria-label={i18nStore.t('docs.headerLink')}
			>
				<span class="material-symbols-outlined">menu_book</span>
			</a>
		</nav>
	</header>

	<main class="explore-main">
		<section class="explore-hero">
			<h1>{i18nStore.t('explore.heroTitle')}</h1>
			<p>{i18nStore.t('explore.heroDesc')}</p>
		</section>

		<section class="explore-filters">
			<input
				type="search"
				bind:value={query}
				placeholder={i18nStore.t('explore.searchPlaceholder')}
				class="filter-input"
				aria-label={i18nStore.t('explore.searchLabel')}
			/>
			<select
				bind:value={language}
				class="filter-select"
				aria-label={i18nStore.t('explore.languageLabel')}
			>
				{#each languages as lang (lang)}
					<option value={lang}>{lang === 'all' ? i18nStore.t('explore.allLanguages') : lang}</option
					>
				{/each}
			</select>
			<span class="explore-count" role="status"
				>{i18nStore.t('explore.repoCount', { n: filtered.length })}</span
			>
		</section>

		<section class="explore-grid">
			{#if filtered.length === 0}
				<div class="explore-empty">
					{i18nStore.t('explore.empty')}
				</div>
			{:else}
				{#each filtered as entry, index (entry.slug)}
					<a class="explore-card" href={resolve(`explore/${entry.slug}`)}>
						<img
							class="card-thumb"
							src="/explore/thumbs/{entry.slug}-{themeStore.current === 'dark'
								? 'dark'
								: 'light'}.webp"
							width="800"
							height="430"
							alt=""
							loading={index < 6 ? 'eager' : 'lazy'}
							fetchpriority={index === 0 ? 'high' : 'auto'}
							decoding="async"
						/>
						<div class="card-body">
							<div class="card-heading">
								<h2 class="card-title">{entry.title}</h2>
								<span class="card-repo">{entry.owner}/{entry.repo}</span>
							</div>
							<p class="card-desc">
								{i18nStore.locale === 'ko' && entry.descriptionKo
									? entry.descriptionKo
									: entry.description}
							</p>
						</div>
						<dl class="card-meta">
							<div>
								<dt class="visually-hidden">{i18nStore.t('explore.languageLabel')}</dt>
								<dd class="card-language">{entry.language}</dd>
							</div>
							{#if entry.stars}
								<div>
									<dt class="visually-hidden">GitHub</dt>
									<dd class="card-stars">
										{i18nStore.t('explore.starCount', { n: entry.stars })}
									</dd>
								</div>
							{/if}
						</dl>
					</a>
				{/each}
			{/if}
		</section>
	</main>
</div>

<style>
	/* Global CSS pins html and body with overflow hidden for the app canvas, so the
	   gallery scrolls inside its own box (the sticky header sticks to it) */
	.explore-page {
		height: 100vh;
		height: 100dvh;
		overflow-y: auto;
		outline: none;
		background: var(--color-background-body);
		color: var(--color-text-primary);
		display: flex;
		flex-direction: column;
	}

	/* Match Header.svelte spacing so gallery pages visually align with
	   the rest of the app (padding 16px, header-left gap 32px). */
	.explore-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-8);
		padding: 0 var(--spacing-4);
		height: var(--header-height);
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.explore-logo {
		font-size: var(--font-size-lg);
		color: var(--color-text-primary);
		text-decoration: none;
	}

	.explore-nav {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		margin-left: auto;
	}

	.explore-nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: var(--spacing-1);
		border-radius: var(--radius-inner);
		color: var(--color-text-secondary);
		text-decoration: none;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.explore-nav-btn .material-symbols-outlined {
		font-size: 18px;
	}

	.explore-nav-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.explore-main {
		flex: 1;
		max-width: 1080px;
		width: 100%;
		margin: 0 auto;
		padding: var(--spacing-6) var(--spacing-6) var(--spacing-12);
	}

	.explore-hero {
		margin-bottom: var(--spacing-5);
	}

	.explore-hero h1 {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		line-height: 1.3;
		margin: 0 0 var(--spacing-1-5);
		color: var(--color-text-primary);
	}

	.explore-hero p {
		max-width: 72ch;
		margin: 0;
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.explore-filters {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding-bottom: var(--spacing-3);
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.filter-input,
	.filter-select {
		height: 32px;
		background: var(--color-background-body);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		padding: 0 var(--spacing-3);
		color: var(--color-text-primary);
		font-size: var(--font-size-sm);
		font-family: inherit;
	}

	.filter-input {
		flex: 1;
		min-width: 200px;
		max-width: 360px;
	}

	.filter-input::placeholder {
		color: var(--color-text-tertiary);
		opacity: 1;
	}

	.filter-input:focus,
	.filter-select:focus {
		border-color: var(--color-text-tertiary);
	}

	.explore-count {
		margin-left: auto;
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	/* One row per repository: the map's thumbnail, what it is, and its language and stars */
	.explore-grid {
		display: flex;
		flex-direction: column;
	}

	.explore-empty {
		padding: var(--spacing-8) 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-base);
	}

	.explore-card {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr) 128px;
		align-items: start;
		gap: var(--spacing-4);
		padding: var(--spacing-3) var(--spacing-2);
		border-bottom: 1px solid var(--color-border);
		text-decoration: none;
		color: inherit;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.explore-card:hover {
			background: var(--color-background-surface);
		}
	}

	.card-thumb {
		display: block;
		width: 100%;
		aspect-ratio: 800 / 430;
		height: auto;
		object-fit: cover;
		background: var(--color-background-canvas);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
	}

	.card-body {
		min-width: 0;
	}

	.card-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 var(--spacing-2);
	}

	.card-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		line-height: 1.4;
		margin: 0;
		color: var(--color-text-primary);
	}

	.card-repo {
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.card-desc {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		line-height: 1.55;
		color: var(--color-text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-meta {
		display: grid;
		gap: var(--spacing-1);
		margin: 0;
		justify-items: end;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.card-meta dd {
		margin: 0;
	}

	.card-stars {
		color: var(--color-text-tertiary);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 639px) {
		.explore-main {
			padding: var(--spacing-5) var(--spacing-4) var(--spacing-10);
		}

		.explore-card {
			grid-template-columns: 96px minmax(0, 1fr);
			gap: var(--spacing-3);
			padding: var(--spacing-3) 0;
		}

		.card-meta {
			grid-column: 2;
			display: flex;
			gap: var(--spacing-3);
			justify-items: start;
		}

		.filter-input {
			max-width: none;
		}

		.explore-count {
			margin-left: 0;
			width: 100%;
		}
	}
</style>
