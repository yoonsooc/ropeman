<script lang="ts">
	import { scrollBehavior } from '$lib/utils/motion';
	import { onMount } from 'svelte';
	import Prism from 'prismjs';
	import 'prismjs/components/prism-python';
	import 'prismjs/components/prism-javascript';
	import 'prismjs/components/prism-typescript';

	let {
		code = '',
		language = 'javascript',
		lineStart,
		lineEnd
	}: {
		code: string;
		language?: string;
		lineStart?: number;
		lineEnd?: number;
	} = $props();

	let codeEl: HTMLElement | undefined = $state();

	const grammar = $derived(Prism.languages[language] ?? Prism.languages['javascript']);

	const highlighted = $derived(code ? Prism.highlight(code, grammar, language) : '');

	const lines = $derived(highlighted.split('\n'));

	$effect(() => {
		if (codeEl && lineStart != null) {
			const target = codeEl.querySelector(`[data-line="${lineStart}"]`);
			target?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
		}
	});

	function isHighlighted(lineNum: number): boolean {
		if (lineStart == null || lineEnd == null) return false;
		return lineNum >= lineStart && lineNum <= lineEnd;
	}
</script>

<div class="code-panel" bind:this={codeEl}>
	<div class="code-header">
		<span class="lang-badge">{language}</span>
		{#if lineStart != null && lineEnd != null}
			<span class="line-range">L{lineStart}-{lineEnd}</span>
		{/if}
	</div>
	<div class="code-body">
		<pre><code
				>{#each lines as line, i}{@const lineNum = (lineStart ?? 1) + i}<span
						class="code-line"
						class:highlighted={isHighlighted(lineNum)}
						data-line={lineNum}
						><span class="line-number">{lineNum}</span><span class="line-content">{@html line}</span
						></span
					>
				{/each}</code
			></pre>
	</div>
</div>

<style>
	.code-panel {
		display: flex;
		flex-direction: column;
		background: var(--color-syntax-background);
		border-radius: var(--radius-element);
		overflow: hidden;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
		font-size: var(--font-size-base);
		line-height: 1.6;
	}

	.code-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-background-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.lang-badge {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		color: var(--color-accent);
		background: var(--color-accent-muted);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-inner);
	}

	.line-range {
		font-size: var(--font-size-sm);
		color: var(--color-syntax-text);
		opacity: 0.5;
	}

	.code-body {
		overflow: auto;
		max-height: 400px;
		padding: var(--spacing-2) 0;
	}

	pre {
		margin: 0;
		color: var(--color-syntax-text);
	}

	code {
		display: block;
	}

	.code-line {
		display: flex;
		padding: 0 var(--spacing-3);
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.code-line:hover {
		background: var(--color-background-surface);
	}

	.code-line.highlighted {
		background: var(--color-accent-muted);
		border-left: 3px solid var(--color-accent);
		padding-left: var(--spacing-2);
	}

	.line-number {
		display: inline-block;
		width: 40px;
		min-width: 40px;
		text-align: right;
		padding-right: var(--spacing-4);
		color: var(--color-text-tertiary);
		user-select: none;
		flex-shrink: 0;
	}

	.line-content {
		flex: 1;
		white-space: pre;
	}

	/* Token colors are managed by the dynamically injected prism theme CSS */
</style>
