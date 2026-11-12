<script lang="ts">
	import { onMount } from 'svelte';

	let {
		message,
		type = 'error',
		ondismiss
	}: {
		message: string;
		type?: 'warning' | 'error' | 'info';
		ondismiss: () => void;
	} = $props();

	onMount(() => {
		if (type !== 'error') {
			const timer = setTimeout(ondismiss, 5000);
			return () => clearTimeout(timer);
		}
	});

	const icons: Record<string, string> = {
		error: '\u2716',
		warning: '\u26A0',
		info: '\u2139'
	};
</script>

<div class="error-banner {type}" role="alert">
	<span class="banner-icon">{icons[type]}</span>
	<span class="banner-message">{message}</span>
	<button class="banner-dismiss" onclick={ondismiss}>&times;</button>
</div>

<style>
	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-4);
		border-radius: var(--radius-element);
		font-size: var(--font-size-base);
		animation: slideDown var(--duration-medium) var(--ease-standard);
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.error-banner.error {
		background: var(--color-error-muted);
		border: 1px solid color-mix(in srgb, var(--color-border-error) 30%, transparent);
		color: var(--color-on-error-muted);
	}

	.error-banner.warning {
		background: var(--color-warning-muted);
		border: 1px solid color-mix(in srgb, var(--color-border-warning) 30%, transparent);
		color: var(--color-on-warning-muted);
	}

	.error-banner.info {
		background: var(--color-info-muted);
		border: 1px solid color-mix(in srgb, var(--color-border-info) 30%, transparent);
		color: var(--color-on-info-muted);
	}

	.banner-icon {
		font-size: 15px;
		flex-shrink: 0;
	}

	.banner-message {
		flex: 1;
	}

	.banner-dismiss {
		font-size: var(--font-size-lg);
		opacity: 0.6;
		padding: 0 var(--spacing-1);
		flex-shrink: 0;
		transition: opacity var(--duration-fast) var(--ease-standard);
	}

	.banner-dismiss:hover {
		opacity: 1;
	}
</style>
