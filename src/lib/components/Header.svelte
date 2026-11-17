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
	import Wordmark from '$lib/components/Wordmark.svelte';
	import type { Component } from 'svelte';
	import { siteLink, type Surface } from './surface';

	let {
		surface = 'app',
		status: Status,
		onsettings,
		onhelp,
		onnewproject,
		onconnect,
		onanalyze,
		onshare,
		ongohome
	}: {
		surface?: Surface;
		/** The Bridge viewer's connection controls, in place of the app's project actions */
		status?: Component;
		onsettings?: () => void;
		onhelp?: () => void;
		onnewproject?: () => void;
		onconnect?: () => void;
		onanalyze?: () => void;
		onshare?: () => void;
		ongohome?: () => void;
	} = $props();

	const canShare = $derived(semanticStore.currentLevel !== null);

	// The Bridge viewer fills projectStore from serve's map, but the app's project actions
	// (new project, AI analysis, share, AI track) and its search index do not apply there
	const isApp = $derived(surface === 'app');
	const hasProject = $derived(isApp && projectStore.fileTree !== null);
	const home = $derived(siteLink(surface, resolve('')));
	const gallery = $derived(siteLink(surface, resolve('explore')));
	const docs = $derived(siteLink(surface, resolve(`docs/${i18nStore.locale}/getting-started`)));
	const isParsing = $derived(
		projectStore.parsingProgress.total > 0 &&
			projectStore.parsingProgress.done < projectStore.parsingProgress.total
	);

	const trackInfo = $derived.by(() => {
		const track = authStore.activeTrack;
		switch (track) {
			case 'edge':
				return { label: i18nStore.t('track.edge'), color: 'var(--track-demo)' };
			case 'webgpu':
				return { label: i18nStore.t('track.webgpu'), color: 'var(--track-webgpu)' };
			case 'byok':
				return { label: i18nStore.t('track.byok'), color: 'var(--track-byok)' };
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
					<Wordmark />
				</button>
			{:else if isApp}
				<Wordmark />
			{:else}
				<a class="home-link" {...home}><Wordmark /></a>
			{/if}
		</div>
		{#if projectStore.projectName}
			<span class="header-project" title={projectStore.projectName}>{projectStore.projectName}</span
			>
		{:else}
			<span class="header-subtitle">{i18nStore.t('subtitle')}</span>
		{/if}
	</div>
	<div class="header-right">
		{#if Status}
			<Status />
		{/if}
		{#if hasProject}
			<button
				class="header-btn text-btn"
				onclick={onnewproject}
				title={i18nStore.t('newProject.title')}
			>
				<span aria-hidden="true" class="material-symbols-outlined">create_new_folder</span>
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
					<span class="analyze-count"
						>{projectStore.parsingProgress.done}/{projectStore.parsingProgress.total}</span
					>
				{:else}
					<span aria-hidden="true" class="material-symbols-outlined">account_tree</span>
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
				<span aria-hidden="true" class="material-symbols-outlined">share</span>
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
			<span aria-hidden="true" class="material-symbols-outlined">translate</span>
		</button>
		<button
			class="header-btn theme-toggle"
			onclick={() => themeStore.toggle()}
			title="{i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')} (Ctrl+Shift+D)"
			aria-label={i18nStore.t(themeStore.current === 'dark' ? 'lightMode' : 'darkMode')}
		>
			<span aria-hidden="true" class="material-symbols-outlined"
				>{themeStore.current === 'dark' ? 'light_mode' : 'dark_mode'}</span
			>
		</button>
		<a
			class="header-btn header-link"
			{...gallery}
			title={i18nStore.t('header.gallery')}
			aria-label={i18nStore.t('header.gallery')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">photo_library</span>
		</a>
		<a
			class="header-btn header-link"
			{...docs}
			title={i18nStore.t('docs.headerLink')}
			aria-label={i18nStore.t('docs.headerLink')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">menu_book</span>
		</a>
		<button
			class="header-btn"
			onclick={onhelp}
			title="{i18nStore.t('shortcuts.showHelp')} (?)"
			aria-label={i18nStore.t('shortcuts.showHelp')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">help_outline</span>
		</button>
		<button
			class="header-btn"
			data-tour-step="3"
			onclick={onsettings}
			title={i18nStore.t('settings')}
			aria-label={i18nStore.t('settings')}
		>
			<span aria-hidden="true" class="material-symbols-outlined">settings</span>
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

{#if isApp}
	<SearchBar />
{/if}

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
		min-width: 0;
	}

	.header-title {
		font-size: var(--font-size-lg);
		color: var(--color-text-primary);
	}

	.home-btn,
	.home-link {
		font: inherit;
		color: inherit;
		border-radius: var(--radius-inner);
		text-decoration: none;
	}

	@media (hover: hover) {
		.home-btn:hover,
		.home-link:hover {
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
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-4);
		flex-shrink: 0;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-1);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.header-btn .material-symbols-outlined {
		font-size: 18px;
	}

	.analyze-btn .material-symbols-outlined,
	.share-btn .material-symbols-outlined,
	.text-btn .material-symbols-outlined {
		font-size: 16px;
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
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		color: var(--color-text-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
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
		/* The one filled button in the header, in the text color rather than the accent */
		background: var(--color-text-primary);
		color: var(--color-background-body);
		border: none;
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
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
		background: var(--color-background-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			opacity var(--duration-fast) var(--ease-standard),
			background var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.share-btn:hover:not(:disabled) {
			background: var(--color-background-muted);
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
		border-radius: var(--radius-inner);
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.track-badge:hover {
			background: var(--color-background-muted);
		}
	}

	.track-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--track-color);
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
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
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
	   The gallery and docs links are on the landing page. */
	@media (max-width: 430px) {
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

		.header-right {
			gap: var(--spacing-0-5);
		}

		/* Seven 28px squares and the title fit 320px */
		.header-btn,
		.header-btn.text-btn,
		.analyze-btn,
		.share-btn {
			width: 28px;
			min-width: 28px;
			height: 28px;
			padding: 0;
			justify-content: center;
		}

		/* The spinner says it is parsing; the count would push the buttons over the title */
		.analyze-count {
			display: none;
		}
	}
</style>
