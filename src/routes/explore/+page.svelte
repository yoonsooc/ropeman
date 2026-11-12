<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { filterEntries, listLanguages } from '$lib/services/exploreService';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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

<div class="explore-page" data-theme={themeStore.current}>
	<header class="explore-header">
		<a href={resolve('/')} class="explore-logo">Ropeman</a>
		<nav class="explore-nav">
			<a
				class="explore-nav-btn"
				href={resolve('/')}
				title={i18nStore.t('explore.home')}
				aria-label={i18nStore.t('explore.home')}
			>
				<span class="material-symbols-outlined">home</span>
			</a>
			<a
				class="explore-nav-btn"
				href={resolve(`/docs/${i18nStore.locale}/getting-started`)}
				title={i18nStore.t('docs.headerLink')}
				aria-label={i18nStore.t('docs.headerLink')}
			>
				<span class="material-symbols-outlined">menu_book</span>
			</a>
		</nav>
	</header>

	<main class="explore-main">
		<section class="explore-hero">
			<h1>
				{i18nStore.t('explore.heroTitle')}
			</h1>
			<p>
				{i18nStore.t('explore.heroDesc')}
			</p>
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
		</section>

		<section class="explore-grid">
			{#if filtered.length === 0}
				<div class="explore-empty">
					{i18nStore.t('explore.empty')}
				</div>
			{:else}
				{#each filtered as entry, index (entry.slug)}
					<a
						class="explore-card"
						class:featured={index === 0 && (filtered.length + 1) % 3 === 0}
						href={resolve(`/explore/${entry.slug}`)}
					>
						<img
							class="card-thumb"
							src="/explore/thumbs/{entry.slug}-{themeStore.current === 'dark'
								? 'dark'
								: 'light'}.webp"
							width="800"
							height="430"
							alt=""
							loading={index < 3 ? 'eager' : 'lazy'}
							fetchpriority={index === 0 ? 'high' : 'auto'}
							decoding="async"
						/>
						<div class="card-header">
							<span class="card-language" data-lang={entry.language.toLowerCase()}
								>{entry.language}</span
							>
							{#if entry.stars}<span class="card-stars">★ {entry.stars}</span>{/if}
						</div>
						<h2 class="card-title">{entry.title}</h2>
						<div class="card-repo">{entry.owner}/{entry.repo}</div>
						<p class="card-desc">
							{i18nStore.locale === 'ko' && entry.descriptionKo
								? entry.descriptionKo
								: entry.description}
						</p>
					</a>
				{/each}
			{/if}
		</section>
	</main>
</div>

<style>
	.explore-page {
		min-height: 100vh;
		background: var(--color-background-body);
		color: var(--color-text-primary);
		display: flex;
		flex-direction: column;
	}

	/* Match Header.svelte spacing so gallery pages visually align with
	   the rest of the app (padding 16px, header-left gap 32px). */
	.explore-header {
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
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
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
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: var(--spacing-12) var(--spacing-6) 80px;
	}

	.explore-hero {
		text-align: center;
		margin-bottom: var(--spacing-10);
	}

	.explore-hero h1 {
		font-family: var(--font-display);
		font-size: 38px;
		font-weight: var(--font-weight-bold);
		margin: 0 0 var(--spacing-4);
		color: var(--color-text-primary);
		letter-spacing: -0.01em;
	}

	.explore-hero p {
		max-width: 640px;
		margin: 0 auto;
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.explore-filters {
		display: flex;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-8);
		flex-wrap: wrap;
	}

	.filter-input,
	.filter-select {
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		padding: var(--spacing-2) var(--spacing-3);
		color: var(--color-text-primary);
		font-size: var(--font-size-base);
		font-family: inherit;
	}

	.filter-input {
		flex: 1;
		min-width: 240px;
	}

	.filter-input::placeholder {
		color: var(--color-text-tertiary);
		opacity: 1;
	}

	.filter-input:focus,
	.filter-select:focus {
		border-color: var(--color-accent);
	}

	/* When the count leaves one cell short of full rows, the first card spans two */
	.explore-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--spacing-4);
	}

	.explore-card.featured {
		grid-column: span 2;
	}

	@media (max-width: 1023px) {
		.explore-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 639px) {
		.explore-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.explore-card.featured {
			grid-column: auto;
		}
	}

	.explore-empty {
		grid-column: 1 / -1;
		text-align: center;
		padding: var(--spacing-12);
		color: var(--color-text-secondary);
		font-size: var(--font-size-base);
	}

	.explore-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: 0 var(--spacing-5) var(--spacing-5);
		overflow: hidden;
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		text-decoration: none;
		color: inherit;
		transition: border-color var(--duration-fast) var(--ease-standard);
	}

	/* Real snapshot of the graph, full bleed at the top of the card */
	.card-thumb {
		display: block;
		width: calc(100% + 40px);
		margin: 0 calc(-1 * var(--spacing-5)) var(--spacing-2);
		aspect-ratio: 800 / 430;
		height: auto;
		object-fit: cover;
		object-position: center;
		background: var(--color-background-canvas);
		border-bottom: 1px solid var(--color-border);
	}

	.explore-card.featured .card-thumb {
		aspect-ratio: 16 / 7;
	}

	@media (hover: hover) {
		.explore-card:hover {
			border-color: var(--color-accent);
		}
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--font-size-sm);
	}

	.card-language {
		padding: var(--spacing-0-5) var(--spacing-2);
		background: var(--color-accent-muted);
		color: var(--color-accent);
		border-radius: var(--radius-full);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
	}

	.card-stars {
		color: var(--color-text-secondary);
	}

	.card-title {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		margin: var(--spacing-1) 0 0;
		color: var(--color-text-primary);
	}

	.card-repo {
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.card-desc {
		font-size: var(--font-size-base);
		line-height: 1.5;
		color: var(--color-text-secondary);
		margin: var(--spacing-1) 0 var(--spacing-3);
		flex: 1;
	}

	.card-cta {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-accent);
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.explore-hero h1 {
			font-size: var(--font-size-3xl);
		}
	}
</style>
