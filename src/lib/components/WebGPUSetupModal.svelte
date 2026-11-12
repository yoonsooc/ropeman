<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { webgpuStore, WEBGPU_MODELS } from '$lib/stores/webgpuStore.svelte';
	import { initModel, cancelDownload } from '$lib/services/webllmService';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	function formatSize(mb: number): string {
		return mb >= 1000 ? `~${(mb / 1000).toFixed(1)} GB` : `~${mb} MB`;
	}

	function estimateTime(mb: number): string {
		if (mb < 600) return i18nStore.t('webgpuSetup.timeUnder1');
		if (mb < 1200) return i18nStore.t('webgpuSetup.time1to3');
		if (mb < 3000) return i18nStore.t('webgpuSetup.time3to6');
		return i18nStore.t('webgpuSetup.time5to10');
	}

	function handleStartDownload() {
		// Start download in background — don't await, close modal immediately
		initModel().catch(() => {
			// error handled by store
		});
		onclose();
	}

	function handleCancel() {
		onclose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('webgpu-backdrop')) {
			handleCancel();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleCancel();
	}
</script>

<!-- Model selection modal (shown before download starts) -->
{#if open && webgpuStore.status !== 'downloading'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop webgpu-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card webgpu-card" role="dialog" aria-modal="true" tabindex="-1" use:focusTrap>
			<div class="modal-header">
				<h2>{i18nStore.t('webgpuSetup.title')}</h2>
				<button class="modal-close" onclick={handleCancel}>&#10005;</button>
			</div>

			<div class="modal-body">
				{#if webgpuStore.status === 'error'}
					<!-- Error -->
					<div class="error-section">
						<div class="error-icon">&#9888;</div>
						<p class="error-text">{webgpuStore.errorMessage}</p>
						<button class="btn btn-primary" onclick={handleStartDownload}
							>{i18nStore.t('common.retry')}</button
						>
						<button class="btn btn-secondary" onclick={handleCancel}
							>{i18nStore.t('common.close')}</button
						>
					</div>
				{:else}
					<!-- Confirmation screen -->
					<div class="confirm-section">
						<div class="model-selector">
							<label for="webgpu-model-select" class="form-label selector-label"
								>{i18nStore.t('webgpuSetup.model')}</label
							>
							<select
								id="webgpu-model-select"
								class="select model-select"
								bind:value={webgpuStore.selectedModelId}
							>
								{#each WEBGPU_MODELS as model}
									<option value={model.id}>
										{model.label} ({model.params})
									</option>
								{/each}
							</select>
						</div>
						<div class="model-info">
							<div class="info-row">
								<span class="info-label">{i18nStore.t('webgpuSetup.parameters')}</span>
								<span class="info-value">{webgpuStore.selectedModel.params}</span>
							</div>
							<div class="info-row">
								<span class="info-label">{i18nStore.t('webgpuSetup.vram')}</span>
								<span class="info-value">{formatSize(webgpuStore.selectedModel.vramMB)}</span>
							</div>
							<div class="info-row">
								<span class="info-label">{i18nStore.t('webgpuSetup.download')}</span>
								<span class="info-value"
									>{formatSize(webgpuStore.selectedModel.downloadSizeMB)}</span
								>
							</div>
							<div class="info-row">
								<span class="info-label">{i18nStore.t('webgpuSetup.estTime')}</span>
								<span class="info-value"
									>{estimateTime(webgpuStore.selectedModel.downloadSizeMB)}</span
								>
							</div>
						</div>
						{#if webgpuStore.selectedModel.vramMB > 3000}
							<p class="notice notice-warning vram-warning">
								{i18nStore.t('webgpuSetup.vramWarning', {
									size: formatSize(webgpuStore.selectedModel.vramMB)
								})}
							</p>
						{/if}
						{#if webgpuStore.isCached}
							<p class="hint confirm-desc notice notice-success cached-hint">
								{i18nStore.t('webgpuSetup.cachedHint')}
							</p>
						{:else}
							<p class="hint confirm-desc">
								{i18nStore.t('webgpuSetup.downloadHint')}
							</p>
						{/if}
						<div class="confirm-actions">
							<button class="btn btn-primary" onclick={handleStartDownload}>
								{webgpuStore.isCached
									? i18nStore.t('webgpuSetup.loadModel')
									: i18nStore.t('webgpuSetup.downloadSetup')}
							</button>
							<button class="btn btn-secondary" onclick={handleCancel}>
								{i18nStore.t('common.cancel')}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Floating download indicator (always visible during download) -->
{#if webgpuStore.status === 'downloading'}
	<div class="download-indicator">
		<div class="di-header">
			<span class="di-icon material-symbols-outlined">download</span>
			<span class="di-title"
				>{i18nStore.t('webgpuSetup.downloadingModel', {
					model: webgpuStore.selectedModel.label
				})}</span
			>
			<button
				class="di-cancel"
				onclick={() => cancelDownload()}
				aria-label={i18nStore.t('webgpuSetup.cancelDownload')}
				>{i18nStore.t('common.cancel')}</button
			>
		</div>
		<div class="di-progress-track">
			<div class="di-progress-fill" style="width: {webgpuStore.downloadProgress}%"></div>
		</div>
		<div class="di-info">
			<span class="di-percent">{webgpuStore.downloadProgress}%</span>
			<span class="di-stage"
				>{webgpuStore.downloadStage || i18nStore.t('webgpuSetup.starting')}</span
			>
		</div>
	</div>
{/if}

<!-- Download complete notification -->
{#if webgpuStore.status === 'ready' && webgpuStore.downloadProgress === 100}
	<div class="download-complete" role="status">
		<span class="dc-icon">&#10003;</span>
		<span class="dc-text"
			>{i18nStore.t('webgpuSetup.ready', { model: webgpuStore.selectedModel.label })}</span
		>
		<button class="dc-dismiss" onclick={() => (webgpuStore.downloadProgress = 0)}>&#10005;</button>
	</div>
{/if}

<style>
	.webgpu-card {
		width: 420px;
	}

	/* Confirmation */
	.confirm-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}
	.model-selector {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
	}
	.model-select:focus {
		border-color: var(--color-accent);
	}
	.model-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: var(--spacing-3);
		background: var(--color-background-surface);
		border-radius: var(--radius-element);
	}
	.info-row {
		display: flex;
		justify-content: space-between;
		font-size: var(--font-size-base);
	}
	.info-label {
		color: var(--color-text-secondary);
	}
	.info-value {
		color: var(--color-text-primary);
		font-weight: var(--font-weight-medium);
	}
	.confirm-desc {
		line-height: 1.6;
	}
	.confirm-actions {
		display: flex;
		gap: var(--spacing-2);
		justify-content: flex-end;
	}

	/* Error */
	.error-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-3);
		text-align: center;
	}
	.error-icon {
		font-size: 32px;
		color: var(--color-text-error);
	}
	.error-text {
		font-size: var(--font-size-base);
		color: var(--color-text-error);
		margin: 0;
	}

	/* Floating download indicator */
	.download-indicator {
		position: fixed;
		bottom: 20px;
		right: 20px;
		width: 256px;
		background: var(--color-background-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		padding: var(--spacing-4);
		box-shadow: var(--shadow-med);
		z-index: 1200;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}
	.di-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}
	.di-icon {
		font-size: 18px;
		flex-shrink: 0;
		color: var(--color-accent);
	}
	.di-title {
		flex: 1;
		font-size: var(--font-size-sm);
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.di-cancel {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.05em;
		cursor: pointer;
		padding: var(--spacing-0-5);
		flex-shrink: 0;
	}
	.di-cancel:hover {
		color: var(--color-text-error);
	}
	.di-progress-track {
		width: 100%;
		height: 4px;
		background: var(--color-background-sidebar-icon);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.di-progress-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: var(--radius-full);
		transition: width var(--duration-medium) var(--ease-standard);
	}
	.di-info {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-code);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}
	.di-percent {
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
	}
	.di-stage {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	/* Download complete notification */
	.download-complete {
		position: fixed;
		bottom: 20px;
		right: 20px;
		background: var(--color-success);
		color: var(--color-on-success);
		border-radius: var(--radius-container);
		padding: var(--spacing-3) var(--spacing-4);
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		box-shadow: var(--shadow-med);
		z-index: 1200;
		animation: slideIn var(--duration-medium) var(--ease-standard);
	}
	.dc-icon {
		font-size: 16px;
		font-weight: var(--font-weight-bold);
	}
	.dc-text {
		flex: 1;
	}
	.dc-dismiss {
		background: none;
		border: none;
		color: var(--color-background-body);
		font-size: var(--font-size-base);
		cursor: pointer;
		padding: var(--spacing-0-5);
		opacity: 0.7;
	}
	.dc-dismiss:hover {
		opacity: 1;
	}
	@keyframes slideIn {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
