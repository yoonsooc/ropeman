<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { page } from '$app/state';

	interface Heading {
		id: string;
		text: string;
		level: 2 | 3;
	}

	const HEADER_OFFSET = 72; // sticky header (48) + a bit of breathing room

	let headings = $state<Heading[]>([]);
	let activeId = $state<string>('');
	let scrollContainer: HTMLElement | null = null;
	let scrollHandler: (() => void) | null = null;

	async function extractHeadings() {
		await tick();
		const container = document.querySelector('.docs-content');
		if (!container) {
			headings = [];
			return;
		}
		const nodes = container.querySelectorAll('h2[id], h3[id]');
		const collected: Heading[] = [];
		for (const node of nodes) {
			collected.push({
				id: node.id,
				text: node.textContent ?? '',
				level: node.tagName === 'H2' ? 2 : 3
			});
		}
		headings = collected;
		setupScrollSpy();
	}

	function setupScrollSpy() {
		// Tear down any previous listener.
		if (scrollContainer && scrollHandler) {
			scrollContainer.removeEventListener('scroll', scrollHandler);
		}
		if (headings.length === 0) return;

		// `.docs-shell` is the scroll container (see docs/+layout.svelte). We
		// listen to its scroll events directly because IntersectionObserver
		// doesn't reliably fire when the body has overflow:hidden in some
		// Chromium-based browsers.
		scrollContainer = document.querySelector('.docs-shell');
		if (!scrollContainer) return;

		const update = () => {
			let current = headings[0]?.id ?? '';
			for (const h of headings) {
				const el = document.getElementById(h.id);
				if (!el) continue;
				const top = el.getBoundingClientRect().top;
				if (top - HEADER_OFFSET <= 0) {
					current = h.id;
				} else {
					break;
				}
			}
			if (current !== activeId) activeId = current;
		};

		scrollHandler = update;
		scrollContainer.addEventListener('scroll', update, { passive: true });
		// Set initial state once.
		update();
	}

	onMount(() => {
		extractHeadings();
		return () => {
			if (scrollContainer && scrollHandler) {
				scrollContainer.removeEventListener('scroll', scrollHandler);
			}
		};
	});

	// Re-extract when the route changes (new doc loaded).
	$effect(() => {
		// Read page.url to subscribe to route changes
		void page.url.pathname;
		extractHeadings();
	});
</script>

{#if headings.length > 0}
	<aside class="docs-toc" aria-label={i18nStore.t('docs.onThisPage')}>
		<h4>{i18nStore.t('docs.onThisPage')}</h4>
		<ul>
			{#each headings as heading (heading.id)}
				<li class:h3={heading.level === 3}>
					<a href={`#${heading.id}`} class:active={heading.id === activeId}>
						{heading.text}
					</a>
				</li>
			{/each}
		</ul>
	</aside>
{/if}

<style>
	.docs-toc {
		grid-area: toc;
		position: sticky;
		top: var(--header-height);
		align-self: start;
		padding: 32px 24px 32px 16px;
		max-height: calc(100vh - var(--header-height));
		overflow-y: auto;
		font-family: var(--font-body);
	}

	h4 {
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		color: var(--color-text-secondary);
		margin: 0 0 12px;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	li.h3 {
		padding-left: 12px;
	}

	li a {
		display: block;
		padding: 4px 8px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--color-text-secondary);
		text-decoration: none;
		border-left: 2px solid transparent;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}

	li a:hover {
		color: var(--color-text-primary);
	}

	li a.active {
		color: var(--color-accent);
		border-left-color: var(--color-accent);
	}

	@media (max-width: 1200px) {
		.docs-toc {
			display: none;
		}
	}
</style>
