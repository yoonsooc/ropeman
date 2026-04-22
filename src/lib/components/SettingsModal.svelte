<script lang="ts">
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { authStore } from '$lib/stores/authStore.svelte';
	import { clearCache } from '$lib/services/cacheService';
	import { clearSemanticCache, getSemanticCacheSize } from '$lib/services/semanticCacheService';
	import { SYNTAX_THEMES } from '$lib/services/syntaxThemeService';

	const hasProject = $derived(projectStore.fileTree !== null);

	const aiConnectionInfo = $derived.by(() => {
		const track = authStore.activeTrack;
		switch (track) {
			case 'bridge':
				return { label: 'Local Bridge', color: 'var(--track-bridge)', connected: true };
			case 'edge':
				return { label: 'Demo', color: 'var(--track-demo)', connected: true };
			case 'webgpu':
				return { label: 'WebGPU', color: 'var(--track-webgpu)', connected: true };
			case 'byok': {
				const provider = settingsStore.aiProvider;
				const model = settingsStore.aiModel;
				const providerLabel =
					provider === 'google' ? 'Gemini' : provider === 'anthropic' ? 'Claude' : 'OpenAI';
				return {
					label: `${providerLabel} (${model})`,
					color: 'var(--track-byok)',
					connected: settingsStore.hasApiKey
				};
			}
			default:
				return {
					label: i18nStore.t('settingsAiNotConnected'),
					color: 'var(--text-muted)',
					connected: false
				};
		}
	});

	let { open, onclose, onconnect }: { open: boolean; onclose: () => void; onconnect?: () => void } =
		$props();

	let cacheEnabled = $state(settingsStore.cacheEnabled);
	let showSymbols = $state(settingsStore.showSymbols);
	let maxSkeletonKB = $state(settingsStore.maxSkeletonKB);
	let skeletonUnlimited = $state(settingsStore.skeletonUnlimited);
	let lang = $state<'ko' | 'en'>(settingsStore.language);
	let syntaxTheme = $state(settingsStore.syntaxTheme);
	let customSkipPatternsText = $state(settingsStore.customSkipPatterns.join('\n'));
	let cacheSize = $state(0);

	$effect(() => {
		if (open) {
			cacheEnabled = settingsStore.cacheEnabled;
			showSymbols = settingsStore.showSymbols;
			maxSkeletonKB = settingsStore.maxSkeletonKB;
			skeletonUnlimited = settingsStore.skeletonUnlimited;
			lang = settingsStore.language;
			syntaxTheme = settingsStore.syntaxTheme;
			customSkipPatternsText = settingsStore.customSkipPatterns.join('\n');
			getSemanticCacheSize().then((n) => {
				cacheSize = n;
			});
		}
	});

	function handleCustomSkipPatternsBlur() {
		const parsed = customSkipPatternsText
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		settingsStore.customSkipPatterns = parsed;
		customSkipPatternsText = parsed.join('\n');
	}

	function handleSkeletonKBChange(e: Event) {
		const v = parseInt((e.target as HTMLInputElement).value) || 150;
		maxSkeletonKB = v;
		settingsStore.maxSkeletonKB = v;
	}

	function handleSkeletonUnlimitedToggle() {
		skeletonUnlimited = !skeletonUnlimited;
		settingsStore.skeletonUnlimited = skeletonUnlimited;
	}

	function handleCacheToggle() {
		cacheEnabled = !cacheEnabled;
		settingsStore.cacheEnabled = cacheEnabled;
	}

	async function handleCacheClear() {
		await clearSemanticCache();
		await clearCache();
		cacheSize = 0;
	}

	function handleShowSymbolsToggle() {
		showSymbols = !showSymbols;
		settingsStore.showSymbols = showSymbols;
	}

	function handleLangChange(e: Event) {
		lang = (e.target as HTMLSelectElement).value as 'ko' | 'en';
		settingsStore.language = lang;
		i18nStore.locale = lang;
	}

	function handleThemeChange(e: Event) {
		syntaxTheme = (e.target as HTMLSelectElement).value;
		settingsStore.syntaxTheme = syntaxTheme;
	}

	async function handleReset() {
		await clearCache();
		await clearSemanticCache();
		settingsStore.clearAll();
		cacheEnabled = true;
		showSymbols = false;
		maxSkeletonKB = 150;
		skeletonUnlimited = false;
		lang = 'ko';
		syntaxTheme = 'tomorrow';
		customSkipPatternsText = '';
		cacheSize = 0;
		i18nStore.locale = 'ko';
	}

	// Tooltip positioning for fixed tooltips
	let tooltipPos = $state<{ top: number; left: number } | null>(null);
	let tooltipText = $state('');

	function handleTooltipEnter(e: MouseEvent) {
		const icon = e.currentTarget as HTMLElement;
		const rect = icon.getBoundingClientRect();
		const tipWidth = 260;
		let left = rect.left + rect.width / 2 - tipWidth / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
		tooltipPos = { top: rect.bottom + 6, left };
		tooltipText = icon.getAttribute('data-tooltip') ?? '';
	}

	function handleTooltipLeave() {
		tooltipPos = null;
		tooltipText = '';
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('settings-backdrop')) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop settings-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="modal-card settings-card" role="dialog" aria-modal="true">
			<div class="modal-header">
				<h2>
					<span class="material-symbols-outlined header-icon">settings</span>
					{i18nStore.t('settings')}
				</h2>
				<div class="header-actions">
					<button class="btn-reset" onclick={handleReset}>{i18nStore.t('settingsReset')}</button>
					<button class="modal-close" onclick={onclose}>&#10005;</button>
				</div>
			</div>

			<div class="modal-body">
				{#if hasProject}
					<section class="settings-section">
						<span class="form-label">{i18nStore.t('settingsAiConnection')}</span>
						<div class="section-card">
							<button
								class="ai-connection-btn"
								onclick={() => {
									onclose();
									onconnect?.();
								}}
							>
								<span class="ai-conn-left">
									<span
										class="ai-conn-dot"
										style="background: {aiConnectionInfo.connected
											? 'var(--color-success)'
											: 'var(--text-muted)'}"
									></span>
									<span class="ai-conn-label">{aiConnectionInfo.label}</span>
								</span>
								<span class="material-symbols-outlined ai-conn-icon">settings_input_component</span>
							</button>
						</div>
					</section>
				{/if}

				<section class="settings-section">
					<span class="form-label">{i18nStore.t('settingsSkeletonLimit')}</span>
					<div class="section-card">
						<div class="form-row">
							<label class="checkbox-label">
								<input
									type="checkbox"
									checked={skeletonUnlimited}
									onchange={handleSkeletonUnlimitedToggle}
								/>
								{i18nStore.t('settingsSkeletonUnlimited')}
							</label>
						</div>
						{#if !skeletonUnlimited}
							<div class="form-row">
								<input
									type="range"
									class="settings-range"
									min="50"
									max="1000"
									step="50"
									value={maxSkeletonKB}
									oninput={handleSkeletonKBChange}
								/>
								<span class="range-value">{maxSkeletonKB} KB</span>
							</div>
						{/if}
						<p class="hint">{i18nStore.t('settingsSkeletonHint')}</p>
					</div>
				</section>

				<section class="settings-section">
					<span class="form-label">{i18nStore.t('settingsCustomSkipPatterns')}</span>
					<div class="section-card">
						<textarea
							class="skip-patterns-input"
							bind:value={customSkipPatternsText}
							onblur={handleCustomSkipPatternsBlur}
							placeholder={i18nStore.t('settingsCustomSkipPatternsPlaceholder')}
							rows="4"
							spellcheck="false"
						></textarea>
						<p class="hint">{i18nStore.t('settingsCustomSkipPatternsHint')}</p>
					</div>
				</section>

				<section class="settings-section">
					<span class="form-label" id="cache-toggle-label">
						{i18nStore.t('cacheEnabled')}
						<span
							class="info-tooltip-wrap"
							onmouseenter={handleTooltipEnter}
							onmouseleave={handleTooltipLeave}
							data-tooltip={i18nStore.t('cacheEnabledTooltip')}
						>
							<span class="material-symbols-outlined info-icon">info</span>
						</span>
					</span>
					<div class="section-card">
						<div class="form-row cache-row">
							<button
								class="toggle"
								class:active={cacheEnabled}
								onclick={handleCacheToggle}
								role="switch"
								aria-checked={cacheEnabled}
								aria-labelledby="cache-toggle-label"
							>
								<span class="toggle-knob"></span>
							</button>
							<span class="cache-size">{cacheSize} entries</span>
							{#if cacheSize > 0}
								<button class="btn-cache-clear" onclick={handleCacheClear}>
									<span class="material-symbols-outlined" style="font-size:14px;">delete</span>
									{i18nStore.t('clearCache')}
								</button>
							{/if}
						</div>
					</div>
				</section>

				<section class="settings-section">
					<span class="form-label" id="symbols-toggle-label">
						{i18nStore.t('showSymbols')}
						<span
							class="info-tooltip-wrap"
							onmouseenter={handleTooltipEnter}
							onmouseleave={handleTooltipLeave}
							data-tooltip={i18nStore.t('showSymbolsTooltip')}
						>
							<span class="material-symbols-outlined info-icon">info</span>
						</span>
					</span>
					<div class="section-card">
						<div class="form-row">
							<button
								class="toggle"
								class:active={showSymbols}
								onclick={handleShowSymbolsToggle}
								role="switch"
								aria-checked={showSymbols}
								aria-labelledby="symbols-toggle-label"
							>
								<span class="toggle-knob"></span>
							</button>
						</div>
					</div>
				</section>

				<!-- 2-column grid: Language + Code Theme (Stitch layout) -->
				<div class="settings-grid-2col">
					<section class="settings-section">
						<label class="form-label" for="lang-select">{i18nStore.t('settingsLanguage')}</label>
						<div class="section-card">
							<select id="lang-select" class="select" value={lang} onchange={handleLangChange}>
								<option value="ko">한국어</option>
								<option value="en">English</option>
							</select>
						</div>
					</section>

					<section class="settings-section">
						<label class="form-label" for="theme-select">{i18nStore.t('codeTheme')}</label>
						<div class="section-card">
							<select
								id="theme-select"
								class="select"
								value={syntaxTheme}
								onchange={handleThemeChange}
							>
								{#each SYNTAX_THEMES as theme}
									<option value={theme.id}
										>{theme.label} ({theme.mode === 'dark' ? 'Dark' : 'Light'})</option
									>
								{/each}
							</select>
						</div>
					</section>
				</div>

				<section class="settings-section">
					<label class="form-label" for="font-size-input">{i18nStore.t('codeFontSize')}</label>
					<div class="section-card font-size-row">
						<input
							id="font-size-input"
							type="range"
							min="10"
							max="24"
							step="1"
							value={settingsStore.codeFontSize}
							oninput={(e) => {
								settingsStore.codeFontSize = Number((e.target as HTMLInputElement).value);
							}}
						/>
						<span class="font-size-value">{settingsStore.codeFontSize}px</span>
					</div>
				</section>

				<section class="settings-section shortcuts-section">
					<span class="form-label">{i18nStore.t('shortcuts.title')}</span>
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
							<span class="shortcut-desc">{i18nStore.t('shortcuts.showHelp')}</span>
							<span class="shortcut-keys"><kbd>?</kbd></span>
						</div>
						<div class="shortcut-row">
							<span class="shortcut-desc">{i18nStore.t('shortcuts.closeModal')}</span>
							<span class="shortcut-keys"><kbd>Esc</kbd></span>
						</div>
					</div>
				</section>
			</div>
		</div>
	</div>

	{#if tooltipPos}
		<div class="info-tooltip-fixed" style="top:{tooltipPos.top}px;left:{tooltipPos.left}px;">
			{tooltipText}
		</div>
	{/if}
{/if}

<style>
	.settings-card {
		width: 380px;
	}
	.settings-card :global(.modal-header) {
		padding: 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.settings-card :global(.modal-header h2) {
		font-size: 14px;
		letter-spacing: 0.025em;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.header-icon {
		font-size: 18px;
		color: var(--text-secondary);
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.btn-reset {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 700;
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--error, #ff6e84);
		background: rgba(255, 110, 132, 0.1);
		border: none;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-reset:hover {
		background: rgba(255, 110, 132, 0.2);
	}
	.settings-card :global(.modal-body) {
		padding: 20px;
		gap: 24px;
		max-height: 600px;
		overflow-y: auto;
	}
	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.section-card {
		background: transparent;
		padding: 0;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* 2-column grid for Language + Code Theme */
	.settings-grid-2col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.font-size-row {
		flex-direction: row;
		align-items: center;
		gap: 12px;
	}

	.font-size-row input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}

	.font-size-value {
		font-size: 12px;
		font-weight: 700;
		font-family: var(--font-code);
		color: var(--text-primary);
		min-width: 36px;
		text-align: right;
	}

	/* Info tooltip */
	.info-tooltip-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		margin-left: 4px;
	}

	.info-icon {
		font-size: 14px;
		color: var(--text-muted);
		cursor: help;
		vertical-align: middle;
	}

	:global(.info-tooltip-fixed) {
		position: fixed;
		width: 260px;
		padding: 10px 12px;
		background: var(--bg-secondary, #1a1f27);
		border: 1px solid var(--border, #2a2f38);
		border-radius: 8px;
		font-size: 11px;
		font-weight: 400;
		line-height: 1.6;
		color: var(--text-secondary);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
		z-index: 2000;
		white-space: normal;
		pointer-events: none;
	}

	/* AI Connection button — Stitch style */
	.ai-connection-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--bg-bright, var(--bg-tertiary));
		border: 1px solid var(--ghost-border, rgba(255, 255, 255, 0.08));
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.15s;
	}
	.ai-connection-btn:hover {
		background: var(--bg-highest, #20262f);
	}
	.ai-conn-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ai-conn-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.ai-conn-label {
		font-size: 12px;
		color: var(--text-primary);
	}
	.ai-conn-icon {
		font-size: 16px;
		color: var(--text-muted);
	}

	/* Cache row */
	.cache-row {
		align-items: center;
	}
	.cache-size {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.btn-cache-clear {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		color: var(--error, #ff6e84);
		background: transparent;
		border: 1px solid rgba(255, 110, 132, 0.3);
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-cache-clear:hover {
		background: rgba(255, 110, 132, 0.1);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.checkbox-label input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.settings-range {
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		background: var(--bg-tertiary, #1b2028);
		border-radius: 2px;
		flex: 1;
	}
	.settings-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		height: 12px;
		width: 12px;
		border-radius: 50%;
		background: var(--accent, #a3a6ff);
		cursor: pointer;
	}
	.range-value {
		font-size: 11px;
		font-family: var(--font-code);
		color: var(--accent);
		min-width: 60px;
		text-align: right;
	}
	.skip-patterns-input {
		width: 100%;
		background: var(--bg-bright, var(--bg-tertiary));
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 8px 10px;
		font-family: var(--font-code);
		font-size: 12px;
		color: var(--text-primary);
		resize: vertical;
		min-height: 72px;
	}
	.skip-patterns-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	/* Settings-specific label override: Stitch 10px uppercase */
	.settings-section :global(.form-label) {
		font-size: 10px;
		font-family: var(--font-display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #64748b;
		margin-bottom: 4px;
	}
	.settings-section :global(.select) {
		background: var(--bg-bright, var(--bg-tertiary));
		font-size: 11px;
		border: none;
		border-radius: 4px;
		padding: 6px;
	}
	.settings-section :global(.select:focus) {
		box-shadow: 0 0 0 1px var(--accent);
		border: none;
	}
	.settings-section :global(.toggle) {
		width: 32px;
		height: 16px;
		border-radius: 8px;
	}
	.settings-section :global(.toggle-knob) {
		width: 8px;
		height: 8px;
		top: 4px;
		left: 4px;
	}
	.settings-section :global(.toggle.active .toggle-knob) {
		transform: translateX(16px);
	}
	.shortcuts-section {
		padding-top: 16px;
	}
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
	}
	.shortcut-desc {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.shortcut-keys :global(kbd) {
		font-family: var(--font-code);
		color: var(--text-muted);
		background: var(--bg-lowest, #000000);
		padding: 1px 4px;
		border-radius: 4px;
	}
</style>
