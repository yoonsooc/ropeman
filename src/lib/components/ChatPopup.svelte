<script lang="ts">
	import { chatStore } from '$lib/stores/chatStore.svelte';
	import type { ChatMessage as ChatMessageType } from '$lib/stores/chatStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { sendMessage } from '$lib/services/aiService';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import ChatMessage from './ChatMessage.svelte';

	let inputText = $state('');
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let lastFromCache = $state(false);

	let { onconnect }: { onconnect?: () => void } = $props();

	$effect(() => {
		if (chatStore.messages.length && messagesContainer) {
			setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 0);
		}
	});

	let sendDisabled = $derived(chatStore.loading || !inputText.trim());

	async function handleSend(): Promise<void> {
		const text = inputText.trim();
		if (!text || chatStore.loading) return;

		inputText = '';
		lastFromCache = false;
		chatStore.addMessage('user', text);
		chatStore.loading = true;

		try {
			const currentMessages = chatStore.messages;
			const history = currentMessages.map((msg) => ({
				role: msg.role,
				content: msg.content
			}));

			const nodeContext = selectionStore.selectedNode;
			const result = await sendMessage(text, nodeContext, history);
			if (result.ok) {
				lastFromCache = result.data.fromCache ?? false;
				chatStore.addMessage('assistant', result.data.content, result.data.relatedNodes);
			} else {
				chatStore.addMessage('assistant', `Error: ${result.error}`);
			}
		} catch (error) {
			chatStore.addMessage('assistant', `Error: ${(error as Error).message}`);
		} finally {
			chatStore.loading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}
</script>

{#if chatStore.open}
	<div class="chat-popup">
		<div class="chat-header">
			<span class="chat-header-title">{i18nStore.t('chatTitle')}</span>
			<button class="chat-close-btn" onclick={() => chatStore.toggle()}>&#10005;</button>
		</div>

		{#if !authStore.isReady}
			<div class="chat-warning">
				<span>{i18nStore.t('chat.notConnected')}</span>
				{#if onconnect}
					<button class="chat-warning-link" onclick={onconnect}>
						{i18nStore.t('chat.connect')}
					</button>
				{/if}
			</div>
		{/if}

		<div class="chat-messages" bind:this={messagesContainer}>
			{#if chatStore.messages.length === 0}
				<p class="chat-empty-state">{i18nStore.t('chatPlaceholder')}</p>
			{/if}

			{#each chatStore.messages as msg, i (msg.timestamp)}
				<ChatMessage message={msg} />
				{#if lastFromCache && i === chatStore.messages.length - 1 && msg.role === 'assistant'}
					<div class="cache-hit-badge">{i18nStore.t('chat.cached')}</div>
				{/if}
			{/each}

			{#if chatStore.loading}
				<div class="chat-loading">
					<span>{i18nStore.t('loading')}</span>
					<span class="chat-loading-dots"><span>.</span><span>.</span><span>.</span></span>
				</div>
			{/if}
		</div>

		<div class="chat-input-area">
			<textarea
				class="chat-input"
				placeholder={i18nStore.t('chatPlaceholder')}
				bind:value={inputText}
				onkeydown={handleKeydown}
				rows="1"
			></textarea>
			<button class="chat-send-btn" onclick={handleSend} disabled={sendDisabled}>
				{i18nStore.t('send')}
			</button>
		</div>
	</div>
{/if}

<button class="chat-float-btn" onclick={() => chatStore.toggle()}>
	{chatStore.open ? '✕' : '💬'}
</button>

<style>
	.chat-empty-state {
		color: var(--color-text-secondary);
		text-align: center;
		margin-top: var(--spacing-10);
		font-size: var(--font-size-base);
	}
	.chat-input {
		resize: none;
		overflow-y: auto;
		max-height: 80px;
	}
	.chat-warning {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-error-muted);
		border-bottom: 1px solid color-mix(in srgb, var(--color-border-error) 30%, transparent);
		font-size: var(--font-size-sm);
		color: var(--color-on-error-muted);
	}
	.chat-warning-link {
		background: none;
		border: none;
		color: var(--color-accent);
		cursor: pointer;
		font-size: var(--font-size-sm);
		text-decoration: underline;
		padding: 0;
	}
	.cache-hit-badge {
		display: inline-block;
		margin: 0 0 var(--spacing-2) var(--spacing-3);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-success-muted);
		color: var(--color-on-success-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
</style>
