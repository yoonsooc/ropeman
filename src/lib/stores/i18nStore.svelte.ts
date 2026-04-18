export type Locale = 'ko' | 'en';

interface LandingTranslations {
	headline: string;
	subheadline: string;
	cta: string;
	dragHint: string;
	featureAiTitle: string;
	featureAiDesc: string;
	featureDrillTitle: string;
	featureDrillDesc: string;
	featureBrowserTitle: string;
	featureBrowserDesc: string;
	githubPlaceholder: string;
	githubLoad: string;
	githubOr: string;
	githubInvalidUrl: string;
	githubNotFound: string;
	githubRateLimit: string;
	githubPrivate: string;
	githubLoadError: string;
	specLocalFirst: string;
	specWebgpu: string;
	specSemantic: string;
	specNoData: string;
	exploreCardEyebrow: string;
	exploreCardTitle: string;
	exploreCardCta: string;
	explorePromptTitle: string;
	explorePromptMessage: string;
	explorePromptAnalyze: string;
	explorePromptGithub: string;
}

interface SnippetTranslations {
	divider: string;
	placeholder: string;
	analyze: string;
	lines: string;
	emptyError: string;
}

interface LegendTranslations {
	title: string;
	depends_on: string;
	calls: string;
	extends: string;
	uses: string;
}

export interface AnalysisProgressTranslations {
	waitingParse: string;
	extractingSkeleton: string;
	requestingAI: string;
	generatingDiagram: string;
}

interface HelpTranslations {
	title: string;
	tabUsage: string;
	tabAiModes: string;
	tabShortcuts: string;
	tabFaq: string;
	usageTitle: string;
	usageSteps: string[];
	usageInteraction: string;
	usageInteractionItems: string[];
	aiModesTitle: string;
	aiModeDemo: string;
	aiModeDemoDesc: string;
	aiModeByok: string;
	aiModeByokDesc: string;
	aiModeBridge: string;
	aiModeBridgeDesc: string;
	aiModeWebgpu: string;
	aiModeWebgpuDesc: string;
	shortcutsTitle: string;
	faqTitle: string;
	faqItems: { q: string; a: string }[];
}

interface ShareTranslations {
	button: string;
	confirmTitle: string;
	confirmMessage: string;
	confirmOk: string;
	confirmCancel: string;
	generating: string;
	successTitle: string;
	copyLink: string;
	copied: string;
	openNewTab: string;
	errorTitle: string;
	errorMessage: string;
	close: string;
}

interface DocsTranslations {
	title: string;
	backToApp: string;
	onThisPage: string;
	menu: string;
	categoryIntro: string;
	categoryGuides: string;
	categoryReference: string;
	categorySupport: string;
	headerLink: string;
	footerLink: string;
	learnMore: string;
}

interface OnboardingStepTranslation {
	title: string;
	desc: string;
}

interface OnboardingTranslations {
	skip: string;
	prev: string;
	next: string;
	done: string;
	restartTour: string;
	skipConfirmText: string;
	skipConfirmOk: string;
	skipConfirmCancel: string;
	step1: OnboardingStepTranslation;
	step2: OnboardingStepTranslation;
	step3: OnboardingStepTranslation;
	step4: OnboardingStepTranslation;
	step5: OnboardingStepTranslation;
	step6: OnboardingStepTranslation;
	step7: OnboardingStepTranslation;
	step8: OnboardingStepTranslation;
}

interface TranslationSet {
	title: string;
	subtitle: string;
	darkMode: string;
	lightMode: string;
	chatPlaceholder: string;
	chatTitle: string;
	send: string;
	relatedNodes: string;
	loading: string;
	settings: string;
	openDirectory: string;
	dropHere: string;
	dropHint: string;
	noApiKey: string;
	cacheEnabled: string;
	cacheEnabledTooltip: string;
	clearCache: string;
	showSymbols: string;
	showSymbolsTooltip: string;
	codeTheme: string;
	codeFontSize: string;
	apiKeyPlaceholder: string;
	settingsAiConnection: string;
	settingsConfigureAi: string;
	settingsSkeletonLimit: string;
	settingsSkeletonUnlimited: string;
	settingsSkeletonHint: string;
	settingsCustomSkipPatterns: string;
	settingsCustomSkipPatternsPlaceholder: string;
	settingsCustomSkipPatternsHint: string;
	analysisLeaveConfirm: string;
	analysisCompleted: string;
	analysisFailed: string;
	settingsLanguage: string;
	settingsReset: string;
	settingsAiNotConnected: string;
	analyzing: string;
	analysisProgress: AnalysisProgressTranslations;
	landing: LandingTranslations;
	snippet: SnippetTranslations;
	legend: LegendTranslations;
	shortcuts: {
		title: string;
		search: string;
		toggleTheme: string;
		toggleView: string;
		toggleSidebar: string;
		exportDiagram: string;
		showHelp: string;
		closeModal: string;
		closeTab: string;
		nextPrevTab: string;
		toggleSplit: string;
		focusPrimary: string;
		focusSecondary: string;
	};
	share: ShareTranslations;
	help: HelpTranslations;
	onboarding: OnboardingTranslations;
	docs: DocsTranslations;
}

const translations: Record<Locale, TranslationSet> = {
	ko: {
		title: 'Ropeman',
		subtitle: '코드베이스를 시각적으로 탐색하세요',
		darkMode: '다크모드',
		lightMode: '라이트모드',
		chatPlaceholder: '아키텍처에 대해 질문하세요...',
		chatTitle: 'ROPEMAN ASSISTANT',
		send: '전송',
		relatedNodes: '관련 코드 보기',
		loading: '응답 생성 중...',
		settings: '설정',
		openDirectory: '폴더 열기',
		dropHere: '프로젝트 폴더를 여기에 드롭하세요',
		dropHint: 'Python, JavaScript, TypeScript 프로젝트 지원',
		noApiKey: 'Settings에서 Gemini API 키를 입력하세요',
		cacheEnabled: '분석 캐시',
		cacheEnabledTooltip:
			'AI 분석 결과를 브라우저에 캐싱합니다. 활성화하면 같은 프로젝트를 다시 열 때 AI 재호출 없이 즉시 복원됩니다.',
		clearCache: '캐시 초기화',
		showSymbols: '심볼 사이드바',
		showSymbolsTooltip:
			'AST 파싱으로 추출된 함수/클래스 심볼 목록을 사이드바에 표시합니다. 파일을 열면 해당 파일의 심볼을 볼 수 있습니다.',
		codeTheme: '코드 테마',
		codeFontSize: '코드 폰트 크기',
		settingsAiConnection: 'AI 연결',
		settingsConfigureAi: 'AI 설정',
		settingsSkeletonLimit: '코드 구조 요약 크기 제한',
		settingsSkeletonUnlimited: '무제한',
		settingsSkeletonHint:
			'AI 분석 시 전송되는 코드 구조 요약(메타데이터)의 최대 크기. 큰 프로젝트에서 API 오류 발생 시 줄이세요. (기본: 250KB)',
		settingsCustomSkipPatterns: '추가 제외 디렉토리',
		settingsCustomSkipPatternsPlaceholder: '1줄 1개, 예:\ntarget\nthird_party',
		settingsCustomSkipPatternsHint:
			'기본 제외 목록에 추가로 제외할 디렉토리 이름. 대형 모노레포나 생성된 코드 디렉토리를 분석 대상에서 빼고 싶을 때 사용합니다.',
		analysisLeaveConfirm: '분석이 진행 중입니다. 페이지를 떠나면 취소됩니다. 계속하시겠어요?',
		analysisCompleted: '분석 완료',
		analysisFailed: '분석 실패',
		settingsLanguage: '언어',
		settingsReset: '초기화',
		settingsAiNotConnected: '미연결',
		apiKeyPlaceholder: 'Gemini API 키 입력',
		analyzing: '분석 중...',
		analysisProgress: {
			waitingParse: '파싱 대기 중...',
			extractingSkeleton: '코드 구조 추출 중...',
			requestingAI: 'AI 분석 요청 중...',
			generatingDiagram: '다이어그램 생성 중...'
		},
		landing: {
			headline: 'AI로 코드 구조를<br/><span class="headline-accent">시각화하세요</span>',
			subheadline:
				'AI 기반 시맨틱 아키텍처 다이어그램. 모두 브라우저에서. 소스 코드 업로드 없이 로컬 폴더를 즉시 로드합니다.',
			cta: '폴더 열기',
			dragHint: 'or drag & drop a folder here',
			featureAiTitle: 'AI 의미론적 분석',
			featureAiDesc: 'LLM이 리포지토리를 시맨틱 모듈과 핵심 추상화로 자동 매핑합니다.',
			featureDrillTitle: '드릴다운 탐색',
			featureDrillDesc:
				'고수준 아키텍처 다이어그램에서 특정 코드 라인까지, 맥락을 잃지 않고 탐색합니다.',
			featureBrowserTitle: 'Multi-Track AI',
			featureBrowserDesc:
				'Demo · API Key · Local Bridge · Browser AI — 4가지 분석 방식을 제공합니다. 소스 코드 원문은 어떤 모드에서도 외부로 전송되지 않습니다.',
			githubPlaceholder: 'https://github.com/owner/repo',
			githubLoad: '불러오기',
			githubOr: '또는 GitHub 저장소 URL을 입력하세요',
			githubInvalidUrl: '유효한 GitHub 저장소 URL을 입력해주세요.',
			githubNotFound: '저장소를 찾을 수 없습니다. URL을 확인해주세요.',
			githubRateLimit: 'GitHub API 요청 한도 초과. 잠시 후 다시 시도해주세요.',
			githubPrivate: '비공개 저장소는 지원하지 않습니다.',
			githubLoadError: 'GitHub 저장소 로딩에 실패했습니다.',
			specLocalFirst: '로컬 분석',
			specWebgpu: 'WebGPU 가속',
			specSemantic: '시맨틱 인식',
			specNoData: '데이터 수집 없음',
			exploreCardEyebrow: '처음이신가요? 예시 둘러보기',
			exploreCardTitle: '예시로 시작해보기',
			exploreCardCta: 'Explore Gallery',
			explorePromptTitle: '이 도메인은 상세 분석이 없습니다',
			explorePromptMessage:
				'이 도메인의 하위 구조는 큐레이션된 스냅샷에 포함되지 않았습니다. 직접 분석하려면 원본 프로젝트를 홈에서 불러오세요.',
			explorePromptAnalyze: '홈에서 분석하기',
			explorePromptGithub: 'GitHub에서 보기'
		},
		snippet: {
			divider: '또는 코드 스니펫으로 체험하기',
			placeholder: '여기에 코드를 붙여넣으세요...',
			analyze: '분석하기',
			lines: '줄',
			emptyError: '코드를 입력해주세요'
		},
		legend: {
			title: '범례',
			depends_on: '의존',
			calls: '호출',
			extends: '상속',
			uses: '사용'
		},
		shortcuts: {
			title: '키보드 단축키',
			search: '검색',
			toggleTheme: '테마 전환',
			toggleView: '사이드바 전환 (파일/시맨틱)',
			toggleSidebar: '사이드바 토글',
			exportDiagram: '다이어그램 내보내기',
			showHelp: '도움말',
			closeModal: '모달 닫기',
			closeTab: '탭 닫기',
			nextPrevTab: '다음/이전 탭',
			toggleSplit: '분할 뷰 전환',
			focusPrimary: '주 패인 포커스',
			focusSecondary: '보조 패인 포커스'
		},
		share: {
			button: '공유하기',
			confirmTitle: '공유 링크 생성',
			confirmMessage: '이 분석을 공개 링크로 생성하시겠습니까?',
			confirmOk: '생성',
			confirmCancel: '취소',
			generating: '공유 링크 생성 중...',
			successTitle: '공유 링크가 생성되었습니다',
			copyLink: '링크 복사',
			copied: '복사됨!',
			openNewTab: '새 탭에서 열기',
			errorTitle: '공유 실패',
			errorMessage: '공유 링크를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.',
			close: '닫기'
		},
		help: {
			title: '도움말',
			tabUsage: '사용법',
			tabAiModes: 'AI 모드',
			tabShortcuts: '단축키',
			tabFaq: 'FAQ',
			usageTitle: '기본 사용법',
			usageSteps: [
				'폴더 열기 — 프로젝트 디렉토리를 선택하면 AST 파싱이 자동으로 시작됩니다.',
				'AI 분석 — AI 연결을 설정하면 코드베이스를 의미론적으로 분석하여 다이어그램을 생성합니다.',
				'드릴다운 — 다이어그램 노드를 더블클릭하면 하위 수준으로 탐색합니다.',
				'코드 보기 — 파일 탐색기에서 파일을 더블클릭하면 코드 뷰어가 열립니다.'
			],
			usageInteraction: '인터랙션',
			usageInteractionItems: [
				'노드 클릭 — 선택 및 상세 정보 확인',
				'노드 더블클릭 — 드릴다운 탐색',
				'파일 더블클릭 — 코드 뷰어에서 열기',
				'탭 드래그 — 분할 뷰로 이동'
			],
			aiModesTitle: 'AI 분석 모드',
			aiModeDemo: 'Demo',
			aiModeDemoDesc:
				'무료 체험 모드입니다. 서버 프록시를 통해 동작하며, 요청 횟수와 프로젝트 크기에 제한이 있습니다.',
			aiModeByok: 'API Key (BYOK)',
			aiModeByokDesc:
				'자신의 Gemini/Anthropic/OpenAI API 키를 사용합니다. 키는 브라우저에만 저장되며 서버로 전송되지 않습니다.',
			aiModeBridge: 'Bridge',
			aiModeBridgeDesc:
				'로컬에 설치된 Gemini CLI 또는 Claude CLI를 통해 분석합니다. API 키 없이 CLI 인증을 활용합니다.',
			aiModeWebgpu: 'WebGPU (실험적)',
			aiModeWebgpuDesc:
				'브라우저 내장 AI를 활용합니다. 외부 서버 연결 없이 완전히 로컬에서 동작하지만, 성능은 기기 사양에 따라 달라집니다.',
			shortcutsTitle: '키보드 단축키',
			faqTitle: '자주 묻는 질문',
			faqItems: [
				{
					q: '소스 코드가 서버로 전송되나요?',
					a: '원본 소스 코드는 전송되지 않습니다. AI 분석 시에는 함수/클래스 시그니처만 추출한 코드 구조 요약(메타데이터)만 전송됩니다.'
				},
				{
					q: '어떤 프로그래밍 언어를 지원하나요?',
					a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala를 지원합니다.'
				},
				{
					q: '프로젝트 크기에 제한이 있나요?',
					a: '파일 수 최대 2,000개, 개별 파일 최대 500KB까지 지원합니다. 대규모 프로젝트는 설정에서 코드 구조 요약 크기를 조절하세요.'
				},
				{
					q: 'API 키는 어디에 저장되나요?',
					a: '브라우저의 localStorage에만 저장됩니다. 서버에는 전송되지 않으며, 설정 초기화로 삭제할 수 있습니다.'
				}
			]
		},
		onboarding: {
			skip: '건너뛰기',
			prev: '이전',
			next: '다음',
			done: '완료',
			restartTour: '투어 다시 보기',
			skipConfirmText: '투어를 종료하시겠습니까?\n설정에서 언제든 다시 시작할 수 있습니다.',
			skipConfirmOk: '종료',
			skipConfirmCancel: '계속하기',
			step1: {
				title: '폴더 열기',
				desc: '프로젝트 폴더를 열어 코드베이스를 로드하세요. Python, JavaScript, TypeScript 등 다양한 언어를 지원합니다.'
			},
			step2: {
				title: 'AI 분석',
				desc: 'AI가 코드 구조를 의미론적으로 분석합니다. 역할과 의존 관계를 자동으로 파악하여 다이어그램을 생성합니다.'
			},
			step3: {
				title: '설정',
				desc: 'AI 모드, 테마, 언어 등을 설정할 수 있습니다. API 키 입력이나 분석 옵션도 여기서 관리합니다.'
			},
			step4: {
				title: '시맨틱 트리',
				desc: 'AI가 분석한 역할 기반 트리입니다. 노드를 클릭하면 관련 파일이 하이라이트됩니다.'
			},
			step5: {
				title: '다이어그램 캔버스',
				desc: '노드를 클릭하면 선택, 더블클릭하면 하위 레벨로 드릴다운합니다. 드래그로 캔버스를 이동할 수 있습니다.'
			},
			step6: {
				title: '브레드크럼',
				desc: '드릴다운 경로를 보여줍니다. 클릭하면 상위 레벨로 바로 이동할 수 있습니다.'
			},
			step7: {
				title: '파일 탐색기',
				desc: '파일을 더블클릭하면 해당 파일이 속하는 시맨틱 노드가 다이어그램에서 하이라이트됩니다. 속하는 노드가 없으면 하이라이트가 해제됩니다.'
			},
			step8: {
				title: '분할 뷰',
				desc: 'Ctrl+\\ 로 다이어그램과 코드를 동시에 볼 수 있습니다. 탭을 드래그하여 분할할 수도 있습니다.'
			}
		},
		docs: {
			title: '문서',
			backToApp: '앱으로 돌아가기',
			onThisPage: '이 페이지',
			menu: '메뉴',
			categoryIntro: '시작하기',
			categoryGuides: '가이드',
			categoryReference: '레퍼런스',
			categorySupport: '도움말',
			headerLink: '문서',
			footerLink: '문서',
			learnMore: '자세히 보기'
		}
	},
	en: {
		title: 'Ropeman',
		subtitle: 'Explore codebases visually',
		darkMode: 'Dark Mode',
		lightMode: 'Light Mode',
		chatPlaceholder: 'Ask about architecture...',
		chatTitle: 'ROPEMAN ASSISTANT',
		send: 'Send',
		relatedNodes: 'View Related Code',
		loading: 'Generating response...',
		settings: 'Settings',
		openDirectory: 'Open Directory',
		dropHere: 'Drop a project folder here',
		dropHint: 'Supports Python, JavaScript, and TypeScript projects',
		noApiKey: 'Enter your Gemini API key in Settings',
		cacheEnabled: 'Analysis Cache',
		cacheEnabledTooltip:
			'Caches AI analysis results in your browser. When enabled, reopening the same project restores results instantly without re-calling AI.',
		clearCache: 'Clear Cache',
		showSymbols: 'Symbol Sidebar',
		showSymbolsTooltip:
			'Shows function/class symbols extracted by AST parsing in the sidebar. Open a file to see its symbols.',
		codeTheme: 'Code Theme',
		codeFontSize: 'Code Font Size',
		settingsAiConnection: 'AI Connection',
		settingsConfigureAi: 'Configure AI',
		settingsSkeletonLimit: 'Code Summary Size Limit',
		settingsSkeletonUnlimited: 'Unlimited',
		settingsSkeletonHint:
			'Max size of the code structure summary (metadata) sent during AI analysis. Reduce for large projects if API errors occur. (Default: 250KB)',
		settingsCustomSkipPatterns: 'Additional Excluded Directories',
		settingsCustomSkipPatternsPlaceholder: 'One per line, e.g.:\ntarget\nthird_party',
		settingsCustomSkipPatternsHint:
			'Directory names to exclude in addition to the built-in list. Useful for large monorepos or generated code directories.',
		analysisLeaveConfirm: 'Analysis is in progress. Leaving will cancel it. Continue?',
		analysisCompleted: 'Analysis complete',
		analysisFailed: 'Analysis failed',
		settingsLanguage: 'Language',
		settingsReset: 'Reset',
		settingsAiNotConnected: 'Not Connected',
		apiKeyPlaceholder: 'Enter Gemini API key',
		analyzing: 'Analyzing...',
		analysisProgress: {
			waitingParse: 'Waiting for parsing...',
			extractingSkeleton: 'Extracting code structure...',
			requestingAI: 'Requesting AI analysis...',
			generatingDiagram: 'Generating diagram...'
		},
		landing: {
			headline: 'Visualize code<br/><span class="headline-accent">architecture with AI</span>',
			subheadline:
				'AI-powered semantic architecture diagrams. All in your browser. Load local folders instantly without uploading source code.',
			cta: 'Open Folder',
			dragHint: 'or drag & drop a folder here',
			featureAiTitle: 'AI Semantic Analysis',
			featureAiDesc:
				'LLMs automatically map your repository into semantic modules and key abstractions.',
			featureDrillTitle: 'Drill-down Navigation',
			featureDrillDesc:
				'Navigate from high-level architecture diagrams down to specific lines of code without losing context.',
			featureBrowserTitle: 'Multi-Track AI',
			featureBrowserDesc:
				'Demo · API Key · Local Bridge · Browser AI — choose from 4 analysis modes. Source code is never sent externally in any mode.',
			githubPlaceholder: 'https://github.com/owner/repo',
			githubLoad: 'Load',
			githubOr: 'or enter a GitHub repository URL',
			githubInvalidUrl: 'Please enter a valid GitHub repository URL.',
			githubNotFound: 'Repository not found. Please check the URL.',
			githubRateLimit: 'GitHub API rate limit exceeded. Please try again later.',
			githubPrivate: 'Private repositories are not supported.',
			githubLoadError: 'Failed to load GitHub repository.',
			specLocalFirst: 'Local-First Analysis',
			specWebgpu: 'WebGPU Accelerated',
			specSemantic: 'Semantic Recognition',
			specNoData: 'Zero Data Collection',
			exploreCardEyebrow: 'New here? Browse examples',
			exploreCardTitle: 'Start with an example',
			exploreCardCta: 'Explore Gallery',
			explorePromptTitle: 'No deep analysis for this domain',
			explorePromptMessage:
				"This domain's internal structure isn't part of the curated snapshot. To explore deeper, load the original project from the home page.",
			explorePromptAnalyze: 'Analyze from home',
			explorePromptGithub: 'View on GitHub'
		},
		snippet: {
			divider: 'or try a code snippet',
			placeholder: 'Paste your code here...',
			analyze: 'Analyze',
			lines: 'lines',
			emptyError: 'Please enter some code'
		},
		legend: {
			title: 'Legend',
			depends_on: 'Depends on',
			calls: 'Calls',
			extends: 'Extends',
			uses: 'Uses'
		},
		shortcuts: {
			title: 'Keyboard Shortcuts',
			search: 'Search',
			toggleTheme: 'Toggle Theme',
			toggleView: 'Toggle Sidebar (Files/Semantic)',
			toggleSidebar: 'Toggle Sidebar',
			exportDiagram: 'Export Diagram',
			showHelp: 'Help',
			closeModal: 'Close Modal',
			closeTab: 'Close Tab',
			nextPrevTab: 'Next / Prev Tab',
			toggleSplit: 'Toggle Split',
			focusPrimary: 'Focus Primary Pane',
			focusSecondary: 'Focus Secondary Pane'
		},
		share: {
			button: 'Share',
			confirmTitle: 'Generate Share Link',
			confirmMessage: 'Generate a public link for this analysis?',
			confirmOk: 'Generate',
			confirmCancel: 'Cancel',
			generating: 'Generating share link...',
			successTitle: 'Share link created',
			copyLink: 'Copy Link',
			copied: 'Copied!',
			openNewTab: 'Open in new tab',
			errorTitle: 'Share failed',
			errorMessage: 'Could not generate a share link. Please try again later.',
			close: 'Close'
		},
		help: {
			title: 'Help',
			tabUsage: 'Usage',
			tabAiModes: 'AI Modes',
			tabShortcuts: 'Shortcuts',
			tabFaq: 'FAQ',
			usageTitle: 'Getting Started',
			usageSteps: [
				'Open Folder — Select a project directory to start automatic AST parsing.',
				'AI Analysis — Configure an AI connection to semantically analyze your codebase and generate diagrams.',
				'Drill-down — Double-click a diagram node to explore deeper levels.',
				'View Code — Double-click a file in the explorer to open the code viewer.'
			],
			usageInteraction: 'Interactions',
			usageInteractionItems: [
				'Click node — Select and view details',
				'Double-click node — Drill-down navigation',
				'Double-click file — Open in code viewer',
				'Drag tab — Move to split view'
			],
			aiModesTitle: 'AI Analysis Modes',
			aiModeDemo: 'Demo',
			aiModeDemoDesc:
				'Free trial mode. Runs through a server proxy with limits on request count and project size.',
			aiModeByok: 'API Key (BYOK)',
			aiModeByokDesc:
				'Use your own Gemini/Anthropic/OpenAI API key. Keys are stored only in your browser and never sent to any server.',
			aiModeBridge: 'Bridge',
			aiModeBridgeDesc:
				'Analyze through locally installed Gemini CLI or Claude CLI. Uses CLI authentication without requiring API keys.',
			aiModeWebgpu: 'WebGPU (Experimental)',
			aiModeWebgpuDesc:
				'Uses browser-built-in AI. Runs entirely locally without any external server connection, but performance depends on device specs.',
			shortcutsTitle: 'Keyboard Shortcuts',
			faqTitle: 'Frequently Asked Questions',
			faqItems: [
				{
					q: 'Is my source code sent to a server?',
					a: 'Your original source code is never sent. During AI analysis, only a code structure summary (metadata) containing function/class signatures is transmitted.'
				},
				{
					q: 'What programming languages are supported?',
					a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, and Scala.'
				},
				{
					q: 'Are there project size limits?',
					a: 'Up to 2,000 files and 500KB per individual file. For large projects, adjust the code summary size limit in Settings.'
				},
				{
					q: 'Where are API keys stored?',
					a: "Only in your browser's localStorage. They are never sent to any server and can be deleted by resetting settings."
				}
			]
		},
		onboarding: {
			skip: 'Skip',
			prev: 'Prev',
			next: 'Next',
			done: 'Done',
			restartTour: 'Restart Tour',
			skipConfirmText: 'End the tour?\nYou can restart it anytime from Settings.',
			skipConfirmOk: 'End Tour',
			skipConfirmCancel: 'Continue',
			step1: {
				title: 'Open Folder',
				desc: 'Open a project folder to load your codebase. Supports Python, JavaScript, TypeScript, and more.'
			},
			step2: {
				title: 'AI Analysis',
				desc: 'AI semantically analyzes your code structure, automatically identifying roles and dependencies to generate diagrams.'
			},
			step3: {
				title: 'Settings',
				desc: 'Configure AI mode, theme, language, and more. Manage API keys and analysis options here.'
			},
			step4: {
				title: 'Semantic Tree',
				desc: 'A role-based tree generated by AI analysis. Click a node to highlight related files.'
			},
			step5: {
				title: 'Diagram Canvas',
				desc: 'Click a node to select it, double-click to drill down into sub-levels. Drag to pan the canvas.'
			},
			step6: {
				title: 'Breadcrumb',
				desc: 'Shows your drill-down path. Click any level to navigate back up instantly.'
			},
			step7: {
				title: 'File Explorer',
				desc: 'Double-click a file to highlight the semantic node it belongs to on the diagram. If the file has no matching node, the highlight is cleared.'
			},
			step8: {
				title: 'Split View',
				desc: 'Press Ctrl+\\ to view the diagram and code side by side. You can also drag a tab to split.'
			}
		},
		docs: {
			title: 'Documentation',
			backToApp: 'Back to App',
			onThisPage: 'On this page',
			menu: 'Menu',
			categoryIntro: 'Getting Started',
			categoryGuides: 'Guides',
			categoryReference: 'Reference',
			categorySupport: 'Support',
			headerLink: 'Docs',
			footerLink: 'Docs',
			learnMore: 'Learn more'
		}
	}
};

function createI18nStore() {
	let locale = $state<Locale>('ko');

	return {
		get locale() {
			return locale;
		},
		set locale(v: Locale) {
			locale = v;
		},
		t(key: string): string {
			const keys = key.split('.');
			let value: unknown = translations[locale];
			for (const k of keys) {
				if (value && typeof value === 'object' && k in value) {
					value = (value as Record<string, unknown>)[k];
				} else {
					return key;
				}
			}
			return value as string;
		},
		toggleLocale() {
			locale = locale === 'ko' ? 'en' : 'ko';
		},
		getProgressMessage(key: keyof AnalysisProgressTranslations): string {
			return translations[locale].analysisProgress[key];
		}
	};
}

export const i18nStore = createI18nStore();
