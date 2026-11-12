<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';

	let {
		open,
		nodeLabel,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		nodeLabel: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let dontAskAgain = $state(false);

	const trackInfo = $derived.by(() => {
		switch (authStore.activeTrack) {
			case 'edge':
				return { label: i18nStore.t('track.edge'), color: 'var(--track-demo)' };
			case 'webgpu':
				return { label: i18nStore.t('track.webgpu'), color: 'var(--track-webgpu)' };
			case 'byok':
				return { label: i18nStore.t('track.byok'), color: 'var(--track-byok)' };
			default:
				return { label: i18nStore.t('track.none'), color: 'var(--color-text-tertiary)' };
		}
	});

	// The bold label and the track name sit at different spots in each language
	const descParts = $derived(i18nStore.t('drilldown.desc').split('{label}'));
	const trackParts = $derived(i18nStore.t('drilldown.trackLine').split('{track}'));

	function handleConfirm() {
		if (dontAskAgain) {
			settingsStore.skipDrilldownConfirm = true;
		}
		dontAskAgain = false;
		onconfirm();
	}

	function handleCancel() {
		dontAskAgain = false;
		oncancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleCancel();
		if (e.key === 'Enter') handleConfirm();
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('drilldown-backdrop')) {
			handleCancel();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop drilldown-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div
			class="modal-card drilldown-card"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			use:focusTrap
		>
			<div class="drilldown-header">
				<div class="drilldown-title">
					<span class="title-dot" style="background: {trackInfo.color}"></span>
					{i18nStore.t('drilldown.title')}
				</div>
				<span class="drilldown-label">{i18nStore.t('drilldown.badge')}</span>
			</div>
			<p class="drilldown-desc">
				{descParts[0]}<strong>{nodeLabel}</strong>{descParts[1]}
			</p>
			<div class="drilldown-track">
				{#if trackParts[0].trim()}<span class="track-suffix">{trackParts[0].trim()}</span>{/if}
				<span class="track-dot" style="background: {trackInfo.color}"></span>
				<span class="track-name" style="color: {trackInfo.color}">{trackInfo.label}</span>
				{#if trackParts[1]?.trim()}<span class="track-suffix">{trackParts[1].trim()}</span>{/if}
			</div>
			<label class="dont-ask">
				<input type="checkbox" bind:checked={dontAskAgain} />
				{i18nStore.t('dontAskAgain')}
			</label>
			<div class="drilldown-actions">
				<button class="btn btn-secondary drilldown-btn" data-autofocus onclick={handleCancel}
					>{i18nStore.t('common.cancel')}</button
				>
				<button class="btn btn-primary drilldown-btn" onclick={handleConfirm}
					>{i18nStore.t('drilldown.confirm')}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.drilldown-backdrop {
		z-index: 1100;
	}
	.drilldown-card {
		padding: var(--spacing-4);
		width: 320px;
		border-radius: var(--radius-element);
	}
	.drilldown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-3);
	}
	.drilldown-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		margin-bottom: 0;
		font-family: var(--font-display);
	}
	.title-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.drilldown-label {
		font-size: var(--font-size-sm);
		font-family: var(--font-code);
		color: var(--color-text-tertiary);
	}
	.drilldown-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-5);
		line-height: 1.625;
	}
	.drilldown-track {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-background-surface);
		border-radius: var(--radius-element);
		margin-bottom: var(--spacing-3);
	}
	.track-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.track-name {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
	}
	.track-suffix {
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
	}
	.dont-ask {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		cursor: pointer;
		margin-bottom: var(--spacing-5);
	}
	.dont-ask input {
		width: 12px;
		height: 12px;
		accent-color: var(--color-accent);
		border-radius: var(--radius-inner);
	}
	.drilldown-actions {
		display: flex;
		gap: var(--spacing-2);
	}
	.drilldown-btn {
		padding: var(--spacing-1-5) 0;
		flex: 1;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-inner);
	}
</style>
