<script lang="ts">
	import { bridgeStore } from '$lib/stores/bridgeStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';

	const status = $derived(bridgeStore.status);
	const label = $derived(
		status.state === 'lost' ? i18nStore.t('bridge.lostBadge') : i18nStore.t('bridge.connected')
	);
</script>

{#if (status.state === 'connected' || status.state === 'lost') && bridgeStore.map}
	<span
		class="bridge-badge"
		class:lost={status.state === 'lost'}
		title={label}
		data-testid="bridge-status"
	>
		<span class="badge-dot" aria-hidden="true"></span>
		<span class="badge-label">{label}</span>
	</span>
	{#if status.state === 'connected'}
		<span class="bridge-server">
			{i18nStore.t('bridge.serverInfo', { version: status.server.version, host: status.host })}
		</span>
	{/if}
	<button
		class="bridge-disconnect"
		onclick={() => bridgeStore.disconnect()}
		title={i18nStore.t('bridge.disconnect')}
		aria-label={i18nStore.t('bridge.disconnect')}
	>
		<span aria-hidden="true" class="material-symbols-outlined">link_off</span>
		<span class="disconnect-label">{i18nStore.t('bridge.disconnect')}</span>
	</button>
{/if}

<style>
	.bridge-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-success-muted);
		color: var(--color-success);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		white-space: nowrap;
	}

	.bridge-badge.lost {
		background: var(--color-warning-muted);
		color: var(--color-text-primary);
	}

	.badge-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.bridge-server {
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		white-space: nowrap;
	}

	.bridge-disconnect {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1) var(--spacing-3);
		background: var(--color-background-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-standard);
	}

	.bridge-disconnect .material-symbols-outlined {
		font-size: 16px;
	}

	@media (hover: hover) {
		.bridge-disconnect:hover {
			background: var(--color-background-muted);
		}
	}

	/* The badge shrinks to its dot on phones and Disconnect to its icon, as the app's buttons do */
	@media (max-width: 768px) {
		.bridge-server,
		.disconnect-label {
			display: none;
		}

		.bridge-disconnect {
			justify-content: center;
			width: 32px;
			min-height: 32px;
			padding: 0;
		}
	}

	@media (max-width: 430px) {
		.bridge-badge {
			padding: var(--spacing-1-5);
		}

		.badge-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.bridge-disconnect {
			width: 28px;
			min-width: 28px;
			height: 28px;
			min-height: 28px;
		}
	}
</style>
