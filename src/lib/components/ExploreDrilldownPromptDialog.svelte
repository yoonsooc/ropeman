<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';

	let {
		open,
		nodeLabel,
		onclose
	}: {
		open: boolean;
		nodeLabel: string;
		onclose: () => void;
	} = $props();

	const meta = $derived(semanticStore.snapshotMeta);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="prompt-backdrop" onclick={handleBackdropClick}>
		<div class="prompt-dialog" role="dialog" aria-modal="true">
			<button class="prompt-close" onclick={onclose} aria-label={i18nStore.t('common.close')}>
				<span class="material-symbols-outlined">close</span>
			</button>

			<div class="prompt-icon">
				<span class="material-symbols-outlined">explore_off</span>
			</div>

			<h2 class="prompt-title">
				{nodeLabel} — {i18nStore.t('landing.explorePromptTitle')}
			</h2>

			<p class="prompt-body">
				{i18nStore.t('landing.explorePromptMessage')}
			</p>

			<div class="prompt-actions">
				<a href={resolve('/')} class="btn btn-primary">
					<span class="material-symbols-outlined">folder_open</span>
					{i18nStore.t('landing.explorePromptAnalyze')}
				</a>
				{#if meta?.owner && meta?.repo}
					<a
						href={`https://github.com/${meta.owner}/${meta.repo}`}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-secondary"
					>
						{i18nStore.t('landing.explorePromptGithub')}
						<span class="material-symbols-outlined btn-icon-small">open_in_new</span>
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.prompt-backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: var(--spacing-6);
	}

	.prompt-dialog {
		position: relative;
		max-width: 480px;
		width: 100%;
		padding: var(--spacing-8) var(--spacing-7) var(--spacing-6);
		background: var(--color-background-muted);
		border-radius: var(--radius-container);
		box-shadow: var(--shadow-high);
		color: var(--color-text-primary);
		text-align: center;
	}

	.prompt-close {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--color-text-tertiary);
		border: none;
		border-radius: var(--radius-element);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}
	.prompt-close:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}
	.prompt-close .material-symbols-outlined {
		font-size: 18px;
	}

	@media (max-width: 768px) {
		.prompt-backdrop {
			padding: 0;
		}
		.prompt-dialog {
			max-width: none;
			width: 100vw;
			height: 100dvh;
			border-radius: 0;
			padding-top: max(var(--spacing-12), env(safe-area-inset-top));
			padding-bottom: max(var(--spacing-6), env(safe-area-inset-bottom));
			padding-left: max(var(--spacing-5), env(safe-area-inset-left));
			padding-right: max(var(--spacing-5), env(safe-area-inset-right));
			overflow-y: auto;
		}
		.prompt-close {
			width: 44px;
			height: 44px;
			top: max(12px, env(safe-area-inset-top));
			right: max(12px, env(safe-area-inset-right));
		}
	}

	.prompt-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-container);
		background: var(--color-accent-muted);
		color: var(--color-accent);
		margin: 0 auto var(--spacing-4);
	}
	.prompt-icon .material-symbols-outlined {
		font-size: 28px;
	}

	.prompt-title {
		margin: 0 0 var(--spacing-2);
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		line-height: 1.3;
	}

	.prompt-body {
		margin: 0 0 var(--spacing-6);
		font-family: var(--font-body);
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-tertiary);
	}

	.prompt-actions {
		display: flex;
		gap: var(--spacing-2);
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-2) var(--spacing-4);
		border-radius: var(--radius-element);
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			transform var(--duration-fast) var(--ease-standard);
	}

	.btn .material-symbols-outlined {
		font-size: 16px;
	}

	.btn-icon-small {
		font-size: 14px !important;
	}

	.btn-primary {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}
	.btn-primary:hover {
		opacity: 0.85;
		transform: translateY(-1px);
	}

	.btn-secondary {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}
	.btn-secondary:hover {
		background: var(--color-background-muted);
	}
</style>
