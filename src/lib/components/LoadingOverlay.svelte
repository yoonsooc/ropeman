<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';

	const progress = $derived(projectStore.parsingProgress);
	const pct = $derived(progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0);
</script>

<div class="loading-overlay">
	<div class="loading-card">
		<div class="spinner">
			<svg viewBox="0 0 50 50" class="spin-svg">
				<circle
					cx="25"
					cy="25"
					r="20"
					fill="none"
					stroke="currentColor"
					stroke-width="4"
					stroke-dasharray="80 40"
					stroke-linecap="round"
				/>
			</svg>
		</div>

		<h2 class="loading-title">{i18nStore.t('parsing.title')}</h2>
		<p class="loading-name">{projectStore.projectName || i18nStore.t('common.loading')}</p>

		<div class="progress-container">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {pct}%"></div>
			</div>
			<div class="progress-info">
				<span class="progress-pct">{pct}%</span>
				{#if progress.total > 0}
					<span class="progress-count"
						>{i18nStore.t('parsing.fileProgress', {
							done: progress.done,
							total: progress.total
						})}</span
					>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.loading-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-overlay);
	}

	.loading-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-4);
		padding: var(--spacing-10) var(--spacing-12);
		background: var(--color-background-surface);
		border-radius: var(--radius-container);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-high);
		min-width: 320px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		color: var(--color-accent);
	}

	.spin-svg {
		width: 100%;
		height: 100%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}

	.loading-name {
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		max-width: 280px;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: var(--color-background-muted);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 3px;
		transition: width var(--duration-medium) var(--ease-standard);
	}

	.progress-info {
		display: flex;
		justify-content: space-between;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.progress-pct {
		font-weight: var(--font-weight-semibold);
		color: var(--color-accent);
	}

	.progress-count {
		color: var(--color-text-tertiary);
	}
</style>
