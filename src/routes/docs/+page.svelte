<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';

	// Client-side redirect to the user's preferred locale. We can't do this
	// server-side because prerender doesn't know the visitor's language.
	onMount(() => {
		goto(resolve(`/docs/${settingsStore.language}/getting-started`), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Ropeman Docs</title>
	<meta name="description" content="Ropeman 공식 문서 — AI 기반 코드 시각화 도구" />
</svelte:head>

<div class="redirect-notice">
	<p>{i18nStore.t('docsUi.loadingDocs')}</p>
	<p class="hint">
		<a href={resolve('/docs/en/getting-started')}>English</a> ·
		<a href={resolve('/docs/ko/getting-started')}>한국어</a>
	</p>
</div>

<style>
	.redirect-notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: var(--spacing-4);
		color: var(--color-text-secondary);
		font-family: var(--font-body);
	}

	.hint {
		font-size: var(--font-size-base);
	}

	.hint a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.hint a:hover {
		text-decoration: underline;
	}
</style>
