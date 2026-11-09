<script lang="ts">
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
			case 'bridge':
				return { label: 'Local Bridge', color: 'var(--track-bridge)' };
			case 'edge':
				return { label: 'Demo', color: 'var(--track-demo)' };
			case 'webgpu':
				return { label: 'WebGPU', color: 'var(--track-webgpu)' };
			case 'byok':
				return { label: 'API Key', color: 'var(--track-byok)' };
			default:
				return { label: 'Not connected', color: 'var(--text-muted)' };
		}
	});

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
		<div class="modal-card drilldown-card" role="dialog" aria-modal="true">
			<div class="drilldown-header">
				<div class="drilldown-title">
					<span class="title-dot" style="background: {trackInfo.color}"></span>
					추가 분석
				</div>
				<span class="drilldown-label">DRILLDOWN</span>
			</div>
			<p class="drilldown-desc">
				<strong>{nodeLabel}</strong> 도메인의 내부 구조를 분석합니다.
			</p>
			<div class="drilldown-track">
				<span class="track-dot" style="background: {trackInfo.color}"></span>
				<span class="track-name" style="color: {trackInfo.color}">{trackInfo.label}</span>
				<span class="track-suffix">모드로 분석</span>
			</div>
			<label class="dont-ask">
				<input type="checkbox" bind:checked={dontAskAgain} />
				다시 묻지 않기
			</label>
			<div class="drilldown-actions">
				<button class="btn btn-secondary drilldown-btn" onclick={handleCancel}>취소</button>
				<button class="btn btn-primary drilldown-btn" onclick={handleConfirm}>분석</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.drilldown-backdrop {
		z-index: 1100;
	}
	.drilldown-card {
		padding: 16px;
		width: 320px;
		border-radius: 8px;
	}
	.drilldown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.drilldown-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 0;
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
	}
	.title-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.drilldown-label {
		font-size: 12px;
		font-family: var(--font-code);
		color: var(--text-muted);
	}
	.drilldown-desc {
		font-size: 11px;
		color: var(--text-secondary);
		margin: 0 0 20px;
		line-height: 1.625;
	}
	.drilldown-track {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: var(--bg-secondary);
		border-radius: 8px;
		margin-bottom: 14px;
	}
	.track-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.track-name {
		font-size: 13px;
		font-weight: 600;
	}
	.track-suffix {
		font-size: 13px;
		color: var(--text-secondary);
	}
	.dont-ask {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 10px;
		color: var(--text-muted);
		cursor: pointer;
		margin-bottom: 20px;
	}
	.dont-ask input {
		width: 12px;
		height: 12px;
		accent-color: var(--accent);
		border-radius: 4px;
	}
	.drilldown-actions {
		display: flex;
		gap: 8px;
	}
	.drilldown-btn {
		padding: 6px 0;
		flex: 1;
		font-size: 11px;
		font-weight: 700;
		border-radius: 4px;
	}
</style>
