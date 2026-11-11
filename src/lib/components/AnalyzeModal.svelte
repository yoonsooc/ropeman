<script lang="ts">
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { webgpuStore } from '$lib/stores/webgpuStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { connectBridge, disconnectBridge } from '$lib/services/bridgeService';
	import { testApiKey } from '$lib/services/apiKeyValidator';
	import { modelCatalogStore } from '$lib/stores/modelCatalogStore.svelte';
	import { untrack } from 'svelte';
	import { AI_PROVIDERS, getProvider } from '$lib/data/aiProviders';
	import {
		extractSkeleton,
		estimatePayloadSize,
		formatPayloadPreview
	} from '$lib/services/skeletonExtractor';
	import type { AIProviderId } from '$lib/stores/settingsStore.svelte';
	import WebGPUSetupModal from './WebGPUSetupModal.svelte';
	import { isModelCached } from '$lib/services/webllmService';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import { onMount } from 'svelte';

	const breakpoint = useBreakpoint();
	// M4: Bridge needs a local CLI server; WebGPU needs gigabytes of RAM and
	// stable power — neither is viable on phones. Disable on compact viewports.
	const isCompact = $derived(breakpoint.isMobile || breakpoint.isTablet);

	// Check if the selected model is cached on mount
	onMount(async () => {
		if (webgpuStore.isSupported && webgpuStore.status === 'idle') {
			webgpuStore.isCached = await isModelCached(webgpuStore.selectedModelId);
		}
	});

	let {
		open,
		onclose,
		onanalyze
	}: {
		open: boolean;
		onclose: () => void;
		onanalyze: (track: 'edge' | 'byok' | 'bridge' | 'webgpu') => void;
	} = $props();

	type CardId = 'edge' | 'byok' | 'bridge' | 'webgpu';
	let expandedCard = $state<CardId | null>(null);
	let showWebGPUSetup = $state(false);
	let showPreview = $state(false);
	let copyFeedback = $state(false);

	// BYOK state
	let selectedProvider = $state<AIProviderId>(settingsStore.aiProvider);
	let selectedModel = $state(settingsStore.aiModel);
	let testStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
	let testError = $state('');

	// Bridge state
	let bridgePort = $state(authStore.bridgePort);

	const currentProvider = $derived(getProvider(selectedProvider));
	const providerModels = $derived(modelCatalogStore.modelsFor(selectedProvider));
	const apiKeyValue = $derived.by(() => {
		if (selectedProvider === 'google') return settingsStore.geminiApiKey;
		if (selectedProvider === 'anthropic') return settingsStore.anthropicApiKey;
		if (selectedProvider === 'openai') return settingsStore.openaiApiKey;
		return '';
	});

	const skeleton = $derived(
		projectStore.fileTree
			? extractSkeleton(projectStore.projectName, projectStore.fileTree, projectStore.astMap)
			: null
	);
	const payloadSize = $derived(skeleton ? estimatePayloadSize(skeleton) : null);
	const payloadPreview = $derived(skeleton ? formatPayloadPreview(skeleton) : '');

	const trackInfo = $derived.by(() => {
		const t = authStore.activeTrack;
		switch (t) {
			case 'bridge':
				return { label: i18nStore.t('track.bridge'), color: 'var(--track-bridge)' };
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

	let prevOpen = $state(false);
	$effect(() => {
		if (open && !prevOpen) {
			selectedProvider = settingsStore.aiProvider;
			selectedModel = settingsStore.aiModel;
			testStatus = 'idle';
			bridgePort = authStore.bridgePort;
			// A key saved in an earlier visit: refresh that provider's model list
			untrack(() => void modelCatalogStore.load(selectedProvider, apiKeyValue));
			expandedCard = null;
		}
		prevOpen = open;
	});

	// Reset expanded card if it becomes a disabled mobile-only track (Bridge / WebGPU)
	// after a viewport resize — keeps the UI from re-expanding when the user returns
	// to desktop with stale state.
	$effect(() => {
		if (isCompact && (expandedCard === 'bridge' || expandedCard === 'webgpu')) {
			expandedCard = null;
		}
	});

	function handleProviderChange(e: Event) {
		const newProvider = (e.target as HTMLSelectElement).value as AIProviderId;
		selectedProvider = newProvider;
		settingsStore.aiProvider = newProvider;
		const defaultModel = modelCatalogStore.modelsFor(newProvider)[0]?.id ?? '';
		selectedModel = defaultModel;
		settingsStore.aiModel = defaultModel;
		testStatus = 'idle';
		void modelCatalogStore.load(newProvider, apiKeyValue);
	}

	function handleModelChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value === '__custom__') {
			selectedModel = '';
			settingsStore.aiModel = '';
		} else {
			selectedModel = value;
			settingsStore.aiModel = value;
		}
	}

	function handleApiKeyInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		if (selectedProvider === 'google') settingsStore.geminiApiKey = value;
		else if (selectedProvider === 'anthropic') settingsStore.anthropicApiKey = value;
		else if (selectedProvider === 'openai') settingsStore.openaiApiKey = value;
	}

	async function testKey() {
		// Fixed before the await: the provider select stays usable while the test runs
		const provider = selectedProvider;
		const key = apiKeyValue;
		if (!key) return;
		testStatus = 'testing';
		testError = '';
		const result = await testApiKey(provider, key, selectedModel);
		testStatus = result.valid ? 'success' : 'error';
		testError = result.error ?? '';
		// Also on failure: a retired model fails the test even with a valid key
		void modelCatalogStore.load(provider, key);
	}

	async function handleBridgeConnect() {
		try {
			await connectBridge(bridgePort, settingsStore.bridgeToken);
		} catch {
			/* handled by authStore */
		}
	}

	function switchTrack(track: CardId) {
		if (track === 'edge') {
			authStore.edgeEnabled = true;
		}
		authStore.preferredTrack = track;
	}

	function startAnalysis(track: CardId) {
		switchTrack(track);
		onanalyze(track);
	}

	function toggleCard(id: CardId) {
		// Switch active track on card click (without starting analysis)
		switchTrack(id);
		expandedCard = expandedCard === id ? null : id;
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('analyze-backdrop')) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop analyze-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card analyze-card" role="dialog" aria-modal="true">
			<div class="modal-header">
				<div>
					<h2>
						<span class="material-symbols-outlined" style="font-size:18px; color: var(--accent);"
							>auto_awesome</span
						>
						{i18nStore.t('analyze.title')}
					</h2>
					{#if trackInfo}
						<div class="current-track">
							<span class="ct-dot" style="background: {trackInfo.color}"></span>
							<span class="ct-label"
								>{i18nStore.t('analyze.current', { track: trackInfo.label })}</span
							>
						</div>
					{/if}
				</div>
				<button class="modal-close" onclick={onclose}>&#10005;</button>
			</div>

			<div class="modal-body analyze-body">
				<!-- Edge / Demo -->
				<div class="track-card" class:active={authStore.activeTrack === 'edge'}>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="track-row" onclick={() => toggleCard('edge')}>
						<span class="track-icon"><span class="material-symbols-outlined">bolt</span></span>
						<div class="track-info">
							<span class="track-name">{i18nStore.t('track.edge')}</span>
							<span class="track-sub">{i18nStore.t('analyze.demoSub')}</span>
						</div>
						{#if authStore.activeTrack === 'edge'}
							<span class="badge badge-accent">{i18nStore.t('analyze.active')}</span>
						{/if}
						<button
							class="btn btn-primary start-btn"
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								startAnalysis('edge');
							}}
						>
							{i18nStore.t('analyze.start')}
						</button>
					</div>
					<p class="track-note">{i18nStore.t('analyze.demoNotice')}</p>
				</div>

				<!-- BYOK -->
				<div class="track-card" class:active={authStore.activeTrack === 'byok'}>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="track-row" onclick={() => toggleCard('byok')}>
						<span class="track-icon"><span class="material-symbols-outlined">vpn_key</span></span>
						<div class="track-info">
							<span class="track-name">{i18nStore.t('analyze.byokName')}</span>
							<span class="track-sub">
								{currentProvider?.label ?? 'Google'} &middot;
								{#if settingsStore.hasApiKey}
									{i18nStore.t('analyze.keySet')}
								{:else}
									{i18nStore.t('analyze.notConfigured')}
								{/if}
							</span>
						</div>
						{#if authStore.activeTrack === 'byok'}
							<span class="badge badge-accent">{i18nStore.t('analyze.active')}</span>
						{/if}
						<span class="expand-arrow" class:expanded={expandedCard === 'byok'}>&#9656;</span>
					</div>
					{#if expandedCard === 'byok'}
						<div class="track-config">
							<label class="form-label" for="analyze-provider-select"
								>{i18nStore.t('analyze.provider')}</label
							>
							<select
								id="analyze-provider-select"
								class="select"
								value={selectedProvider}
								onchange={handleProviderChange}
							>
								{#each AI_PROVIDERS as provider}
									<option value={provider.id}>{provider.label}</option>
								{/each}
							</select>
							<label class="form-label" for="analyze-model-select"
								>{i18nStore.t('analyze.model')}</label
							>
							<select
								id="analyze-model-select"
								class="select"
								value={providerModels.some((m) => m.id === selectedModel)
									? selectedModel
									: '__custom__'}
								onchange={handleModelChange}
							>
								{#each providerModels as model}
									<option value={model.id}>{model.label}</option>
								{/each}
								<option value="__custom__">{i18nStore.t('analyze.customModel')}</option>
							</select>
							{#if !providerModels.some((m) => m.id === selectedModel)}
								<input
									class="input"
									type="text"
									placeholder={i18nStore.t('analyze.modelPlaceholder')}
									value={selectedModel}
									oninput={(e) => {
										const v = (e.target as HTMLInputElement).value;
										selectedModel = v;
										settingsStore.aiModel = v;
									}}
								/>
							{/if}
							<label class="form-label" for="analyze-api-key"
								>{i18nStore.t('analyze.apiKeyLabel', {
									provider: currentProvider?.label ?? ''
								})}</label
							>
							<div class="form-row">
								<input
									id="analyze-api-key"
									type="password"
									class="input"
									placeholder={i18nStore.t('analyze.apiKeyPlaceholder')}
									value={apiKeyValue}
									oninput={handleApiKeyInput}
								/>
								<button
									class="btn btn-primary"
									onclick={testKey}
									disabled={!apiKeyValue || testStatus === 'testing'}
								>
									{testStatus === 'testing' ? '...' : i18nStore.t('analyze.test')}
								</button>
							</div>
							{#if testStatus === 'success'}
								<span class="cfg-status success">{i18nStore.t('analyze.valid')}</span>
							{:else if testStatus === 'error'}
								<span class="cfg-status error">{testError || i18nStore.t('analyze.invalid')}</span>
							{/if}
							<p class="cfg-note">{i18nStore.t('analyze.byokKeyNotice')}</p>
							{#if apiKeyValue}
								<button
									class="btn btn-primary start-btn wide"
									onclick={() => startAnalysis('byok')}
								>
									{i18nStore.t('analyze.startWithApiKey')}
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Bridge -->
				<div
					class="track-card"
					class:active={authStore.activeTrack === 'bridge'}
					class:disabled={isCompact}
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="track-row" onclick={() => !isCompact && toggleCard('bridge')}>
						<span class="track-icon"><span class="material-symbols-outlined">link</span></span>
						<div class="track-info">
							<span class="track-name">{i18nStore.t('track.bridge')}</span>
							<span class="track-sub">
								{#if isCompact}
									{i18nStore.t('analyze.bridgeDesktopOnly')}
								{:else if authStore.bridgeStatus === 'connected'}
									{i18nStore.t('analyze.connected')}
								{:else}
									{i18nStore.t('analyze.disconnected')}
								{/if}
							</span>
						</div>
						{#if authStore.activeTrack === 'bridge'}
							<span class="badge badge-accent">{i18nStore.t('analyze.active')}</span>
						{/if}
						{#if !isCompact}
							<span class="expand-arrow" class:expanded={expandedCard === 'bridge'}>&#9656;</span>
						{/if}
					</div>
					{#if expandedCard === 'bridge' && !isCompact}
						<div class="track-config">
							<label class="form-label" for="analyze-cli-select"
								>{i18nStore.t('analyze.cliTool')}</label
							>
							<select
								id="analyze-cli-select"
								class="select"
								value={settingsStore.bridgeCli}
								onchange={(e) =>
									(settingsStore.bridgeCli = (e.target as HTMLSelectElement).value as
										| 'claude'
										| 'gemini'
										| 'auto')}
							>
								<option value="auto">{i18nStore.t('analyze.cliAuto')}</option>
								<option value="claude">Claude Code</option>
								<option value="gemini">Gemini CLI</option>
							</select>
							<label class="form-label" for="analyze-bridge-port"
								>{i18nStore.t('analyze.port')}</label
							>
							<div class="form-row">
								<input
									id="analyze-bridge-port"
									type="number"
									class="input"
									value={bridgePort}
									oninput={(e) =>
										(bridgePort = parseInt((e.target as HTMLInputElement).value) || 9876)}
								/>
								{#if authStore.bridgeStatus === 'connected'}
									<button class="btn btn-danger" onclick={disconnectBridge}
										>{i18nStore.t('analyze.disconnect')}</button
									>
								{:else}
									<button
										class="btn btn-primary"
										onclick={handleBridgeConnect}
										disabled={authStore.bridgeStatus === 'connecting'}
									>
										{authStore.bridgeStatus === 'connecting'
											? '...'
											: i18nStore.t('analyze.connect')}
									</button>
								{/if}
							</div>
							<label class="form-label" for="analyze-bridge-token"
								>{i18nStore.t('analyze.token')}</label
							>
							<input
								id="analyze-bridge-token"
								type="password"
								class="input"
								autocomplete="off"
								spellcheck="false"
								placeholder={i18nStore.t('analyze.tokenPlaceholder')}
								value={settingsStore.bridgeToken}
								oninput={(e) => (settingsStore.bridgeToken = (e.target as HTMLInputElement).value)}
							/>
							<div class="cfg-command">
								<code
									>npx @ropeman/bridge --port {bridgePort}{settingsStore.bridgeCli !== 'auto'
										? ' --cli ' + settingsStore.bridgeCli
										: ''}</code
								>
							</div>
							{#if authStore.bridgeStatus === 'connected'}
								<button
									class="btn btn-primary start-btn wide"
									onclick={() => startAnalysis('bridge')}
								>
									{i18nStore.t('analyze.startWithBridge')}
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- WebGPU -->
				<div
					class="track-card"
					class:active={authStore.activeTrack === 'webgpu'}
					class:disabled={!webgpuStore.isSupported || isCompact}
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="track-row"
						onclick={() => webgpuStore.isSupported && !isCompact && toggleCard('webgpu')}
					>
						<span class="track-icon"><span class="material-symbols-outlined">psychology</span></span
						>
						<div class="track-info">
							<span class="track-name"
								>{i18nStore.t('analyze.webgpuName')}
								<span class="badge badge-muted">{i18nStore.t('common.beta')}</span></span
							>
							<span class="track-sub">
								{#if isCompact}
									{i18nStore.t('analyze.webgpuDesktopOnly')}
								{:else if !webgpuStore.isSupported}
									{i18nStore.t('analyze.webgpuUnsupported')}
								{:else if webgpuStore.isReady}
									{i18nStore.t('analyze.modelLoaded')}
								{:else if webgpuStore.status === 'downloading'}
									{i18nStore.t('analyze.downloading', { n: webgpuStore.downloadProgress })}
								{:else if webgpuStore.isCached}
									{i18nStore.t('analyze.cachedNeedsLoading')}
								{:else}
									{i18nStore.t('analyze.notInitialized', {
										size:
											webgpuStore.selectedModel.downloadSizeMB >= 1000
												? (webgpuStore.selectedModel.downloadSizeMB / 1000).toFixed(1) + 'GB'
												: webgpuStore.selectedModel.downloadSizeMB + 'MB'
									})}
								{/if}
							</span>
						</div>
						{#if authStore.activeTrack === 'webgpu'}
							<span class="badge badge-accent">{i18nStore.t('analyze.active')}</span>
						{/if}
						{#if webgpuStore.isSupported && !isCompact}
							<span class="expand-arrow" class:expanded={expandedCard === 'webgpu'}>&#9656;</span>
						{/if}
					</div>
					{#if expandedCard === 'webgpu' && webgpuStore.isSupported && !isCompact}
						<div class="track-config">
							{#if webgpuStore.isReady}
								<button
									class="btn btn-primary start-btn wide"
									onclick={() => startAnalysis('webgpu')}
								>
									{i18nStore.t('analyze.startWithWebgpu')}
								</button>
							{:else}
								<button class="btn btn-primary" onclick={() => (showWebGPUSetup = true)}>
									{i18nStore.t('analyze.setupModel')}
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Payload Preview -->
				{#if skeleton}
					<div class="preview-section">
						<div class="preview-header">
							<button class="preview-toggle" onclick={() => (showPreview = !showPreview)}>
								{i18nStore.t('analyze.payloadPreview')}
								<span class="toggle-arrow" class:expanded={showPreview}>&#9656;</span>
							</button>
							{#if showPreview}
								<button
									class="copy-json-btn"
									onclick={async () => {
										await navigator.clipboard.writeText(payloadPreview);
										copyFeedback = true;
										setTimeout(() => (copyFeedback = false), 1500);
									}}
									title={i18nStore.t('analyze.copyJson')}
								>
									<span class="material-symbols-outlined"
										>{copyFeedback ? 'check' : 'content_copy'}</span
									>
								</button>
							{/if}
						</div>
						<div class="preview-meta">
							{#if payloadSize}
								<span class="meta-item">{payloadSize.formatted}</span>
								<span class="meta-sep">&middot;</span>
							{/if}
							<span class="meta-item"
								>{i18nStore.t('node.fileMany', { n: skeleton.totalFiles })}</span
							>
							<span class="meta-sep">&middot;</span>
							<span class="meta-item"
								>{i18nStore.t('common.symbolCount', { n: skeleton.totalSymbols })}</span
							>
							<span class="meta-sep">&middot;</span>
							<span class="meta-item"
								>{i18nStore.t('analyze.limit', {
									value: settingsStore.skeletonUnlimited
										? i18nStore.t('analyze.unlimited')
										: settingsStore.maxSkeletonKB + ' KB'
								})}</span
							>
						</div>
						{#if showPreview}
							<pre class="preview-json">{payloadPreview}</pre>
						{/if}
					</div>
				{/if}
			</div>

			<div class="analyze-footer">
				<p class="analyze-footer-hint">{i18nStore.t('analyze.footerHint')}</p>
			</div>
		</div>
	</div>
{/if}

<WebGPUSetupModal open={showWebGPUSetup} onclose={() => (showWebGPUSetup = false)} />

<style>
	.analyze-card {
		width: 420px;
	}
	.analyze-card :global(.modal-header) {
		padding: 20px;
	}
	.analyze-card :global(.modal-header h2) {
		font-size: 14px;
		letter-spacing: 0.025em;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.analyze-body {
		padding: 16px;
		gap: 12px;
	}
	.current-track {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.ct-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.ct-label {
		font-size: 11px;
		color: var(--text-secondary);
	}

	/* Track cards */
	.track-card {
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg-secondary);
		border: 1px solid var(--ghost-border);
		transition:
			background-color 0.2s,
			border-color 0.2s;
	}
	.track-card:hover:not(.disabled) {
		background: var(--bg-tertiary);
	}
	.track-card.active {
		background: var(--accent-bg);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.track-card.disabled {
		opacity: 0.5;
	}
	.track-row {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 12px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: inherit;
	}
	.track-icon {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		font-size: 20px;
	}
	.track-card.active .track-icon {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
	}
	.track-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.track-name {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
	}
	.track-sub {
		font-size: 10px;
		color: var(--text-secondary);
		margin-top: 1px;
	}
	.expand-arrow {
		font-size: 12px;
		color: var(--text-secondary);
		transition: transform 0.2s;
		flex-shrink: 0;
	}
	.expand-arrow.expanded {
		transform: rotate(90deg);
	}
	.start-btn {
		flex-shrink: 0;
		padding: 4px 12px;
		font-size: 12px;
		font-weight: 700;
		font-family: var(--font-display);
	}
	.start-btn.wide {
		width: 100%;
		padding: 8px;
		font-size: 13px;
	}

	/* Config sections */
	.track-config {
		padding: 10px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--bg-tertiary);
	}
	.cfg-status {
		font-size: 11px;
	}
	.track-note,
	.cfg-note {
		margin: 0;
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-secondary);
		word-break: keep-all;
	}
	.track-note {
		/* lines up with the track name: row padding 12 + icon 40 + gap 16 */
		padding: 0 12px 12px 68px;
	}
	.cfg-status.success {
		color: var(--color-success);
	}
	.cfg-status.error {
		color: var(--color-error);
	}
	.cfg-command {
		padding: 6px 10px;
		background: var(--bg-primary);
		border: none;
		border-radius: 6px;
	}
	.cfg-command code {
		font-size: 11px;
		color: var(--color-success);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}

	/* Preview */
	.preview-section {
		margin-top: 4px;
		padding-top: 10px;
	}
	.preview-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.preview-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}
	.preview-toggle:hover {
		color: var(--text-primary);
	}
	.copy-json-btn {
		display: flex;
		align-items: center;
		background: none;
		border: none;
		padding: 2px;
		cursor: pointer;
		color: var(--text-secondary);
		border-radius: 4px;
	}
	.copy-json-btn:hover {
		color: var(--text-primary);
		background: var(--bg-secondary);
	}
	.copy-json-btn .material-symbols-outlined {
		font-size: 14px;
	}
	.toggle-arrow {
		font-size: 10px;
		transition: transform 0.2s;
	}
	.toggle-arrow.expanded {
		transform: rotate(90deg);
	}
	.preview-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		flex-wrap: wrap;
	}
	.meta-item {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.meta-sep {
		font-size: 11px;
		color: var(--text-secondary);
		opacity: 0.4;
	}
	.preview-json {
		background: var(--bg-secondary);
		font-family: 'SF Mono', 'Fira Code', monospace;
		font-size: 10px;
		line-height: 1.5;
		padding: 10px;
		border-radius: 8px;
		max-height: 200px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
		margin-top: 8px;
		color: var(--text-secondary);
	}

	/* Footer */
	.analyze-footer {
		padding: 16px;
		background: var(--bg-secondary);
		border-top: 1px solid var(--ghost-border);
		border-radius: 0 0 12px 12px;
	}
	.analyze-footer-hint {
		font-size: 10px;
		color: var(--text-muted);
		font-style: italic;
		margin: 0;
	}
</style>
