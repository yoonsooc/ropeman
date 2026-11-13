<script lang="ts">
	import { onboardingStore } from '$lib/stores/onboardingStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';

	// Phase 2 auto-trigger: watch for analysis completion
	let phase2Triggered = $state(false);

	// Reset the trigger flag when tour is reset (phase2Completed goes back to false)
	$effect(() => {
		if (!onboardingStore.phase2Completed) {
			phase2Triggered = false;
		}
	});

	$effect(() => {
		const hasSemanticData = semanticStore.cache.size > 0;
		if (hasSemanticData && onboardingStore.canStartPhase2 && !phase2Triggered) {
			phase2Triggered = true;
			// Small delay so the UI has time to render the semantic elements
			setTimeout(() => {
				onboardingStore.startPhase2();
			}, 800);
		}
	});

	// Tooltip positioning
	let tooltipStyle = $state('');
	let cutoutStyle = $state('');
	let arrowClass = $state('arrow-bottom');

	$effect(() => {
		if (!onboardingStore.isActive) return;
		const step = onboardingStore.currentStep;
		// Use requestAnimationFrame to wait for DOM update
		requestAnimationFrame(() => {
			positionTooltip(step);
		});
	});

	/** Prepare sidebar for the given step. Returns true if a switch was triggered (needs DOM wait). */
	function prepareStep(step: number): boolean {
		// Step 7: switch sidebar to file explorer so the element is visible
		if (step === 7) {
			const filesBtn = document.querySelector(
				'.sidebar-icons .icon-btn:first-child'
			) as HTMLElement;
			if (filesBtn && !filesBtn.classList.contains('active')) {
				filesBtn.click();
				return true;
			}
		}
		// Step 4: switch sidebar to semantic tree
		if (step === 4) {
			const semanticBtn = document.querySelector(
				'.sidebar-icons .icon-btn:nth-child(2)'
			) as HTMLElement;
			if (
				semanticBtn &&
				!semanticBtn.classList.contains('active') &&
				!semanticBtn.classList.contains('disabled')
			) {
				semanticBtn.click();
				return true;
			}
		}
		return false;
	}

	function positionTooltip(step: number) {
		const needsPrep = prepareStep(step);
		if (needsPrep) {
			// Wait for Svelte to re-render after sidebar switch
			setTimeout(() => {
				positionTooltipInner(step);
			}, 150);
			return;
		}
		positionTooltipInner(step);
	}

	function positionTooltipInner(step: number) {
		const el = document.querySelector(`[data-tour-step="${step}"]`);
		if (!el) {
			// Element not found — skip this step
			onboardingStore.next();
			return;
		}

		const rect = el.getBoundingClientRect();
		const padding = 8;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// Cutout position (highlight area)
		cutoutStyle = `top:${rect.top - padding}px;left:${rect.left - padding}px;width:${rect.width + padding * 2}px;height:${rect.height + padding * 2}px;`;

		const tooltipWidth = 320;
		const tooltipHeight = 180;
		const gap = 16;

		let top: number;
		let left: number;
		let arrow: string;

		// Large element detection: if element covers most of the viewport,
		// place tooltip centered over the element instead of outside it
		const isLargeElement = rect.width > vw * 0.6 && rect.height > vh * 0.6;

		if (isLargeElement) {
			// Center the tooltip within the element
			top = rect.top + rect.height / 2 - tooltipHeight / 2;
			left = rect.left + rect.width / 2 - tooltipWidth / 2;
			// Clamp to viewport
			top = Math.max(16, Math.min(top, vh - tooltipHeight - 16));
			left = Math.max(16, Math.min(left, vw - tooltipWidth - 16));
			arrow = '';
			cutoutStyle = ''; // No cutout for large elements — overlay only
		}
		// Prefer below
		else if (rect.bottom + gap + tooltipHeight < vh) {
			top = rect.bottom + gap;
			left = Math.max(
				16,
				Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, vw - tooltipWidth - 16)
			);
			arrow = 'arrow-top';
		}
		// Try above
		else if (rect.top - gap - tooltipHeight > 0) {
			top = rect.top - gap - tooltipHeight;
			left = Math.max(
				16,
				Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, vw - tooltipWidth - 16)
			);
			arrow = 'arrow-bottom';
		}
		// Fallback: right side (clamped to viewport)
		else {
			top = Math.max(
				16,
				Math.min(rect.top + rect.height / 2 - tooltipHeight / 2, vh - tooltipHeight - 16)
			);
			left = Math.min(rect.right + gap, vw - tooltipWidth - 16);
			arrow = 'arrow-left';
		}

		tooltipStyle = `top:${top}px;left:${left}px;width:${tooltipWidth}px;`;
		arrowClass = arrow;
	}

	// Recalculate on window resize
	function handleResize() {
		if (onboardingStore.isActive) {
			positionTooltip(onboardingStore.currentStep);
		}
	}

	// Step info
	const stepInfo = $derived.by(() => {
		const step = onboardingStore.currentStep;
		const phase = onboardingStore.phase;
		const totalSteps = phase === 'phase1' ? 3 : phase === 'phase2' ? 5 : 0;
		const stepInPhase = phase === 'phase1' ? step : step - 3;
		const isLast = (phase === 'phase1' && step === 3) || (phase === 'phase2' && step === 8);
		const isFirst = (phase === 'phase1' && step === 1) || (phase === 'phase2' && step === 4);
		return { step, totalSteps, stepInPhase, isLast, isFirst };
	});

	function getStepTitle(step: number): string {
		return i18nStore.t(`onboarding.step${step}.title`);
	}

	function getStepDesc(step: number): string {
		return i18nStore.t(`onboarding.step${step}.desc`);
	}

	function handlePrev() {
		onboardingStore.prev();
	}

	function handleNext() {
		onboardingStore.next();
	}

	let showSkipConfirm = $state(false);

	function handleSkipRequest() {
		showSkipConfirm = true;
	}

	function handleSkipConfirm() {
		showSkipConfirm = false;
		onboardingStore.skip();
	}

	function handleSkipCancel() {
		showSkipConfirm = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!onboardingStore.isActive) return;
		if (showSkipConfirm) {
			if (e.key === 'Escape') handleSkipCancel();
			else if (e.key === 'Enter') handleSkipConfirm();
			return;
		}
		if (e.key === 'Escape') {
			handleSkipRequest();
		} else if (e.key === 'ArrowLeft') {
			handlePrev();
		} else if (e.key === 'ArrowRight' || e.key === 'Enter') {
			handleNext();
		}
	}
</script>

<svelte:window onresize={handleResize} onkeydown={handleKeydown} />

{#if onboardingStore.isActive}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="tour-overlay" class:no-cutout={!cutoutStyle} onclick={handleSkipRequest}>
		<!-- Cutout highlight -->
		{#if cutoutStyle}
			<div class="tour-cutout" style={cutoutStyle}></div>
		{/if}

		{#if showSkipConfirm}
			<!-- Skip confirmation dialog -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="tour-confirm" onclick={(e) => e.stopPropagation()}>
				<p class="tour-confirm-text">{i18nStore.t('onboarding.skipConfirmText')}</p>
				<div class="tour-confirm-actions">
					<button class="tour-btn-skip" onclick={handleSkipCancel}>
						{i18nStore.t('onboarding.skipConfirmCancel')}
					</button>
					<button class="tour-btn-next" onclick={handleSkipConfirm}>
						{i18nStore.t('onboarding.skipConfirmOk')}
					</button>
				</div>
			</div>
		{:else}
			<!-- Tooltip -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="tour-tooltip {arrowClass}"
				style={tooltipStyle}
				onclick={(e) => e.stopPropagation()}
			>
				<div class="tour-tooltip-header">
					<span class="tour-step-badge">
						{stepInfo.stepInPhase}/{stepInfo.totalSteps}
					</span>
					<h3 class="tour-tooltip-title">{getStepTitle(stepInfo.step)}</h3>
				</div>
				<p class="tour-tooltip-desc">{getStepDesc(stepInfo.step)}</p>
				<div class="tour-tooltip-actions">
					<button class="tour-btn-skip" onclick={handleSkipRequest}>
						{i18nStore.t('onboarding.skip')}
					</button>
					<div class="tour-tooltip-nav">
						{#if !stepInfo.isFirst}
							<button class="tour-btn-prev" onclick={handlePrev}>
								{i18nStore.t('onboarding.prev')}
							</button>
						{/if}
						<button class="tour-btn-next" onclick={handleNext}>
							{#if stepInfo.isLast}
								{i18nStore.t('onboarding.done')}
							{:else}
								{i18nStore.t('onboarding.next')}
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.tour-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: transparent;
		transition: background var(--duration-medium) var(--ease-standard);
	}

	/* When no cutout (large elements), overlay itself provides the dim */
	.tour-overlay.no-cutout {
		background: var(--color-overlay);
	}

	.tour-cutout {
		position: fixed;
		border-radius: var(--radius-element);
		background: transparent;
		box-shadow: 0 0 0 9999px var(--color-overlay);
		z-index: 10000;
		pointer-events: none;
		transition:
			top var(--duration-medium) var(--ease-standard),
			left var(--duration-medium) var(--ease-standard),
			width var(--duration-medium) var(--ease-standard),
			height var(--duration-medium) var(--ease-standard);
	}

	.tour-tooltip {
		position: fixed;
		z-index: 10001;
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-container);
		padding: var(--spacing-5);
		box-shadow: var(--shadow-med);
		transition:
			top var(--duration-medium) var(--ease-standard),
			left var(--duration-medium) var(--ease-standard);
	}

	/* Arrow indicators */
	.tour-tooltip.arrow-top::before {
		content: '';
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: 8px solid var(--color-border);
	}
	.tour-tooltip.arrow-top::after {
		content: '';
		position: absolute;
		top: -7px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 7px solid transparent;
		border-right: 7px solid transparent;
		border-bottom: 7px solid var(--color-background-surface);
	}

	.tour-tooltip.arrow-bottom::before {
		content: '';
		position: absolute;
		bottom: -8px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-top: 8px solid var(--color-border);
	}
	.tour-tooltip.arrow-bottom::after {
		content: '';
		position: absolute;
		bottom: -7px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 7px solid transparent;
		border-right: 7px solid transparent;
		border-top: 7px solid var(--color-background-surface);
	}

	.tour-tooltip.arrow-left::before {
		content: '';
		position: absolute;
		left: -8px;
		top: 50%;
		transform: translateY(-50%);
		border-top: 8px solid transparent;
		border-bottom: 8px solid transparent;
		border-right: 8px solid var(--color-border);
	}
	.tour-tooltip.arrow-left::after {
		content: '';
		position: absolute;
		left: -7px;
		top: 50%;
		transform: translateY(-50%);
		border-top: 7px solid transparent;
		border-bottom: 7px solid transparent;
		border-right: 7px solid var(--color-background-surface);
	}

	.tour-tooltip-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		margin-bottom: var(--spacing-2);
	}

	.tour-step-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 32px;
		height: 22px;
		padding: 0 var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		font-family: var(--font-display);
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.tour-tooltip-title {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		font-family: var(--font-display);
	}

	.tour-tooltip-desc {
		margin: 0 0 var(--spacing-4);
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.tour-tooltip-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-2);
	}

	.tour-tooltip-nav {
		display: flex;
		gap: var(--spacing-1-5);
	}

	.tour-btn-prev {
		padding: var(--spacing-1-5) var(--spacing-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		background: transparent;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.tour-btn-prev:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.tour-btn-skip {
		padding: var(--spacing-1-5) var(--spacing-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		background: transparent;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.tour-btn-skip:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.tour-btn-next {
		padding: var(--spacing-1-5) var(--spacing-4);
		border: none;
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-on-accent);
		background: var(--color-accent);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-standard);
	}

	.tour-btn-next:hover {
		background: var(--color-accent-hover);
	}

	/* Skip confirmation dialog */
	.tour-confirm {
		position: fixed;
		z-index: 10001;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-container);
		padding: var(--spacing-6);
		width: 340px;
		box-shadow: var(--shadow-high);
	}

	.tour-confirm-text {
		margin: 0 0 var(--spacing-5);
		font-size: var(--font-size-base);
		line-height: 1.7;
		color: var(--color-text-primary);
	}

	.tour-confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
	}
</style>
