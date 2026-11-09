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
		background: var(--code-bg);
		border-radius: 8px;
		overflow: hidden;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
		font-size: 13px;
		line-height: 1.6;
	}

	.code-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border-bottom: 1px solid var(--ghost-border);
	}

	.lang-badge {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--accent);
		background: rgba(96, 165, 250, 0.12);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.line-range {
		font-size: 11px;
		color: var(--code-text);
		opacity: 0.5;
	}

	.code-body {
		overflow: auto;
		max-height: 400px;
		padding: 8px 0;
	}

	pre {
		margin: 0;
		color: var(--code-text);
	}

	code {
		display: block;
	}

	.code-line {
		display: flex;
		padding: 0 12px;
		transition: background-color 0.15s ease;
	}

	.code-line:hover {
		background: var(--bg-secondary);
	}

	.code-line.highlighted {
		background: rgba(96, 165, 250, 0.12);
		border-left: 3px solid var(--accent);
		padding-left: 9px;
	}

	.line-number {
		display: inline-block;
		width: 40px;
		min-width: 40px;
		text-align: right;
		padding-right: 16px;
		color: var(--text-muted);
		user-select: none;
		flex-shrink: 0;
	}

	.line-content {
		flex: 1;
		white-space: pre;
	}

	/* Token colors are managed by the dynamically injected prism theme CSS */
</style>
