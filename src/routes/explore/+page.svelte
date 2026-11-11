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
		background: var(--bg-primary);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
	}

	/* Match Header.svelte spacing so gallery pages visually align with
	   the rest of the app (padding 16px, header-left gap 32px). */
	.explore-header {
		display: flex;
		align-items: center;
		gap: 32px;
		padding: 0 16px;
		height: var(--header-height, 48px);
		background: var(--sidebar-icon-bg, #0f141a);
		border-bottom: 1px solid var(--ghost-border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.explore-logo {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 700;
		color: var(--accent);
		text-decoration: none;
	}

	.explore-nav {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	.explore-nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 4px;
		border-radius: 4px;
		color: var(--text-secondary);
		text-decoration: none;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.explore-nav-btn .material-symbols-outlined {
		font-size: 18px;
	}

	.explore-nav-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.explore-main {
		flex: 1;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 48px 24px 80px;
	}

	.explore-hero {
		text-align: center;
		margin-bottom: 40px;
	}

	.explore-hero h1 {
		font-family: var(--font-display);
		font-size: 38px;
		font-weight: 700;
		margin: 0 0 16px;
		color: var(--text-primary);
		letter-spacing: -0.01em;
	}

	.explore-hero p {
		max-width: 640px;
		margin: 0 auto;
		font-size: 15px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.explore-filters {
		display: flex;
		gap: 12px;
		margin-bottom: 32px;
		flex-wrap: wrap;
	}

	.filter-input,
	.filter-select {
		background: var(--bg-secondary, #0f141a);
		border: 1px solid var(--ghost-border);
		border-radius: 6px;
		padding: 10px 14px;
		color: var(--text-primary);
		font-size: 13px;
		font-family: inherit;
	}

	.filter-input {
		flex: 1;
		min-width: 240px;
	}

	.filter-input::placeholder {
		color: var(--text-muted);
		opacity: 1;
	}

	.filter-input:focus,
	.filter-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* When the count leaves one cell short of full rows, the first card spans two */
	.explore-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
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
		padding: 48px;
		color: var(--text-secondary);
		font-size: 14px;
	}

	.explore-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 20px 20px;
		overflow: hidden;
		background: var(--bg-secondary, #0f141a);
		border: 1px solid var(--ghost-border);
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s ease-out;
	}

	/* Real snapshot of the graph, full bleed at the top of the card */
	.card-thumb {
		display: block;
		width: calc(100% + 40px);
		margin: 0 -20px 8px;
		aspect-ratio: 800 / 430;
		height: auto;
		object-fit: cover;
		object-position: center;
		background: var(--bg-lowest);
		border-bottom: 1px solid var(--border);
	}

	.explore-card.featured .card-thumb {
		aspect-ratio: 16 / 7;
	}

	@media (hover: hover) {
		.explore-card:hover {
			border-color: var(--accent);
		}
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
	}

	.card-language {
		padding: 2px 8px;
		background: var(--accent-bg, rgba(83, 221, 252, 0.15));
		color: var(--accent);
		border-radius: 9999px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.card-stars {
		color: var(--text-secondary);
	}

	.card-title {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 700;
		margin: 4px 0 0;
		color: var(--text-primary);
	}

	.card-repo {
		font-family: var(--font-code);
		font-size: 12px;
		color: var(--text-secondary);
	}

	.card-desc {
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-secondary);
		margin: 4px 0 12px;
		flex: 1;
	}

	.card-cta {
		font-size: 12px;
		font-weight: 600;
		color: var(--accent);
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.explore-hero h1 {
			font-size: 28px;
		}
	}
</style>
