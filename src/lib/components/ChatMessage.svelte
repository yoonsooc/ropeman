<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import type { ChatMessage } from '$lib/stores/chatStore.svelte';
	import { marked } from 'marked';

	let { message }: { message: ChatMessage } = $props();

	// Configure marked for safe rendering
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	function renderContent(text: string): string {
		if (!text) return '';
		try {
			return marked.parse(text) as string;
		} catch {
			// Fallback to basic escaping
			return text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/\n/g, '<br>');
		}
	}

	function handleNodeClick(nodeId: string) {
		// Find the node in the AST map or set selection by ID
		// The selectionStore expects a GraphNode, so we create a minimal lookup
		// Other components (graph-zui) will handle the actual navigation
		// For now, dispatch a custom event on the window
		window.dispatchEvent(new CustomEvent('ropeman:navigate-node', { detail: { nodeId } }));
	}

	let formattedContent = $derived(renderContent(message.content));
	let hasRelatedNodes = $derived(message.relatedNodes && message.relatedNodes.length > 0);
</script>

<div class="chat-message {message.role}">
	<div class="chat-message-content">
		{@html formattedContent}
	</div>

	{#if hasRelatedNodes && message.role === 'assistant'}
		<div class="chat-related-nodes">
			{#each message.relatedNodes as nodeId}
				<button class="chat-related-link" onclick={() => handleNodeClick(nodeId)}>
					{i18nStore.t('relatedNodes')}: {nodeId}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chat-related-link {
		background: none;
		border: none;
		color: var(--color-accent);
		cursor: pointer;
		font-size: var(--font-size-sm);
		padding: var(--spacing-0-5) var(--spacing-1);
		text-decoration: underline;
		text-align: left;
	}
	.chat-related-link:hover {
		opacity: 0.8;
	}
	.chat-message-content :global(pre) {
		background: var(--color-background-muted);
		padding: var(--spacing-2) var(--spacing-3);
		border-radius: var(--radius-element);
		overflow-x: auto;
		font-size: var(--font-size-sm);
	}
	.chat-message-content :global(code) {
		background: var(--color-background-muted);
		padding: 1px var(--spacing-1);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
	}
	.chat-message-content :global(pre code) {
		background: none;
		padding: 0;
	}
</style>
