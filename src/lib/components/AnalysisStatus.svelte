<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { analysisUiStore } from '$lib/stores/analysisUiStore.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		classifyAIError,
		getAIErrorInfo,
		type AIErrorAction,
		type AIErrorInfo
	} from '$lib/types/ai';

	const MAX_VISIBLE_PILLS = 3;
	const PILL_BOTTOM_BASE = 80;
	const PILL_SPACING = 56;

	let errorDismissed = $state(false);
	let errorDismissTimer: ReturnType<typeof setTimeout> | null = null;
	let currentErrorInfo = $state<AIErrorInfo | null>(null);
	// Non-reactive: used inside $effect to dedupe on analysisError change without self-triggering
	let lastErrorMsg: string | null = null;

	// Cancel confirm modal state
	type CancelTarget = { mode: 'single'; nodeId: string; nodeLabel: string } | { mode: 'all' };
	let showCancelConfirm = $state(false);
	let cancelTarget = $state<CancelTarget | null>(null);
	let cancelDontAskAgain = $state(false);

	// Group pill is "sticky": once activated (size > MAX), remains until size === 0
	let groupActive = $state(false);
	let groupExpanded = $state(false);

	$effect(() => {
		const size = semanticStore.analysisRequests.size;
		if (size > MAX_VISIBLE_PILLS && !groupActive) {
			groupActive = true;
		}
		if (size === 0) {
			groupActive = false;
			groupExpanded = false;
		}
	});

	// Completion toast (success/error) — auto-dismiss after 3s
	let completionVisible = $state(false);
	let completionTimer: ReturnType<typeof setTimeout> | null = null;
	// Non-reactive: tracking last seen completion.at without being an effect dep
	let lastCompletionAt = 0;

	$effect(() => {
		const rawMsg = semanticStore.analysisError;
		if (!rawMsg || rawMsg === lastErrorMsg) return;
		lastErrorMsg = rawMsg;
		const errorType = classifyAIError(rawMsg);
		const info = getAIErrorInfo(errorType, rawMsg, (key) => i18nStore.t(key));
		currentErrorInfo = info;
		errorDismissed = false;
		if (errorDismissTimer) clearTimeout(errorDismissTimer);
		const dismissDelay = info.actions.length > 0 ? 15000 : 5000;
		errorDismissTimer = setTimeout(() => {
			errorDismissed = true;
		}, dismissDelay);
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
	});

	function dismissError() {
		errorDismissed = true;
		semanticStore.analysisError = null;
		currentErrorInfo = null;
		lastErrorMsg = null;
	}

	function handleErrorAction(target: AIErrorAction['target']) {
		dismissError();
		if (target === 'explore') {
			goto(resolve('/explore'));
		} else if (target === 'analyze') {
			analysisUiStore.openAnalyze?.();
		} else {
			analysisUiStore.openSettings?.();
		}
	}

	function cancelSingle(nodeId: string) {
		semanticStore.cancelAnalysisRequest(nodeId);
	}

	function cancelAll() {
		for (const req of semanticStore.analysisRequests.values()) {
			semanticStore.cancelAnalysisRequest(req.nodeId);
		}
	}

	function performCancel(target: CancelTarget) {
		if (target.mode === 'single') cancelSingle(target.nodeId);
		else cancelAll();
	}

	function openCancelConfirm(target: CancelTarget) {
		if (settingsStore.skipAnalysisCancelConfirm) {
			performCancel(target);
			return;
		}
		cancelTarget = target;
		cancelDontAskAgain = false;
		showCancelConfirm = true;
	}

	function confirmCancel() {
		if (cancelDontAskAgain) {
			settingsStore.skipAnalysisCancelConfirm = true;
		}
		const t = cancelTarget;
		showCancelConfirm = false;
		cancelTarget = null;
		if (t) performCancel(t);
	}

	function closeCancelConfirm() {
		showCancelConfirm = false;
		cancelTarget = null;
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

	function toggleGroup() {
		groupExpanded = !groupExpanded;
	}

	// Derived: ordered list of requests
	const requests = $derived([...semanticStore.analysisRequests.values()]);
	const showIndividualPills = $derived(requests.length > 0 && (!groupActive || groupExpanded));
	const showGroupPill = $derived(groupActive);

	const cancelConfirmMessage = $derived.by(() => {
		if (!cancelTarget) return '';
		if (cancelTarget.mode === 'single') {
			return i18nStore.t('analysisCancelConfirmMessageSingle', { label: cancelTarget.nodeLabel });
		}
		return i18nStore.t('analysisCancelConfirmMessageAll', { count: requests.length });
	});
</script>

{#if showIndividualPills}
	{#each requests as req, i (req.nodeId)}
		<div
			class="analysis-progress-pill"
			style:--pill-base="{PILL_BOTTOM_BASE + (groupActive ? PILL_SPACING : 0) + i * PILL_SPACING}px"
		>
			<span class="material-symbols-outlined analysis-pill-icon">auto_awesome</span>
			<div class="analysis-pill-content">
				<span class="analysis-pill-title">{i18nStore.t('analysisInProgress')}</span>
				<span class="analysis-pill-subtitle">
					{req.progress ? `[${req.nodeLabel}] ${req.progress}` : req.nodeLabel}
				</span>
			</div>
			<button
				class="analysis-pill-cancel"
				onclick={() =>
					openCancelConfirm({ mode: 'single', nodeId: req.nodeId, nodeLabel: req.nodeLabel })}
				aria-label={i18nStore.t('analysisCancelConfirmTitle')}
			>
				<span class="material-symbols-outlined">stop_circle</span>
				<span class="cancel-label">{i18nStore.t('analysisCancelLabel')}</span>
			</button>
		</div>
	{/each}
{/if}

{#if showGroupPill}
	<div class="analysis-progress-pill group-pill" style:--pill-base="{PILL_BOTTOM_BASE}px">
		<span class="material-symbols-outlined analysis-pill-icon">auto_awesome</span>
		<div class="analysis-pill-content">
			<span class="analysis-pill-title"
				>{i18nStore.t('analysisGroupRunning', { count: requests.length })}</span
			>
			{#if !groupExpanded && requests.length > 0}
				<span class="analysis-pill-subtitle">
					{semanticStore.analysisProgress || i18nStore.t('analyzing')}
				</span>
			{/if}
		</div>
		<button
			class="group-toggle-btn"
			onclick={toggleGroup}
			aria-label={groupExpanded
				? i18nStore.t('analysisGroupCollapse')
				: i18nStore.t('analysisGroupExpand')}
		>
			<span class="material-symbols-outlined"
				>{groupExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}</span
			>
		</button>
		<button
			class="analysis-pill-cancel"
			onclick={() => openCancelConfirm({ mode: 'all' })}
			aria-label={i18nStore.t('analysisCancelAll')}
		>
			<span class="material-symbols-outlined">stop_circle</span>
			<span class="cancel-label">{i18nStore.t('analysisCancelAll')}</span>
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
		<div
			class="modal-card cancel-confirm-card"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			use:focusTrap
		>
			<div class="cancel-confirm-header">
				<span class="material-symbols-outlined cancel-confirm-icon">stop_circle</span>
				<span class="cancel-confirm-title">{i18nStore.t('analysisCancelConfirmTitle')}</span>
			</div>
			<p class="cancel-confirm-msg">{cancelConfirmMessage}</p>
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
		right: max(24px, env(safe-area-inset-right));
		bottom: calc(var(--pill-base, 80px) + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		padding: var(--spacing-2) var(--spacing-4);
		background: var(--color-background-surface);
		border: 1px solid var(--color-accent-muted);
		border-radius: var(--radius-full);
		z-index: 50;
		box-shadow: var(--shadow-med);
		animation: pillFadeIn var(--duration-fast) var(--ease-standard);
		transition: bottom var(--duration-fast) var(--ease-standard);
	}

	.group-pill {
		border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
		z-index: 51;
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
		color: var(--color-accent);
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
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		white-space: nowrap;
	}

	.analysis-pill-subtitle {
		font-family: var(--font-code);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.analysis-pill-cancel {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		background: var(--color-error-muted);
		border: 1px solid color-mix(in srgb, var(--color-border-error) 40%, transparent);
		padding: var(--spacing-0-5) var(--spacing-2) var(--spacing-0-5) var(--spacing-1-5);
		margin-left: var(--spacing-1);
		cursor: pointer;
		color: var(--color-on-error-muted);
		flex-shrink: 0;
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		font-family: var(--font-display);
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}
	.analysis-pill-cancel:hover {
		background: var(--color-error);
		color: var(--color-on-error);
		border-color: var(--color-border-error);
	}
	.analysis-pill-cancel :global(.material-symbols-outlined) {
		font-size: 14px;
	}
	.cancel-label {
		letter-spacing: 0.03em;
	}

	.group-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		padding: var(--spacing-0-5);
		cursor: pointer;
		color: var(--color-text-secondary);
		border-radius: var(--radius-inner);
		flex-shrink: 0;
	}
	.group-toggle-btn:hover {
		color: var(--color-text-primary);
		background: var(--color-background-muted);
	}
	.group-toggle-btn :global(.material-symbols-outlined) {
		font-size: 16px;
	}

	/* Cancel confirm modal */
	.cancel-confirm-backdrop {
		z-index: 1100;
	}
	.cancel-confirm-card {
		padding: var(--spacing-5);
		width: 340px;
		border-radius: var(--radius-element);
	}
	.cancel-confirm-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		margin-bottom: var(--spacing-3);
	}
	.cancel-confirm-icon {
		font-size: 20px;
		color: var(--color-icon-error);
	}
	.cancel-confirm-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		font-family: var(--font-display);
	}
	.cancel-confirm-msg {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-4);
		line-height: 1.6;
	}
	.dont-ask {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		cursor: pointer;
		margin-bottom: var(--spacing-4);
	}
	.dont-ask input {
		width: 12px;
		height: 12px;
		accent-color: var(--color-accent);
		border-radius: var(--radius-inner);
	}
	.cancel-confirm-actions {
		display: flex;
		gap: var(--spacing-2);
	}
	.cancel-confirm-btn {
		padding: var(--spacing-1-5) 0;
		flex: 1;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-inner);
	}

	.analysis-error-toast {
		position: fixed;
		bottom: calc(80px + env(safe-area-inset-bottom));
		right: max(24px, env(safe-area-inset-right));
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-error);
		border: 1px solid var(--color-border-error);
		border-radius: var(--radius-element);
		z-index: 53;
		box-shadow: var(--shadow-med);
		animation: pillFadeIn var(--duration-fast) var(--ease-standard);
		max-width: 360px;
	}

	.analysis-error-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
		min-width: 0;
	}

	.analysis-error-text {
		font-size: var(--font-size-sm);
		color: var(--color-on-error);
		font-weight: var(--font-weight-medium);
		word-break: break-word;
	}

	.analysis-error-actions {
		display: flex;
		gap: var(--spacing-1-5);
		flex-wrap: wrap;
	}

	.analysis-error-action-btn {
		background: color-mix(in srgb, var(--color-on-error) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-on-error) 40%, transparent);
		color: var(--color-on-error);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-inner);
		cursor: pointer;
		white-space: nowrap;
		transition: background var(--duration-fast) var(--ease-standard);
	}

	.analysis-error-action-btn:hover {
		background: color-mix(in srgb, var(--color-on-error) 35%, transparent);
	}

	.analysis-error-dismiss {
		background: none;
		border: none;
		color: color-mix(in srgb, var(--color-on-error) 80%, transparent);
		cursor: pointer;
		font-size: var(--font-size-base);
		padding: 0 var(--spacing-0-5);
		flex-shrink: 0;
		line-height: 1;
	}

	.analysis-error-dismiss:hover {
		color: var(--color-on-error);
	}

	.analysis-success-toast {
		position: fixed;
		bottom: calc(132px + env(safe-area-inset-bottom));
		right: max(24px, env(safe-area-inset-right));
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-success);
		border: 1px solid var(--color-border-success);
		border-radius: var(--radius-full);
		z-index: 54;
		box-shadow: var(--shadow-med);
		animation: pillFadeIn var(--duration-fast) var(--ease-standard);
	}
	.analysis-success-toast :global(.material-symbols-outlined) {
		font-size: 16px;
		color: var(--color-on-success);
	}
	.analysis-success-text {
		font-size: var(--font-size-sm);
		color: var(--color-on-success);
		font-weight: var(--font-weight-semibold);
	}
</style>
