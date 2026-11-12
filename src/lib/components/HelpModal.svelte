<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { resolve } from '$app/paths';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { onboardingStore } from '$lib/stores/onboardingStore.svelte';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	function handleRestartTour() {
		onclose();
		onboardingStore.reset();
	}

	type HelpTab = 'usage' | 'aiModes' | 'shortcuts' | 'faq';
	let activeTab = $state<HelpTab>('usage');

	const tabs: { id: HelpTab; key: string }[] = [
		{ id: 'usage', key: 'help.tabUsage' },
		{ id: 'aiModes', key: 'help.tabAiModes' },
		{ id: 'shortcuts', key: 'help.tabShortcuts' },
		{ id: 'faq', key: 'help.tabFaq' }
	];

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
				<button class="modal-close" onclick={onclose}>&#10005;</button>
			</div>

			<div class="help-tabs">
				{#each tabs as tab}
					<button
						class="help-tab"
						class:active={activeTab === tab.id}
						onclick={() => (activeTab = tab.id)}
					>
						{i18nStore.t(tab.key)}
					</button>
				{/each}
			</div>

			<div class="modal-body help-body">
				{#if activeTab === 'usage'}
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
									<span class="ai-mode-dot" style="background: var(--track-bridge)"></span>
									<span class="ai-mode-name">{i18nStore.t('help.aiModeBridge')}</span>
								</div>
								<p class="ai-mode-desc">{i18nStore.t('help.aiModeBridgeDesc')}</p>
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
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.search')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>K</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.toggleTheme')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.toggleView')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.toggleSidebar')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>B</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.exportDiagram')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.showHelp')}</span>
								<span class="shortcut-keys"><kbd>?</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.closeModal')}</span>
								<span class="shortcut-keys"><kbd>Esc</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.closeTab')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>W</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.nextPrevTab')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>Tab</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.toggleSplit')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>\</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.focusPrimary')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>1</kbd></span>
							</div>
							<div class="shortcut-row">
								<span class="shortcut-desc">{i18nStore.t('shortcuts.focusSecondary')}</span>
								<span class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>2</kbd></span>
							</div>
						</div>
					</section>
				{:else if activeTab === 'faq'}
					<section class="help-section">
						<h3 class="help-section-title">{i18nStore.t('help.faqTitle')}</h3>
						<div class="faq-list">
							{#each helpData.faqItems as item}
								<details class="faq-item">
									<summary class="faq-question">{item.q}</summary>
									<p class="faq-answer">{item.a}</p>
									<a
										class="faq-learn-more"
										href={resolve(`/docs/${i18nStore.locale}/${item.slug}`)}
									>
										{i18nStore.t('docs.learnMore')} →
									</a>
								</details>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<div class="help-footer">
				<button class="help-tour-btn" onclick={handleRestartTour}>
					<span class="material-symbols-outlined" style="font-size:16px;">play_circle</span>
					{i18nStore.t('onboarding.restartTour')}
				</button>
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
		font-family: var(--font-display);
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
		border-radius: 50%;
		background: var(--color-accent-muted);
		color: var(--color-accent);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
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
		font-family: var(--font-display);
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

	.faq-question::before {
		content: '';
		width: 0;
		height: 0;
		border-left: 5px solid var(--color-text-tertiary);
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-standard);
	}

	.faq-item[open] > .faq-question::before {
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
		display: inline-block;
		margin: 0 var(--spacing-3) var(--spacing-3);
		padding: 0;
		font-size: var(--font-size-sm);
		color: var(--color-accent);
		text-decoration: none;
		font-weight: var(--font-weight-medium);
	}

	.faq-learn-more:hover {
		text-decoration: underline;
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
	}
</style>
