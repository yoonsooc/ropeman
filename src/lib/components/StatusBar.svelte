<script lang="ts">
	import { authStore } from '$lib/stores/authStore.svelte';

	const connectionInfo = $derived.by(() => {
		const track = authStore.activeTrack;
		if (!track) return { status: 'Disconnected', color: 'var(--text-muted)', dotClass: '' };
		switch (track) {
			case 'edge':
				return { status: 'Demo', color: 'var(--color-success)', dotClass: 'dot-success' };
			case 'byok':
				return { status: 'API Key', color: 'var(--color-success)', dotClass: 'dot-success' };
			case 'bridge':
				return authStore.bridgeStatus === 'connected'
					? {
							status: 'Bridge Connected',
							color: 'var(--color-success)',
							dotClass: 'dot-success'
						}
					: { status: 'Bridge Disconnected', color: 'var(--text-muted)', dotClass: '' };
			case 'webgpu':
				return { status: 'WebGPU', color: 'var(--color-success)', dotClass: 'dot-success' };
			default:
				return { status: 'Disconnected', color: 'var(--text-muted)', dotClass: '' };
		}
	});
</script>

<footer class="status-bar">
	<div class="status-left">
		<div class="status-item">
			<span class="material-symbols-outlined status-icon">zoom_in</span>
			<span class="status-text">Zoom 100%</span>
		</div>
		<div class="status-item">
			<span class="material-symbols-outlined status-icon">map</span>
			<span class="status-text">Minimap</span>
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
		background: var(--bg-secondary, #151a21);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 16px;
		flex-shrink: 0;
		z-index: 50;
		border-top: 1px solid var(--ghost-border);
	}

	.status-left,
	.status-right {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.status-item:hover {
		color: var(--text-primary);
	}

	.status-icon {
		font-size: 14px;
		color: var(--text-muted);
	}

	.status-text {
		font-family: var(--font-body);
		font-size: 11px;
		color: var(--text-muted);
	}

	.status-connection {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.connection-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
	}

	.connection-dot.dot-success {
		background: var(--color-success, #7ad4a0);
	}

	.connection-text {
		font-family: var(--font-body);
		font-size: 11px;
	}

	.status-divider {
		width: 1px;
		height: 12px;
		background: var(--bg-tertiary, #1b2028);
	}

	.status-version {
		font-family: var(--font-body);
		font-size: 11px;
		color: var(--text-muted);
	}
</style>
