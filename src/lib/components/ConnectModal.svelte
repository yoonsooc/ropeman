<script lang="ts">
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { webgpuStore } from '$lib/stores/webgpuStore.svelte';
	import { connectBridge, disconnectBridge } from '$lib/services/bridgeService';
	import { AI_PROVIDERS, getProvider, getDefaultModel } from '$lib/data/aiProviders';
	import { testApiKey } from '$lib/services/apiKeyValidator';
	import type { AIProviderId } from '$lib/stores/settingsStore.svelte';
	import WebGPUSetupModal from './WebGPUSetupModal.svelte';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	let activeTab = $state<'edge' | 'byok' | 'bridge' | 'webgpu'>('byok');
	let showWebGPUSetup = $state(false);
	let testStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
	let testError = $state('');
	let bridgePort = $state(authStore.bridgePort);

	// Provider/model selection
	let selectedProvider = $state<AIProviderId>(settingsStore.aiProvider);
	let selectedModel = $state(settingsStore.aiModel);

	const currentProvider = $derived(getProvider(selectedProvider));
	const providerModels = $derived(currentProvider?.models ?? []);
	const requiresBridge = $derived(currentProvider?.requiresBridge ?? false);

	// API key based on selected provider
	const apiKeyValue = $derived.by(() => {
		if (selectedProvider === 'google') return settingsStore.geminiApiKey;
		if (selectedProvider === 'anthropic') return settingsStore.anthropicApiKey;
		if (selectedProvider === 'openai') return settingsStore.openaiApiKey;
		return '';
	});

	let prevOpen = $state(false);
	$effect(() => {
		if (open && !prevOpen) {
			selectedProvider = settingsStore.aiProvider;
			selectedModel = settingsStore.aiModel;
			testStatus = 'idle';
			bridgePort = authStore.bridgePort;
			// Auto-select tab matching current track
			const track = authStore.activeTrack;
			if (track === 'bridge') activeTab = 'bridge';
			else if (track === 'webgpu') activeTab = 'webgpu';
			else if (track === 'edge') activeTab = 'edge';
			else activeTab = 'byok';
		}
		prevOpen = open;
	});

	function handleProviderChange(e: Event) {
		const newProvider = (e.target as HTMLSelectElement).value as AIProviderId;
		selectedProvider = newProvider;
		settingsStore.aiProvider = newProvider;
		// Auto-select default model for new provider
		const defaultModel = getDefaultModel(newProvider);
		selectedModel = defaultModel;
		settingsStore.aiModel = defaultModel;
		testStatus = 'idle';
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
		if (selectedProvider === 'google') {
			settingsStore.geminiApiKey = value;
		} else if (selectedProvider === 'anthropic') {
			settingsStore.anthropicApiKey = value;
		} else if (selectedProvider === 'openai') {
			settingsStore.openaiApiKey = value;
		}
	}

	async function testKey() {
		const key = apiKeyValue;
		if (!key) return;
		testStatus = 'testing';
		testError = '';
		const result = await testApiKey(selectedProvider, key, selectedModel);
		testStatus = result.valid ? 'success' : 'error';
		testError = result.error ?? '';
	}

	async function handleConnect() {
		try {
			await connectBridge(bridgePort);
		} catch {
			// error is handled by authStore
		}
	}

	function handleDisconnect() {
		disconnectBridge();
	}

	function activateEdge() {
		authStore.edgeEnabled = true;
		onclose();
	}

	function activateByok() {
		authStore.edgeEnabled = false;
		onclose();
	}

	function handleBridgePortInput(e: Event) {
		bridgePort = parseInt((e.target as HTMLInputElement).value) || 9876;
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('connect-backdrop')) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function handleCliChange(e: Event) {
		settingsStore.bridgeCli = (e.target as HTMLSelectElement).value as 'claude' | 'gemini' | 'auto';
	}

	function copyCommand() {
		const cmd = `npx @ropeman/bridge --port ${bridgePort}${settingsStore.bridgeCli !== 'auto' ? ` --cli ${settingsStore.bridgeCli}` : ''}`;
		navigator.clipboard.writeText(cmd);
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop connect-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card connect-card" role="dialog" aria-modal="true">
			<div class="modal-header connect-header">
				<h2>AI Connection</h2>
				<button class="modal-close" onclick={onclose}>&#10005;</button>
			</div>

			<div class="connect-tabs">
				<button
					class="connect-tab"
					class:active={activeTab === 'edge'}
					onclick={() => (activeTab = 'edge')}
				>
					Demo
				</button>
				<button
					class="connect-tab"
					class:active={activeTab === 'byok'}
					onclick={() => (activeTab = 'byok')}
				>
					API Key
				</button>
				<button
					class="connect-tab"
					class:active={activeTab === 'bridge'}
					onclick={() => (activeTab = 'bridge')}
				>
					Local Bridge
				</button>
				<button
					class="connect-tab"
					class:active={activeTab === 'webgpu'}
					onclick={() => (activeTab = 'webgpu')}
				>
					Browser AI
					<span class="badge badge-muted tab-badge">Beta</span>
				</button>
			</div>

			<div class="modal-body connect-body">
				{#if activeTab === 'edge'}
					<section class="connect-section">
						<p class="hint connect-hint" style="font-size:13px; opacity:1;">
							서버를 경유하여 AI 분석을 수행합니다. API 키 없이 무료로 사용 가능하며, 파일 구조
							메타데이터만 전달됩니다. Google Gemini 무료 등급으로 처리되므로 Google이 입력을 서비스
							개선에 사용할 수 있습니다. 공개하기 어려운 코드는 API 키나 로컬 브리지를 쓰세요.
						</p>
						<div class="edge-status">
							{#if authStore.activeTrack === 'edge'}
								<span class="connect-status success">Active</span>
							{:else}
								<span class="connect-status">Inactive</span>
							{/if}
						</div>
						<button class="btn btn-primary" onclick={activateEdge}>
							{authStore.activeTrack === 'edge' ? 'Using Demo Mode' : 'Use Demo Mode'}
						</button>
					</section>
				{:else if activeTab === 'byok'}
					<section class="connect-section">
						<!-- Provider Selection -->
						<label class="form-label connect-label" for="connect-provider-select">Provider</label>
						<select
							id="connect-provider-select"
							class="select connect-select"
							value={selectedProvider}
							onchange={handleProviderChange}
						>
							{#each AI_PROVIDERS as provider}
								<option value={provider.id}>{provider.label}</option>
							{/each}
						</select>

						<!-- Model Selection -->
						<label class="form-label connect-label" for="connect-model-select">Model</label>
						<select
							id="connect-model-select"
							class="select connect-select"
							value={providerModels.some((m) => m.id === selectedModel)
								? selectedModel
								: '__custom__'}
							onchange={handleModelChange}
						>
							{#each providerModels as model}
								<option value={model.id}>{model.label}</option>
							{/each}
							<option value="__custom__">Custom...</option>
						</select>
						{#if !providerModels.some((m) => m.id === selectedModel)}
							<input
								class="input connect-input"
								type="text"
								placeholder="e.g. claude-sonnet-4-6"
								value={selectedModel}
								oninput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									selectedModel = v;
									settingsStore.aiModel = v;
								}}
							/>
						{/if}

						<!-- API Key Input -->
						<label class="form-label connect-label" for="connect-api-key"
							>{currentProvider?.label ?? ''} API Key</label
						>
						<div class="connect-row">
							<input
								type="password"
								class="input connect-input"
								placeholder="Enter API key"
								value={apiKeyValue}
								oninput={handleApiKeyInput}
							/>
							<button
								class="btn btn-primary"
								onclick={testKey}
								disabled={!apiKeyValue || testStatus === 'testing'}
							>
								{testStatus === 'testing' ? '...' : 'Test'}
							</button>
						</div>
						{#if testStatus === 'success'}
							<span class="connect-status success">Valid key</span>
						{:else if testStatus === 'error'}
							<span class="connect-status error">{testError || 'Invalid key'}</span>
						{/if}
						<p class="hint connect-hint">
							Your API key is stored locally and never sent to our servers.
						</p>
						{#if apiKeyValue}
							<button class="btn btn-primary" onclick={activateByok}>
								{authStore.activeTrack === 'byok' ? 'Using API Key' : 'Use API Key'}
							</button>
						{/if}
					</section>
				{:else if activeTab === 'bridge'}
					<section class="connect-section">
						<label class="form-label connect-label" for="connect-cli-select">CLI Tool</label>
						<select
							id="connect-cli-select"
							class="select connect-select"
							value={settingsStore.bridgeCli}
							onchange={handleCliChange}
						>
							<option value="auto">Auto-detect</option>
							<option value="claude">Claude Code</option>
							<option value="gemini">Gemini CLI</option>
						</select>

						<label class="form-label connect-label" for="connect-bridge-port">Bridge Port</label>
						<div class="connect-row">
							<input
								type="number"
								class="input connect-input"
								value={bridgePort}
								oninput={handleBridgePortInput}
							/>
							{#if authStore.bridgeStatus === 'connected'}
								<button class="btn btn-danger" onclick={handleDisconnect}>Disconnect</button>
							{:else}
								<button
									class="btn btn-primary"
									onclick={handleConnect}
									disabled={authStore.bridgeStatus === 'connecting'}
								>
									{authStore.bridgeStatus === 'connecting' ? 'Connecting...' : 'Connect'}
								</button>
							{/if}
						</div>

						<div class="bridge-status">
							{#if authStore.bridgeStatus === 'connected'}
								<span class="status-dot connected"></span>
								<span class="status-text">Connected</span>
							{:else if authStore.bridgeStatus === 'connecting'}
								<span class="status-dot connecting"></span>
								<span class="status-text">Connecting...</span>
							{:else if authStore.bridgeStatus === 'reconnecting'}
								<span class="status-dot connecting"></span>
								<span class="status-text">Reconnecting...</span>
							{:else if authStore.bridgeStatus === 'error'}
								<span class="status-dot error"></span>
								<span class="status-text">{authStore.bridgeError || 'Connection failed'}</span>
							{:else}
								<span class="status-dot"></span>
								<span class="status-text">Disconnected</span>
							{/if}
						</div>

						<div class="command-block">
							<code
								>npx @ropeman/bridge --port {bridgePort}{settingsStore.bridgeCli !== 'auto'
									? ' --cli ' + settingsStore.bridgeCli
									: ''}</code
							>
							<button class="copy-btn" onclick={copyCommand} title="Copy">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
									<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
								</svg>
							</button>
						</div>
						<p class="hint connect-hint">
							{#if settingsStore.bridgeCli === 'auto'}
								Run this command in your terminal. The bridge will auto-detect Claude Code or Gemini
								CLI.
							{:else if settingsStore.bridgeCli === 'claude'}
								Requires Claude Code CLI installed. Run: npm install -g @anthropic-ai/claude-code
							{:else}
								Requires Gemini CLI installed.
							{/if}
						</p>
					</section>
				{:else if activeTab === 'webgpu'}
					<section class="connect-section">
						{#if !webgpuStore.isSupported}
							<div class="notice notice-warning bridge-notice">
								<span class="notice-icon">&#9888;</span>
								<span class="notice-text">
									Your browser does not support WebGPU. Please use Chrome 113+ or Edge 113+.
								</span>
							</div>
						{:else}
							<div class="webgpu-status-row">
								<span class="form-label connect-label">Status</span>
								{#if webgpuStore.isReady}
									<span class="connect-status success">Model loaded</span>
								{:else if webgpuStore.status === 'downloading'}
									<span class="connect-status">Downloading... {webgpuStore.downloadProgress}%</span>
								{:else if webgpuStore.status === 'error'}
									<span class="connect-status error">{webgpuStore.errorMessage}</span>
								{:else}
									<span class="connect-status">Not initialized</span>
								{/if}
							</div>
							<p class="hint connect-hint">
								Run a small AI model (Qwen2.5-Coder-1.5B) directly in your browser using WebGPU. No
								data leaves your machine.
							</p>
							<button
								class="btn btn-primary"
								disabled={webgpuStore.status === 'downloading'}
								onclick={() => (showWebGPUSetup = true)}
							>
								{webgpuStore.isReady ? 'Reconfigure' : 'Setup Model'}
							</button>
						{/if}
					</section>
				{/if}
			</div>
		</div>
	</div>
{/if}

<WebGPUSetupModal open={showWebGPUSetup} onclose={() => (showWebGPUSetup = false)} />

<style>
	.connect-card {
		width: 440px;
	}
	.connect-header {
		background: transparent;
		border-bottom: 1px solid var(--border);
	}
	.connect-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
	}
	.connect-tab {
		flex: 1;
		padding: 10px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}
	.connect-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
	.tab-badge {
		vertical-align: super;
	}
	.webgpu-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.connect-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.connect-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.connect-status {
		font-size: 12px;
	}
	.connect-status.success {
		color: var(--color-success);
	}
	.connect-status.error {
		color: var(--color-error);
	}
	.bridge-status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
		flex-shrink: 0;
	}
	.status-dot.connected {
		background: var(--color-success);
	}
	.status-dot.connecting {
		background: var(--color-warning);
		animation: pulse 1s infinite;
	}
	.status-dot.error {
		background: var(--color-error);
	}
	.status-text {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.command-block {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.command-block code {
		flex: 1;
		font-size: 12px;
		color: var(--color-success);
		font-family: 'SF Mono', 'Fira Code', monospace;
	}
	.copy-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
	}
	.copy-btn:hover {
		color: var(--text-primary);
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
</style>
