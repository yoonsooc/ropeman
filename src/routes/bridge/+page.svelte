<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { bridgeStore, type Naming } from '$lib/stores/bridgeStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { themeStore } from '$lib/stores/themeStore.svelte';
	import ZUICanvas from '$lib/components/ZUICanvas.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import SemanticDetailPanel from '$lib/components/SemanticDetailPanel.svelte';
	import CodeViewer from '$lib/components/CodeViewer.svelte';
	import type { ConnectFailure } from '$lib/services/bridgeClient';
	import type { RpcErrorCode } from '$lib/types/ropemanMap';

	const DEFAULT_PORT = 9800;
	const TOKEN_FILE = '~/.ropeman/bridge-token';
	// Per tab: a reload in local mode reconnects without the token staying in the address
	const SESSION_KEY = 'ropeman-bridge';

	let port = $state(String(DEFAULT_PORT));
	let token = $state('');
	/** The page's own host when serve itself serves it (local mode) */
	let localHost = $state<string | null>(null);

	const status = $derived(bridgeStore.status);
	const showingMap = $derived(
		(status.state === 'connected' || status.state === 'lost') && bridgeStore.map !== null
	);
	const codeTab = $derived(tabStore.activeTab?.type === 'code' ? tabStore.activeTab : null);
	const shownParent = $derived(semanticStore.currentLevel?.parentId ?? null);
	const naming = $derived(shownParent ? bridgeStore.namingOf(shownParent) : null);
	const hasSemanticSelection = $derived(
		semanticStore.selectedSemanticNode !== null && !semanticStore.panelDismissed
	);
	const portNumber = $derived(Number(port));
	const portValid = $derived(Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536);

	function remember(host: string, value: string) {
		try {
			sessionStorage.setItem(SESSION_KEY, JSON.stringify({ host, token: value }));
		} catch {
			// Storage off (private mode): the user pastes the token again after a reload
		}
	}

	function recall(): { host: string; token: string } | null {
		try {
			const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
			return typeof saved?.host === 'string' && typeof saved?.token === 'string' ? saved : null;
		} catch {
			return null;
		}
	}

	async function connect(host: string, value: string) {
		await bridgeStore.connect(host, value);
		if (bridgeStore.status.state === 'connected') remember(host, value);
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!portValid || !token.trim()) return;
		connect(`127.0.0.1:${portNumber}`, token.trim());
	}

	onMount(() => {
		const hashToken = new URLSearchParams(location.hash.slice(1)).get('token');
		// The token must not stay in the address bar, history or a copied link. SvelteKit's own
		// replaceState throws before the router has mounted, which onMount of the first page is
		if (hashToken !== null) {
			history.replaceState(history.state, '', location.pathname + location.search);
		}
		const loopback =
			location.protocol === 'http:' &&
			(location.hostname === '127.0.0.1' || location.hostname === 'localhost');
		const saved = recall();
		if (loopback && hashToken) {
			localHost = location.host;
			connect(location.host, hashToken);
		} else if (loopback && saved?.host === location.host) {
			localHost = location.host;
			connect(saved.host, saved.token);
		} else if (saved) {
			port = saved.host.split(':')[1] ?? port;
			token = saved.token;
		}
	});

	onDestroy(() => bridgeStore.disconnect());

	function failureText(host: string, failure: ConnectFailure): string {
		switch (failure.reason) {
			case 'closed':
				return i18nStore.t('bridge.failedClosed', { host });
			case 'newer-server':
				return i18nStore.t('bridge.failedNewer', { version: failure.version });
			case 'older-server':
				return i18nStore.t('bridge.failedOlder', { version: failure.version });
			case 'bad-hello':
				return i18nStore.t('bridge.failedBadHello', { host });
		}
	}

	function namingText(n: Extract<Naming, { state: 'failed' }>): string {
		switch (n.code) {
			case 'no-cli':
				return i18nStore.t('bridge.namingNoCli');
			case 'naming-failed':
				return i18nStore.t('bridge.namingFailed');
			case 'verification-failed':
				return i18nStore.t('bridge.namingRejected');
			default:
				return i18nStore.t('bridge.namingStopped');
		}
	}

	/** One sentence for any RPC error code; codes this viewer does not know show serve's sentence. */
	function requestText(code: RpcErrorCode | 'disconnected', error: string): string {
		switch (code) {
			case 'busy':
				return i18nStore.t('bridge.busyExpand');
			case 'not-ready':
			case 'no-root':
				return i18nStore.t('bridge.noRoot');
			case 'disconnected':
				return i18nStore.t('bridge.disconnected');
			case 'env-file':
				return i18nStore.t('bridge.fileEnv');
			case 'too-large':
				return i18nStore.t('bridge.fileTooLarge');
			case 'binary':
				return i18nStore.t('bridge.fileBinary');
			case 'not-found':
				return i18nStore.t('bridge.fileNotFound');
			case 'changed':
				return i18nStore.t('bridge.fileChanged');
			case 'not-a-file':
				return i18nStore.t('bridge.fileNotAFile');
			case 'invalid-path':
			case 'absolute-path':
			case 'outside-root':
			case 'symlink-outside-root':
				return i18nStore.t('bridge.fileOutside');
			default:
				return i18nStore.t('bridge.otherError', { error });
		}
	}

	const noticeText = $derived.by(() => {
		const n = bridgeStore.notice;
		if (!n) return null;
		if (n.kind === 'map') {
			return i18nStore.t('bridge.mapFailed', { reason: requestText(n.code, n.error) });
		}
		return i18nStore.t('bridge.expandFailed', {
			label: n.label,
			reason: requestText(n.code, n.error)
		});
	});

	async function readSource(path: string) {
		const got = await bridgeStore.readFile(path);
		if (got.ok) return { ok: true as const, content: got.result.content };
		// file.read's busy is about reads, not namings
		const message =
			got.code === 'busy' ? i18nStore.t('bridge.fileBusy') : requestText(got.code, got.error);
		return { ok: false as const, message };
	}

	function backToMap() {
		const path = semanticStore.drilldownPath;
		tabStore.openDiagramTab(path, path.length > 0 ? path[path.length - 1].label : 'Project');
	}
</script>

<svelte:head>
	<title>{bridgeStore.map?.project.name ?? i18nStore.t('bridge.pageTitle')} | Ropeman</title>
</svelte:head>

<div class="bridge-page" data-theme={themeStore.current}>
	<header class="bridge-header">
		<a href={resolve('/')} class="bridge-logo">Ropeman</a>
		{#if showingMap && bridgeStore.map}
			<span class="bridge-project">{bridgeStore.map.project.name}</span>
			<span class="bridge-badge" class:lost={status.state === 'lost'} data-testid="bridge-status">
				{status.state === 'lost'
					? i18nStore.t('bridge.lostBadge')
					: i18nStore.t('bridge.connected')}
			</span>
			{#if status.state === 'connected'}
				<span class="bridge-server">
					{i18nStore.t('bridge.serverInfo', { version: status.server.version, host: status.host })}
				</span>
			{/if}
			<div class="bridge-header-actions">
				<button class="bridge-cta secondary" onclick={() => bridgeStore.disconnect()}>
					{i18nStore.t('bridge.disconnect')}
				</button>
			</div>
		{/if}
	</header>

	<div class="bridge-content">
		{#if showingMap}
			{#if codeTab?.filePath}
				<section class="bridge-source" aria-label={codeTab.filePath}>
					<div class="bridge-source-bar">
						<button class="bridge-cta secondary" onclick={backToMap}>
							<span aria-hidden="true" class="material-symbols-outlined">arrow_back</span>
							{i18nStore.t('bridge.backToMap')}
						</button>
					</div>
					<div class="bridge-source-body">
						<CodeViewer
							filePath={codeTab.filePath}
							read={readSource}
							revision={bridgeStore.revisionOf(codeTab.filePath)}
						/>
					</div>
				</section>
			{:else}
				<div class="bridge-overlay">
					<Breadcrumb />
					{#if status.state === 'lost'}
						<div class="bridge-strip warning" role="alert">
							<span>{i18nStore.t('bridge.lost')}</span>
							<button class="bridge-cta" onclick={() => bridgeStore.reconnect()}>
								{i18nStore.t('bridge.reconnect')}
							</button>
						</div>
					{/if}
					{#if naming?.state === 'pending'}
						<div class="bridge-strip" role="status" data-testid="naming-status">
							<span class="bridge-pulse" aria-hidden="true"></span>
							<span>{i18nStore.t('bridge.namingPending')}</span>
						</div>
					{:else if naming?.state === 'failed'}
						<div class="bridge-strip warning" role="status" data-testid="naming-status">
							<span>
								{namingText(naming)}
								<span class="bridge-detail"
									>{i18nStore.t('bridge.serverSaid', { error: naming.error })}</span
								>
							</span>
						</div>
					{/if}
					{#if noticeText}
						<div class="bridge-strip error" role="alert">
							<span>{noticeText}</span>
							<button class="bridge-cta secondary" onclick={() => bridgeStore.dismissNotice()}>
								{i18nStore.t('bridge.dismiss')}
							</button>
						</div>
					{/if}
				</div>
				<div class="bridge-canvas">
					<ZUICanvas
						onexpand={(node) => bridgeStore.expand(node)}
						namesPending={naming?.state === 'pending'}
					/>
				</div>
				{#if hasSemanticSelection}
					<div class="bridge-detail-panel">
						<SemanticDetailPanel ondismiss={() => (semanticStore.panelDismissed = true)} />
					</div>
				{/if}
			{/if}
		{:else}
			<section class="bridge-card" aria-labelledby="bridge-title">
				<span aria-hidden="true" class="material-symbols-outlined bridge-icon">cable</span>
				<h1 id="bridge-title">{i18nStore.t('bridge.title')}</h1>
				{#if localHost}
					<span class="bridge-badge">{i18nStore.t('bridge.localMode')}</span>
				{/if}

				{#if status.state === 'connecting' || (status.state === 'connected' && !bridgeStore.map)}
					<div class="loading-ring" aria-hidden="true"></div>
					<p role="status">
						{status.state === 'connecting'
							? i18nStore.t('bridge.connecting', { host: status.host })
							: i18nStore.t('bridge.loadingMap')}
					</p>
					{#if noticeText}
						<p class="bridge-error" role="alert">{noticeText}</p>
					{/if}
					<button class="bridge-cta secondary" onclick={() => bridgeStore.disconnect()}>
						{i18nStore.t('bridge.cancel')}
					</button>
				{:else}
					<p class="bridge-desc">{i18nStore.t('bridge.desc')}</p>
					{#if status.state === 'failed'}
						<div class="bridge-failure" role="alert">
							<strong>{i18nStore.t('bridge.failedTitle')}</strong>
							<p>{failureText(status.host, status.failure)}</p>
						</div>
					{/if}
					{#if !localHost}
						<p class="bridge-step">{i18nStore.t('bridge.startServe')}</p>
						<pre class="bridge-command"><code>npx @ropeman/bridge serve --root .</code></pre>
						<form class="bridge-form" onsubmit={submit}>
							<label class="bridge-field">
								<span>{i18nStore.t('bridge.portLabel')}</span>
								<input
									class="input"
									type="number"
									inputmode="numeric"
									min="1"
									max="65535"
									bind:value={port}
									aria-invalid={!portValid}
								/>
							</label>
							<label class="bridge-field grow">
								<span>{i18nStore.t('bridge.tokenLabel')}</span>
								<input
									class="input"
									type="password"
									autocomplete="off"
									spellcheck="false"
									bind:value={token}
									aria-describedby="bridge-token-hint"
								/>
							</label>
							<button class="bridge-cta" type="submit" disabled={!portValid || !token.trim()}>
								{i18nStore.t('bridge.connect')}
							</button>
						</form>
						<p id="bridge-token-hint" class="bridge-hint">
							{i18nStore.t('bridge.tokenHint', { file: TOKEN_FILE })}
						</p>
						<p class="bridge-hint">{i18nStore.t('bridge.copyToken')}</p>
						<pre class="bridge-command"><code>cat {TOKEN_FILE}</code></pre>
					{:else if status.state === 'failed'}
						<button class="bridge-cta" onclick={() => bridgeStore.reconnect()}>
							{i18nStore.t('bridge.reconnect')}
						</button>
					{/if}
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.bridge-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		background: var(--color-background-body);
		color: var(--color-text-primary);
	}

	.bridge-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		height: var(--header-height);
		padding: 0 var(--spacing-4);
		background: var(--color-background-sidebar-icon);
		border-bottom: 1px solid var(--color-border);
		min-width: 0;
	}

	.bridge-logo {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-accent);
		text-decoration: none;
	}

	.bridge-project,
	.bridge-server {
		font-family: var(--font-code);
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.bridge-server {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.bridge-badge {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		padding: var(--spacing-0-5) var(--spacing-2);
		border-radius: var(--radius-full);
		background: var(--color-success-muted);
		color: var(--color-success);
		white-space: nowrap;
	}

	.bridge-badge.lost {
		background: var(--color-warning-muted);
		color: var(--color-text-primary);
	}

	.bridge-header-actions {
		margin-left: auto;
	}

	.bridge-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-1-5);
		min-height: 32px;
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

	.bridge-cta:hover:not(:disabled) {
		opacity: 0.85;
	}

	.bridge-cta:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.bridge-cta.secondary {
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.bridge-cta .material-symbols-outlined {
		font-size: 16px;
	}

	.bridge-content {
		flex: 1;
		display: flex;
		position: relative;
		overflow: hidden;
		min-height: 0;
	}

	.bridge-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-4);
		pointer-events: none;
	}

	.bridge-overlay > :global(*) {
		pointer-events: auto;
	}

	.bridge-strip {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		align-self: flex-start;
		max-width: min(640px, 100%);
		padding: var(--spacing-1-5) var(--spacing-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		background: var(--color-background-surface);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		box-shadow: 0 2px 8px var(--color-shadow);
	}

	.bridge-strip.warning {
		background: var(--color-warning-muted);
		color: var(--color-text-primary);
	}

	.bridge-strip.error {
		background: var(--color-error-muted);
		color: var(--color-text-primary);
	}

	.bridge-detail {
		display: block;
		font-family: var(--font-code);
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		overflow-wrap: anywhere;
	}

	.bridge-pulse {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--color-accent);
		animation: bridge-pulse 1.2s var(--ease-standard) infinite alternate;
	}

	@keyframes bridge-pulse {
		from {
			opacity: 0.25;
		}
	}

	.bridge-canvas {
		--canvas-toolbar-top: 56px;
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.bridge-detail-panel {
		position: relative;
		z-index: 11;
		width: 320px;
		border-left: 1px solid var(--color-border);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.bridge-source {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.bridge-source-bar {
		padding: var(--spacing-2) var(--spacing-4);
		border-bottom: 1px solid var(--color-border);
	}

	.bridge-source-body {
		flex: 1;
		min-height: 0;
	}

	.bridge-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-3);
		width: min(560px, calc(100% - 2 * var(--spacing-4)));
		margin: auto;
		padding: var(--spacing-6) var(--spacing-5);
		text-align: center;
		color: var(--color-text-secondary);
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-container);
		max-height: calc(100% - 2 * var(--spacing-4));
		overflow-y: auto;
	}

	.bridge-card h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-2xl);
		color: var(--color-text-primary);
	}

	.bridge-desc,
	.bridge-step,
	.bridge-hint {
		font-size: var(--font-size-base);
		line-height: 1.6;
	}

	.bridge-step,
	.bridge-hint {
		align-self: stretch;
		text-align: left;
	}

	.bridge-hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.bridge-icon {
		font-size: 48px;
		color: var(--color-text-tertiary);
	}

	.bridge-command {
		align-self: stretch;
		margin: 0;
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-background-muted);
		border-radius: var(--radius-element);
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		text-align: left;
		overflow-x: auto;
		user-select: all;
	}

	.bridge-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--spacing-2);
		align-self: stretch;
	}

	.bridge-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		width: 96px;
		text-align: left;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.bridge-field.grow {
		flex: 1;
		min-width: 160px;
	}

	.bridge-failure {
		align-self: stretch;
		padding: var(--spacing-3);
		text-align: left;
		background: var(--color-error-muted);
		border-radius: var(--radius-element);
		color: var(--color-text-primary);
		font-size: var(--font-size-sm);
		line-height: 1.5;
	}

	.bridge-error {
		color: var(--color-text-primary);
		overflow-wrap: anywhere;
	}

	.loading-ring {
		width: 40px;
		height: 40px;
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
		.bridge-server {
			display: none;
		}

		.bridge-detail-panel {
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
