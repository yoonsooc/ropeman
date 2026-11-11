<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data } = $props();

	const kindIcons: Record<string, string> = {
		function: 'fn',
		class: 'C',
		method: 'm',
		import: '&#8594;'
	};

	const kindColors: Record<string, { bg: string; border: string; text: string }> = {
		function: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
		class: { bg: '#faf5ff', border: '#a855f7', text: '#7c3aed' },
		method: { bg: '#ecfdf5', border: '#22c55e', text: '#15803d' },
		import: { bg: '#f0f9ff', border: '#06b6d4', text: '#0e7490' }
	};

	const badgeEmoji: Record<string, string> = {
		static: '\u2699\uFE0F',
		async: '\u26A1',
		generator: '\uD83D\uDD04',
		route: '\uD83C\uDF10',
		export_default: '\uD83D\uDCE6',
		decorator: '\uD83C\uDFF7\uFE0F',
		abstract: '\uD83D\uDCD0'
	};

	const colors = $derived(kindColors[data.kind] ?? kindColors['function']);
	const icon = $derived(kindIcons[data.kind] ?? 'fn');
	const lineRange = $derived(
		data.lineStart && data.lineEnd
			? `L${data.lineStart}-L${data.lineEnd}`
			: data.lineStart
				? `L${data.lineStart}`
				: ''
	);
</script>

<div class="symbol-node" style="background: {colors.bg}; border-color: {colors.border};">
	<Handle type="target" position={Position.Top} />

	<div class="node-content">
		<span class="kind-icon" style="background: {colors.border};">{@html icon}</span>
		<span class="label" style="color: {colors.text};">{data.label}</span>
		{#if lineRange}
			<span class="line-range">{lineRange}</span>
		{/if}
		{#if data.badges?.length}
			<span class="badges">
				{#each data.badges as badge}
					<span
						class="badge-pill"
						title={badge in badgeEmoji ? i18nStore.t(`symbolBadge.${badge}`) : undefined}
						>{badgeEmoji[badge]}</span
					>
				{/each}
			</span>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} />
</div>

<style>
	.symbol-node {
		border: 1.5px solid #d1d5db;
		border-radius: 5px;
		padding: 6px 10px;
		min-width: 130px;
		font-size: 11px;
		cursor: pointer;
		transition: box-shadow 0.15s ease;
	}

	.symbol-node:hover {
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
	}

	.node-content {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.kind-icon {
		color: white;
		font-size: 9px;
		font-weight: 800;
		width: 20px;
		height: 20px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.label {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.line-range {
		font-size: 9px;
		color: #9ca3af;
		flex-shrink: 0;
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	.badges {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
		margin-left: 2px;
	}

	.badge-pill {
		font-size: 10px;
		line-height: 1;
		cursor: default;
	}
</style>
