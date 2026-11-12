<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { SHARE_URL } from '$lib/config';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	type Phase = 'confirm' | 'loading' | 'success' | 'error';
	let phase = $state<Phase>('confirm');
	let shareUrl = $state('');
	let copied = $state(false);
	let errorMessage = $state('');

	$effect(() => {
		if (open) {
			phase = 'confirm';
			shareUrl = '';
			copied = false;
			errorMessage = '';
		}
	});

	function buildSnapshot() {
		const cache = semanticStore.cache;
		const semanticLevels: Record<
			string,
			{ parentId: string | null; nodes: any[]; edges: any[]; breadcrumbLabel: string }
		> = {};
		for (const [key, level] of cache) {
			semanticLevels[key] = {
				parentId: level.parentId,
				nodes: level.nodes,
				edges: level.edges,
				breadcrumbLabel: level.breadcrumbLabel
			};
		}

		const filePaths = [...projectStore.astMap.keys()];
		const languageBreakdown: Record<string, number> = {};
		for (const fp of filePaths) {
			const ext = fp.split('.').pop()?.toLowerCase() ?? 'unknown';
			languageBreakdown[ext] = (languageBreakdown[ext] ?? 0) + 1;
		}

		return {
			projectName: projectStore.projectName,
			semanticLevels,
			filePaths,
			metadata: {
				fileCount: filePaths.length,
				languageBreakdown
			},
			createdAt: new Date().toISOString()
		};
	}

	async function handleConfirm() {
		phase = 'loading';
		try {
			const snapshot = buildSnapshot();
			const body = JSON.stringify(snapshot);
			if (body.length > 1_048_576) {
				throw new Error(i18nStore.t('share.tooLarge'));
			}
			const res = await fetch(`${SHARE_URL}/share`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const data = await res.json();
			// Prefer url from server response (contains canonical share domain).
			// Fall back to constructing from slug + current origin for dev.
			if (typeof data.url === 'string') {
				shareUrl = data.url;
			} else {
				const slug = data.slug ?? data.id;
				shareUrl = `${window.location.origin}/share/${slug}`;
			}
			phase = 'success';
		} catch (err) {
			console.error('Share failed:', err);
			errorMessage = err instanceof Error ? err.message : String(err);
			phase = 'error';
		}
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// fallback: select text
		}
	}

	function handleOpenNewTab() {
		window.open(shareUrl, '_blank');
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('share-backdrop')) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop share-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card share-card" role="dialog" aria-modal="true">
			<div class="modal-header">
				<h2>
					<span class="material-symbols-outlined" style="font-size:18px;">share</span>
					{i18nStore.t('share.confirmTitle')}
				</h2>
				<button class="modal-close" onclick={onclose}>&#10005;</button>
			</div>

			<div class="modal-body share-body">
				{#if phase === 'confirm'}
					<p class="share-message">{i18nStore.t('share.confirmMessage')}</p>
					<div class="share-actions">
						<button class="share-btn share-btn-cancel" onclick={onclose}>
							{i18nStore.t('share.confirmCancel')}
						</button>
						<button class="share-btn share-btn-confirm" onclick={handleConfirm}>
							{i18nStore.t('share.confirmOk')}
						</button>
					</div>
				{:else if phase === 'loading'}
					<div class="share-loading">
						<span class="material-symbols-outlined share-spinner">progress_activity</span>
						<p>{i18nStore.t('share.generating')}</p>
					</div>
				{:else if phase === 'success'}
					<p class="share-success-title">{i18nStore.t('share.successTitle')}</p>
					<div class="share-url-box">
						<input class="share-url-input" type="text" readonly value={shareUrl} />
					</div>
					<div class="share-actions">
						<button class="share-btn share-btn-copy" onclick={handleCopy}>
							<span class="material-symbols-outlined" style="font-size:14px;">
								{copied ? 'check' : 'content_copy'}
							</span>
							{copied ? i18nStore.t('share.copied') : i18nStore.t('share.copyLink')}
						</button>
						<button class="share-btn share-btn-open" onclick={handleOpenNewTab}>
							<span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span>
							{i18nStore.t('share.openNewTab')}
						</button>
					</div>
				{:else if phase === 'error'}
					<div class="share-error">
						<span class="material-symbols-outlined share-error-icon">error</span>
						<p class="share-error-title">{i18nStore.t('share.errorTitle')}</p>
						<p class="share-error-message">{i18nStore.t('share.errorMessage')}</p>
						{#if errorMessage}
							<p class="share-error-detail">{errorMessage}</p>
						{/if}
					</div>
					<div class="share-actions">
						<button class="share-btn share-btn-cancel" onclick={onclose}>
							{i18nStore.t('share.close')}
						</button>
						<button class="share-btn share-btn-confirm" onclick={handleConfirm}>
							{i18nStore.t('share.confirmOk')}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.share-card {
		width: 400px;
	}

	.share-card :global(.modal-header h2) {
		font-size: var(--font-size-base);
		letter-spacing: 0.025em;
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.share-body {
		padding: var(--spacing-5);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.share-message {
		font-size: var(--font-size-base);
		color: var(--color-text-primary);
		line-height: 1.6;
		margin: 0;
	}

	.share-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
	}

	.share-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1-5) var(--spacing-3);
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			opacity var(--duration-fast) var(--ease-standard);
		border: none;
	}

	.share-btn-cancel {
		background: var(--color-background-muted);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.share-btn-cancel:hover {
		background: var(--color-background-surface);
	}

	.share-btn-confirm {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.share-btn-confirm:hover {
		opacity: 0.85;
	}

	.share-btn-copy {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.share-btn-copy:hover {
		opacity: 0.85;
	}

	.share-btn-open {
		background: var(--color-background-muted);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.share-btn-open:hover {
		background: var(--color-background-surface);
	}

	.share-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-3);
		padding: var(--spacing-5) 0;
	}

	.share-loading p {
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.share-spinner {
		font-size: 24px;
		color: var(--color-accent);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.share-success-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-success);
		margin: 0;
	}

	.share-url-box {
		display: flex;
		gap: var(--spacing-2);
	}

	.share-url-input {
		flex: 1;
		padding: var(--spacing-2) var(--spacing-2);
		border-radius: var(--radius-element);
		border: 1px solid var(--color-border);
		background: var(--color-background-muted);
		color: var(--color-text-primary);
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
	}

	.share-url-input:focus {
		border-color: var(--color-accent);
	}

	.share-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-3) 0;
	}

	.share-error-icon {
		font-size: 28px;
		color: var(--color-text-error);
	}

	.share-error-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-error);
		margin: 0;
	}

	.share-error-message {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0;
		text-align: center;
	}

	.share-error-detail {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		font-family: var(--font-code);
		margin: 0;
	}

	@media (max-width: 480px) {
		.share-card {
			width: 95vw;
		}
	}
</style>
