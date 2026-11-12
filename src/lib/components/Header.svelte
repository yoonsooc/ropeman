<script lang="ts">
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
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
		onshare,
		ongohome
	}: {
		onsettings?: () => void;
		onhelp?: () => void;
		onnewproject?: () => void;
		onconnect?: () => void;
		onanalyze?: () => void;
		onshare?: () => void;
		ongohome?: () => void;
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
				return {
					label: i18nStore.t('track.bridgeShort'),
					color: 'var(--track-bridge)',
					icon: '🔗'
				};
			case 'edge':
				return { label: i18nStore.t('track.edge'), color: 'var(--track-demo)', icon: '⚡' };
			case 'webgpu':
				return { label: i18nStore.t('track.webgpu'), color: 'var(--track-webgpu)', icon: '🧠' };
			case 'byok':
				return { label: i18nStore.t('track.byok'), color: 'var(--track-byok)', icon: '🔑' };
			default:
				return null;
		}
	});
</script>

<header class="header">
	<div class="header-left">
		<div class="header-title">
			{#if hasProject && ongohome}
				<button
					type="button"
					class="home-btn"
					onclick={ongohome}
					title={i18nStore.t('header.home')}
					aria-label="{i18nStore.t('title')}, {i18nStore.t('header.home')}"
				>
					{i18nStore.t('title')}
				</button>
			{:else}
				{i18nStore.t('title')}
			{/if}
		</div>
		{#if projectStore.projectName}
			<span class="header-project">{projectStore.projectName}</span>
		{:else}
			<span class="header-subtitle">{i18nStore.t('subtitle')}</span>
		{/if}
	</div>
	<div class="header-right">
		{#if hasProject}
			<button
				class="header-btn text-btn"
				onclick={onnewproject}
				title={i18nStore.t('newProject.title')}
			>
				<svg
					aria-hidden="true"
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
				<span class="btn-label">{i18nStore.t('header.newLabel')}</span>
			</button>
		{/if}
		{#if hasProject}
			<button
				class="analyze-btn"
				data-tour-step="2"
				onclick={() => onanalyze?.()}
				disabled={isParsing}
				title={i18nStore.t('header.analyzeTitle')}
				aria-label={i18nStore.t('header.analyzeTitle')}
			>
				{#if isParsing}
					<span aria-hidden="true" class="material-symbols-outlined analyze-spinner"
						>progress_activity</span
					>
					{projectStore.parsingProgress.done}/{projectStore.parsingProgress.total}
				{:else}
					<svg
						aria-hidden="true"
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
					<span class="analyze-label">{i18nStore.t('header.analyze')}</span>
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
				<span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;"
					>share</span
				>
				<span class="btn-label">{i18nStore.t('share.button')}</span>
			</button>
		{/if}
		<div class="header-divider"></div>
		<!-- Saves an explicit choice, so the browser language no longer applies -->
		<button
			class="header-btn lang-toggle"
			onclick={() => (settingsStore.language = i18nStore.locale === 'ko' ? 'en' : 'ko')}
			title={i18nStore.t('header.languageToggle')}
			aria-label={i18nStore.t('header.languageToggle')}
		>
			{i18nStore.locale === 'ko' ? 'EN' : '\uD55C'}
		</button>
		<button
			class="header-btn"
			onclick={() => themeStore.toggle()}
			title="{i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')} (Ctrl+Shift+D)"
			aria-label={i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')}
		>
			{themeStore.current === 'dark' ? '\u2600' : '\u263D'}
		</button>
		<a
			class="header-btn header-link"
			href={resolve('/explore')}
			title={i18nStore.t('header.gallery')}
			aria-label={i18nStore.t('header.gallery')}
		>
			<span aria-hidden="true" class="material-symbols-outlined" style="font-size:18px;"
				>photo_library</span
			>
		</a>
		<a
			class="header-btn header-link"
			href={resolve(`/docs/${i18nStore.locale}/getting-started`)}
			title={i18nStore.t('docs.headerLink')}
			aria-label={i18nStore.t('docs.headerLink')}
		>
			<span aria-hidden="true" class="material-symbols-outlined" style="font-size:18px;"
				>menu_book</span
			>
		</a>
		<button
			class="header-btn"
			onclick={onhelp}
			title="{i18nStore.t('shortcuts.showHelp')} (?)"
			aria-label={i18nStore.t('shortcuts.showHelp')}
		>
			<span aria-hidden="true" class="material-symbols-outlined" style="font-size:18px;"
				>help_outline</span
			>
		</button>
		<button
			class="header-btn"
			data-tour-step="3"
			onclick={onsettings}
			title={i18nStore.t('settings')}
			aria-label={i18nStore.t('settings')}
		>
			<svg
				aria-hidden="true"
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
				title={i18nStore.t('header.trackBadgeTitle', { track: trackInfo.label })}
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
		padding: 0 var(--spacing-4);
		width: 100%;
		background: var(--color-background-sidebar-icon);
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	@media (max-width: 768px) {
		.header {
			padding-top: env(safe-area-inset-top);
			padding-left: max(var(--spacing-4), env(safe-area-inset-left));
			padding-right: max(var(--spacing-4), env(safe-area-inset-right));
			height: calc(var(--header-height) + env(safe-area-inset-top));
		}
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-8);
	}

	.header-title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
		font-family: var(--font-display);
	}

	.home-btn {
		font: inherit;
		color: inherit;
		border-radius: var(--radius-inner);
	}

	@media (hover: hover) {
		.home-btn:hover {
			text-decoration: underline;
			text-underline-offset: 4px;
		}
	}

	.header-subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.header-project {
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		font-weight: var(--font-weight-medium);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-4);
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-1);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-secondary);
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.header-btn :global(svg) {
		width: 18px;
		height: 18px;
	}

	@media (hover: hover) {
		.header-btn:hover {
			background: var(--color-background-muted);
			color: var(--color-text-primary);
		}
	}

	.header-link {
		text-decoration: none;
	}

	.header-btn.text-btn {
		width: auto;
		padding: var(--spacing-1) var(--spacing-3);
		gap: var(--spacing-1-5);
		background: var(--color-background-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		color: var(--color-accent);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
	}

	@media (hover: hover) {
		.header-btn.text-btn:hover {
			background: var(--color-background-muted);
		}
	}

	.btn-label {
		font-size: var(--font-size-sm);
	}

	.analyze-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1) var(--spacing-3);
		background: var(--color-accent);
		color: var(--color-on-accent);
		border: none;
		border-radius: var(--radius-inner);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		transition: opacity var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.analyze-btn:hover:not(:disabled) {
			opacity: 0.85;
		}
	}

	.analyze-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.share-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1) var(--spacing-3);
		background: var(--color-background-muted);
		color: var(--color-accent);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		transition:
			opacity var(--duration-fast) var(--ease-standard),
			background var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.share-btn:hover:not(:disabled) {
			background: var(--color-background-surface);
		}
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
		gap: var(--spacing-1-5);
		padding: var(--spacing-0-5) var(--spacing-2);
		margin-left: var(--spacing-1);
		border-radius: var(--radius-full);
		background: var(--color-accent-muted);
		border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.track-badge:hover {
			background: color-mix(in srgb, var(--color-accent) 15%, transparent);
		}
	}

	.track-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-accent);
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
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
	}

	.header-divider {
		width: 0;
		height: 100%;
		border-left: 1px solid var(--color-border);
		margin-left: var(--spacing-2);
		padding-left: var(--spacing-4);
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

		.header-right {
			gap: var(--spacing-1);
		}

		.header-btn {
			min-width: 32px;
			min-height: 32px;
		}
	}

	/* Phones: every header control must fit at 320px, with or without a project.
	   Language lives in Settings; the gallery and docs links are on the landing page. */
	@media (max-width: 430px) {
		.lang-toggle,
		.header-divider,
		.header-project,
		.header-link,
		.analyze-label {
			display: none;
		}

		.header {
			padding-left: max(var(--spacing-3), env(safe-area-inset-left));
			padding-right: max(var(--spacing-3), env(safe-area-inset-right));
		}

		.header-btn,
		.analyze-btn,
		.share-btn {
			min-width: 28px;
			min-height: 28px;
		}

		.analyze-btn {
			padding: var(--spacing-1) var(--spacing-2);
		}
	}
</style>
