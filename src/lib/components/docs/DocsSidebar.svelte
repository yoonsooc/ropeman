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
		padding: 32px 16px 32px 24px;
		border-right: 1px solid var(--border);
		background: var(--bg-primary);
		font-family: var(--font-body);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.category-label {
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		color: var(--text-secondary);
		margin: 0 0 8px;
		padding: 0 8px;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	li a {
		display: block;
		padding: 6px 10px;
		font-size: 13px;
		color: var(--text-secondary);
		text-decoration: none;
		border-radius: 6px;
		border-left: 2px solid transparent;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	li a:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	li a.active {
		color: var(--accent);
		background: var(--bg-secondary);
		border-left-color: var(--accent);
		font-weight: 600;
	}

	@media (max-width: 960px) {
		.docs-sidebar {
			position: fixed;
			top: var(--header-height);
			left: 0;
			width: 280px;
			z-index: 15;
			transform: translateX(-100%);
			transition: transform 0.25s ease;
			box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
		}

		.docs-sidebar.open {
			transform: translateX(0);
		}
	}
</style>
