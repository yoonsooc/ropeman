<script lang="ts">
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { analysisUiStore } from '$lib/stores/analysisUiStore.svelte';
	import { classifyAIError, getAIErrorInfo, type AIErrorInfo } from '$lib/types/ai';

	let errorDismissed = $state(false);
	let errorDismissTimer: ReturnType<typeof setTimeout> | null = null;
	let currentErrorInfo = $state<AIErrorInfo | null>(null);

	let showCancelConfirm = $state(false);
	let cancelDontAskAgain = $state(false);

	// Completion toast (success/error) — auto-dismiss after 3s
	let completionVisible = $state(false);
	let completionTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCompletionAt = $state(0);

	$effect(() => {
		const rawMsg = semanticStore.analysisError;
		if (rawMsg) {
			const errorType = classifyAIError(rawMsg);
			currentErrorInfo = getAIErrorInfo(errorType, rawMsg);
			errorDismissed = false;
			if (errorDismissTimer) clearTimeout(errorDismissTimer);
			const dismissDelay = currentErrorInfo.actions.length > 0 ? 15000 : 5000;
			errorDismissTimer = setTimeout(() => {
				errorDismissed = true;
			}, dismissDelay);
		}
		return () => {
			if (errorDismissTimer) clearTimeout(errorDismissTimer);
		};
	});

	$effect(() => {
		const c = semanticStore.lastCompletion;
		if (!c || c.at === lastCompletionAt) return;
		lastCompletionAt = c.at;
		completionVisible = true;
		if (completionTimer) clearTimeout(completionTimer);
		completionTimer = setTimeout(() => {
			completionVisible = false;
		}, 3000);

		// Browser Notification when tab is hidden
		if (
			typeof document !== 'undefined' &&
			document.hidden &&
			typeof Notification !== 'undefined' &&
			Notification.permission === 'granted'
		) {
			try {
				const suffix =
					c.type === 'success' ? i18nStore.t('analysisCompleted') : i18nStore.t('analysisFailed');
				const body = `${c.nodeLabel} — ${suffix}`;
				new Notification('Ropeman', { body, tag: 'ropeman-analysis' });
			} catch {
				// ignore notification failures
			}
		}

		return () => {
			if (completionTimer) clearTimeout(completionTimer);
		};
	});

	function dismissError() {
		errorDismissed = true;
		semanticStore.analysisError = null;
		currentErrorInfo = null;
	}

	function handleErrorAction(target: 'analyze' | 'settings') {
		dismissError();
		if (target === 'analyze') {
			analysisUiStore.openAnalyze?.();
		} else {
			analysisUiStore.openSettings?.();
		}
	}

	function cancelAllRequests() {
		for (const req of semanticStore.analysisRequests.values()) {
			semanticStore.cancelAnalysisRequest(req.nodeId);
		}
	}

	function handleCancelClick() {
		if (semanticStore.analysisRequests.size === 0) return;
		if (settingsStore.skipAnalysisCancelConfirm) {
			cancelAllRequests();
		} else {
			cancelDontAskAgain = false;
			showCancelConfirm = true;
		}
	}

	function confirmCancel() {
		if (cancelDontAskAgain) {
			settingsStore.skipAnalysisCancelConfirm = true;
		}
		showCancelConfirm = false;
		cancelAllRequests();
	}

	function closeCancelConfirm() {
		showCancelConfirm = false;
		cancelDontAskAgain = false;
	}

	function handleCancelModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeCancelConfirm();
		if (e.key === 'Enter') confirmCancel();
	}

	function handleCancelBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('cancel-confirm-backdrop')) {
			closeCancelConfirm();
		}
	}
</script>

{#if semanticStore.isAnalyzing}
	<div class="analysis-progress-pill">
		<span class="material-symbols-outlined analysis-pill-icon">auto_awesome</span>
		<div class="analysis-pill-content">
			<span class="analysis-pill-title">AI Analysis in Progress</span>
			<span class="analysis-pill-subtitle">
				{semanticStore.analysisProgress || i18nStore.t('analyzing')}
			</span>
		</div>
		<button
			class="analysis-pill-cancel"
			onclick={handleCancelClick}
			aria-label={i18nStore.t('analysisCancelConfirmTitle')}
		>
			<span class="material-symbols-outlined">stop_circle</span>
			<span class="cancel-label">{i18nStore.t('analysisCancelLabel')}</span>
		</button>
	</div>
{/if}

{#if showCancelConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop cancel-confirm-backdrop"
		onclick={handleCancelBackdropClick}
		onkeydown={handleCancelModalKeydown}
	>
		<div class="modal-card cancel-confirm-card" role="dialog" aria-modal="true">
			<div class="cancel-confirm-header">
				<span class="material-symbols-outlined cancel-confirm-icon">stop_circle</span>
				<span class="cancel-confirm-title">{i18nStore.t('analysisCancelConfirmTitle')}</span>
			</div>
			<p class="cancel-confirm-msg">{i18nStore.t('analysisCancelConfirmMessage')}</p>
			<label class="dont-ask">
				<input type="checkbox" bind:checked={cancelDontAskAgain} />
				{i18nStore.t('dontAskAgain')}
			</label>
			<div class="cancel-confirm-actions">
				<button class="btn btn-secondary cancel-confirm-btn" onclick={closeCancelConfirm}
					>{i18nStore.t('analysisCancelConfirmBack')}</button
				>
				<button class="btn btn-danger cancel-confirm-btn" onclick={confirmCancel}
					>{i18nStore.t('analysisCancelConfirmOk')}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if semanticStore.analysisError && !errorDismissed && currentErrorInfo}
	<div class="analysis-error-toast">
		<div class="analysis-error-content">
			<span class="analysis-error-text">{currentErrorInfo.message}</span>
			{#if currentErrorInfo.actions.length > 0}
				<div class="analysis-error-actions">
					{#each currentErrorInfo.actions as action}
						<button
							class="analysis-error-action-btn"
							onclick={() => handleErrorAction(action.target)}
						>
							{action.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<button class="analysis-error-dismiss" onclick={dismissError}>&#10005;</button>
	</div>
{/if}

{#if completionVisible && semanticStore.lastCompletion?.type === 'success'}
	<div class="analysis-success-toast">
		<span class="material-symbols-outlined">check_circle</span>
		<span class="analysis-success-text"
			>{semanticStore.lastCompletion.nodeLabel} — {i18nStore.t('analysisCompleted')}</span
		>
	</div>
{/if}

<style>
	.analysis-progress-pill {
		position: fixed;
		bottom: 80px;
		right: 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: rgba(21, 26, 33, 0.9);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(172, 138, 255, 0.3);
		border-radius: 9999px;
		z-index: 50;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.3),
			0 4px 6px -4px rgba(0, 0, 0, 0.2);
		animation: pillFadeIn 0.2s ease;
	}

	@keyframes pillFadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.analysis-pill-icon {
		font-size: 18px;
		color: var(--accent-tertiary, #ac8aff);
		animation: spin-slow 2s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.analysis-pill-content {
		display: flex;
		flex-direction: column;
	}

	.analysis-pill-title {
		font-family: var(--font-display);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.analysis-pill-subtitle {
		font-family: var(--font-code);
		font-size: 9px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.analysis-pill-cancel {
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.4);
		padding: 3px 10px 3px 6px;
		margin-left: 4px;
		cursor: pointer;
		color: #ff8585;
		flex-shrink: 0;
		border-radius: 9999px;
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-display);
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.analysis-pill-cancel:hover {
		background: rgba(239, 68, 68, 0.9);
		color: #fff;
		border-color: rgba(239, 68, 68, 1);
	}
	.analysis-pill-cancel :global(.material-symbols-outlined) {
		font-size: 14px;
	}
	.cancel-label {
		letter-spacing: 0.03em;
	}

	/* Cancel confirm modal */
	.cancel-confirm-backdrop {
		z-index: 1100;
	}
	.cancel-confirm-card {
		padding: 20px;
		width: 340px;
		border-radius: 8px;
	}
	.cancel-confirm-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.cancel-confirm-icon {
		font-size: 20px;
		color: #ef4444;
	}
	.cancel-confirm-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
	}
	.cancel-confirm-msg {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0 0 16px;
		line-height: 1.6;
	}
	.dont-ask {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 10px;
		color: var(--text-muted);
		cursor: pointer;
		margin-bottom: 16px;
	}
	.dont-ask input {
		width: 12px;
		height: 12px;
		accent-color: var(--accent);
		border-radius: 4px;
	}
	.cancel-confirm-actions {
		display: flex;
		gap: 8px;
	}
	.cancel-confirm-btn {
		padding: 7px 0;
		flex: 1;
		font-size: 11px;
		font-weight: 700;
		border-radius: 4px;
	}
	:global(.cancel-confirm-card .btn-danger) {
		background: #ef4444;
		color: #fff;
		border: 1px solid #ef4444;
	}
	:global(.cancel-confirm-card .btn-danger:hover) {
		background: #dc2626;
		border-color: #dc2626;
	}

	.analysis-error-toast {
		position: fixed;
		bottom: 80px;
		right: 24px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(239, 68, 68, 0.9);
		border: 1px solid rgba(239, 68, 68, 1);
		border-radius: 8px;
		z-index: 51;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		animation: pillFadeIn 0.2s ease;
		max-width: 360px;
	}

	.analysis-error-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.analysis-error-text {
		font-size: 12px;
		color: #fff;
		font-weight: 500;
		word-break: break-word;
	}

	.analysis-error-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.analysis-error-action-btn {
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.4);
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s ease;
	}

	.analysis-error-action-btn:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	.analysis-error-dismiss {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		font-size: 14px;
		padding: 0 2px;
		flex-shrink: 0;
		line-height: 1;
	}

	.analysis-error-dismiss:hover {
		color: #fff;
	}

	.analysis-success-toast {
		position: fixed;
		bottom: 132px;
		right: 24px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: rgba(34, 197, 94, 0.92);
		border: 1px solid rgba(34, 197, 94, 1);
		border-radius: 9999px;
		z-index: 52;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		animation: pillFadeIn 0.2s ease;
	}
	.analysis-success-toast :global(.material-symbols-outlined) {
		font-size: 16px;
		color: #fff;
	}
	.analysis-success-text {
		font-size: 12px;
		color: #fff;
		font-weight: 600;
	}
</style>
