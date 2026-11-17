<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { codeMapStore } from '$lib/stores/codeMapStore.svelte';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import {
		openDirectory,
		readDirectoryRecursive,
		handleFallbackInput
	} from '$lib/services/fileSystemService';
	import { parseAllFiles } from '$lib/services/parserService';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { createPathFilter } from '$lib/utils/filePriority';
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { parseGitHubUrl, githubLoadErrorKey } from '$lib/utils/githubUrl';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import AgentSetup from '$lib/components/AgentSetup.svelte';

	const breakpoint = useBreakpoint();
	// M4: File System Access API + directory drag are desktop-only. On phones
	// and tablets we redirect users to the GitHub URL path.
	const isCompact = $derived(breakpoint.isMobile || breakpoint.isTablet);

	let { oncancel, onload }: { oncancel?: () => void; onload?: () => void } = $props();

	// The landing page honors the same exclude and include settings as New
	function currentPathFilter() {
		return createPathFilter(settingsStore.customSkipPatterns, settingsStore.customIncludePatterns);
	}

	let isDragOver = $state(false);
	let error = $state('');
	let fallbackInput = $state<HTMLInputElement>(null!);
	let githubUrl = $state('');
	let isLoadingGithub = $state(false);

	const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		error = '';

		try {
			const items = e.dataTransfer?.items;
			if (!items || items.length === 0) return;

			const item = items[0];

			// Try File System Access API (Chromium)
			if ('getAsFileSystemHandle' in item) {
				const handle = await (item as any).getAsFileSystemHandle();
				if (handle?.kind === 'directory') {
					await loadFromDirectoryHandle(handle as FileSystemDirectoryHandle);
					return;
				}
			}

			// Fallback: check for files via webkitGetAsEntry
			const entry = item.webkitGetAsEntry?.();
			if (entry?.isDirectory) {
				error = i18nStore.t('dropzone.needsChromium');
				return;
			}

			error = i18nStore.t('dropzone.folderOnly');
		} catch (err) {
			error = i18nStore.t('dropzone.readFailed', { error: String(err) });
		}
	}

	async function handleOpenDirectory() {
		error = '';

		if (supportsDirectoryPicker) {
			try {
				const dirHandle = await openDirectory();
				await loadFromDirectoryHandle(dirHandle);
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					error = i18nStore.t('dropzone.openFailed', { error: err.message });
				}
			}
		} else {
			// Trigger fallback file input
			fallbackInput?.click();
		}
	}

	function resetStores() {
		projectStore.reset();
		graphStore.clear();
		selectionStore.clear();
		semanticStore.clear();
	}

	async function handleFallbackFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		error = '';
		try {
			resetStores();
			const { tree, cut, configs } = await handleFallbackInput(input.files, currentPathFilter());
			projectStore.projectName = tree.name;
			projectStore.fileTree = tree;
			projectStore.cutFiles = cut;
			projectStore.isLoading = true;
			const { astMap, refs, skipped } = await parseAllFiles(tree, (progress) => {
				projectStore.parsingProgress = progress;
			});
			projectStore.astMap = astMap;
			projectStore.parseSkips = skipped;
			codeMapStore.build({ astMap, root: null, refs, configs });
			projectStore.isLoading = false;
		} catch (err) {
			error = i18nStore.t('dropzone.processFailed', { error: String(err) });
			projectStore.isLoading = false;
		}
	}

	async function handleGitHubLoad() {
		error = '';
		const parsed = parseGitHubUrl(githubUrl);
		if (!parsed) {
			error = i18nStore.t('landing.githubInvalidUrl');
			return;
		}

		isLoadingGithub = true;
		error = '';

		try {
			resetStores();
			projectStore.projectName = parsed.repo;
			const { loadGitHubRepo } = await import('$lib/services/githubLoader');
			const { cut } = await loadGitHubRepo(parsed);
			projectStore.cutFiles = cut;
			onload?.();
		} catch (err: any) {
			resetStores();
			error = i18nStore.t(githubLoadErrorKey(err?.status));
		} finally {
			isLoadingGithub = false;
		}
	}

	function handleGitHubKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleGitHubLoad();
		}
	}

	async function loadFromDirectoryHandle(dirHandle: FileSystemDirectoryHandle) {
		resetStores();
		projectStore.isLoading = true;
		projectStore.projectName = dirHandle.name;
		onload?.();

		const { tree, cut, configs } = await readDirectoryRecursive(dirHandle, '', currentPathFilter());
		projectStore.fileTree = tree;
		projectStore.cutFiles = cut;

		const { astMap, refs, skipped } = await parseAllFiles(tree, (progress) => {
			projectStore.parsingProgress = progress;
		});
		projectStore.astMap = astMap;
		projectStore.parseSkips = skipped;
		codeMapStore.build({ astMap, root: null, refs, configs });
		projectStore.isLoading = false;
	}
</script>

<div
	class="dropzone"
	class:dragover={isDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label={i18nStore.t('landing.dropRegion')}
>
	{#if oncancel}
		<button class="dropzone-close" onclick={oncancel} title={i18nStore.t('common.cancel')}>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	{/if}
	<div class="dropzone-content">
		{#if projectStore.isLoading}
			<div class="loading-state">
				<div class="loading-card">
					<div class="loading-spinner-container">
						<div class="loading-ring"></div>
						<span aria-hidden="true" class="material-symbols-outlined loading-icon">refresh</span>
					</div>
					<div class="loading-text">
						<h2>{i18nStore.t('landing.loadingTitle')}</h2>
						{#if projectStore.parsingProgress.total > 0}
							<p class="progress">
								{i18nStore.t('landing.parsingLabel')}
								<span class="progress-count"
									>{projectStore.parsingProgress.done}/{projectStore.parsingProgress.total}</span
								>
							</p>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="landing" class:mobile={isCompact}>
				<header class="landing-head pane">
					<h1>
						{i18nStore.t('landing.headlineLead')}
						<span class="headline-accent">{i18nStore.t('landing.headlineAccent')}</span>
					</h1>
					<p class="hero-sub">{i18nStore.t('landing.subheadline')}</p>
				</header>

				<section class="landing-stage" aria-labelledby="landing-example-title">
					<div class="stage-bar">
						<h2 id="landing-example-title">{i18nStore.t('landing.navExample')}</h2>
						<span class="stage-path">huggingface/transformers</span>
						<a class="stage-link" href={resolve('explore')} data-tour-step="explore"
							>{i18nStore.t('landing.exampleCta')}</a
						>
					</div>
					<figure class="hero-visual">
						<a
							class="hero-shot"
							href={resolve('explore/transformers')}
							aria-label={i18nStore.t('landing.heroShotLink')}
						>
							<!-- One image per language and theme, picked in CSS from <html lang> and the theme,
							     because hydration keeps the prerendered src. Hidden lazy images never load. -->
							{#each ['en', 'ko'] as locale (locale)}
								{#each ['dark', 'light'] as theme (theme)}
									<img
										class="shot-{locale} shot-{theme}"
										src="/landing/explore-transformers-{locale}-{theme}.webp"
										width="2200"
										height="1360"
										alt={i18nStore.t('landing.heroShotAlt')}
										decoding="async"
										loading="lazy"
									/>
								{/each}
							{/each}
						</a>
						<figcaption>{i18nStore.t('landing.heroShotCaption')}</figcaption>
					</figure>
					<dl class="stage-facts">
						<div>
							<dt>{i18nStore.t('landing.featureMapTitle')}</dt>
							<dd>{i18nStore.t('landing.featureMapDesc')}</dd>
						</div>
						<div>
							<dt>{i18nStore.t('landing.featureVerifyTitle')}</dt>
							<dd>{i18nStore.t('landing.featureVerifyDesc')}</dd>
						</div>
						<div>
							<dt>{i18nStore.t('landing.featureDrillTitle')}</dt>
							<dd>{i18nStore.t('landing.featureDrillDesc')}</dd>
						</div>
					</dl>
				</section>

				<section class="landing-setup pane" id="agent-setup" aria-labelledby="landing-setup-title">
					<h2 id="landing-setup-title">{i18nStore.t('landing.setupTitle')}</h2>
					<AgentSetup />
				</section>

				<section class="landing-try pane" aria-labelledby="landing-try-title">
					<h2 id="landing-try-title">{i18nStore.t('landing.tryTitle')}</h2>
					<p class="try-body">{i18nStore.t('landing.tryBody')}</p>
					{#if !isCompact}
						<div class="try-actions">
							<button class="cta-btn" data-tour-step="1" onclick={handleOpenDirectory}>
								<span aria-hidden="true" class="material-symbols-outlined cta-icon"
									>folder_open</span
								>
								{i18nStore.t('landing.cta')}
							</button>
							<span class="drag-hint">{i18nStore.t('landing.dragHint')}</span>
						</div>
					{:else}
						<p class="mobile-folder-hint">{i18nStore.t('landing.mobileFolderHint')}</p>
					{/if}
					<div class="github-input-section">
						<label class="github-or" for="landing-github-url">
							{isCompact
								? i18nStore.t('landing.mobileGithubLead')
								: i18nStore.t('landing.githubOr')}
						</label>
						<div class="github-input-row">
							<input
								id="landing-github-url"
								type="url"
								inputmode="url"
								autocomplete="off"
								spellcheck="false"
								class="github-input"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? 'landing-github-error' : undefined}
								placeholder={i18nStore.t('landing.githubPlaceholder')}
								bind:value={githubUrl}
								onkeydown={handleGitHubKeydown}
								disabled={isLoadingGithub}
							/>
							<button
								class="github-load-btn"
								onclick={handleGitHubLoad}
								disabled={isLoadingGithub}
								aria-busy={isLoadingGithub}
							>
								{#if isLoadingGithub}
									<span aria-hidden="true" class="material-symbols-outlined github-spinner"
										>progress_activity</span
									>
								{/if}
								{i18nStore.t('landing.githubLoad')}
							</button>
						</div>
					</div>
					{#if error}
						<p class="error-msg" id="landing-github-error" role="alert">{error}</p>
					{/if}
					<a class="try-link" href={resolve('open')}>{i18nStore.t('landing.openMapCta')}</a>
				</section>

				<footer class="landing-footer pane">
					<span>&copy; 2026 Ropeman</span>
					<a href={resolve(`docs/${i18nStore.locale}/getting-started`)}
						>{i18nStore.t('docs.footerLink')}</a
					>
					<a href="https://github.com/yoonsooc/ropeman">GitHub</a>
					<span>{i18nStore.t('landing.specOpenSource')}</span>
					<a href="mailto:contact@ropeman.dev">contact@ropeman.dev</a>
				</footer>
			</div>
		{/if}
	</div>
</div>

<!-- Hidden fallback input for non-Chromium browsers -->
{#if !supportsDirectoryPicker}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<input
		bind:this={fallbackInput}
		type="file"
		webkitdirectory
		multiple
		hidden
		onchange={handleFallbackFiles}
	/>
{/if}

<style>
	.dropzone {
		flex: 1;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		position: relative;
		border: none;
		transition: background-color var(--duration-fast) var(--ease-standard);
		overflow-y: auto;
		overflow-x: hidden;
		background-color: var(--color-background-body);
	}

	.dropzone-close {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-element);
		color: var(--color-text-secondary);
		cursor: pointer;
		z-index: 1;
	}

	@media (hover: hover) {
		.dropzone-close:hover {
			background: var(--color-background-muted);
			color: var(--color-text-primary);
		}
	}

	/* Show the standard "copy" cursor ONLY while an actual drag is in progress,
	   so idle hover over body text behaves normally. */
	.dropzone.dragover {
		background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
		cursor: copy;
	}

	/* Landing layout: a working pane on the left, the product itself filling the right pane */
	.dropzone-content {
		width: 100%;
		color: var(--color-text-secondary);
	}

	.landing {
		display: grid;
		/* Wide enough that the skill command breaks only at its path separators */
		grid-template-columns: clamp(400px, 40vw, 600px) minmax(0, 1fr);
		grid-template-rows: auto auto auto 1fr;
		min-height: calc(100dvh - var(--header-height));
	}

	.pane {
		grid-column: 1;
		min-width: 0;
		padding: 0 var(--spacing-6);
	}

	.landing-stage {
		grid-column: 2;
		grid-row: 1 / -1;
		position: sticky;
		top: 0;
		align-self: start;
		display: flex;
		flex-direction: column;
		height: calc(100dvh - var(--header-height));
		overflow-y: auto;
		background: var(--color-background-canvas);
		border-left: 1px solid var(--color-border);
	}

	.landing-head {
		padding-top: var(--spacing-6);
		padding-bottom: var(--spacing-6);
		border-bottom: 1px solid var(--color-border);
	}

	.landing-head h1 {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: 1.4;
		color: var(--color-text-primary);
	}

	/* The second half of the headline reads as one sentence with the first */
	.headline-accent {
		color: inherit;
	}

	.hero-sub {
		margin-top: var(--spacing-2);
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.pane h2 {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		line-height: 1.4;
		color: var(--color-text-primary);
		margin-bottom: var(--spacing-4);
	}

	.landing-setup,
	.landing-try {
		padding-top: var(--spacing-5);
		padding-bottom: var(--spacing-6);
		border-bottom: 1px solid var(--color-border);
	}

	.stage-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		min-height: 40px;
		padding: 0 var(--spacing-4);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background-body);
		font-size: var(--font-size-sm);
	}

	.stage-bar h2 {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}

	.stage-path {
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stage-link {
		margin-left: auto;
		color: var(--color-accent);
		text-underline-offset: 3px;
		white-space: nowrap;
	}

	.hero-visual {
		margin: 0;
		padding: var(--spacing-4) var(--spacing-4) 0;
	}

	.hero-shot {
		display: block;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
	}

	.hero-shot img {
		display: block;
		width: 100%;
		height: auto;
	}

	:global([data-theme='light']) .hero-shot img.shot-dark,
	:global(:root:not([data-theme='light'])) .hero-shot img.shot-light,
	:global(:root[lang='ko']) .hero-shot img.shot-en,
	:global(:root:not([lang='ko'])) .hero-shot img.shot-ko {
		display: none;
	}

	@media (hover: hover) {
		.hero-shot:hover {
			border-color: var(--color-text-tertiary);
		}
	}

	.hero-visual figcaption {
		margin-top: var(--spacing-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.stage-facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--spacing-6);
		padding: var(--spacing-5) var(--spacing-4) var(--spacing-6);
	}

	.stage-facts dt {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		margin-bottom: var(--spacing-1);
	}

	.stage-facts dd {
		font-size: var(--font-size-sm);
		line-height: 1.55;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.try-link,
	.landing-footer a {
		color: var(--color-accent);
		text-underline-offset: 3px;
	}

	.try-body {
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.try-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-2) var(--spacing-3);
		margin-top: var(--spacing-4);
	}

	.cta-btn,
	.github-load-btn {
		-webkit-user-select: none;
		user-select: none;
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		height: 32px;
		padding: 0 var(--spacing-3);
		background: var(--color-background-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			border-color var(--duration-fast) var(--ease-standard);
	}

	@media (hover: hover) {
		.cta-btn:hover,
		.github-load-btn:hover:not(:disabled) {
			background: var(--color-background-muted);
		}
	}

	.cta-btn:not(:disabled):active {
		scale: 0.96;
	}

	.cta-icon {
		font-size: 16px;
	}

	.drag-hint,
	.github-or {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.mobile-folder-hint {
		margin-top: var(--spacing-3);
		font-size: var(--font-size-sm);
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	.github-input-section {
		margin-top: var(--spacing-4);
	}

	.github-or {
		display: block;
		margin-bottom: var(--spacing-1-5);
	}

	.github-input-row {
		display: flex;
		gap: var(--spacing-2);
	}

	.github-input {
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: 0 var(--spacing-3);
		background: var(--color-background-body);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
		color: var(--color-text-primary);
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
	}

	.github-input:focus {
		border-color: var(--color-accent);
	}

	.github-input:disabled,
	.github-load-btn:disabled {
		opacity: 0.5;
	}

	.github-input::placeholder {
		color: var(--color-text-tertiary);
	}

	.github-spinner {
		font-size: 16px;
		animation: spin 0.8s linear infinite;
	}

	.try-link {
		display: inline-block;
		margin-top: var(--spacing-4);
		font-size: var(--font-size-sm);
	}

	.landing-footer {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1) var(--spacing-4);
		padding-top: var(--spacing-4);
		padding-bottom: var(--spacing-6);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	@media (max-width: 1023px) {
		.landing {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: none;
		}

		.landing-stage {
			grid-column: 1;
			grid-row: auto;
			position: static;
			height: auto;
			overflow: visible;
			border-left: none;
			border-bottom: 1px solid var(--color-border);
		}

		.landing-head {
			order: 1;
		}

		.landing-stage {
			order: 2;
		}

		.landing-setup {
			order: 3;
		}

		.landing-try {
			order: 4;
		}

		.landing-footer {
			order: 5;
		}

		.stage-facts {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--spacing-4);
		}
	}

	@media (max-width: 720px) {
		/* A phone shows the left of the canvas at a size its text can be read */
		.hero-shot {
			aspect-ratio: 5 / 4;
		}

		.hero-shot img {
			width: 180%;
			max-width: none;
		}

		/* On a phone the hero paragraph already says how naming and drill-down work */
		.stage-facts > div:not(:first-child) {
			display: none;
		}

		.pane {
			padding-left: var(--spacing-4);
			padding-right: var(--spacing-4);
		}

		.landing-head {
			padding-top: var(--spacing-5);
		}
	}

	.error-msg {
		margin-top: var(--spacing-3);
		color: var(--color-text-error);
		font-size: var(--font-size-base);
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-4);
		text-align: center;
	}

	.loading-card {
		background: var(--color-background-surface);
		padding: var(--spacing-8) var(--spacing-10);
		border-radius: var(--radius-container);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-med);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-6);
	}

	.loading-spinner-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loading-ring {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: 2px solid var(--color-accent-muted);
		border-top-color: var(--color-accent);
		animation: spin 0.8s linear infinite;
	}

	.loading-icon {
		position: absolute;
		color: var(--color-accent);
		font-size: 30px;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.loading-text {
		text-align: center;
	}

	.loading-text h2 {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		margin-bottom: var(--spacing-2);
	}

	.progress {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.progress-count {
		color: var(--color-accent);
		font-weight: var(--font-weight-bold);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
