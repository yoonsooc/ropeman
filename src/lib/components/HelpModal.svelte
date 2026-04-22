<script lang="ts">
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

	// Access help translations via raw object for arrays
	const helpKo = {
		usageSteps: [
			'폴더 열기 — 프로젝트 디렉토리를 선택하면 AST 파싱이 자동으로 시작됩니다.',
			'AI 분석 — AI 연결을 설정하면 코드베이스를 의미론적으로 분석하여 다이어그램을 생성합니다.',
			'드릴다운 — 다이어그램 노드를 더블클릭하면 하위 수준으로 탐색합니다.',
			'코드 보기 — 파일 탐색기에서 파일을 더블클릭하면 코드 뷰어가 열립니다.'
		],
		usageInteractionItems: [
			'노드 클릭 — 선택 및 상세 정보 확인',
			'노드 더블클릭 — 드릴다운 탐색',
			'파일 더블클릭 — 코드 뷰어에서 열기',
			'탭 드래그 — 분할 뷰로 이동'
		],
		faqItems: [
			{
				q: '제 프로젝트의 원본 소스 코드가 외부 서버로 유출되나요?',
				a: '안심하셔도 됩니다. 어떠한 경우에도 원본 소스 코드는 외부로 전송되지 않습니다. AI가 맥락을 파악하기 위해 필요한 최소한의 코드 구조 정보(메타데이터)만 활용되며, AI 연동 모드에 따라 다음과 같이 처리됩니다.\n\n• WebGPU 모드 (최고 보안): 100% 기기 내부에서 오프라인으로 처리되며, 어떠한 데이터도 외부로 나가지 않습니다.\n• Demo / API Key 모드: 보안이 적용된 자체 중계 서버를 거쳐 AI 모델 제공사로 안전하게 전달됩니다.\n• Bridge 모드: 로컬에 설치된 CLI 툴을 통해 AI 모델 제공사의 서버로 직접 전송됩니다.',
				slug: 'security'
			},
			{
				q: '어떤 프로그래밍 언어를 지원하나요?',
				a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala를 지원합니다.',
				slug: 'getting-started'
			},
			{
				q: '프로젝트 크기에 제한이 있나요?',
				a: '파일 수 최대 2,000개, 개별 파일 최대 500KB까지 지원합니다. 대규모 프로젝트는 설정에서 코드 구조 요약 크기를 조절하세요.',
				slug: 'troubleshooting'
			},
			{
				q: 'GitHub URL로 분석할 수 있나요?',
				a: '네. 랜딩 페이지에서 공개 GitHub 저장소의 URL을 입력하면 로컬에 프로젝트를 다운로드하지 않고도 바로 분석할 수 있습니다. 비공개 저장소는 지원되지 않습니다.',
				slug: 'getting-started'
			},
			{
				q: '분석 결과를 공유할 수 있나요?',
				a: 'AI 분석이 완료된 후 헤더의 Share 버튼을 클릭하면 공개 링크가 생성됩니다. 이 링크를 통해 다른 사람과 분석 결과를 공유할 수 있습니다.',
				slug: 'faq'
			},
			{
				q: '특정 디렉토리를 분석에서 제외할 수 있나요?',
				a: 'Settings → 추가 제외 디렉토리 textarea에 디렉토리 이름을 1줄 1개씩 입력하면 기본 제외 목록에 추가됩니다. Rust의 target, 생성된 코드가 있는 generated, 모노레포의 third_party 같은 대형 디렉토리를 분석 대상에서 빼고 싶을 때 유용합니다.',
				slug: 'faq'
			},
			{
				q: '진행 중인 분석을 취소하거나 여러 개 동시에 실행할 수 있나요?',
				a: '우측 하단 pill의 빨간 "취소" 버튼으로 언제든 중단 가능합니다 (확인 다이얼로그 + "다시 묻지 않기"). 여러 영역을 동시에 드릴다운하면 pill이 개별 스택되며, 3개를 초과하면 "N개 분석 중" 그룹 배지로 자동 병합됩니다. 분석은 페이지 이동 간에도 계속 진행되며 pill은 어느 라우트에서든 보입니다.',
				slug: 'faq'
			},
			{
				q: '입력한 API 키는 안전하게 보관되나요?',
				a: 'API 키는 저희 서버에 절대 저장되지 않으며, 오직 사용자 기기의 브라우저 로컬 저장소에만 보관됩니다.\n\n• API Key 모드: 브라우저에 저장된 키는 API 호출 시에만 일회성으로 사용되며, 보안 통신을 통해 AI 모델 제공사로 전달됩니다.\n• Bridge 모드: 별도의 API 키 입력 없이, 로컬에 연동된 CLI 툴의 인증 방식을 그대로 사용합니다.\n• WebGPU 모드: 오프라인으로 동작하므로 API 키 자체가 필요하지 않습니다.\n\n설정 초기화로 언제든 삭제할 수 있습니다.',
				slug: 'security'
			}
		]
	};

	const helpEn = {
		usageSteps: [
			'Open Folder — Select a project directory to start automatic AST parsing.',
			'AI Analysis — Configure an AI connection to semantically analyze your codebase and generate diagrams.',
			'Drill-down — Double-click a diagram node to explore deeper levels.',
			'View Code — Double-click a file in the explorer to open the code viewer.'
		],
		usageInteractionItems: [
			'Click node — Select and view details',
			'Double-click node — Drill-down navigation',
			'Double-click file — Open in code viewer',
			'Drag tab — Move to split view'
		],
		faqItems: [
			{
				q: 'Is my original source code ever sent to an external server?',
				a: 'Rest assured — your original source code is never transmitted externally under any circumstances. Only minimal code structure information (metadata) is used for AI context, and it is handled securely based on your chosen AI mode.\n\n• WebGPU mode (highest security): Processed 100% offline on your device. No data leaves your machine.\n• Demo / API Key mode: Routed through our secure relay server to the AI model provider.\n• Bridge mode: Sent directly to the AI provider via your locally installed CLI tool.',
				slug: 'security'
			},
			{
				q: 'What programming languages are supported?',
				a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, and Scala.',
				slug: 'getting-started'
			},
			{
				q: 'Are there project size limits?',
				a: 'Up to 2,000 files and 500KB per individual file. For large projects, adjust the code summary size limit in Settings.',
				slug: 'troubleshooting'
			},
			{
				q: 'Can I analyze a GitHub repository by URL?',
				a: 'Yes. Paste a public GitHub repository URL into the input field on the landing page and click Load. Ropeman fetches the file structure and analyzes it just like a local folder. Private repositories are not supported.',
				slug: 'getting-started'
			},
			{
				q: 'Can I share my analysis results?',
				a: 'Yes. After AI analysis completes, click the Share button in the header to generate a public link. You can share this link with anyone to let them view the analysis.',
				slug: 'faq'
			},
			{
				q: 'Can I exclude specific directories from analysis?',
				a: "Yes. Go to Settings → Additional Excluded Directories and enter one directory name per line. Your custom patterns are merged with the built-in skip list. Useful for large monorepos or generated-code directories like Rust's target, third_party, or generated.",
				slug: 'faq'
			},
			{
				q: 'Can I cancel or run multiple analyses in parallel?',
				a: 'Yes. The bottom-right pill has a red Cancel button (with a one-time confirm + "Don\'t ask again"). Double-click different nodes to drill down in parallel; each request gets its own pill. Beyond three concurrent analyses, pills collapse into a single "N analyses running" group badge. Analysis continues across in-app route navigation and the pill is visible everywhere.',
				slug: 'faq'
			},
			{
				q: 'Are my API keys stored securely?',
				a: "API keys are never stored on our servers — they are kept only in your browser's local storage on your device.\n\n• API Key mode: Keys are used only at the moment of an API call and securely transmitted to the AI model provider.\n• Bridge mode: No API key input is needed. It inherits the authentication of your locally configured CLI tool.\n• WebGPU mode: Runs offline, so no API key is required at all.\n\nYou can delete keys anytime by resetting settings.",
				slug: 'security'
			}
		]
	};

	const helpData = $derived(i18nStore.locale === 'ko' ? helpKo : helpEn);
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop help-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
		<div class="modal-card help-card" role="dialog" aria-modal="true">
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
		padding: 20px;
		flex-shrink: 0;
	}

	.help-card :global(.modal-header h2) {
		font-size: 14px;
		letter-spacing: 0.025em;
	}

	.help-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
		padding: 0 20px;
		gap: 0;
		flex-shrink: 0;
	}

	.help-tab {
		padding: 10px 16px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
		white-space: nowrap;
	}

	.help-tab:hover {
		color: var(--text-primary);
	}

	.help-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.help-body {
		padding: 20px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.help-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.help-section + .help-section {
		margin-top: 20px;
	}

	.help-section-title {
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-secondary);
		margin: 0;
	}

	/* Usage steps */
	.help-steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.help-steps li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent-muted);
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.step-text {
		font-size: 12px;
		color: var(--text-primary);
		line-height: 1.6;
	}

	.help-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.help-list li {
		font-size: 12px;
		color: var(--text-primary);
		line-height: 1.5;
		padding-left: 12px;
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
		background: var(--text-muted);
	}

	/* AI Modes */
	.ai-modes {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.ai-mode-card {
		background: var(--bg-secondary);
		border-radius: 8px;
		padding: 12px;
	}

	.ai-mode-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.ai-mode-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.ai-mode-name {
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.ai-mode-desc {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	/* Shortcuts */
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 0;
	}

	.shortcut-desc {
		font-size: 12px;
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
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
	}

	/* FAQ */
	.faq-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.faq-item {
		background: var(--bg-secondary);
		border-radius: 8px;
		overflow: hidden;
	}

	.faq-question {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		padding: 12px;
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.faq-question::-webkit-details-marker {
		display: none;
	}

	.faq-question::before {
		content: '';
		width: 0;
		height: 0;
		border-left: 5px solid var(--text-muted);
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.faq-item[open] > .faq-question::before {
		transform: rotate(90deg);
	}

	.faq-answer {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.6;
		padding: 0 12px 8px;
		margin: 0;
		white-space: pre-line;
	}

	.faq-learn-more {
		display: inline-block;
		margin: 0 12px 12px;
		padding: 0;
		font-size: 12px;
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}

	.faq-learn-more:hover {
		text-decoration: underline;
	}

	/* Footer */
	.help-footer {
		padding: 12px 20px;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	.help-tour-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		background: transparent;
		border: 1px solid var(--border);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.help-tour-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.help-footer-info {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
		font-size: 10px;
		color: var(--text-muted);
	}

	.help-footer-info a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.help-footer-info a:hover {
		color: var(--accent);
	}

	@media (max-width: 600px) {
		.help-card {
			width: 95vw;
		}
	}
</style>
