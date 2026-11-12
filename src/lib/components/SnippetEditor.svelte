<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { graphStore } from '$lib/stores/graphStore.svelte';
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { parseAllFiles } from '$lib/services/parserService';
	import { analyzeTopLevel } from '$lib/services/semanticAnalysisService';
	import { detectLanguage } from '$lib/utils/languageDetector';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import {
		SNIPPET_PRESETS,
		LANGUAGE_COLORS,
		LANGUAGE_EXTENSIONS,
		type SnippetPreset
	} from '$lib/data/snippetPresets';
	import type { FileNode } from '$lib/types/fileTree';

	let { oncancel, onload }: { oncancel?: () => void; onload?: () => void } = $props();

	let code = $state('');
	let language = $state('python');
	let error = $state('');

	const supportedLanguages = [
		{ id: 'python', label: 'Python' },
		{ id: 'javascript', label: 'JavaScript' },
		{ id: 'typescript', label: 'TypeScript' }
	];

	function loadPreset(preset: SnippetPreset) {
		code = preset.code;
		language = preset.language;
	}

	function resetStores() {
		projectStore.reset();
		graphStore.clear();
		selectionStore.clear();
	}

	async function handleAnalyze() {
		if (!code.trim()) {
			error = i18nStore.t('snippet.emptyError');
			return;
		}
		error = '';

		const ext = LANGUAGE_EXTENSIONS[language] ?? '.txt';
		const filename = `snippet${ext}`;

		const fileNode: FileNode = {
			name: filename,
			path: filename,
			kind: 'file',
			language,
			size: code.length,
			handle: {
				kind: 'file' as const,
				name: filename,
				getFile: () => Promise.resolve(new File([code], filename))
			} as unknown as FileSystemFileHandle
		};

		const tree: FileNode = {
			name: 'snippet',
			path: '',
			kind: 'directory',
			children: [fileNode]
		};

		try {
			onload?.();
			resetStores();
			projectStore.projectName = 'snippet';
			projectStore.fileTree = tree;
			projectStore.isLoading = true;
			projectStore.isSnippetMode = true;
			const { astMap, skipped } = await parseAllFiles(tree, projectStore.astMap, (progress) => {
				projectStore.parsingProgress = progress;
			});
			projectStore.astMap = astMap;
			projectStore.parseSkips = skipped;
			projectStore.isLoading = false;
			// Auto-trigger semantic analysis if AI is connected
			if (authStore.isReady) {
				analyzeTopLevel({ force: true });
			}
		} catch (err) {
			error = i18nStore.t('snippet.analyzeFailed', { error: String(err) });
			projectStore.isLoading = false;
		}
	}

	const lineCount = $derived(code.split('\n').length);
</script>

<section class="snippet-section">
	<div class="snippet-divider">
		<span class="divider-line"></span>
		<span class="divider-text">{i18nStore.t('snippet.divider')}</span>
		<span class="divider-line"></span>
	</div>

	<div class="preset-row">
		{#each SNIPPET_PRESETS as preset}
			<button
				class="preset-card"
				class:active={code === preset.code && language === preset.language}
				onclick={() => loadPreset(preset)}
			>
				<span class="preset-dot" style="background:{LANGUAGE_COLORS[preset.language] ?? '#888'}"
				></span>
				<span class="preset-info">
					<span class="preset-name">{preset.name}</span>
					<span class="preset-desc">{preset.description}</span>
				</span>
			</button>
		{/each}
	</div>

	<div class="editor-area">
		<div class="editor-toolbar">
			<select class="lang-select" bind:value={language}>
				{#each supportedLanguages as lang}
					<option value={lang.id}>{lang.label}</option>
				{/each}
			</select>
			<span class="line-info">{i18nStore.t('snippet.lines', { n: lineCount })}</span>
		</div>
		<div class="editor-wrapper">
			<div class="line-numbers" aria-hidden="true">
				{#each { length: lineCount } as _, i}
					<span>{i + 1}</span>
				{/each}
			</div>
			<textarea
				class="code-textarea"
				bind:value={code}
				placeholder={i18nStore.t('snippet.placeholder')}
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
			></textarea>
		</div>
	</div>

	{#if error}
		<p class="error-msg">{error}</p>
	{/if}

	<button class="analyze-btn" onclick={handleAnalyze} disabled={!code.trim()}>
		<span class="material-symbols-outlined">play_arrow</span>
		{i18nStore.t('snippet.analyze')}
	</button>
</section>

<style>
	.snippet-section {
		margin-top: 48px;
	}

	.snippet-divider {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 24px;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.divider-text {
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-tertiary);
		white-space: nowrap;
	}

	.preset-row {
		display: flex;
		gap: 12px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}

	.preset-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--color-background-muted);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		text-align: left;
	}

	.preset-card:hover {
		border-color: var(--color-text-tertiary);
		background: var(--color-background-muted);
	}

	.preset-card.active {
		border-color: var(--color-accent);
		background: var(--color-accent-muted);
	}

	.preset-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.preset-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.preset-name {
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.preset-desc {
		font-family: var(--font-body);
		font-size: 11px;
		color: var(--color-text-tertiary);
	}

	.editor-area {
		border: 1px solid var(--color-border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--color-background-canvas);
	}

	.editor-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--color-background-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.lang-select {
		background: var(--color-neutral);
		color: var(--color-text-primary);
		border: none;
		border-radius: 4px;
		padding: 4px 8px;
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.line-info {
		font-family: var(--font-code);
		font-size: 10px;
		color: var(--color-text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.editor-wrapper {
		display: flex;
		min-height: 200px;
		max-height: 400px;
		overflow: auto;
	}

	.line-numbers {
		display: flex;
		flex-direction: column;
		padding: 12px 0;
		min-width: 40px;
		text-align: right;
		user-select: none;
		border-right: 1px solid var(--color-border);
		background: var(--color-background-sidebar-icon);
	}

	.line-numbers span {
		display: block;
		padding: 0 8px;
		font-family: var(--font-code);
		font-size: 11px;
		line-height: 20px;
		color: var(--color-text-tertiary);
	}

	.code-textarea {
		flex: 1;
		padding: 12px 16px;
		font-family: var(--font-code);
		font-size: 13px;
		line-height: 20px;
		color: var(--color-text-primary);
		background: transparent;
		border: none;
		--focus-outline-offset: -2px;
		resize: none;
		tab-size: 4;
		white-space: pre;
		overflow: hidden;
	}

	.code-textarea::placeholder {
		color: var(--color-text-tertiary);
		opacity: 0.5;
	}

	.error-msg {
		margin-top: 8px;
		color: var(--color-text-error);
		font-size: 12px;
	}

	.analyze-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		padding: 12px 24px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		border-radius: 8px;
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		box-shadow:
			0 10px 15px -3px var(--color-accent-muted),
			0 4px 6px -4px var(--color-accent-muted);
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}

	.analyze-btn:hover:not(:disabled) {
		opacity: 0.9;
		transform: none;
	}

	.analyze-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.analyze-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.analyze-btn .material-symbols-outlined {
		font-size: 18px;
	}

	@media (max-width: 720px) {
		.preset-row {
			flex-direction: column;
		}
	}
</style>
