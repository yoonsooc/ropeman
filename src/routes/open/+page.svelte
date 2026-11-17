<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import SnapshotViewer from '$lib/components/SnapshotViewer.svelte';
	import { readMapFile, toViewerLevels } from '$lib/services/mapViewer';
	import { openDirectory } from '$lib/services/fileSystemService';
	import {
		checkFolder,
		folderMatches,
		readFolderFile,
		type FolderMatch
	} from '$lib/services/folderSource';
	import { toSourceRead, type SourceRead } from '$lib/services/sourceFile';
	import { MAX_MAP_BYTES, type ParseResult, type RopemanMap } from '$lib/types/ropemanMap';

	type Failure = Extract<ParseResult<RopemanMap>, { ok: false }>;

	type Folder =
		| { state: 'unsupported' }
		| { state: 'none' }
		| { state: 'checking'; dir: FileSystemDirectoryHandle }
		| { state: 'failed'; error: string }
		| { state: 'mismatch'; name: string; match: FolderMatch }
		| { state: 'connected'; name: string; dir: FileSystemDirectoryHandle };

	let fileInput: HTMLInputElement | undefined = $state(undefined);
	let reading = $state(false);
	let dragOver = $state(false);
	let failure = $state<{ name: string; text: string } | null>(null);
	let opened = $state<{ projectName: string; fileName: string } | null>(null);

	const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
	const noFolder = (): Folder => (canPickFolder ? { state: 'none' } : { state: 'unsupported' });
	let folder = $state.raw<Folder>(noFolder());
	let folderRevision = $state(0);
	let mapFiles: string[] = [];

	function settleFolder(next: Folder) {
		folder = next;
		folderRevision++;
	}

	async function connectFolder() {
		let dir: FileSystemDirectoryHandle;
		try {
			dir = await openDirectory();
		} catch (err) {
			if ((err as { name?: unknown } | null)?.name === 'AbortError') return;
			settleFolder({ state: 'failed', error: err instanceof Error ? err.message : String(err) });
			return;
		}
		folder = { state: 'checking', dir };
		const match = await checkFolder(dir, mapFiles);
		if (folder.state !== 'checking' || folder.dir !== dir) return;
		settleFolder(
			folderMatches(match)
				? { state: 'connected', name: dir.name, dir }
				: { state: 'mismatch', name: dir.name, match }
		);
	}

	async function readSource(path: string): Promise<SourceRead> {
		const t = i18nStore.t;
		switch (folder.state) {
			case 'unsupported':
				return { ok: false, message: t('openMap.folderUnsupported') };
			case 'none':
			case 'checking':
				return { ok: false, message: t('openMap.folderNeeded') };
			case 'failed':
				return { ok: false, message: t('openMap.folderFailed', { error: folder.error }) };
			case 'mismatch':
				return {
					ok: false,
					message: t('openMap.folderMismatch', {
						folder: folder.name,
						found: folder.match.found,
						checked: folder.match.checked,
						example: folder.match.expectedPath ?? ''
					})
				};
			case 'connected':
				return toSourceRead(await readFolderFile(folder.dir, path), 'folder');
		}
	}

	const fileAction = $derived.by(() => {
		switch (folder.state) {
			case 'none':
			case 'failed':
				return { label: i18nStore.t('openMap.connectFolder'), onclick: connectFolder };
			case 'mismatch':
				return { label: i18nStore.t('openMap.changeFolder'), onclick: connectFolder };
			case 'connected':
				return { label: i18nStore.t('openMap.changeFolder'), onclick: connectFolder, quiet: true };
			default:
				return null;
		}
	});

	const fileNote = $derived(
		folder.state === 'checking'
			? i18nStore.t('openMap.folderChecking')
			: folder.state === 'connected'
				? i18nStore.t('openMap.folderReading', { folder: folder.name })
				: null
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
		mapFiles = map.levels.flatMap((level) => level.nodes.flatMap((node) => node.filePaths));
		settleFolder(noFolder());
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
		<a href={resolve('')} class="open-logo"><Wordmark /></a>
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
			<SnapshotViewer read={readSource} revision={folderRevision} {fileAction} {fileNote} />
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
		font-size: var(--font-size-lg);
		color: var(--color-text-primary);
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
		font-weight: var(--font-weight-medium);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-inner);
		background: var(--color-background-muted);
		color: var(--color-text-secondary);
	}

	.open-header-actions {
		margin-left: auto;
	}

	.open-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1-5) var(--spacing-3);
		background: var(--color-text-primary);
		color: var(--color-background-body);
		border: none;
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
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
	}
</style>
