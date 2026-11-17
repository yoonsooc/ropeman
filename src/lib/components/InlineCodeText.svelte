<script lang="ts">
	import { splitInlineCode } from '$lib/utils/inlineCode';

	let { text }: { text: string } = $props();

	const parts = $derived(splitInlineCode(text));
</script>

{#each parts as part, i (i)}{#if part.code}<code class="inline-code">{part.text}</code
		>{:else}{part.text}{/if}{/each}

<style>
	/* A flag or path breaks only at the spaces around it, never at its own hyphens */
	.inline-code {
		font-family: var(--font-code);
		font-size: 0.92em;
		color: inherit;
		white-space: nowrap;
	}
</style>
