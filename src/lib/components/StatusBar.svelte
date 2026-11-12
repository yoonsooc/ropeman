<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';

	const connectionInfo = $derived.by(() => {
		const track = authStore.activeTrack;
		if (!track)
			return {
				status: i18nStore.t('track.disconnected'),
				color: 'var(--color-text-tertiary)',
				dotClass: ''
			};
		switch (track) {
			case 'edge':
				return {
					status: i18nStore.t('track.edge'),
					color: 'var(--color-text-success)',
					dotClass: 'dot-success'
				};
			case 'byok':
				return {
					status: i18nStore.t('track.byok'),
					color: 'var(--color-text-success)',
					dotClass: 'dot-success'
				};
			case 'webgpu':
				return {
					status: i18nStore.t('track.webgpu'),
					color: 'var(--color-text-success)',
					dotClass: 'dot-success'
				};
			default:
				return {
					status: i18nStore.t('track.disconnected'),
					color: 'var(--color-text-tertiary)',
					dotClass: ''
				};
		}
	});
</script>

<footer class="status-bar">
	<div class="status-left">
		<div class="status-item">
			<span class="material-symbols-outlined status-icon">zoom_in</span>
			<span class="status-text">{i18nStore.t('statusBar.zoom')}</span>
		</div>
		<div class="status-item">
			<span class="material-symbols-outlined status-icon">map</span>
			<span class="status-text">{i18nStore.t('statusBar.minimap')}</span>
		</div>
	</div>
	<div class="status-right">
		<div class="status-connection">
			<div
				class="connection-dot"
				class:dot-success={connectionInfo.dotClass === 'dot-success'}
			></div>
			<span class="connection-text" style="color: {connectionInfo.color}"
				>{connectionInfo.status}</span
			>
		</div>
		<div class="status-divider"></div>
		<span class="status-version">v0.17.0</span>
	</div>
</footer>

<style>
	.status-bar {
		height: 32px;
		width: 100%;
		background: var(--color-background-surface);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 var(--spacing-4);
		flex-shrink: 0;
		z-index: 50;
		border-top: 1px solid var(--color-border);
	}

	.status-left,
	.status-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-4);
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-standard);
	}

	.status-item:hover {
		color: var(--color-text-primary);
	}

	.status-icon {
		font-size: 14px;
		color: var(--color-text-tertiary);
	}

	.status-text {
		font-family: var(--font-body);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.status-connection {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.connection-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-text-tertiary);
	}

	.connection-dot.dot-success {
		background: var(--color-icon-success);
	}

	.connection-text {
		font-family: var(--font-body);
		font-size: var(--font-size-sm);
	}

	.status-divider {
		width: 1px;
		height: 12px;
		background: var(--color-background-muted);
	}

	.status-version {
		font-family: var(--font-body);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}
</style>
