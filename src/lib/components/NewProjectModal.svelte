<script lang="ts">
	import { tick } from 'svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { focusTrap } from '$lib/utils/focusTrap';
	import { parseGitHubUrl, githubLoadErrorKey, type GitHubRepoInfo } from '$lib/utils/githubUrl';

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

	// Non-reactive: the open edge
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
		// The input was disabled while loading, which dropped focus to <body>
		if (open) {
			await tick();
			inputEl?.focus();
		}
	}

	// On the window, not the backdrop: focus can sit on <body> after a disabled control
	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && !loading) onclose();
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

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="modal-backdrop newproject-backdrop" onclick={handleBackdropClick}>
		<div
			class="modal-card newproject-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="newproject-title"
			tabindex="-1"
			use:focusTrap
		>
			<div class="newproject-header">
				<h2 id="newproject-title" class="newproject-title">{i18nStore.t('newProject.title')}</h2>
				<button
					class="modal-close"
					onclick={onclose}
					disabled={loading}
					aria-label={i18nStore.t('newProject.cancel')}
				>
					<span class="material-symbols-outlined" aria-hidden="true">close</span>
				</button>
			</div>

			{#if canOpenFolder}
				<button
					class="btn btn-secondary newproject-folder"
					onclick={handleOpenFolder}
					disabled={loading}
				>
					<span class="material-symbols-outlined" aria-hidden="true">folder_open</span>
					{i18nStore.t('newProject.openFolder')}
				</button>
			{:else}
				<p class="newproject-hint">
					<span class="material-symbols-outlined" aria-hidden="true">info</span>
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
					aria-busy={loading}
					aria-label={i18nStore.t('landing.githubLoad')}
				>
					{#if loading}
						<span class="material-symbols-outlined newproject-spinner" aria-hidden="true"
							>progress_activity</span
						>
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
		padding: var(--spacing-5);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}
	.newproject-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.newproject-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.newproject-folder {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-2);
		width: 100%;
	}
	.newproject-folder .material-symbols-outlined {
		font-size: 18px;
	}
	.newproject-hint {
		display: flex;
		gap: var(--spacing-1-5);
		margin: 0;
		font-size: var(--font-size-sm);
		line-height: 1.5;
		color: var(--color-text-secondary);
	}
	.newproject-hint .material-symbols-outlined {
		font-size: 16px;
	}
	.newproject-label {
		margin-top: var(--spacing-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}
	.newproject-row {
		display: flex;
		gap: var(--spacing-2);
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
		font-size: var(--font-size-sm);
		color: var(--color-text-error);
	}
	.newproject-note {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}
	@media (prefers-reduced-motion: reduce) {
		.newproject-spinner {
			animation: none;
		}
	}
</style>
