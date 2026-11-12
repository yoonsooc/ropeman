<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { SidebarCategory } from '$lib/services/docsService';

	let {
		categories,
		lang,
		open = false,
		onNavigate
	}: {
		categories: SidebarCategory[];
		lang: 'ko' | 'en';
		open?: boolean;
		onNavigate?: () => void;
	} = $props();

	const currentSlug = $derived(page.params.slug ?? '');
</script>

<aside class="docs-sidebar" class:open aria-label={i18nStore.t('docsUi.sidebarNav')}>
	<nav>
		{#each categories as category (category.id)}
			<div class="category">
				<h3 class="category-label">{category.label}</h3>
				<ul>
					{#each category.items as item (item.slug)}
						<li>
							<a
								href={resolve(`/docs/${lang}/${item.slug}`)}
								class:active={item.slug === currentSlug}
								onclick={onNavigate}
							>
								{item.title}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</aside>

<style>
	.docs-sidebar {
		grid-area: sidebar;
		position: sticky;
		top: var(--header-height);
		height: calc(100vh - var(--header-height));
		overflow-y: auto;
		padding: var(--spacing-8) var(--spacing-4) var(--spacing-8) var(--spacing-6);
		border-right: 1px solid var(--color-border);
		background: var(--color-background-body);
		font-family: var(--font-body);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.category-label {
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-2);
		padding: 0 var(--spacing-2);
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-0-5);
	}

	li a {
		display: block;
		padding: var(--spacing-1-5) var(--spacing-2);
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		text-decoration: none;
		border-radius: var(--radius-element);
		border-left: 2px solid transparent;
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	li a:hover {
		background: var(--color-background-surface);
		color: var(--color-text-primary);
	}

	li a.active {
		color: var(--color-accent);
		background: var(--color-background-surface);
		border-left-color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}

	@media (max-width: 960px) {
		.docs-sidebar {
			position: fixed;
			top: var(--header-height);
			left: 0;
			width: 280px;
			z-index: 15;
			transform: translateX(-100%);
			transition: transform var(--duration-medium) var(--ease-standard);
			box-shadow: 4px 0 16px var(--color-shadow);
		}

		.docs-sidebar.open {
			transform: translateX(0);
		}
	}
</style>
