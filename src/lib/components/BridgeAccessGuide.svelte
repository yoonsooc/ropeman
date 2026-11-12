<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import type { AccessState, BrowserFamily } from '$lib/services/bridgeAccess';

	let {
		state,
		browser,
		host,
		origin,
		local = false
	}: {
		state: AccessState;
		browser: BrowserFamily;
		/** `127.0.0.1:<port>`: where the page tried, or will try, to connect */
		host: string;
		/** This page's origin, for the browser's site settings address and serve's allow list */
		origin: string;
		/** The page is served by serve itself (local mode) */
		local?: boolean;
	} = $props();

	const t = (key: string, params?: Record<string, string | number>) =>
		i18nStore.t(`bridgeAccess.${key}`, params);

	const port = $derived(host.slice(host.lastIndexOf(':') + 1));
	const browserName = $derived(
		browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : t('yourBrowser')
	);
	const SERVE = 'npx @ropeman/bridge serve --root .';
	const LOCAL = 'npx @ropeman/bridge serve --root . --local';
	const TOKEN = 'cat ~/.ropeman/bridge-token';
	const allowThisPage = $derived(`${SERVE} --allow-origin ${origin}`);

	const tone = $derived(
		state === 'granted' || state === 'unasked' || state === 'unknown' || state === 'safari'
			? 'info'
			: state === 'prompt-pending'
				? 'pending'
				: 'problem'
	);
	const icon = $derived(
		{
			unasked: 'shield_lock',
			granted: 'verified_user',
			unknown: 'shield_lock',
			safari: 'open_in_browser',
			'prompt-pending': 'front_hand',
			denied: 'block',
			unanswered: 'help',
			'serve-down': 'power_off',
			refused: 'key_off',
			unexplained: 'link_off'
		}[state]
	);

	/** Where this browser keeps the site's permission */
	const resetSteps = $derived(
		browser === 'chrome' || browser === 'chromium'
			? ['stepSiteControls', 'stepSiteSettings', 'stepAllowLoopback', 'stepReload']
			: browser === 'edge'
				? ['stepEdgeLock', 'stepEdgePermissions', 'stepAllowLoopback', 'stepReload']
				: browser === 'firefox'
					? ['stepFirefoxIcon', 'stepFirefoxRemove', 'stepReload']
					: ['stepOtherSettings', 'stepOtherAllow', 'stepReload']
	);
	const settingsUrl = $derived(
		browser === 'chrome' || browser === 'edge'
			? `${browser}://settings/content/siteDetails?site=${encodeURIComponent(origin)}`
			: null
	);

	/** The copy for each state; Firefox and local mode get their own wording where it differs. */
	const copy = $derived.by((): [string, string] => {
		switch (state) {
			case 'unasked':
				return ['unaskedTitle', 'unaskedBody'];
			case 'granted':
				return ['grantedTitle', 'grantedBody'];
			case 'unknown':
				return browser === 'firefox'
					? ['firefoxTitle', 'firefoxBody']
					: ['unknownTitle', 'unknownBody'];
			case 'safari':
				return ['safariTitle', 'safariBody'];
			case 'prompt-pending':
				return ['promptPendingTitle', 'promptPendingBody'];
			case 'denied':
				return ['deniedTitle', 'deniedBody'];
			case 'unanswered':
				return ['unansweredTitle', 'unansweredBody'];
			case 'serve-down':
				return ['serveDownTitle', 'serveDownBody'];
			case 'refused':
				return local ? ['refusedLocalTitle', 'refusedLocalBody'] : ['refusedTitle', 'refusedBody'];
			case 'unexplained':
				return ['unexplainedTitle', 'unexplainedBody'];
		}
	});
	/** `Browser` starts a sentence: "Your browser does not let..." */
	const params = $derived({
		port,
		browser: browserName,
		Browser: browserName.charAt(0).toUpperCase() + browserName.slice(1)
	});
</script>

<section
	class="access-guide {tone}"
	role={tone === 'info' ? 'note' : tone === 'pending' ? 'status' : 'alert'}
	aria-labelledby="access-guide-title"
	data-testid="access-guide"
	data-state={state}
>
	<div class="guide-head">
		<span aria-hidden="true" class="material-symbols-outlined guide-icon">{icon}</span>
		<h2 id="access-guide-title">{t(copy[0], params)}</h2>
	</div>
	<p>{t(copy[1], params)}</p>

	{#if state === 'denied'}
		<ol class="guide-steps">
			{#each resetSteps as step (step)}
				<li>{t(step)}</li>
			{/each}
		</ol>
		<p class="guide-hint">{t('stepsMayDiffer')}</p>
		{#if settingsUrl}
			<p class="guide-hint">{t('settingsUrl')}</p>
			<pre class="guide-command"><code>{settingsUrl}</code></pre>
		{/if}
	{/if}

	{#if state === 'serve-down'}
		<pre class="guide-command"><code>{SERVE}</code></pre>
	{/if}

	{#if state === 'refused' && !local}
		<pre class="guide-command"><code>{TOKEN}</code></pre>
		<p class="guide-hint">{t('refusedHint')}</p>
		<p class="guide-hint">{t('allowOrigin')}</p>
		<pre class="guide-command"><code>{allowThisPage}</code></pre>
	{/if}

	{#if state === 'unexplained'}
		<ol class="guide-steps">
			<li>
				{t('checkServe', params)}
				<pre class="guide-command"><code>{SERVE}</code></pre>
			</li>
			<li>
				{t('checkToken')}
				<pre class="guide-command"><code>{TOKEN}</code></pre>
			</li>
			<li>{t('checkBlocked', params)}</li>
			<li>
				{t('allowOrigin')}
				<pre class="guide-command"><code>{allowThisPage}</code></pre>
			</li>
		</ol>
	{/if}

	{#if state === 'safari'}
		<ol class="guide-steps">
			<li>{t('stopServe')}</li>
			<li>
				{t('startLocal')}
				<pre class="guide-command"><code>{LOCAL}</code></pre>
			</li>
			<li>{t('openPrinted', { port })}</li>
		</ol>
	{:else if !local && (state === 'denied' || state === 'unanswered' || state === 'unexplained')}
		<div class="guide-local">
			<p>{t('localInstead')}</p>
			<pre class="guide-command"><code>{LOCAL}</code></pre>
			<p class="guide-hint">{t('openPrinted', { port })}</p>
		</div>
	{/if}
</section>

<style>
	.access-guide {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: var(--spacing-3) var(--spacing-4);
		text-align: left;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		background: var(--color-background-muted);
		color: var(--color-text-primary);
		font-size: var(--font-size-sm);
		line-height: 1.55;
	}

	.access-guide.pending {
		background: var(--color-warning-muted);
		/* A browser that never gates loopback connects within milliseconds; don't flash the card */
		animation: guide-reveal 0s 400ms both;
	}

	.access-guide.problem {
		background: var(--color-error-muted);
	}

	@keyframes guide-reveal {
		from {
			visibility: hidden;
		}
	}

	.guide-head {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.guide-icon {
		font-size: 20px;
		flex-shrink: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
	}

	p {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.guide-steps {
		margin: 0;
		padding-left: var(--spacing-5);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.guide-hint {
		color: var(--color-text-secondary);
	}

	.guide-local {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
		padding-top: var(--spacing-2);
		border-top: 1px solid var(--color-border);
	}

	.guide-command {
		margin: var(--spacing-1) 0 0;
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--color-background-surface);
		border-radius: var(--radius-element);
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		user-select: all;
		/* A phone shows the whole command, `--local` included, instead of hiding it behind a scroll */
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
