<script lang="ts">
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

		<h2 class="loading-title">Parsing Project</h2>
		<p class="loading-name">{projectStore.projectName || 'Loading...'}</p>

		<div class="progress-container">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {pct}%"></div>
			</div>
			<div class="progress-info">
				<span class="progress-pct">{pct}%</span>
				{#if progress.total > 0}
					<span class="progress-count">{progress.done} / {progress.total} files</span>
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
		background: var(--modal-backdrop);
	}

	.loading-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 40px 48px;
		background: var(--bg-secondary);
		border-radius: 16px;
		border: 1px solid var(--border);
		box-shadow: 0 20px 60px var(--shadow);
		min-width: 320px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		color: var(--accent);
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
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.loading-name {
		font-size: 14px;
		color: var(--text-secondary);
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
		gap: 8px;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: var(--bg-tertiary);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-info {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: var(--text-secondary);
	}

	.progress-pct {
		font-weight: 600;
		color: var(--accent);
	}

	.progress-count {
		color: var(--text-muted);
	}
</style>
