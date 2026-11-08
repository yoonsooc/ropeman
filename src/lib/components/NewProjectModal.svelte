<script lang="ts">
	import { tick } from 'svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { parseGitHubUrl, type GitHubRepoInfo } from '$lib/utils/githubUrl';
	import { githubLoadErrorKey } from '$lib/services/githubLoader';

	let {
		open,
		canOpenFolder,
		onopenfolder,
		onloadgithub,
		onclose
	}: {
		open: boolean;
		/** False on phones and tablets, where folder access is not offered (M4) */
		canOpenFolder: boolean;
		onopenfolder: () => void;
		/** Resolves when the repository is accepted; rejects with a GitHubLoadError otherwise */
		onloadgithub: (info: GitHubRepoInfo) => Promise<void>;
		onclose: () => void;
	} = $props();

	let url = $state('');
	let error = $state('');
	let loading = $state(false);
	let inputEl: HTMLInputElement | undefined = $state(undefined);

	let prevOpen = false;
	$effect(() => {
		if (open && !prevOpen) {
			url = '';
			error = '';
			loading = false;
			tick().then(() => inputEl?.focus());
		}
		prevOpen = open;
	});

	function handleOpenFolder() {
		onclose();
		onopenfolder();
	}

	async function handleLoad() {
		error = '';
		const parsed = parseGitHubUrl(url);
		if (!parsed) {
			error = i18nStore.t('landing.githubInvalidUrl');
			return;
		}
		loading = true;
		try {
			await onloadgithub(parsed);
		} catch (err) {
			error = i18nStore.t(githubLoadErrorKey((err as { status?: number })?.status));
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !loading) onclose();
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleLoad();
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('newproject-backdrop') && !loading) {
			onclose();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop newproject-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div
			class="modal-card newproject-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="newproject-title"
		>
			<div class="newproject-header">
				<h2 id="newproject-title" class="newproject-title">{i18nStore.t('newProject.title')}</h2>
				<button
					class="modal-close"
					onclick={onclose}
					disabled={loading}
					aria-label={i18nStore.t('newProject.cancel')}
				>
					<span class="material-symbols-outlined">close</span>
				</button>
			</div>

			{#if canOpenFolder}
				<button
					class="btn btn-secondary newproject-folder"
					onclick={handleOpenFolder}
					disabled={loading}
				>
					<span class="material-symbols-outlined">folder_open</span>
					{i18nStore.t('newProject.openFolder')}
				</button>
			{:else}
				<p class="newproject-hint">
					<span class="material-symbols-outlined">info</span>
					{i18nStore.t('landing.mobileFolderHint')}
				</p>
			{/if}

			<label class="newproject-label" for="newproject-github">
				{i18nStore.t('newProject.githubLabel')}
			</label>
			<div class="newproject-row">
				<input
					id="newproject-github"
					class="input newproject-input"
					type="text"
					placeholder={i18nStore.t('landing.githubPlaceholder')}
					bind:value={url}
					bind:this={inputEl}
					onkeydown={handleInputKeydown}
					disabled={loading}
				/>
				<button
					class="btn btn-primary newproject-load"
					onclick={handleLoad}
					disabled={loading || !url.trim()}
				>
					{#if loading}
						<span class="material-symbols-outlined newproject-spinner">progress_activity</span>
					{:else}
						{i18nStore.t('landing.githubLoad')}
					{/if}
				</button>
			</div>
			{#if error}
				<p class="newproject-error" role="alert">{error}</p>
			{/if}
			<p class="newproject-note">{i18nStore.t('newProject.replaceNote')}</p>
		</div>
	</div>
{/if}

<style>
	.newproject-backdrop {
		z-index: 1100;
	}
	.newproject-card {
		width: 400px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.newproject-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.newproject-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.newproject-folder {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
	}
	.newproject-folder .material-symbols-outlined {
		font-size: 18px;
	}
	.newproject-hint {
		display: flex;
		gap: 6px;
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-secondary);
	}
	.newproject-hint .material-symbols-outlined {
		font-size: 16px;
	}
	.newproject-label {
		margin-top: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}
	.newproject-row {
		display: flex;
		gap: 8px;
	}
	.newproject-input {
		flex: 1;
		min-width: 0;
	}
	.newproject-load {
		min-width: 72px;
	}
	.newproject-spinner {
		font-size: 16px;
		animation: newproject-spin 1s linear infinite;
	}
	@keyframes newproject-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.newproject-error {
		margin: 0;
		font-size: 12px;
		color: var(--color-error);
	}
	.newproject-note {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted);
	}
	@media (prefers-reduced-motion: reduce) {
		.newproject-spinner {
			animation: none;
		}
	}
</style>
