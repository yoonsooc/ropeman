<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';

	let {
		connectHint = true
	}: {
		/** How to connect from ropeman.dev instead, with a link to /bridge. Off on /bridge itself. */
		connectHint?: boolean;
	} = $props();

	const INSTALL = 'npm install -g @ropeman/bridge@0.3.1';
	const SKILL_URL =
		'https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.3.1/skill/ropeman/SKILL.md';
	const ADDRESS = 'http://127.0.0.1:9800/bridge#token=…';

	/** Where each agent loads personal skills, as its own docs (host and path) say, checked 2026-11-13 */
	const AGENTS = [
		{
			id: 'claude',
			name: 'Claude Code',
			dir: '~/.claude/skills',
			tested: true,
			docs: 'code.claude.com/docs/en/skills'
		},
		{
			id: 'codex',
			name: 'Codex',
			dir: '~/.agents/skills',
			tested: false,
			docs: 'developers.openai.com/codex/skills'
		},
		{
			id: 'gemini',
			name: 'Gemini CLI',
			dir: '~/.gemini/skills',
			tested: false,
			docs: 'geminicli.com/docs/cli/skills/'
		},
		{
			id: 'cursor',
			name: 'Cursor',
			dir: '~/.cursor/skills',
			tested: false,
			docs: 'cursor.com/docs/context/skills'
		}
	] as const;
	type Agent = (typeof AGENTS)[number];

	const uid = $props.id();
	let selected = $state<Agent>(AGENTS[0]);
	const skillCommand = $derived(
		`curl --create-dirs -fsSLo ${selected.dir}/ropeman/SKILL.md ${SKILL_URL}`
	);

	/** The last copy, keyed by the command text so switching agents clears it */
	let copy = $state<{ text: string; ok: boolean } | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	const copied = (text: string) => copy?.text === text && copy.ok;
	const copyFailed = (text: string) => copy?.text === text && !copy.ok;

	async function copyCommand(text: string, source: HTMLElement | undefined) {
		clearTimeout(copyTimer);
		try {
			await navigator.clipboard.writeText(text);
			copy = { text, ok: true };
			copyTimer = setTimeout(() => (copy = null), 2000);
		} catch {
			copy = { text, ok: false };
			if (source) window.getSelection()?.selectAllChildren(source);
		}
	}

	let installCode = $state<HTMLElement>();
	let skillCode = $state<HTMLElement>();

	const tabs: HTMLButtonElement[] = [];
	function onTabKey(e: KeyboardEvent, index: number) {
		const last = AGENTS.length - 1;
		const next =
			e.key === 'ArrowRight'
				? index === last
					? 0
					: index + 1
				: e.key === 'ArrowLeft'
					? index === 0
						? last
						: index - 1
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? last
							: null;
		if (next === null) return;
		e.preventDefault();
		selected = AGENTS[next];
		tabs[next]?.focus();
	}

	const t = (key: string, params?: Record<string, string | number>) =>
		i18nStore.t(`agentSetup.${key}`, params);
	/** The address renders as code inside the sentence, wherever the language puts it */
	const [askBefore, askAfter] = $derived(t('askBody').split('{address}'));

	const announcement = $derived(
		copy === null
			? ''
			: !copy.ok
				? t('copyFailed')
				: copy.text === INSTALL
					? t('copiedInstall')
					: t('copiedSkill', { agent: selected.name })
	);
</script>

<ol class="agent-setup" data-testid="agent-setup">
	<li class="step">
		<h3>{t('installTitle')}</h3>
		<p>{t('installBody')}</p>
		<div class="command">
			<pre data-testid="install-command"><code bind:this={installCode}>{INSTALL}</code></pre>
			<button
				type="button"
				class="copy"
				aria-label={t('copyInstall')}
				onclick={() => copyCommand(INSTALL, installCode)}
			>
				<span aria-hidden="true" class="material-symbols-outlined"
					>{copied(INSTALL) ? 'check' : 'content_copy'}</span
				>
				<span>{copied(INSTALL) ? t('copied') : t('copy')}</span>
			</button>
		</div>
		{#if copyFailed(INSTALL)}
			<p class="copy-failed" data-testid="copy-failed">{t('copyFailed')}</p>
		{/if}
	</li>

	<li class="step">
		<h3>{t('skillTitle')}</h3>
		<div class="agents" role="tablist" aria-label={t('agentsLabel')}>
			{#each AGENTS as agent, i (agent.id)}
				<button
					bind:this={tabs[i]}
					type="button"
					role="tab"
					id="{uid}-tab-{agent.id}"
					aria-selected={selected.id === agent.id}
					aria-controls="{uid}-panel"
					tabindex={selected.id === agent.id ? 0 : -1}
					onclick={() => (selected = agent)}
					onkeydown={(e) => onTabKey(e, i)}
				>
					{agent.name}
				</button>
			{/each}
		</div>
		<div
			class="agent-panel"
			role="tabpanel"
			id="{uid}-panel"
			aria-labelledby="{uid}-tab-{selected.id}"
			tabindex="0"
		>
			<p>{t('skillBody', { agent: selected.name })}</p>
			<div class="command">
				<pre data-testid="skill-command"><code bind:this={skillCode}>{skillCommand}</code></pre>
				<button
					type="button"
					class="copy"
					aria-label={t('copySkill', { agent: selected.name })}
					onclick={() => copyCommand(skillCommand, skillCode)}
				>
					<span aria-hidden="true" class="material-symbols-outlined"
						>{copied(skillCommand) ? 'check' : 'content_copy'}</span
					>
					<span>{copied(skillCommand) ? t('copied') : t('copy')}</span>
				</button>
			</div>
			{#if copyFailed(skillCommand)}
				<p class="copy-failed" data-testid="copy-failed">{t('copyFailed')}</p>
			{/if}
			<p class="note" data-testid="agent-support">
				{#if selected.tested}
					<span aria-hidden="true" class="material-symbols-outlined tested">check_circle</span>
					{t('tested', { agent: selected.name })}
				{:else}
					<span aria-hidden="true" class="material-symbols-outlined">info</span>
					<span>
						{t('untested', { agent: selected.name, dir: selected.dir })}
						<a href={`https://${selected.docs}`} target="_blank" rel="noopener noreferrer"
							>{t('docsLink', { agent: selected.name })}</a
						>
					</span>
				{/if}
			</p>
		</div>
	</li>

	<li class="step">
		<h3>{t('askTitle')}</h3>
		<p>{askBefore}<code class="address">{ADDRESS}</code>{askAfter}</p>
		{#if connectHint}
			<div class="connect" data-testid="connect-hint">
				<p class="connect-lead">{t('connectLead')}</p>
				<ul>
					<li>{t('connectChromium')}</li>
					<li>{t('connectFirefox')}</li>
					<li>{t('connectSafari')}</li>
				</ul>
				<a class="connect-link" href={resolve('/bridge')}>
					{t('connectLink')}
					<span aria-hidden="true">&#x2192;</span>
				</a>
			</div>
		{/if}
	</li>
</ol>
<p class="shell-note">{t('shellNote')}</p>
<p class="visually-hidden" role="status" data-testid="copy-status">{announcement}</p>

<style>
	.agent-setup {
		list-style: none;
		counter-reset: setup;
		display: grid;
		gap: var(--spacing-8);
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.step {
		counter-increment: setup;
		position: relative;
		padding-left: 44px;
		min-width: 0;
	}

	/* The order is the instruction, so the step number carries information */
	.step::before {
		content: counter(setup);
		position: absolute;
		left: 0;
		top: -2px;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		background: var(--color-accent-muted);
		color: var(--color-accent);
		font-family: var(--font-display);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		font-variant-numeric: tabular-nums;
	}

	.step:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 13.5px;
		top: 34px;
		bottom: calc(-1 * var(--spacing-8) + 6px);
		width: 1px;
		background: var(--color-border);
	}

	h3 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		line-height: 1.4;
		margin: 0 0 var(--spacing-1-5);
		text-wrap: balance;
	}

	p {
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
		max-width: 68ch;
	}

	.command {
		display: flex;
		align-items: stretch;
		margin-top: var(--spacing-3);
		background: var(--color-syntax-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		min-width: 0;
	}

	pre {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: var(--spacing-3) var(--spacing-4);
		font-family: var(--font-code);
		font-size: var(--font-size-sm);
		line-height: 1.6;
		color: var(--color-syntax-text);
		/* The whole command stays visible, so people can read what they paste */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.address {
		font-family: var(--font-code);
		font-size: 0.92em;
		color: var(--color-text-primary);
		overflow-wrap: anywhere;
	}

	.copy {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		flex-shrink: 0;
		padding: 0 var(--spacing-3);
		border-left: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		cursor: pointer;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-standard);
	}

	.copy .material-symbols-outlined {
		font-size: 16px;
	}

	@media (hover: hover) {
		.copy:hover {
			color: var(--color-accent);
		}
	}

	.agents {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
		margin-top: var(--spacing-3);
		padding: var(--spacing-1);
		width: fit-content;
		max-width: 100%;
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
	}

	[role='tab'] {
		padding: var(--spacing-1-5) var(--spacing-3);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	[role='tab'][aria-selected='true'] {
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	@media (hover: hover) {
		[role='tab'][aria-selected='false']:hover {
			color: var(--color-text-primary);
		}
	}

	.agent-panel {
		margin-top: var(--spacing-3);
		border-radius: var(--radius-element);
	}

	.agent-panel:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 4px;
	}

	.copy-failed {
		margin-top: var(--spacing-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.note {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-1-5);
		margin-top: var(--spacing-3);
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.note .material-symbols-outlined {
		font-size: 16px;
		margin-top: 2px;
	}

	.note .tested {
		color: var(--color-icon-success);
	}

	.note a,
	.connect-link {
		color: var(--color-accent);
		text-underline-offset: 3px;
	}

	.connect {
		margin-top: var(--spacing-4);
		padding: var(--spacing-4);
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
	}

	.connect-lead {
		font-weight: var(--font-weight-medium);
		color: var(--color-text-primary);
	}

	.connect ul {
		margin: var(--spacing-2) 0 var(--spacing-3);
		padding-left: var(--spacing-5);
		display: grid;
		gap: var(--spacing-1);
		font-size: var(--font-size-sm);
		line-height: 1.55;
		color: var(--color-text-secondary);
	}

	.connect-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1-5);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		text-decoration: none;
	}

	.shell-note {
		margin-top: var(--spacing-6);
		padding-left: 44px;
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		text-align: left;
	}

	@media (max-width: 480px) {
		.step {
			padding-left: 36px;
		}

		.command {
			flex-direction: column;
		}

		.copy {
			justify-content: flex-end;
			padding: var(--spacing-2) var(--spacing-3);
			border-left: none;
			border-top: 1px solid var(--color-border);
		}

		.shell-note {
			padding-left: 0;
		}
	}
</style>
