<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ldJson = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'TechArticle',
			headline: data.frontmatter.title,
			description: data.frontmatter.description,
			inLanguage: data.lang,
			url: `https://ropeman.dev/docs/${data.lang}/${data.slug}`,
			author: { '@type': 'Organization', name: 'Ropeman' }
		})
	);
</script>

<svelte:head>
	<title>{data.frontmatter.title} | Ropeman Docs</title>
	<meta name="description" content={data.frontmatter.description} />
	<meta property="og:title" content={`${data.frontmatter.title} | Ropeman Docs`} />
	<meta property="og:description" content={data.frontmatter.description} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={`https://ropeman.dev/docs/${data.lang}/${data.slug}`} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={`${data.frontmatter.title} | Ropeman Docs`} />
	<meta name="twitter:description" content={data.frontmatter.description} />
	<link rel="alternate" hreflang="ko" href={`https://ropeman.dev/docs/ko/${data.slug}`} />
	<link rel="alternate" hreflang="en" href={`https://ropeman.dev/docs/en/${data.slug}`} />
	<link rel="alternate" hreflang="x-default" href={`https://ropeman.dev/docs/en/${data.slug}`} />
	<!--
		Schema.org JSON-LD. The closing script tag is split across two string
		literals so the Svelte parser doesn't see a literal `</script>` in the
		template source, which would terminate its lexer state early.
	-->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${ldJson}<` + `/script>`}
</svelte:head>

<article class="docs-article">
	<header class="article-header">
		<h1>{data.frontmatter.title}</h1>
		{#if data.frontmatter.description}
			<p class="article-lede">{data.frontmatter.description}</p>
		{/if}
	</header>
	<div class="docs-content">
		<data.component />
	</div>
</article>

<style>
	.docs-article {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--spacing-12) var(--spacing-8) 96px;
		color: var(--color-text-primary);
		font-family: var(--font-body);
	}

	.article-header {
		margin-bottom: var(--spacing-10);
		padding-bottom: var(--spacing-6);
		border-bottom: 1px solid var(--color-border);
	}

	.article-header h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-4xl);
		font-weight: var(--font-weight-semibold);
		line-height: 1.2;
		margin: 0 0 var(--spacing-3);
		color: var(--color-text-primary);
	}

	.article-lede {
		font-size: var(--font-size-lg);
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.docs-content :global(h2) {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: var(--font-weight-semibold);
		margin: var(--spacing-12) 0 var(--spacing-4);
		color: var(--color-text-primary);
		scroll-margin-top: 72px;
	}

	.docs-content :global(h3) {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		margin: var(--spacing-8) 0 var(--spacing-3);
		color: var(--color-text-primary);
		scroll-margin-top: 72px;
	}

	.docs-content :global(p) {
		font-size: var(--font-size-lg);
		line-height: 1.75;
		margin: var(--spacing-4) 0;
	}

	.docs-content :global(a) {
		color: var(--color-accent);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: border-color var(--duration-fast) var(--ease-standard);
	}

	.docs-content :global(a:hover) {
		border-bottom-color: var(--color-accent);
	}

	.docs-content :global(ul),
	.docs-content :global(ol) {
		padding-left: var(--spacing-7);
		margin: var(--spacing-4) 0;
	}

	.docs-content :global(li) {
		font-size: var(--font-size-lg);
		line-height: 1.75;
		margin: var(--spacing-1-5) 0;
	}

	.docs-content :global(code) {
		font-family: var(--font-code);
		font-size: 0.9em;
		padding: var(--spacing-0-5) var(--spacing-1-5);
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		color: var(--color-text-primary);
	}

	.docs-content :global(pre) {
		background: var(--color-syntax-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		padding: var(--spacing-4) var(--spacing-5);
		overflow-x: auto;
		margin: var(--spacing-5) 0;
	}

	.docs-content :global(pre code) {
		background: transparent;
		border: none;
		padding: 0;
		color: var(--color-syntax-text);
		font-size: var(--font-size-base);
		line-height: 1.6;
	}

	.docs-content :global(blockquote) {
		border-left: 3px solid var(--color-accent);
		padding: var(--spacing-2) var(--spacing-4);
		margin: var(--spacing-4) 0;
		background: var(--color-background-surface);
		color: var(--color-text-secondary);
		border-radius: 0 var(--radius-element) var(--radius-element) 0;
	}

	.docs-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: var(--spacing-5) 0;
		font-size: var(--font-size-base);
	}

	.docs-content :global(th),
	.docs-content :global(td) {
		text-align: left;
		padding: var(--spacing-2) var(--spacing-3);
		border-bottom: 1px solid var(--color-border);
	}

	.docs-content :global(th) {
		font-weight: var(--font-weight-semibold);
		background: var(--color-background-surface);
	}

	.docs-content :global(img) {
		max-width: 100%;
		border-radius: var(--radius-element);
	}

	.docs-content :global(hr) {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: var(--spacing-8) 0;
	}
</style>
