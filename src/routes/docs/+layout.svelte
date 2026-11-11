<script lang="ts">
	import { page } from '$app/state';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { docsModules, buildSidebar, type DocLocale } from '$lib/services/docsService';
	import DocsHeader from '$lib/components/docs/DocsHeader.svelte';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';
	import DocsTOC from '$lib/components/docs/DocsTOC.svelte';

	let { children } = $props();

	let sidebarOpen = $state(false);

	const lang = $derived<DocLocale>(
		(page.params.lang as DocLocale) ?? (i18nStore.locale as DocLocale)
	);
	const slug = $derived<string>(page.params.slug ?? '');

	const categoryLabels = $derived({
		intro: i18nStore.t('docs.categoryIntro'),
		guides: i18nStore.t('docs.categoryGuides'),
		reference: i18nStore.t('docs.categoryReference'),
		support: i18nStore.t('docs.categorySupport')
	});

	const categories = $derived(buildSidebar(docsModules, lang, categoryLabels));

	// Sync docs URL locale → settingsStore so the rest of the app (if user
	// navigates back) stays in the same language.
	$effect(() => {
		if ((lang === 'ko' || lang === 'en') && settingsStore.language !== lang) {
			settingsStore.language = lang;
		}
	});
</script>

<div class="docs-shell">
	<DocsHeader {lang} {slug} onMenuToggle={() => (sidebarOpen = !sidebarOpen)} />
	<div class="docs-grid">
		<DocsSidebar {categories} {lang} open={sidebarOpen} onNavigate={() => (sidebarOpen = false)} />
		<main class="docs-main">
			{@render children()}
		</main>
		<DocsTOC />
	</div>
	{#if sidebarOpen}
		<button
			type="button"
			class="sidebar-backdrop"
			aria-label="Close menu"
			onclick={() => (sidebarOpen = false)}
		></button>
	{/if}
</div>

<style>
	.docs-shell {
		/*
		 * Global CSS pins html/body to height: 100% with overflow: hidden so
		 * the main SPA app can manage its own viewport. For the docs subtree
		 * we restore normal page scrolling by making .docs-shell the scroll
		 * container (sticky DocsHeader/Sidebar/TOC use this as their context).
		 */
		height: 100vh;
		overflow-y: auto;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.docs-grid {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr) 220px;
		grid-template-areas: 'sidebar main toc';
		max-width: 1400px;
		margin: 0 auto;
	}

	.docs-main {
		grid-area: main;
		min-width: 0;
	}

	.sidebar-backdrop {
		display: none;
	}

	@media (max-width: 1200px) {
		.docs-grid {
			grid-template-columns: 260px minmax(0, 1fr);
			grid-template-areas: 'sidebar main';
		}
	}

	@media (max-width: 960px) {
		.docs-grid {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'main';
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			top: var(--header-height);
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			padding: 0;
			background: rgba(0, 0, 0, 0.4);
			border: none;
			cursor: pointer;
			z-index: 14;
		}
	}
</style>
