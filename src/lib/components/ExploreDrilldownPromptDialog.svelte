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
			<button class="prompt-close" onclick={onclose} aria-label="Close">
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
		background: rgba(10, 14, 20, 0.6);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 24px;
	}

	.prompt-dialog {
		position: relative;
		max-width: 480px;
		width: 100%;
		padding: 32px 28px 24px;
		background: var(--bg-tertiary, #1b2028);
		border-radius: 12px;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
		color: var(--text-primary);
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
		color: var(--text-muted);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.prompt-close:hover {
		background: var(--bg-highest, #20262f);
		color: var(--text-primary);
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
			padding-top: max(48px, env(safe-area-inset-top));
			padding-bottom: max(24px, env(safe-area-inset-bottom));
			padding-left: max(20px, env(safe-area-inset-left));
			padding-right: max(20px, env(safe-area-inset-right));
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
		border-radius: 12px;
		background: rgba(83, 221, 252, 0.1);
		color: var(--accent-secondary, #53ddfc);
		margin: 0 auto 16px;
	}
	.prompt-icon .material-symbols-outlined {
		font-size: 28px;
	}

	.prompt-title {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.3;
	}

	.prompt-body {
		margin: 0 0 24px;
		font-family: var(--font-body, 'Inter', sans-serif);
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.prompt-actions {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border-radius: 8px;
		font-family: var(--font-display);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition:
			background 0.15s,
			transform 0.15s;
	}

	.btn .material-symbols-outlined {
		font-size: 16px;
	}

	.btn-icon-small {
		font-size: 14px !important;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--sidebar-icon-bg, #0f141a);
	}
	.btn-primary:hover {
		opacity: 0.85;
		transform: translateY(-1px);
	}

	.btn-secondary {
		background: transparent;
		color: var(--text-primary);
		border: 1px solid var(--ghost-border, rgba(148, 163, 184, 0.2));
	}
	.btn-secondary:hover {
		background: var(--bg-highest, #20262f);
	}
</style>
