<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import { readMapFile, toViewerLevels } from '$lib/services/mapViewer';
	import { MAX_MAP_BYTES, type ParseResult, type RopemanMap } from '$lib/types/ropemanMap';

	type Failure = Extract<ParseResult<RopemanMap>, { ok: false }>;

	let fileInput: HTMLInputElement | undefined = $state(undefined);
	let reading = $state(false);
	let dragOver = $state(false);
	let failure = $state<{ name: string; text: string } | null>(null);
	let opened = $state<{ projectName: string; fileName: string } | null>(null);

	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null && !semanticStore.panelDismissed
	);

	function failureText(f: Failure): string {
		switch (f.code) {
			case 'too-large':
				return i18nStore.t('openMap.tooLarge', { limit: MAX_MAP_BYTES / (1024 * 1024) });
			case 'not-json':
				return i18nStore.t('openMap.notJson');
			case 'not-a-map':
				return i18nStore.t('openMap.notAMap');
			case 'newer-version':
				return i18nStore.t('openMap.newerVersion', { version: f.version });
			case 'unsupported-version':
				return i18nStore.t('openMap.unsupportedVersion', { version: f.version });
			case 'invalid':
				return i18nStore.t('openMap.invalid', { field: f.at ?? '-' });
		}
	}

	function showMap(map: RopemanMap, fileName: string) {
		semanticStore.clear();
		// Nodes the file did not expand show the "not in this snapshot" prompt instead of calling AI
		semanticStore.readOnlyMode = 'snapshot';
		const levels = toViewerLevels(map);
		for (const [key, level] of levels) semanticStore.setCachedLevel(key, level);
		semanticStore.currentLevel = levels.get('__root__') ?? null;
		projectStore.projectName = map.project.name;
		opened = { projectName: map.project.name, fileName };
	}

	async function openFile(file: File | undefined) {
		if (!file) return;
		reading = true;
		failure = null;
		try {
			const result = await readMapFile(file);
			if (result.ok) showMap(result.value, file.name);
			else failure = { name: file.name, text: failureText(result) };
		} catch {
			failure = { name: file.name, text: i18nStore.t('openMap.readFailed') };
		} finally {
			reading = false;
		}
	}

	function choose() {
		fileInput?.click();
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		openFile(input.files?.[0]);
		// The same file chosen again after a fix must fire `change` again
		input.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		openFile(e.dataTransfer?.files[0]);
	}

	onDestroy(() => {
		semanticStore.clear();
		projectStore.projectName = '';
	});
</script>

<svelte:head>
	<title>{opened?.projectName ?? i18nStore.t('openMap.pageTitle')} | Ropeman</title>
</svelte:head>

<input
	bind:this={fileInput}
	type="file"
	accept=".json,application/json"
	class="visually-hidden"
	data-testid="open-map-input"
	tabindex="-1"
	aria-hidden="true"
	onchange={handleInput}
/>

<div class="open-page" data-theme={themeStore.current}>
	<header class="open-header">
		<a href={resolve('/')} class="open-logo">Ropeman</a>
		{#if opened}
			<span class="open-project-name">{opened.projectName}</span>
			<span class="open-badge">{i18nStore.t('openMap.badge')}</span>
			<div class="open-header-actions">
				<button class="open-cta secondary" onclick={choose}>
					<span aria-hidden="true" class="material-symbols-outlined">upload_file</span>
					{i18nStore.t('openMap.chooseAnother')}
				</button>
			</div>
		{/if}
	</header>

	<div class="open-content">
		{#if opened && !reading && !failure}
			<div class="open-breadcrumb">
				<Breadcrumb />
			</div>
			<div class="open-canvas-area">
				<ZUICanvas />
			</div>
			{#if hasSemanticSelection}
				<div class="open-detail-panel">
					<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
				</div>
			{/if}
		{:else}
			<section
				class="open-picker"
				class:dragover={dragOver}
				aria-labelledby="open-map-title"
				ondragover={(e) => {
					e.preventDefault();
					dragOver = true;
				}}
				ondragleave={() => (dragOver = false)}
				ondrop={handleDrop}
			>
				{#if reading}
					<div class="loading-ring" aria-hidden="true"></div>
					<p role="status">{i18nStore.t('openMap.loading')}</p>
				{:else if failure}
					<span aria-hidden="true" class="material-symbols-outlined open-icon error">error</span>
					<h1 id="open-map-title">{i18nStore.t('openMap.errorTitle')}</h1>
					<p class="open-file-name">{failure.name}</p>
					<p class="open-error" role="alert">{failure.text}</p>
					<p>{i18nStore.t('openMap.errorRecover')}</p>
					<button class="open-cta" onclick={choose}>
						<span aria-hidden="true" class="material-symbols-outlined">upload_file</span>
						{i18nStore.t('openMap.chooseAnother')}
					</button>
				{:else}
					<span aria-hidden="true" class="material-symbols-outlined open-icon">map</span>
					<h1 id="open-map-title">{i18nStore.t('openMap.title')}</h1>
					<p>{i18nStore.t('openMap.desc')}</p>
					<button class="open-cta" onclick={choose}>
						<span aria-hidden="true" class="material-symbols-outlined">upload_file</span>
						{i18nStore.t('openMap.choose')}
					</button>
					<p class="open-drop-hint">{i18nStore.t('openMap.dropHint')}</p>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.open-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--color-background-body);
		color: var(--color-text-primary);
	}

	.open-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		height: var(--header-height);
		padding: 0 var(--spacing-4);
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
		min-width: 0;
	}

	.open-logo {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
		text-decoration: none;
	}

	.open-project-name {
		font-family: var(--font-code);
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.open-badge {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	.open-header-actions {
		margin-left: auto;
	}

	.open-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1-5) var(--spacing-3);
		background: var(--color-accent);
		color: var(--color-on-accent);
		border: none;
		border-radius: var(--radius-element);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		white-space: nowrap;
		transition: opacity var(--duration-fast) var(--ease-standard);
	}

	.open-cta:hover {
		opacity: 0.85;
	}

	.open-cta.secondary {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.open-cta .material-symbols-outlined {
		font-size: 16px;
	}

	.open-content {
		flex: 1;
		display: flex;
		position: relative;
		overflow: hidden;
	}

	.open-breadcrumb {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		padding: var(--spacing-2) var(--spacing-4);
	}

	.open-canvas-area {
		--canvas-toolbar-top: 56px;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.open-detail-panel {
		position: relative;
		z-index: 11;
		width: 320px;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.open-picker {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-3);
		margin: var(--spacing-6);
		padding: var(--spacing-6) var(--spacing-4);
		text-align: center;
		color: var(--color-text-secondary);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-container);
	}

	.open-picker.dragover {
		border-color: var(--color-accent);
		background: var(--color-accent-muted);
	}

	.open-picker h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		color: var(--color-text-primary);
	}

	.open-picker p {
		max-width: 440px;
		font-size: var(--font-size-base);
		line-height: 1.6;
	}

	.open-icon {
		font-size: 48px;
		color: var(--color-text-tertiary);
	}

	.open-icon.error {
		color: var(--color-error, var(--color-text-tertiary));
	}

	.open-file-name {
		font-family: var(--font-code);
		overflow-wrap: anywhere;
	}

	.open-error {
		color: var(--color-text-primary);
		overflow-wrap: anywhere;
	}

	.open-drop-hint {
		font-size: var(--font-size-sm);
	}

	.loading-ring {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 2px solid var(--color-accent-muted);
		border-top-color: var(--color-accent);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.open-picker {
			margin: var(--spacing-4);
		}

		.open-detail-panel {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 55dvh;
			z-index: 30;
			border-left: none;
			border-top: 1px solid var(--color-border);
			border-radius: var(--radius-container) var(--radius-container) 0 0;
			box-shadow: 0 -8px 24px var(--color-shadow);
			padding-bottom: env(safe-area-inset-bottom);
		}
	}
</style>
