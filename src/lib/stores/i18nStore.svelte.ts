import type { Locale } from '$lib/utils/locale';
import { settingsStore } from './settingsStore.svelte';

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
	mobileFolderHint: string;
	mobileGithubLead: string;
	githubInvalidUrl: string;
	githubNotFound: string;
	githubRateLimit: string;
	githubPrivate: string;
	githubLoadError: string;
	specLocalFirst: string;
	specWebgpu: string;
	specSemantic: string;
	specNoData: string;
	exampleCta: string;
	heroShotAlt: string;
	heroShotCaption: string;
	heroShotLink: string;
	dropRegion: string;
	loadingTitle: string;
	parsingLabel: string;
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
	analyzeFailed: string;
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
	faqItems: { q: string; a: string; slug: string }[];
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
	tooLarge: string;
}

interface AIErrorTranslations {
	tpm: string;
	rateLimit: string;
	quota: string;
	auth: string;
	network: string;
	demo: string;
	unknown: string;
	actionSize: string;
	actionModel: string;
	actionKey: string;
	actionExplore: string;
	actionConnect: string;
}

type Strings<K extends string> = Record<K, string>;

type AnalyzeTranslations = Strings<
	| 'demoNotice'
	| 'byokKeyNotice'
	| 'title'
	| 'current'
	| 'demoSub'
	| 'active'
	| 'start'
	| 'byokName'
	| 'keySet'
	| 'notConfigured'
	| 'provider'
	| 'model'
	| 'customModel'
	| 'modelPlaceholder'
	| 'apiKeyLabel'
	| 'apiKeyPlaceholder'
	| 'test'
	| 'valid'
	| 'invalid'
	| 'startWithApiKey'
	| 'bridgeDesktopOnly'
	| 'connected'
	| 'disconnected'
	| 'cliTool'
	| 'cliAuto'
	| 'port'
	| 'connect'
	| 'disconnect'
	| 'token'
	| 'tokenPlaceholder'
	| 'startWithBridge'
	| 'webgpuName'
	| 'webgpuDesktopOnly'
	| 'webgpuUnsupported'
	| 'modelLoaded'
	| 'downloading'
	| 'cachedNeedsLoading'
	| 'notInitialized'
	| 'startWithWebgpu'
	| 'setupModel'
	| 'payloadPreview'
	| 'copyJson'
	| 'limit'
	| 'unlimited'
	| 'footerHint'
>;

interface NewProjectTranslations {
	title: string;
	openFolder: string;
	githubLabel: string;
	replaceNote: string;
	cancel: string;
}

interface HeaderTranslations {
	newLabel: string;
	analyze: string;
	analyzeTitle: string;
	languageToggle: string;
	gallery: string;
	home: string;
	homeConfirmTitle: string;
	homeConfirmMessage: string;
	homeConfirmOk: string;
	homeConfirmCancel: string;
	trackBadgeTitle: string;
}

interface NodeTranslations {
	fileOne: string;
	fileMany: string;
	openInside: string;
	openCode: string;
	notInSnapshot: string;
	notInSnapshotShort: string;
	reanalyze: string;
	unclassified: string;
	unclassifiedDesc: string;
}

interface PanelTranslations {
	close: string;
	description: string;
	files: string;
	keySymbols: string;
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
	settingsCustomIncludePatterns: string;
	settingsCustomIncludePatternsPlaceholder: string;
	settingsCustomIncludePatternsHint: string;
	analysisCompleted: string;
	analysisFailed: string;
	analysisGroupExpand: string;
	analysisGroupCollapse: string;
	analysisCancelLabel: string;
	analysisCancelConfirmTitle: string;
	analysisCancelConfirmMessage: string;
	analysisCancelConfirmMessageSingle: string;
	analysisCancelConfirmMessageAll: string;
	analysisCancelConfirmOk: string;
	analysisCancelConfirmBack: string;
	analysisCancelAll: string;
	analysisGroupRunning: string;
	dontAskAgain: string;
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
	newProject: NewProjectTranslations;
	header: HeaderTranslations;
	node: NodeTranslations;
	panel: PanelTranslations;
	aiError: AIErrorTranslations;
	analyze: AnalyzeTranslations;
	help: HelpTranslations;
	onboarding: OnboardingTranslations;
	docs: DocsTranslations;
	analysisInProgress: string;
	common: Strings<
		'close' | 'cancel' | 'retry' | 'copy' | 'loading' | 'project' | 'error' | 'beta' | 'symbolCount'
	>;
	track: Strings<
		| 'edge'
		| 'byok'
		| 'bridge'
		| 'bridgeShort'
		| 'webgpu'
		| 'none'
		| 'disconnected'
		| 'bridgeConnected'
		| 'bridgeDisconnected'
	>;
	webgpuSetup: Strings<
		| 'title'
		| 'model'
		| 'parameters'
		| 'vram'
		| 'download'
		| 'estTime'
		| 'vramWarning'
		| 'cachedHint'
		| 'downloadHint'
		| 'loadModel'
		| 'downloadSetup'
		| 'downloadingModel'
		| 'cancelDownload'
		| 'starting'
		| 'ready'
		| 'timeUnder1'
		| 'time1to3'
		| 'time3to6'
		| 'time5to10'
	>;
	drilldown: Strings<'title' | 'badge' | 'desc' | 'trackLine' | 'confirm'>;
	nodeDetail: Strings<
		'title' | 'details' | 'language' | 'lines' | 'children' | 'parent' | 'id' | 'empty'
	>;
	explorer: Strings<'title' | 'hide' | 'show' | 'filterPlaceholder' | 'clearFilter'>;
	sidebar: Strings<
		'fileExplorer' | 'semanticTree' | 'semanticTreeNeedsAnalysis' | 'hidePanel' | 'semanticEmpty'
	>;
	codeViewer: Strings<'empty' | 'lines' | 'symbols' | 'noProject' | 'notAccessible' | 'loadFailed'>;
	search: Strings<'placeholder' | 'noResults' | 'file'>;
	statusBar: Strings<'zoom' | 'minimap'>;
	parsing: Strings<'title' | 'fileProgress'>;
	chat: Strings<'notConnected' | 'connect' | 'cached'>;
	pane: Strings<'empty' | 'dropToSplit'>;
	canvas: Strings<
		| 'noDirectConnection'
		| 'sharedFiles'
		| 'moreFiles'
		| 'minimap'
		| 'analysisRequests'
		| 'edgeDependsOn'
		| 'edgeCalls'
		| 'edgeExtends'
		| 'edgeUses'
	>;
	settingsUi: Strings<'cacheEntries' | 'themeDark' | 'themeLight'>;
	dropzone: Strings<'needsChromium' | 'folderOnly' | 'readFailed' | 'openFailed' | 'processFailed'>;
	symbolBadge: Strings<
		'static' | 'async' | 'generator' | 'route' | 'export_default' | 'decorator' | 'abstract'
	>;
	docsUi: Strings<'sidebarNav' | 'closeMenu' | 'loadingDocs'>;
	explore: Strings<
		| 'navLabel'
		| 'pageTitle'
		| 'home'
		| 'heroTitle'
		| 'heroDesc'
		| 'searchPlaceholder'
		| 'searchLabel'
		| 'languageLabel'
		| 'allLanguages'
		| 'empty'
		| 'entryTitle'
		| 'analyzeOwn'
		| 'loadingEntry'
		| 'notAnalyzedTitle'
		| 'notAnalyzedDesc'
		| 'analyzeFromHome'
		| 'viewOnGithub'
		| 'backToGallery'
	>;
	shareView: Strings<
		| 'badge'
		| 'pageTitleFallback'
		| 'projectFallback'
		| 'analyzeOwn'
		| 'loading'
		| 'notFoundTitle'
		| 'notFound'
		| 'loadFailed'
		| 'goHome'
	>;
}

const translations: Record<Locale, TranslationSet> = {
	ko: {
		title: 'Ropeman',
		subtitle: '코드베이스를 시각적으로 탐색하세요',
		darkMode: '다크모드',
		lightMode: '라이트모드',
		chatPlaceholder: '아키텍처를 물어보세요...',
		chatTitle: 'ROPEMAN ASSISTANT',
		send: '전송',
		relatedNodes: '관련 코드 보기',
		loading: '응답 생성 중...',
		settings: '설정',
		openDirectory: '폴더 열기',
		dropHere: '프로젝트 폴더를 여기에 놓으세요',
		dropHint: 'Python, JavaScript, TypeScript 프로젝트를 지원합니다',
		noApiKey: '설정에서 Gemini API 키를 입력하세요',
		cacheEnabled: '분석 캐시',
		cacheEnabledTooltip:
			'AI 분석 결과를 이 브라우저에 저장합니다. 켜 두면 같은 프로젝트를 다시 열 때 AI를 다시 부르지 않고 저장한 결과를 보여 줍니다.',
		clearCache: '캐시 초기화',
		showSymbols: '심볼 사이드바',
		showSymbolsTooltip:
			'파서가 찾은 함수와 클래스 목록을 사이드바에 보여 줍니다. 파일을 열면 그 파일의 목록이 나옵니다.',
		codeTheme: '코드 테마',
		codeFontSize: '코드 폰트 크기',
		settingsAiConnection: 'AI 연결',
		settingsConfigureAi: 'AI 설정',
		settingsSkeletonLimit: '코드 구조 요약 크기 제한',
		settingsSkeletonUnlimited: '무제한',
		settingsSkeletonHint:
			'AI 분석 한 번에 보내는 코드 구조 요약(심볼, 시그니처, import)의 최대 크기입니다. 큰 프로젝트에서 API 오류가 나면 줄이세요. 기본값은 250KB입니다.',
		settingsCustomSkipPatterns: '추가 제외 디렉토리',
		settingsCustomSkipPatternsPlaceholder: '한 줄에 하나씩. 예:\ntarget\nthird_party',
		settingsCustomSkipPatternsHint:
			'기본 제외 목록에 더할 폴더입니다. 이름만 쓰면 어느 깊이에 있든 빼고, /가 들어가면 프로젝트 루트부터의 경로로 봅니다. 생성된 코드나 큰 모노레포 폴더를 뺄 때 쓰세요.',
		settingsCustomIncludePatterns: '포함할 경로',
		settingsCustomIncludePatternsPlaceholder: '한 줄에 하나씩. 예:\ndocs\n.github/workflows',
		settingsCustomIncludePatternsHint:
			'여기 적은 경로는 제외 규칙에 걸려도 읽습니다. 이름만 쓰면 어느 깊이에 있든 그 이름의 폴더나 파일을, /가 들어가면 프로젝트 루트부터의 경로를 포함합니다. 에이전트 지침 폴더(.agents, .cursor, .claude/skills, .github/instructions 등)는 기본으로 포함합니다.',
		analysisCompleted: '분석 완료',
		analysisFailed: '분석 실패',
		analysisGroupExpand: '분석 목록 펼치기',
		analysisGroupCollapse: '분석 목록 접기',
		analysisCancelLabel: '취소',
		analysisCancelConfirmTitle: '분석 취소',
		analysisCancelConfirmMessage:
			'진행 중인 AI 분석을 취소할까요? 지금까지 분석한 내용은 사라집니다.',
		analysisCancelConfirmMessageSingle:
			'{label} 분석을 취소할까요? 지금까지 분석한 내용은 사라집니다.',
		analysisCancelConfirmMessageAll:
			'진행 중인 분석 {count}개를 모두 취소할까요? 지금까지 분석한 내용은 사라집니다.',
		analysisCancelConfirmOk: '분석 취소',
		analysisCancelConfirmBack: '계속 분석',
		analysisCancelAll: '전체 취소',
		analysisGroupRunning: '{count}개 분석 중',
		analysisInProgress: 'AI 분석 진행 중',
		dontAskAgain: '다시 묻지 않기',
		settingsLanguage: '언어',
		settingsReset: '초기화',
		settingsAiNotConnected: '연결 안 됨',
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
				'폴더를 열면 AI가 코드를 역할별로 묶어 아키텍처 다이어그램을 그립니다. 파싱은 브라우저에서 하고, 소스 코드는 업로드하지 않습니다.',
			cta: '폴더 열기',
			dragHint: '또는 폴더를 여기로 끌어다 놓으세요',
			featureAiTitle: 'AI 시맨틱 분석',
			featureAiDesc: 'LLM이 파일을 하는 일에 따라 모듈로 묶고, 주요 추상화에 이름을 붙입니다.',
			featureDrillTitle: '드릴다운 탐색',
			featureDrillDesc:
				'전체 다이어그램에서 파일 하나의 코드까지 내려가 봅니다. 브레드크럼이 지금 위치를 보여 줍니다.',
			featureBrowserTitle: '네 가지 AI 방식',
			featureBrowserDesc:
				'데모, API 키, 로컬 브리지, 브라우저 AI 중에서 고르세요. 어느 방식이든 AI에는 코드 구조 요약을 보내고, 소스 파일은 브라우저에 남깁니다.',
			githubPlaceholder: 'https://github.com/owner/repo',
			githubLoad: '불러오기',
			githubOr: '또는 GitHub 저장소 URL을 입력하세요',
			mobileFolderHint:
				'모바일 브라우저에서는 로컬 폴더를 열 수 없습니다. 대신 공개 GitHub 저장소 URL을 입력하세요.',
			mobileGithubLead: 'GitHub 저장소 URL로 분석을 시작하세요',
			githubInvalidUrl: 'GitHub 저장소 URL을 입력하세요. 예: https://github.com/owner/repo',
			githubNotFound: '저장소를 찾을 수 없습니다. URL을 확인하세요.',
			githubRateLimit: 'GitHub API 요청 한도에 걸렸습니다. 잠시 후 다시 시도하세요.',
			githubPrivate: '비공개 저장소는 지원하지 않습니다.',
			githubLoadError: 'GitHub 저장소를 불러오지 못했습니다.',
			specLocalFirst: '로컬 분석',
			specWebgpu: 'WebGPU 가속',
			specSemantic: '역할별 묶음',
			specNoData: '데이터 수집 없음',
			exampleCta: '분석 예시 보기',
			heroShotAlt:
				'huggingface/transformers를 분석한 Ropeman 화면. 도메인별 노드와 연결, 오른쪽에 선택한 노드의 파일과 주요 심볼',
			heroShotCaption:
				'huggingface/transformers를 실제로 분석한 결과입니다. 눌러서 직접 살펴보세요.',
			heroShotLink: 'huggingface/transformers 분석 예시 열기',
			dropRegion: '폴더 놓는 곳',
			loadingTitle: '프로젝트 불러오는 중',
			parsingLabel: '파일 파싱 중',
			explorePromptTitle: '이 도메인은 상세 분석이 없습니다',
			explorePromptMessage:
				'예시 스냅샷은 이 도메인까지만 담고 있습니다. 더 들어가려면 홈에서 프로젝트를 불러와 분석하세요.',
			explorePromptAnalyze: '홈에서 분석하기',
			explorePromptGithub: 'GitHub에서 보기'
		},
		snippet: {
			divider: '또는 코드 스니펫으로 해 보기',
			placeholder: '여기에 코드를 붙여넣으세요...',
			analyze: '분석하기',
			lines: '줄',
			emptyError: '코드를 입력하세요',
			analyzeFailed: '스니펫을 분석하지 못했습니다: {error}'
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
			toggleSidebar: '사이드바 열고 닫기',
			exportDiagram: '다이어그램 내보내기',
			showHelp: '도움말',
			closeModal: '창 닫기',
			closeTab: '탭 닫기',
			nextPrevTab: '다음/이전 탭',
			toggleSplit: '분할 뷰 켜고 끄기',
			focusPrimary: '주 창 선택',
			focusSecondary: '보조 창 선택'
		},
		share: {
			button: '공유하기',
			confirmTitle: '공유 링크 만들기',
			confirmMessage: '이 분석의 공개 링크를 만들까요? 링크가 있으면 누구나 볼 수 있습니다.',
			confirmOk: '만들기',
			confirmCancel: '취소',
			generating: '공유 링크 만드는 중...',
			successTitle: '공유 링크를 만들었습니다',
			copyLink: '링크 복사',
			copied: '복사됨!',
			openNewTab: '새 탭에서 열기',
			errorTitle: '공유 실패',
			errorMessage: '공유 링크를 만들지 못했습니다. 잠시 후 다시 시도하세요.',
			close: '닫기',
			tooLarge: '분석 데이터가 공유 한도(1MB)를 넘습니다. 더 작은 프로젝트로 시도하세요.'
		},
		aiError: {
			tpm: '요청이 모델의 토큰 한도를 초과했습니다. 코드 구조 요약 크기를 줄이거나 다른 모델을 선택하세요.',
			rateLimit: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
			quota: 'API 크레딧이 부족합니다. 제공자 대시보드에서 충전하세요.',
			auth: 'API 키가 유효하지 않습니다. 키를 확인하고 다시 입력하세요.',
			network: 'AI 서비스에 연결하지 못했습니다. 네트워크 연결을 확인하세요.',
			demo: '지금은 무료 데모를 쓸 수 없습니다. 갤러리에서 미리 분석한 예시를 보거나, API 키나 로컬 브리지(Claude Code, Gemini CLI)를 연결해 직접 분석하세요.',
			unknown: 'AI 분석 중 오류가 발생했습니다.',
			actionSize: '크기 설정',
			actionModel: '모델 변경',
			actionKey: 'API 키 확인',
			actionExplore: '갤러리 열기',
			actionConnect: '다른 AI 연결'
		},
		analyze: {
			demoNotice:
				'Google Gemini 무료 등급에서 처리합니다. 무료 등급에서는 Google이 입력을 서비스 개선에 쓸 수 있으니, 공개하기 어려운 코드는 API 키나 로컬 브리지를 쓰세요.',
			byokKeyNotice:
				'키는 이 브라우저에만 저장됩니다. Gemini 요청은 Google로 바로 가고, Anthropic·OpenAI 요청은 브라우저 제약 때문에 Ropeman 프록시를 거칩니다. 프록시는 키를 저장하지 않습니다.',
			title: 'AI 아키텍처 분석',
			current: '현재: {track}',
			demoSub: '무료 · 설정 없음',
			active: '사용 중',
			start: '시작',
			byokName: 'API 키 (BYOK)',
			keySet: '키 설정됨',
			notConfigured: '설정 안 됨',
			provider: '제공자',
			model: '모델',
			customModel: '직접 입력...',
			modelPlaceholder: '예: claude-sonnet-5-5',
			apiKeyLabel: '{provider} API 키',
			apiKeyPlaceholder: 'API 키 입력',
			test: '테스트',
			valid: '유효함',
			invalid: '유효하지 않음',
			startWithApiKey: 'API 키로 시작',
			bridgeDesktopOnly: '데스크톱 전용. 로컬 브리지가 필요합니다.',
			connected: '연결됨',
			disconnected: '연결 안 됨',
			cliTool: 'CLI 도구',
			cliAuto: '자동 감지',
			port: '포트',
			connect: '연결',
			disconnect: '연결 해제',
			token: '토큰',
			tokenPlaceholder: '브리지가 시작할 때 출력합니다',
			startWithBridge: '브리지로 시작',
			webgpuName: '브라우저 AI',
			webgpuDesktopOnly: '데스크톱 전용. WebGPU와 수 GB의 RAM이 필요합니다.',
			webgpuUnsupported: 'WebGPU 미지원',
			modelLoaded: '모델 로드됨',
			downloading: '다운로드 중... {n}%',
			cachedNeedsLoading: '캐시됨 (불러오기 필요)',
			notInitialized: '초기화 안 됨 (~{size} 다운로드)',
			startWithWebgpu: 'WebGPU로 시작',
			setupModel: '모델 설정',
			payloadPreview: '전송 데이터 미리보기',
			copyJson: 'JSON 복사',
			limit: '한도: {value}',
			unlimited: '제한 없음',
			footerHint: '분석을 시작할 방식을 고르세요.'
		},
		panel: {
			close: '닫기',
			description: '설명',
			files: '파일',
			keySymbols: '주요 심볼'
		},
		node: {
			fileOne: '파일 {n}개',
			fileMany: '파일 {n}개',
			openInside: '안으로 들어가기',
			openCode: '코드 보기',
			notInSnapshot: '이 스냅샷에는 더 깊은 분석이 없습니다. 눌러서 자세히 보기',
			notInSnapshotShort: '스냅샷에 없음',
			reanalyze: '다시 분석',
			unclassified: '미분류',
			unclassifiedDesc: '분석이 어느 그룹에도 넣지 않은 파일'
		},
		header: {
			newLabel: '새로 열기',
			analyze: '분석',
			analyzeTitle: 'AI 시맨틱 분석',
			languageToggle: 'EN, 영어로 보기',
			gallery: '갤러리',
			home: '처음 화면으로',
			homeConfirmTitle: '처음 화면으로 돌아갈까요?',
			homeConfirmMessage: '지금 열린 프로젝트와 분석 화면이 닫힙니다. 진행 중인 분석도 멈춥니다.',
			homeConfirmOk: '처음 화면으로 돌아가기',
			homeConfirmCancel: '계속 보기',
			trackBadgeTitle: 'AI: {track} (클릭해서 변경)'
		},
		newProject: {
			title: '새 프로젝트 열기',
			openFolder: '로컬 폴더 열기',
			githubLabel: 'GitHub 공개 저장소',
			replaceNote: '새 프로젝트를 불러오면 지금 열린 프로젝트는 닫힙니다.',
			cancel: '취소'
		},
		help: {
			title: '도움말',
			tabUsage: '사용법',
			tabAiModes: 'AI 모드',
			tabShortcuts: '단축키',
			tabFaq: 'FAQ',
			usageTitle: '기본 사용법',
			usageInteraction: '인터랙션',
			aiModesTitle: 'AI 분석 모드',
			aiModeDemo: '데모',
			aiModeDemoDesc:
				'무료로 써 볼 수 있습니다. 요청은 Ropeman 서버를 거쳐 Google Gemini 무료 등급으로 가고, 요청 횟수와 프로젝트 크기에 제한이 있습니다. 무료 등급에서는 Google이 입력을 서비스 개선에 쓸 수 있습니다.',
			aiModeByok: 'API 키 (BYOK)',
			aiModeByokDesc:
				'내 Gemini, Anthropic, OpenAI API 키를 씁니다. 키는 이 브라우저에만 저장합니다. Gemini 요청은 Google로 바로 가고, Anthropic과 OpenAI 요청은 Ropeman 프록시를 거칩니다. 프록시는 키를 저장하지 않습니다.',
			aiModeBridge: '브리지',
			aiModeBridgeDesc:
				'내 컴퓨터에 설치한 Gemini CLI나 Claude Code로 분석합니다. CLI에 로그인된 계정을 그대로 쓰므로 API 키를 입력하지 않습니다.',
			aiModeWebgpu: 'WebGPU (실험 기능)',
			aiModeWebgpuDesc:
				'WebGPU로 브라우저 안에서 모델을 돌립니다. 처음 한 번 모델을 내려받은 뒤에는 서버 없이 분석합니다. 속도는 GPU 성능에 따라 다릅니다.',
			shortcutsTitle: '키보드 단축키',
			faqTitle: '자주 묻는 질문',
			usageSteps: [
				'프로젝트 폴더를 열면 바로 파싱을 시작합니다.',
				'AI 연결을 설정하면 AI가 코드를 역할별로 묶어 다이어그램을 그립니다.',
				'다이어그램 노드를 더블클릭하면 그 안으로 들어갑니다(드릴다운).',
				'파일 탐색기에서 파일을 더블클릭하면 코드 뷰어가 열립니다.'
			],
			usageInteractionItems: [
				'노드 클릭: 선택하고 상세 정보 보기',
				'노드 더블클릭: 드릴다운',
				'파일 더블클릭: 코드 뷰어에서 열기',
				'탭 드래그: 화면 나누기'
			],
			faqItems: [
				{
					q: '소스 코드 원문이 외부 서버로 나가나요?',
					a: '아니요. AI에는 코드 구조 요약(심볼, 시그니처, import)을 보내고, 파일 원문은 보내지 않습니다. 요약이 어디로 가는지는 AI 모드에 따라 다릅니다.\n\n• WebGPU: 모델이 기기 안에서 돌기 때문에 아무것도 밖으로 나가지 않습니다.\n• 데모, API 키: 요약이 AI 제공자에게 갑니다. 데모 요청과 Anthropic·OpenAI 키 요청은 Ropeman 프록시를 거치고, Gemini 키 요청은 Google로 바로 갑니다.\n• 브리지: 로컬 CLI가 요약을 그 CLI의 제공자에게 보냅니다.',
					slug: 'security'
				},
				{
					q: '어떤 프로그래밍 언어를 지원하나요?',
					a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala를 지원합니다.',
					slug: 'getting-started'
				},
				{
					q: '프로젝트 크기에 제한이 있나요?',
					a: '파일은 최대 2,000개, 파일 하나는 최대 500KB까지 읽습니다. 큰 프로젝트는 설정에서 코드 구조 요약 크기 제한을 조절하세요.',
					slug: 'troubleshooting'
				},
				{
					q: 'GitHub URL로 분석할 수 있나요?',
					a: '네. 시작 화면에 공개 GitHub 저장소 URL을 넣으면 프로젝트를 내려받지 않고 바로 분석합니다. 비공개 저장소는 지원하지 않습니다.',
					slug: 'getting-started'
				},
				{
					q: '분석 결과를 공유할 수 있나요?',
					a: '네. AI 분석이 끝나면 헤더의 공유하기 버튼을 눌러 공개 링크를 만드세요. 링크가 있으면 누구나 분석 결과를 볼 수 있습니다.',
					slug: 'faq'
				},
				{
					q: '특정 폴더를 분석에서 뺄 수 있나요?',
					a: '네. 설정의 추가 제외 디렉토리 칸에 폴더 이름을 한 줄에 하나씩 적으면 기본 제외 목록에 더해집니다. Rust의 target, 생성 코드가 담긴 generated, third_party처럼 큰 폴더를 뺄 때 씁니다.',
					slug: 'faq'
				},
				{
					q: '진행 중인 분석을 취소하거나 여러 개 동시에 실행할 수 있나요?',
					a: '네. 분석마다 오른쪽 아래에 진행 상태 표시가 생기고, 빨간 "취소" 버튼으로 언제든 멈출 수 있습니다. 처음 한 번은 확인을 묻고, "다시 묻지 않기"를 고를 수 있습니다. 여러 노드를 더블클릭하면 각각 따로 분석하고, 4개 이상이면 "N개 분석 중" 배지 하나로 합쳐집니다. 다른 페이지로 옮겨도 분석은 계속되고 진행 상태 표시도 그대로 보입니다.',
					slug: 'faq'
				},
				{
					q: '입력한 API 키는 어디에 저장되나요?',
					a: 'Ropeman 서버는 API 키를 저장하지 않습니다. 키는 이 브라우저의 로컬 저장소에만 있습니다.\n\n• API 키 모드: AI를 호출할 때마다 요청에 키를 담아 보냅니다. Gemini 요청은 Google로 바로 가고, Anthropic·OpenAI 요청은 Ropeman 프록시를 거치며 프록시는 키를 저장하지 않습니다.\n• 브리지 모드: 키를 입력하지 않습니다. CLI에 로그인된 계정을 그대로 씁니다.\n• WebGPU 모드: 키가 필요 없습니다.\n\n설정을 초기화하면 저장된 키가 지워집니다.',
					slug: 'security'
				}
			]
		},
		onboarding: {
			skip: '건너뛰기',
			prev: '이전',
			next: '다음',
			done: '완료',
			restartTour: '투어 다시 보기',
			skipConfirmText: '투어를 끝낼까요?\n설정에서 언제든 다시 볼 수 있습니다.',
			skipConfirmOk: '끝내기',
			skipConfirmCancel: '계속하기',
			step1: {
				title: '폴더 열기',
				desc: '프로젝트 폴더를 열어 코드를 불러오세요. Python, JavaScript, TypeScript를 포함해 14개 언어를 지원합니다.'
			},
			step2: {
				title: 'AI 분석',
				desc: 'AI가 코드 구조 요약을 읽고 파일을 역할별로 묶은 뒤, 묶음 사이의 의존 관계를 찾아 다이어그램을 그립니다.'
			},
			step3: {
				title: '설정',
				desc: 'AI 모드, 테마, 언어를 정합니다. API 키와 분석 옵션도 여기에 있습니다.'
			},
			step4: {
				title: '시맨틱 트리',
				desc: 'AI 분석이 파일을 역할별로 묶은 트리입니다. 노드를 클릭하면 그 노드의 파일이 강조됩니다.'
			},
			step5: {
				title: '다이어그램 캔버스',
				desc: '노드를 클릭하면 선택하고, 더블클릭하면 그 안으로 들어갑니다. 드래그하면 캔버스가 움직입니다.'
			},
			step6: {
				title: '브레드크럼',
				desc: '들어온 경로를 보여 줍니다. 단계를 클릭하면 그 단계로 돌아갑니다.'
			},
			step7: {
				title: '파일 탐색기',
				desc: '파일을 더블클릭하면 그 파일이 속한 시맨틱 노드가 다이어그램에서 강조됩니다. 속한 노드가 없으면 강조가 사라집니다.'
			},
			step8: {
				title: '분할 뷰',
				desc: 'Ctrl+\\ 를 누르면 다이어그램과 코드를 나란히 봅니다. 탭을 드래그해서 나눌 수도 있습니다.'
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
		},
		common: {
			close: '닫기',
			cancel: '취소',
			retry: '다시 시도',
			copy: '복사',
			loading: '불러오는 중...',
			project: '프로젝트',
			error: '오류',
			beta: '베타',
			symbolCount: '심볼 {n}개'
		},
		track: {
			edge: '데모',
			byok: 'API 키',
			bridge: '로컬 브리지',
			bridgeShort: '브리지',
			webgpu: 'WebGPU',
			none: '연결 안 됨',
			disconnected: '연결 안 됨',
			bridgeConnected: '브리지 연결됨',
			bridgeDisconnected: '브리지 연결 끊김'
		},
		webgpuSetup: {
			title: '브라우저 AI 설정',
			model: '모델',
			parameters: '파라미터',
			vram: 'VRAM',
			download: '다운로드',
			estTime: '예상 시간',
			vramWarning: '이 모델은 VRAM {size}이 필요합니다. GPU 메모리가 충분한지 확인하세요.',
			cachedHint: '이 모델은 이미 브라우저에 저장되어 있습니다. 몇 초면 불러옵니다.',
			downloadHint:
				'모델은 백그라운드에서 내려받습니다. 기다리는 동안 다른 AI 모드를 쓸 수 있습니다. 다 받으면 브라우저(IndexedDB)에 저장합니다.',
			loadModel: '모델 불러오기',
			downloadSetup: '다운로드 후 설정',
			downloadingModel: '{model} 다운로드 중...',
			cancelDownload: '다운로드 취소',
			starting: '시작하는 중...',
			ready: '브라우저 AI({model})가 준비되었습니다.',
			timeUnder1: '1분 미만',
			time1to3: '1~3분',
			time3to6: '3~6분',
			time5to10: '5~10분'
		},
		drilldown: {
			title: '추가 분석',
			badge: '드릴다운',
			desc: '{label} 도메인의 내부 구조를 분석합니다.',
			trackLine: '{track} 모드로 분석',
			confirm: '분석'
		},
		nodeDetail: {
			title: '노드 상세',
			details: '상세',
			language: '언어',
			lines: '줄',
			children: '하위 항목',
			parent: '상위 항목',
			id: 'ID',
			empty: '노드를 선택하면 상세 정보가 보입니다'
		},
		explorer: {
			title: '탐색기',
			hide: '탐색기 숨기기',
			show: '탐색기 보이기',
			filterPlaceholder: '파일 필터...',
			clearFilter: '필터 지우기'
		},
		sidebar: {
			fileExplorer: '파일 탐색기',
			semanticTree: '시맨틱 트리',
			semanticTreeNeedsAnalysis: '시맨틱 트리 (먼저 AI 분석을 실행하세요)',
			hidePanel: '패널 숨기기',
			semanticEmpty: '시맨틱 분석 데이터가 없습니다'
		},
		codeViewer: {
			empty: '탐색기에서 파일이나 시맨틱 노드를 선택하면 코드가 보입니다',
			lines: '{n}줄',
			symbols: '심볼',
			noProject: '불러온 프로젝트가 없습니다',
			notAccessible: '파일에 접근할 수 없습니다',
			loadFailed: '파일을 불러오지 못했습니다: {error}'
		},
		search: {
			placeholder: '파일과 심볼 검색...',
			noResults: '결과가 없습니다',
			file: '파일'
		},
		statusBar: {
			zoom: '확대 100%',
			minimap: '미니맵'
		},
		parsing: {
			title: '프로젝트 파싱 중',
			fileProgress: '파일 {done} / {total}개'
		},
		chat: {
			notConnected: 'AI 연결 안 됨',
			connect: '연결',
			cached: '캐시됨'
		},
		pane: {
			empty: '파일을 열거나 탭을 여기로 끌어오세요',
			dropToSplit: '놓으면 화면을 나눕니다'
		},
		canvas: {
			noDirectConnection: '직접 연결 없음',
			sharedFiles: '공유 파일 ({n}개):',
			moreFiles: '... 외 {n}개',
			minimap: '미니맵',
			analysisRequests: '분석 요청',
			edgeDependsOn: '의존',
			edgeCalls: '호출',
			edgeExtends: '상속',
			edgeUses: '사용'
		},
		settingsUi: {
			cacheEntries: '{n}개 항목',
			themeDark: '다크',
			themeLight: '라이트'
		},
		dropzone: {
			needsChromium:
				'폴더를 끌어다 놓아 읽으려면 Chromium 계열 브라우저가 필요합니다. 대신 "폴더 열기" 버튼을 쓰세요.',
			folderOnly: '파일이 아니라 폴더를 놓아 주세요.',
			readFailed: '폴더를 읽지 못했습니다: {error}',
			openFailed: '폴더를 열지 못했습니다: {error}',
			processFailed: '파일을 처리하지 못했습니다: {error}'
		},
		symbolBadge: {
			static: '정적',
			async: '비동기',
			generator: '제너레이터',
			route: '라우트 핸들러',
			export_default: '기본 내보내기',
			decorator: '데코레이터 적용',
			abstract: '추상'
		},
		docsUi: {
			sidebarNav: '문서 탐색',
			closeMenu: '메뉴 닫기',
			loadingDocs: '문서를 불러오는 중…'
		},
		explore: {
			navLabel: '갤러리',
			pageTitle: '갤러리 — 오픈소스 아키텍처 | Ropeman',
			home: '홈',
			heroTitle: '오픈소스 아키텍처 둘러보기',
			heroDesc:
				'인기 오픈소스 프로젝트를 Ropeman으로 분석한 아키텍처 다이어그램입니다. 프로젝트는 직접 고르고, 스냅샷은 수시로 갱신합니다.',
			searchPlaceholder: '프로젝트 검색...',
			searchLabel: '검색',
			languageLabel: '언어',
			allLanguages: '모든 언어',
			empty: '조건에 맞는 프로젝트가 없습니다.',
			entryTitle: '{title} 아키텍처 | Ropeman 갤러리',
			analyzeOwn: '내 프로젝트 분석하기',
			loadingEntry: '{title} 아키텍처 불러오는 중...',
			notAnalyzedTitle: '아직 분석하지 않았습니다',
			notAnalyzedDesc:
				'{title}의 스냅샷은 아직 없습니다. 지금 분석하려면 홈에서 GitHub URL을 붙여 넣으세요.',
			analyzeFromHome: '홈에서 분석하기',
			viewOnGithub: 'GitHub에서 보기',
			backToGallery: '갤러리로'
		},
		shareView: {
			badge: '공유됨',
			pageTitleFallback: '공유됨',
			projectFallback: '공유된 프로젝트',
			analyzeOwn: '내 프로젝트 분석하기',
			loading: '공유 데이터 불러오는 중...',
			notFoundTitle: '링크를 찾을 수 없습니다',
			notFound: '공유 링크를 찾을 수 없습니다. 만료되었거나 주소가 잘못되었습니다.',
			loadFailed: '공유 데이터를 불러오지 못했습니다.',
			goHome: 'Ropeman으로 이동'
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
			'Keeps AI analysis results in this browser, so reopening the same project shows them again without a new AI request.',
		clearCache: 'Clear Cache',
		showSymbols: 'Symbol Sidebar',
		showSymbolsTooltip:
			'Lists the functions and classes the parser found in the open file, in the sidebar.',
		codeTheme: 'Code Theme',
		codeFontSize: 'Code Font Size',
		settingsAiConnection: 'AI Connection',
		settingsConfigureAi: 'Configure AI',
		settingsSkeletonLimit: 'Code Summary Size Limit',
		settingsSkeletonUnlimited: 'Unlimited',
		settingsSkeletonHint:
			'Largest code summary (symbols, signatures, imports) sent to the AI for one analysis. Lower it if a large project gets API errors. Default: 250KB.',
		settingsCustomSkipPatterns: 'Additional Excluded Directories',
		settingsCustomSkipPatternsPlaceholder: 'One per line, e.g.:\ntarget\nthird_party',
		settingsCustomSkipPatternsHint:
			'Folders to skip on top of the built-in list. A bare name matches at any depth. An entry with a slash matches that path from the project root. Use it for generated code or large monorepo folders.',
		settingsCustomIncludePatterns: 'Included Paths',
		settingsCustomIncludePatternsPlaceholder: 'One per line, e.g.:\ndocs\n.github/workflows',
		settingsCustomIncludePatternsHint:
			'Paths listed here are read even when an exclude rule matches them. A bare name matches a folder or file of that name at any depth. An entry with a slash matches that path from the project root. Agent instruction folders (.agents, .cursor, .claude/skills, .github/instructions and others) are included by default.',
		analysisCompleted: 'Analysis complete',
		analysisFailed: 'Analysis failed',
		analysisGroupExpand: 'Expand analysis list',
		analysisGroupCollapse: 'Collapse analysis list',
		analysisCancelLabel: 'Cancel',
		analysisCancelConfirmTitle: 'Cancel Analysis',
		analysisCancelConfirmMessage: 'Cancel the running AI analysis? Progress so far will be lost.',
		analysisCancelConfirmMessageSingle:
			'Cancel the "{label}" analysis? Progress so far will be lost.',
		analysisCancelConfirmMessageAll:
			'Cancel all {count} running {count|analysis|analyses}? Progress so far will be lost.',
		analysisCancelConfirmOk: 'Cancel Analysis',
		analysisCancelConfirmBack: 'Keep Running',
		analysisCancelAll: 'Cancel All',
		analysisGroupRunning: '{count} {count|analysis|analyses} running',
		analysisInProgress: 'AI Analysis in Progress',
		dontAskAgain: "Don't ask again",
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
				'Open a folder and the AI groups its code by role into an architecture diagram. Parsing runs in your browser, and the source code is not uploaded.',
			cta: 'Open Folder',
			dragHint: 'or drag & drop a folder here',
			featureAiTitle: 'AI Semantic Analysis',
			featureAiDesc:
				'An LLM groups your files into modules by what they do and names the main abstractions.',
			featureDrillTitle: 'Drill-down Navigation',
			featureDrillDesc:
				'Go from the top-level diagram down to the code of a single file. The breadcrumb shows where you are.',
			featureBrowserTitle: 'Four AI modes',
			featureBrowserDesc:
				'Pick Demo, API Key, Local Bridge or Browser AI. Every mode sends the AI a code summary and keeps the source files in your browser.',
			githubPlaceholder: 'https://github.com/owner/repo',
			githubLoad: 'Load',
			githubOr: 'or enter a GitHub repository URL',
			mobileFolderHint:
				"Mobile browsers can't open local folders. Enter a public GitHub repository URL instead.",
			mobileGithubLead: 'Enter a GitHub repository URL to start analysis',
			githubInvalidUrl: 'Enter a GitHub repository URL, like https://github.com/owner/repo.',
			githubNotFound: 'Repository not found. Check the URL.',
			githubRateLimit: 'Hit the GitHub API rate limit. Try again later.',
			githubPrivate: 'Private repositories are not supported.',
			githubLoadError: "Couldn't load the GitHub repository.",
			specLocalFirst: 'Local-First Analysis',
			specWebgpu: 'WebGPU Accelerated',
			specSemantic: 'Role-based grouping',
			specNoData: 'Zero Data Collection',
			exampleCta: 'See an example',
			heroShotAlt:
				"Ropeman analysis of huggingface/transformers: domain nodes and their links, with the selected node's files and key symbols on the right",
			heroShotCaption: 'A real analysis of huggingface/transformers. Click to explore it.',
			heroShotLink: 'Open the huggingface/transformers example',
			dropRegion: 'Folder drop area',
			loadingTitle: 'Loading project',
			parsingLabel: 'Parsing files',
			explorePromptTitle: 'No deep analysis for this domain',
			explorePromptMessage:
				'The example snapshot stops at this domain. To go deeper, load the project from the home page and analyze it.',
			explorePromptAnalyze: 'Analyze from home',
			explorePromptGithub: 'View on GitHub'
		},
		snippet: {
			divider: 'or try a code snippet',
			placeholder: 'Paste your code here...',
			analyze: 'Analyze',
			lines: 'lines',
			emptyError: 'Paste some code first',
			analyzeFailed: "Couldn't analyze the snippet: {error}"
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
			confirmTitle: 'Create Share Link',
			confirmMessage: 'Create a public link to this analysis? Anyone with the link can view it.',
			confirmOk: 'Create',
			confirmCancel: 'Cancel',
			generating: 'Creating share link...',
			successTitle: 'Share link created',
			copyLink: 'Copy Link',
			copied: 'Copied!',
			openNewTab: 'Open in new tab',
			errorTitle: 'Share failed',
			errorMessage: "Couldn't create a share link. Try again later.",
			close: 'Close',
			tooLarge: 'This analysis is over the 1MB share limit. Try a smaller project.'
		},
		aiError: {
			tpm: "The request is over the model's token limit. Lower the code summary size or pick another model.",
			rateLimit: 'Too many requests. Wait a moment and try again.',
			quota: "Your API credit has run out. Add credit in your provider's dashboard.",
			auth: "This API key isn't valid. Check it and enter it again.",
			network: "Couldn't reach the AI service. Check your network connection.",
			demo: 'The free demo is unavailable right now. Browse pre-analyzed examples in Explore, or connect an API key or the local bridge (Claude Code, Gemini CLI) to analyze your own code.',
			unknown: 'Something went wrong during AI analysis.',
			actionSize: 'Size settings',
			actionModel: 'Change model',
			actionKey: 'Check API key',
			actionExplore: 'Open Explore',
			actionConnect: 'Connect another AI'
		},
		analyze: {
			demoNotice:
				'Runs on the free tier of Google Gemini, where Google may use inputs to improve its products. For code you would not share, use an API key or the local bridge.',
			byokKeyNotice:
				"Keys are stored only in this browser. Gemini requests go straight to Google; Anthropic and OpenAI requests pass through Ropeman's proxy because of browser restrictions. The proxy does not store keys.",
			title: 'AI Architecture Analysis',
			current: 'Current: {track}',
			demoSub: 'Free · No setup',
			active: 'Active',
			start: 'Start',
			byokName: 'API Key (BYOK)',
			keySet: 'Key set',
			notConfigured: 'Not configured',
			provider: 'Provider',
			model: 'Model',
			customModel: 'Custom...',
			modelPlaceholder: 'e.g. claude-sonnet-5-5',
			apiKeyLabel: '{provider} API Key',
			apiKeyPlaceholder: 'Enter API key',
			test: 'Test',
			valid: 'Valid',
			invalid: 'Invalid',
			startWithApiKey: 'Start with API Key',
			bridgeDesktopOnly: 'Desktop only. Needs the local bridge.',
			connected: 'Connected',
			disconnected: 'Disconnected',
			cliTool: 'CLI Tool',
			cliAuto: 'Auto-detect',
			port: 'Port',
			connect: 'Connect',
			disconnect: 'Disconnect',
			token: 'Token',
			tokenPlaceholder: 'Printed by the bridge at startup',
			startWithBridge: 'Start with Bridge',
			webgpuName: 'Browser AI',
			webgpuDesktopOnly: 'Desktop only. Needs WebGPU and several GB of RAM.',
			webgpuUnsupported: 'WebGPU not supported',
			modelLoaded: 'Model loaded',
			downloading: 'Downloading... {n}%',
			cachedNeedsLoading: 'Cached (needs loading)',
			notInitialized: 'Not initialized (~{size} download)',
			startWithWebgpu: 'Start with WebGPU',
			setupModel: 'Setup Model',
			payloadPreview: 'Payload preview',
			copyJson: 'Copy JSON',
			limit: 'Limit: {value}',
			unlimited: 'Unlimited',
			footerHint: 'Pick a mode to start the analysis.'
		},
		panel: {
			close: 'Close',
			description: 'Description',
			files: 'Files',
			keySymbols: 'Key symbols'
		},
		node: {
			fileOne: '{n} file',
			fileMany: '{n} {n|file|files}',
			openInside: 'Open',
			openCode: 'View code',
			notInSnapshot: 'This snapshot has no deeper analysis. Click for details',
			notInSnapshotShort: 'Not in snapshot',
			reanalyze: 'Re-analyze',
			unclassified: 'Unclassified',
			unclassifiedDesc: 'Files the analysis did not place in any group'
		},
		header: {
			newLabel: 'New',
			analyze: 'Analyze',
			analyzeTitle: 'AI semantic analysis',
			languageToggle: '한, 한국어로 보기',
			gallery: 'Explore',
			home: 'Back to start',
			homeConfirmTitle: 'Go back to the start page?',
			homeConfirmMessage:
				'This closes the open project and its analysis. Any analysis in progress stops.',
			homeConfirmOk: 'Go back to start',
			homeConfirmCancel: 'Keep working',
			trackBadgeTitle: 'AI: {track} (click to change)'
		},
		newProject: {
			title: 'Open a new project',
			openFolder: 'Open a local folder',
			githubLabel: 'Public GitHub repository',
			replaceNote: 'Loading a new project closes the one that is open now.',
			cancel: 'Cancel'
		},
		help: {
			title: 'Help',
			tabUsage: 'Usage',
			tabAiModes: 'AI Modes',
			tabShortcuts: 'Shortcuts',
			tabFaq: 'FAQ',
			usageTitle: 'Getting Started',
			usageInteraction: 'Interactions',
			aiModesTitle: 'AI Analysis Modes',
			aiModeDemo: 'Demo',
			aiModeDemoDesc:
				"Free to try. Requests go through Ropeman's server to the Google Gemini free tier, with limits on request count and project size. Google may use free-tier inputs to improve its products.",
			aiModeByok: 'API Key (BYOK)',
			aiModeByokDesc:
				"Use your own Gemini, Anthropic or OpenAI API key. The key is stored only in your browser. Gemini requests go straight to Google. Anthropic and OpenAI requests pass through Ropeman's proxy, which does not store keys.",
			aiModeBridge: 'Bridge',
			aiModeBridgeDesc:
				"Runs the analysis through Gemini CLI or Claude Code on your machine. The CLI uses its own login, so you don't enter an API key.",
			aiModeWebgpu: 'WebGPU (Experimental)',
			aiModeWebgpuDesc:
				'Runs a model inside your browser with WebGPU. After the one-time model download, analysis needs no server. Speed depends on your GPU.',
			shortcutsTitle: 'Keyboard Shortcuts',
			faqTitle: 'Frequently Asked Questions',
			usageSteps: [
				'Open a project folder. Parsing starts right away.',
				'Set up an AI connection, and the AI groups the code by role and draws a diagram.',
				'Double-click a diagram node to drill down into it.',
				'Double-click a file in the explorer to open it in the code viewer.'
			],
			usageInteractionItems: [
				'Click a node: select it and see its details',
				'Double-click a node: drill down',
				'Double-click a file: open it in the code viewer',
				'Drag a tab: split the view'
			],
			faqItems: [
				{
					q: 'Does my source code leave my computer?',
					a: "No. Ropeman sends the AI a code summary (symbols, signatures and imports), not the files themselves. Where the summary goes depends on the AI mode.\n\n• WebGPU: the model runs on your device, and nothing leaves it.\n• Demo and API Key: the summary goes to the AI provider. Demo requests and Anthropic or OpenAI key requests pass through Ropeman's proxy. Gemini key requests go straight to Google.\n• Bridge: your local CLI sends the summary to its provider.",
					slug: 'security'
				},
				{
					q: 'What programming languages are supported?',
					a: 'Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, and Scala.',
					slug: 'getting-started'
				},
				{
					q: 'Are there project size limits?',
					a: 'Up to 2,000 files, and up to 500KB per file. For a large project, adjust the code summary size limit in Settings.',
					slug: 'troubleshooting'
				},
				{
					q: 'Can I analyze a GitHub repository by URL?',
					a: 'Yes. Paste a public GitHub repository URL into the field on the start page and click Load. Ropeman fetches the files and analyzes them like a local folder. Private repositories are not supported.',
					slug: 'getting-started'
				},
				{
					q: 'Can I share my analysis results?',
					a: 'Yes. After the AI analysis finishes, click Share in the header to create a public link. Anyone with the link can view the analysis.',
					slug: 'faq'
				},
				{
					q: 'Can I exclude specific folders from analysis?',
					a: "Yes. In Settings, enter one folder name per line under Additional Excluded Directories. Ropeman adds them to the built-in skip list. Typical entries are large or generated folders such as Rust's target, third_party or generated.",
					slug: 'faq'
				},
				{
					q: 'Can I cancel or run multiple analyses in parallel?',
					a: 'Yes. Each analysis shows a status pill in the bottom-right corner with a red Cancel button. It asks once before cancelling, and you can tick "Don\'t ask again". Double-click several nodes to drill down into them in parallel, and each one gets its own pill. With more than three running, the pills collapse into one "N analyses running" badge. Analyses keep running when you move between pages, and the pill stays visible.',
					slug: 'faq'
				},
				{
					q: 'Where is my API key stored?',
					a: "Ropeman's servers don't store API keys. The key stays in this browser's local storage.\n\n• API Key mode: the key goes out with each AI request. Gemini requests go straight to Google. Anthropic and OpenAI requests pass through Ropeman's proxy, which does not store the key.\n• Bridge mode: you don't enter a key. The CLI uses its own login.\n• WebGPU mode: no key is needed.\n\nReset settings to delete stored keys.",
					slug: 'security'
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
				desc: 'Open a project folder to load its code. Python, JavaScript, TypeScript and 11 other languages are supported.'
			},
			step2: {
				title: 'AI Analysis',
				desc: 'The AI reads the code summary, groups files by role, finds the dependencies between groups and draws the diagram.'
			},
			step3: {
				title: 'Settings',
				desc: 'Set the AI mode, theme and language. API keys and analysis options are here too.'
			},
			step4: {
				title: 'Semantic Tree',
				desc: 'The AI analysis groups files into this tree by role. Click a node to highlight its files.'
			},
			step5: {
				title: 'Diagram Canvas',
				desc: 'Click a node to select it. Double-click it to drill down. Drag to move the canvas.'
			},
			step6: {
				title: 'Breadcrumb',
				desc: 'Shows the path you drilled down. Click a level to go back to it.'
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
		},
		common: {
			close: 'Close',
			cancel: 'Cancel',
			retry: 'Retry',
			copy: 'Copy',
			loading: 'Loading...',
			project: 'Project',
			error: 'Error',
			beta: 'Beta',
			symbolCount: '{n} {n|symbol|symbols}'
		},
		track: {
			edge: 'Demo',
			byok: 'API Key',
			bridge: 'Local Bridge',
			bridgeShort: 'Bridge',
			webgpu: 'WebGPU',
			none: 'Not connected',
			disconnected: 'Disconnected',
			bridgeConnected: 'Bridge Connected',
			bridgeDisconnected: 'Bridge Disconnected'
		},
		webgpuSetup: {
			title: 'Browser AI Setup',
			model: 'Model',
			parameters: 'Parameters',
			vram: 'VRAM',
			download: 'Download',
			estTime: 'Est. Time',
			vramWarning: 'This model requires {size} VRAM. Make sure your GPU has enough memory.',
			cachedHint: 'This model is already cached in your browser. Loading takes a few seconds.',
			downloadHint:
				'The model downloads in the background, and you can use other AI modes meanwhile. After the download, your browser keeps the model in IndexedDB.',
			loadModel: 'Load Model',
			downloadSetup: 'Download & Setup',
			downloadingModel: 'Downloading {model}...',
			cancelDownload: 'Cancel download',
			starting: 'Starting...',
			ready: 'Browser AI ({model}) is ready.',
			timeUnder1: '< 1 min',
			time1to3: '1~3 min',
			time3to6: '3~6 min',
			time5to10: '5~10 min'
		},
		drilldown: {
			title: 'Further analysis',
			badge: 'DRILLDOWN',
			desc: 'Analyzes the internal structure of the {label} domain.',
			trackLine: 'Analyze in {track} mode',
			confirm: 'Analyze'
		},
		nodeDetail: {
			title: 'Node Details',
			details: 'Details',
			language: 'Language',
			lines: 'Lines',
			children: 'Children',
			parent: 'Parent',
			id: 'ID',
			empty: 'Select a node to view details'
		},
		explorer: {
			title: 'Explorer',
			hide: 'Hide Explorer',
			show: 'Show Explorer',
			filterPlaceholder: 'Filter files...',
			clearFilter: 'Clear filter'
		},
		sidebar: {
			fileExplorer: 'File Explorer',
			semanticTree: 'Semantic Tree',
			semanticTreeNeedsAnalysis: 'Semantic Tree (run AI analysis first)',
			hidePanel: 'Hide Panel',
			semanticEmpty: 'No semantic analysis data'
		},
		codeViewer: {
			empty: 'Pick a file in the Explorer or a semantic node to see its code',
			lines: '{n} {n|line|lines}',
			symbols: 'Symbols',
			noProject: 'No project loaded',
			notAccessible: "Can't read this file",
			loadFailed: "Couldn't load the file: {error}"
		},
		search: {
			placeholder: 'Search files and symbols...',
			noResults: 'No results',
			file: 'file'
		},
		statusBar: {
			zoom: 'Zoom 100%',
			minimap: 'Minimap'
		},
		parsing: {
			title: 'Parsing Project',
			fileProgress: '{done} / {total} files'
		},
		chat: {
			notConnected: 'AI not connected',
			connect: 'Connect',
			cached: 'cached'
		},
		pane: {
			empty: 'Open a file or drag a tab here',
			dropToSplit: 'Drop to split'
		},
		canvas: {
			noDirectConnection: 'No direct connection',
			sharedFiles: 'Shared files ({n}):',
			moreFiles: '... +{n} more',
			minimap: 'Minimap',
			analysisRequests: 'Analysis Requests',
			edgeDependsOn: 'depends on',
			edgeCalls: 'calls',
			edgeExtends: 'extends',
			edgeUses: 'uses'
		},
		settingsUi: {
			cacheEntries: '{n} {n|entry|entries}',
			themeDark: 'Dark',
			themeLight: 'Light'
		},
		dropzone: {
			needsChromium:
				'Reading a dropped folder needs a Chromium browser. Use the "Open Directory" button instead.',
			folderOnly: 'Drop a folder, not single files.',
			readFailed: "Couldn't read the folder: {error}",
			openFailed: "Couldn't open the folder: {error}",
			processFailed: "Couldn't process the files: {error}"
		},
		symbolBadge: {
			static: 'Static',
			async: 'Async',
			generator: 'Generator',
			route: 'Route Handler',
			export_default: 'Default Export',
			decorator: 'Decorated',
			abstract: 'Abstract'
		},
		docsUi: {
			sidebarNav: 'Documentation navigation',
			closeMenu: 'Close menu',
			loadingDocs: 'Loading documentation…'
		},
		explore: {
			navLabel: 'Explore',
			pageTitle: 'Explore — Open-source architectures | Ropeman',
			home: 'Home',
			heroTitle: 'Explore Open-Source Architectures',
			heroDesc:
				'Architecture diagrams of popular open-source projects, analyzed with Ropeman. We pick the projects and refresh the snapshots from time to time.',
			searchPlaceholder: 'Search projects...',
			searchLabel: 'Search',
			languageLabel: 'Language',
			allLanguages: 'All languages',
			empty: 'No projects match your filters.',
			entryTitle: '{title} architecture | Ropeman Explore',
			analyzeOwn: 'Analyze your own',
			loadingEntry: 'Loading {title} architecture...',
			notAnalyzedTitle: 'Not analyzed yet',
			notAnalyzedDesc:
				'There is no snapshot for {title} yet. To analyze it now, paste its GitHub URL on the home page.',
			analyzeFromHome: 'Analyze from home',
			viewOnGithub: 'View on GitHub',
			backToGallery: 'Back to Explore'
		},
		shareView: {
			badge: 'Shared',
			pageTitleFallback: 'Shared',
			projectFallback: 'Shared Project',
			analyzeOwn: 'Analyze your own',
			loading: 'Loading shared analysis...',
			notFoundTitle: 'Link not found',
			notFound: "This share link doesn't exist. It may have expired, or the URL is wrong.",
			loadFailed: "Couldn't load the shared analysis.",
			goHome: 'Go to Ropeman'
		}
	}
};

function createI18nStore() {
	return {
		get locale(): Locale {
			return settingsStore.language;
		},
		get messages(): TranslationSet {
			return translations[settingsStore.language];
		},
		t(key: string, params?: Record<string, string | number>): string {
			const keys = key.split('.');
			let value: unknown = translations[settingsStore.language];
			for (const k of keys) {
				if (value && typeof value === 'object' && k in value) {
					value = (value as Record<string, unknown>)[k];
				} else {
					return key;
				}
			}
			if (!params) return value as string;
			const plural = new Intl.PluralRules(settingsStore.language);
			return (value as string).replace(
				/\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,
				(match, name: string, one?: string, other?: string) => {
					if (!(name in params)) return match;
					if (other === undefined) return String(params[name]);
					return plural.select(Number(params[name])) === 'one' ? one! : other;
				}
			);
		},
		getProgressMessage(key: keyof AnalysisProgressTranslations): string {
			return translations[settingsStore.language].analysisProgress[key];
		}
	};
}

export const i18nStore = createI18nStore();
