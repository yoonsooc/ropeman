<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { onboardingStore } from '$lib/stores/onboardingStore.svelte';
	import InlineCodeText from './InlineCodeText.svelte';
	import { SHORTCUTS, siteLink, type Surface } from './surface';

	let {
		open,
		onclose,
		surface = 'app'
	}: { open: boolean; onclose: () => void; surface?: Surface } = $props();

	function handleRestartTour() {
		onclose();
		onboardingStore.reset();
	}

	type HelpTab = 'bridge' | 'usage' | 'aiModes' | 'shortcuts' | 'faq';

	const TAB_KEYS: Record<HelpTab, string> = {
		bridge: 'help.tabBridge',
		usage: 'help.tabUsage',
		aiModes: 'help.tabAiModes',
		shortcuts: 'help.tabShortcuts',
		faq: 'help.tabFaq'
	};

	const TABS: Record<Surface, HelpTab[]> = {
		app: ['usage', 'aiModes', 'shortcuts', 'faq'],
		bridge: ['bridge', 'usage', 'aiModes', 'shortcuts', 'faq']
	};

	const tabs = $derived(TABS[surface]);
	// svelte-ignore state_referenced_locally
	let activeTab = $state<HelpTab>(TABS[surface][0]);
	const shortcuts = $derived(SHORTCUTS.filter((s) => s.surfaces.includes(surface)));
	const docsLink = (slug: string) => siteLink(surface, resolve(`docs/${i18nStore.locale}/${slug}`));

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('help-backdrop')) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	const helpData = $derived(i18nStore.messages.help);
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop help-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
		<div class="modal-card help-card" role="dialog" aria-modal="true" tabindex="-1" use:focusTrap>
			<div class="modal-header">
				<h2>{i18nStore.t('help.title')}</h2>
				<button class="modal-close" onclick={onclose} aria-label={i18nStore.t('common.close')}>
					<span aria-hidden="true" class="material-symbols-outlined">close</span>
				</button>
			</div>

			<div class="help-tabs">
				{#each tabs as tab (tab)}
					<button
						class="help-tab"
						class:active={activeTab === tab}
						onclick={() => (activeTab = tab)}
					>
						{i18nStore.t(TAB_KEYS[tab])}
					</button>
				{/each}
			</div>

			<div class="modal-body help-body">
				{#if activeTab === 'bridge'}
					<section class="help-section" data-testid="help-bridge">
						<h3 class="help-section-title">{i18nStore.t('help.bridgeTitle')}</h3>
						<div class="ai-modes">
							{#each helpData.bridgeItems as item (item.title)}
								<div class="ai-mode-card">
									<div class="ai-mode-header">
										<span class="ai-mode-name">{item.title}</span>
									</div>
									<p class="ai-mode-desc"><InlineCodeText text={item.body} /></p>
								</div>
							{/each}
						</div>
						<a class="faq-learn-more bridge-learn-more" {...docsLink('bridge-setup')}>
							{i18nStore.t('docs.learnMore')}
							<span aria-hidden="true" class="material-symbols-outlined inline-icon"
								>arrow_forward</span
							>
						</a>
					</section>
				{:else if activeTab === 'usage'}
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.usageTitle')}</h3>
						<ol class="help-steps">
							{#each helpData.usageSteps as step, i}
								<li>
									<span class="step-number">{i + 1}</span>
									<span class="step-text">{step}</span>
								</li>
							{/each}
						</ol>
					</section>
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.usageInteraction')}</h3>
						<ul class="help-list">
							{#each helpData.usageInteractionItems as item}
								<li>{item}</li>
							{/each}
						</ul>
					</section>
				{:else if activeTab === 'aiModes'}
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.aiModesTitle')}</h3>
						<div class="ai-modes">
							<div class="ai-mode-card">
								<div class="ai-mode-header">
									<span class="ai-mode-dot" style="background: var(--track-demo)"></span>
									<span class="ai-mode-name">{i18nStore.t('help.aiModeDemo')}</span>
								</div>
								<p class="ai-mode-desc">{i18nStore.t('help.aiModeDemoDesc')}</p>
							</div>
							<div class="ai-mode-card">
								<div class="ai-mode-header">
									<span class="ai-mode-dot" style="background: var(--track-byok)"></span>
									<span class="ai-mode-name">{i18nStore.t('help.aiModeByok')}</span>
								</div>
								<p class="ai-mode-desc">{i18nStore.t('help.aiModeByokDesc')}</p>
							</div>
							<div class="ai-mode-card">
								<div class="ai-mode-header">
									<span class="ai-mode-dot" style="background: var(--track-webgpu)"></span>
									<span class="ai-mode-name">{i18nStore.t('help.aiModeWebgpu')}</span>
								</div>
								<p class="ai-mode-desc">{i18nStore.t('help.aiModeWebgpuDesc')}</p>
							</div>
						</div>
					</section>
				{:else if activeTab === 'shortcuts'}
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.shortcutsTitle')}</h3>
						<div class="shortcut-list">
							{#each shortcuts as shortcut (shortcut.label)}
								<div class="shortcut-row">
									<span class="shortcut-desc">{i18nStore.t(`shortcuts.${shortcut.label}`)}</span>
									<span class="shortcut-keys">
										{#each shortcut.keys as key, i (key)}{#if i > 0}+{/if}<kbd>{key}</kbd>{/each}
									</span>
								</div>
							{/each}
						</div>
					</section>
				{:else if activeTab === 'faq'}
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.faqTitle')}</h3>
						<div class="faq-list">
							{#each helpData.faqItems as item}
								<details class="faq-item">
									<summary class="faq-question">
										<span aria-hidden="true" class="material-symbols-outlined faq-chevron"
											>chevron_right</span
										>{item.q}
									</summary>
									<p class="faq-answer">{item.a}</p>
									<a class="faq-learn-more" {...docsLink(item.slug)}>
										{i18nStore.t('docs.learnMore')}
										<span aria-hidden="true" class="material-symbols-outlined inline-icon"
											>arrow_forward</span
										>
									</a>
								</details>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<div class="help-footer">
				<!-- The tour walks the main app; the Bridge viewer has none -->
				{#if surface === 'app'}
					<button class="help-tour-btn" onclick={handleRestartTour}>
						<span aria-hidden="true" class="material-symbols-outlined">play_circle</span>
						{i18nStore.t('onboarding.restartTour')}
					</button>
				{/if}
				<div class="help-footer-info">
					<span>&copy; 2026 Ropeman</span>
					<a href="mailto:contact@ropeman.dev">contact@ropeman.dev</a>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.help-card {
		width: 520px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}

	.help-card :global(.modal-header) {
		padding: var(--spacing-5);
		flex-shrink: 0;
	}

	.help-card :global(.modal-header h2) {
		font-size: var(--font-size-base);
		letter-spacing: 0.025em;
	}

	.help-tabs {
		display: flex;
		border-bottom: 1px solid var(--color-border);
		padding: 0 var(--spacing-5);
		gap: 0;
		flex-shrink: 0;
		/* A longer translation still scrolls instead of pushing the card wider */
		overflow-x: auto;
		scrollbar-width: none;
	}

	.help-tab {
		padding: var(--spacing-2) var(--spacing-4);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color var(--duration-fast) var(--ease-standard),
			border-color var(--duration-fast) var(--ease-standard);
		white-space: nowrap;
	}

	.help-tab:hover {
		color: var(--color-text-primary);
	}

	.help-tab.active {
		color: var(--color-accent);
		border-bottom-color: var(--color-accent);
	}

	.help-body {
		padding: var(--spacing-5);
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.help-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.help-section + .help-section {
		margin-top: var(--spacing-5);
	}

	.help-section-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* Usage steps */
	.help-steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.help-steps li {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-inner);
		background: var(--color-background-muted);
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.step-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
		line-height: 1.6;
	}

	.help-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
	}

	.help-list li {
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
		line-height: 1.5;
		padding-left: var(--spacing-3);
		position: relative;
	}

	.help-list li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 8px;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--color-text-tertiary);
	}

	/* AI Modes */
	.ai-modes {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.ai-mode-card {
		background: var(--color-background-surface);
		border-radius: var(--radius-element);
		padding: var(--spacing-3);
	}

	.ai-mode-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		margin-bottom: var(--spacing-1-5);
	}

	.ai-mode-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.ai-mode-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
	}

	.ai-mode-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	/* Shortcuts */
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1-5);
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-1-5) 0;
	}

	.shortcut-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: var(--spacing-0-5);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.shortcut-keys :global(kbd) {
		font-family: var(--font-code);
		color: var(--color-text-tertiary);
		background: var(--color-background-canvas);
		padding: var(--spacing-0-5) var(--spacing-1-5);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
	}

	/* FAQ */
	.faq-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.faq-item {
		background: var(--color-background-surface);
		border-radius: var(--radius-element);
		overflow: hidden;
	}

	.faq-question {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		padding: var(--spacing-3);
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.faq-question::-webkit-details-marker {
		display: none;
	}

	.faq-chevron {
		font-size: 16px;
		color: var(--color-text-tertiary);
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-standard);
	}

	.faq-item[open] > .faq-question .faq-chevron {
		transform: rotate(90deg);
	}

	.faq-answer {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		padding: 0 var(--spacing-3) var(--spacing-2);
		margin: 0;
		white-space: pre-line;
	}

	.faq-learn-more {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		margin: 0 var(--spacing-3) var(--spacing-3);
		padding: 0;
		font-size: var(--font-size-sm);
		color: var(--color-accent);
		text-decoration: none;
		font-weight: var(--font-weight-medium);
	}

	.bridge-learn-more {
		align-self: flex-start;
		margin: 0;
	}

	.faq-learn-more:hover {
		text-decoration: underline;
	}

	.help-tour-btn .material-symbols-outlined {
		font-size: 16px;
	}

	/* Footer */
	.help-footer {
		padding: var(--spacing-3) var(--spacing-5);
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.help-tour-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		padding: var(--spacing-1-5) var(--spacing-3);
		border-radius: var(--radius-element);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.help-tour-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.help-footer-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		margin-top: var(--spacing-2);
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}

	.help-footer-info:first-child {
		margin-top: 0;
	}

	.help-footer-info a {
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.help-footer-info a:hover {
		color: var(--color-accent);
	}

	@media (max-width: 600px) {
		.help-card {
			width: 95vw;
		}

		/* The Bridge viewer's five tabs fit 320px only with tighter padding */
		.help-tabs {
			padding: 0 var(--spacing-3);
		}

		.help-tab {
			padding: var(--spacing-2);
		}
	}
</style>
