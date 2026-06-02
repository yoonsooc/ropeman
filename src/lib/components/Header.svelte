<script lang="ts">
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let {
		onsettings,
		onhelp,
		onnewproject,
		onconnect,
		onanalyze,
		onshare
	}: {
		onsettings?: () => void;
		onhelp?: () => void;
		onnewproject?: () => void;
		onconnect?: () => void;
		onanalyze?: () => void;
		onshare?: () => void;
	} = $props();

	const canShare = $derived(semanticStore.currentLevel !== null);

	const hasProject = $derived(projectStore.fileTree !== null);
	const isParsing = $derived(
		projectStore.parsingProgress.total > 0 &&
			projectStore.parsingProgress.done < projectStore.parsingProgress.total
	);

	const trackInfo = $derived.by(() => {
		const track = authStore.activeTrack;
		switch (track) {
			case 'bridge':
				return { label: 'Bridge', color: 'var(--track-bridge)', icon: '🔗' };
			case 'edge':
				return { label: 'Demo', color: 'var(--track-demo)', icon: '⚡' };
			case 'webgpu':
				return { label: 'WebGPU', color: 'var(--track-webgpu)', icon: '🧠' };
			case 'byok':
				return { label: 'API Key', color: 'var(--track-byok)', icon: '🔑' };
			default:
				return null;
		}
	});
</script>

<header class="header">
	<div class="header-left">
		<h1 class="header-title">{i18nStore.t('title')}</h1>
		{#if projectStore.projectName}
			<span class="header-project">{projectStore.projectName}</span>
		{:else}
			<span class="header-subtitle">{i18nStore.t('subtitle')}</span>
		{/if}
	</div>
	<div class="header-right">
		{#if hasProject}
			<button class="header-btn text-btn" onclick={onnewproject} title="Open New Project">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					<line x1="12" y1="11" x2="12" y2="17" />
					<line x1="9" y1="14" x2="15" y2="14" />
				</svg>
				<span class="btn-label">New</span>
			</button>
		{/if}
		{#if hasProject}
			<button
				class="analyze-btn"
				data-tour-step="2"
				onclick={() => onanalyze?.()}
				disabled={isParsing}
				title="AI Semantic Analysis"
			>
				{#if isParsing}
					<span class="material-symbols-outlined analyze-spinner">progress_activity</span>
					{projectStore.parsingProgress.done}/{projectStore.parsingProgress.total}
				{:else}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/>
					</svg>
					Analyze
				{/if}
			</button>
		{/if}
		{#if hasProject}
			<button
				class="share-btn"
				onclick={() => onshare?.()}
				disabled={!canShare}
				title={i18nStore.t('share.button')}
			>
				<span class="material-symbols-outlined" style="font-size:14px;">share</span>
				<span class="btn-label">{i18nStore.t('share.button')}</span>
			</button>
		{/if}
		<div class="header-divider"></div>
		<button class="header-btn" onclick={() => i18nStore.toggleLocale()} title="Toggle Language">
			{i18nStore.locale === 'ko' ? 'EN' : '\uD55C'}
		</button>
		<button
			class="header-btn"
			onclick={() => themeStore.toggle()}
			title="{i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')} (Ctrl+Shift+D)"
		>
			{themeStore.current === 'dark' ? '\u2600' : '\u263D'}
		</button>
		<a
			class="header-btn header-link"
			href={resolve('/explore')}
			title={i18nStore.locale === 'ko' ? '갤러리' : 'Explore gallery'}
		>
			<span class="material-symbols-outlined" style="font-size:18px;">photo_library</span>
		</a>
		<a
			class="header-btn header-link"
			href={resolve(`/docs/${i18nStore.locale}/getting-started`)}
			title={i18nStore.t('docs.headerLink')}
		>
			<span class="material-symbols-outlined" style="font-size:18px;">menu_book</span>
		</a>
		<button class="header-btn" onclick={onhelp} title="{i18nStore.t('shortcuts.showHelp')} (?)">
			<span class="material-symbols-outlined" style="font-size:18px;">help_outline</span>
		</button>
		<button
			class="header-btn"
			data-tour-step="3"
			onclick={onsettings}
			title={i18nStore.t('settings')}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="3" />
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
				/>
			</svg>
		</button>
		{#if hasProject && trackInfo}
			<button
				class="track-badge"
				style="--track-color: {trackInfo.color}"
				onclick={onconnect}
				title="AI: {trackInfo.label} (click to change)"
			>
				<span class="track-dot"></span>
				<span class="track-label">{trackInfo.label}</span>
			</button>
		{/if}
	</div>
</header>

<SearchBar />

{#if hasProject}
	<Breadcrumb />
{/if}

<style>
	.header {
		height: var(--header-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		width: 100%;
		background: var(--sidebar-icon-bg);
		flex-shrink: 0;
		border-bottom: 1px solid var(--ghost-border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	@media (max-width: 768px) {
		.header {
			padding-top: env(safe-area-inset-top);
			padding-left: max(16px, env(safe-area-inset-left));
			padding-right: max(16px, env(safe-area-inset-right));
			height: calc(var(--header-height) + env(safe-area-inset-top));
		}
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 32px;
	}

	.header-title {
		font-size: 18px;
		font-weight: 700;
		color: var(--accent);
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.header-subtitle {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.header-project {
		font-size: 13px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-secondary);
		transition:
			background-color var(--transition),
			color var(--transition);
	}

	.header-btn :global(svg) {
		width: 18px;
		height: 18px;
	}

	.header-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.header-link {
		text-decoration: none;
	}

	.header-btn.text-btn {
		width: auto;
		padding: 4px 12px;
		gap: 6px;
		background: var(--bg-tertiary);
		border: 1px solid var(--ghost-border);
		border-radius: 4px;
		color: var(--accent-secondary);
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.header-btn.text-btn:hover {
		background: var(--bg-tertiary);
	}

	.btn-label {
		font-size: 11px;
	}

	.analyze-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		background: var(--accent);
		color: var(--sidebar-icon-bg, #0f141a);
		border: none;
		border-radius: 4px;
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.analyze-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.analyze-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.share-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		background: var(--bg-tertiary);
		color: var(--accent-secondary, var(--text-secondary));
		border: 1px solid var(--ghost-border);
		border-radius: 4px;
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition:
			opacity 0.2s,
			background 0.2s;
	}

	.share-btn:hover:not(:disabled) {
		background: var(--bg-secondary);
	}

	.share-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.analyze-spinner {
		font-size: 14px;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.track-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		margin-left: 4px;
		border-radius: 9999px;
		background: var(--accent-bg);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		cursor: pointer;
		transition: background 0.2s;
	}

	.track-badge:hover {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}

	.track-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent, #a3a6ff);
		flex-shrink: 0;
		animation: trackPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes trackPulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.track-label {
		font-size: 9px;
		font-weight: 700;
		color: var(--accent, #a3a6ff);
		letter-spacing: -0.05em;
		text-transform: uppercase;
	}

	.header-divider {
		width: 0;
		height: 100%;
		border-left: 1px solid var(--ghost-border);
		margin-left: 8px;
		padding-left: 16px;
	}

	@media (max-width: 768px) {
		.header-subtitle {
			display: none;
		}

		.btn-label {
			display: none;
		}

		.header-btn.text-btn {
			width: 32px;
			padding: 0;
		}
	}
</style>
