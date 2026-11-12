import type { Locale } from '$lib/utils/locale';
import { settingsStore } from './settingsStore.svelte';
import type { CoverageReason, CoverageStatus } from '$lib/types/coverage';

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
	openMapCta: string;
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
	inferred: string;
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
	| 'payloadTokens'
	| 'demoTooLarge'
	| 'byokTooLarge'
	| 'byokWindowUnknown'
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
	naming: string;
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

interface CoverageTranslations {
	summary: string;
	cut: string;
	skipped: string;
	failed: string;
	toggle: string;
	title: string;
	intro: string;
	filter: string;
	capped: string;
	noMatch: string;
	status: Record<CoverageStatus, string>;
	reason: Record<CoverageReason, string>;
	levelsTitle: string;
	levelRoot: string;
	levelOverBudget: string;
	levelExceedsBudget: string;
	levelLeftOut: string;
	levelInvented: string;
	levelDuplicated: string;
	levelEmptied: string;
	levelClean: string;
	levelUnknown: string;
	imports: string;
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
	coverage: CoverageTranslations;
	analysisInProgress: string;
	common: Strings<
		'close' | 'cancel' | 'retry' | 'copy' | 'loading' | 'project' | 'error' | 'beta' | 'symbolCount'
	>;
	track: Strings<'edge' | 'byok' | 'webgpu' | 'none' | 'disconnected'>;
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
	openMap: Strings<
		| 'pageTitle'
		| 'badge'
		| 'title'
		| 'desc'
		| 'choose'
		| 'chooseAnother'
		| 'dropHint'
		| 'loading'
		| 'errorTitle'
		| 'errorRecover'
		| 'tooLarge'
		| 'notJson'
		| 'notAMap'
		| 'newerVersion'
		| 'unsupportedVersion'
		| 'invalid'
		| 'readFailed'
	>;
	bridgeAccess: Strings<
		| 'yourBrowser'
		| 'checking'
		| 'connectAnyway'
		| 'unaskedTitle'
		| 'unaskedBody'
		| 'grantedTitle'
		| 'grantedBody'
		| 'unknownTitle'
		| 'unknownBody'
		| 'firefoxTitle'
		| 'firefoxBody'
		| 'safariTitle'
		| 'safariBody'
		| 'promptPendingTitle'
		| 'promptPendingBody'
		| 'deniedTitle'
		| 'deniedBody'
		| 'unansweredTitle'
		| 'unansweredBody'
		| 'serveDownTitle'
		| 'serveDownBody'
		| 'refusedTitle'
		| 'refusedBody'
		| 'refusedHint'
		| 'allowOrigin'
		| 'unexplainedTitle'
		| 'unexplainedBody'
		| 'checkServe'
		| 'checkToken'
		| 'checkBlocked'
		| 'refusedLocalTitle'
		| 'refusedLocalBody'
		| 'stepSiteControls'
		| 'stepSiteSettings'
		| 'stepAllowLoopback'
		| 'stepReload'
		| 'stepEdgeLock'
		| 'stepEdgePermissions'
		| 'stepFirefoxIcon'
		| 'stepFirefoxRemove'
		| 'stepOtherSettings'
		| 'stepOtherAllow'
		| 'stepsMayDiffer'
		| 'settingsUrl'
		| 'stopServe'
		| 'startLocal'
		| 'openPrinted'
		| 'localInstead'
	>;
	bridge: Strings<
		| 'pageTitle'
		| 'title'
		| 'desc'
		| 'startServe'
		| 'portLabel'
		| 'tokenLabel'
		| 'tokenHint'
		| 'tokenMemoryOnly'
		| 'copyToken'
		| 'connect'
		| 'connecting'
		| 'cancel'
		| 'failedTitle'
		| 'failedNewer'
		| 'failedOlder'
		| 'failedBadHello'
		| 'connected'
		| 'lostBadge'
		| 'serverInfo'
		| 'disconnect'
		| 'lost'
		| 'reconnect'
		| 'loadingMap'
		| 'localMode'
		| 'namingPending'
		| 'namingNoCli'
		| 'namingFailed'
		| 'namingRejected'
		| 'namingStopped'
		| 'serverSaid'
		| 'expandFailed'
		| 'mapFailed'
		| 'busyExpand'
		| 'noRoot'
		| 'disconnected'
		| 'otherError'
		| 'dismiss'
		| 'backToMap'
		| 'fileEnv'
		| 'fileTooLarge'
		| 'fileBinary'
		| 'fileNotFound'
		| 'fileChanged'
		| 'fileOutside'
		| 'fileNotAFile'
		| 'fileBusy'
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
		settingsCustomIncludePatternsPlaceholder: '한 줄에 하나씩. 예:\ndocs\n.devcontainer',
		settingsCustomIncludePatternsHint:
			'여기 적은 경로는 제외 규칙에 걸려도 읽습니다. 이름만 쓰면 어느 깊이에 있든 그 이름의 폴더나 파일을, /가 들어가면 프로젝트 루트부터의 경로를 포함합니다. 에이전트 지침 폴더(.agents, .cursor, .claude/skills, .github/instructions 등)와 CI 설정(.github/workflows, .gitlab-ci.yml, .circleci)은 기본으로 포함합니다.',
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
				'데모, API 키, 브라우저 AI 중에서 고르세요. 어느 방식이든 AI에는 코드 구조 요약을 보내고, 소스 파일은 브라우저에 남깁니다.',
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
			openMapCta: 'ropeman.json 열기',
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
			lines: '{n}줄',
			emptyError: '코드를 입력하세요',
			analyzeFailed: '스니펫을 분석하지 못했습니다: {error}'
		},
		legend: {
			title: '범례',
			depends_on: '의존',
			calls: '호출',
			extends: '상속',
			uses: '사용',
			inferred: '점선은 코드에서 찾지 못하고 AI가 추론한 관계입니다'
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
			demo: '지금은 무료 데모를 쓸 수 없습니다. 갤러리에서 미리 분석한 예시를 보거나, API 키를 연결해 직접 분석하세요.',
			unknown: 'AI 분석 중 오류가 발생했습니다.',
			actionSize: '크기 설정',
			actionModel: '모델 변경',
			actionKey: 'API 키 확인',
			actionExplore: '갤러리 열기',
			actionConnect: '다른 AI 연결'
		},
		analyze: {
			demoNotice:
				'Google Gemini 무료 등급에서 처리합니다. 무료 등급에서는 Google이 입력을 서비스 개선에 쓸 수 있으니, 공개하기 어려운 코드는 API 키를 쓰세요.',
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
			payloadTokens: '약 {n} 토큰',
			demoTooLarge:
				'이번 요청 본문은 {size}입니다. {limit}를 넘으면 무료 데모가 시간 초과로 실패할 수 있습니다. 설정에서 코드 구조 요약 크기를 줄이거나 API 키를 쓰세요.',
			byokTooLarge:
				'이번 요청은 약 {tokens} 토큰입니다. {model} 모델이 받을 수 있는 입력(컨텍스트 창에서 응답 몫을 뺀 값)은 약 {limit} 토큰이라 거절되거나 잘릴 수 있습니다. 창이 더 큰 모델을 고르거나 설정에서 코드 구조 요약 크기를 줄이세요.',
			byokWindowUnknown: '이 모델의 컨텍스트 창은 알려지지 않아 {context} 토큰으로 가정했습니다.',
			footerHint: '분석을 시작할 방식을 고르세요.'
		},
		panel: {
			close: '닫기',
			description: '설명',
			files: '파일',
			keySymbols: '주요 심볼'
		},
		node: {
			naming: '이름 붙이는 중...',
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
					a: '아니요. AI에는 코드 구조 요약(심볼, 시그니처, import)을 보내고, 파일 원문은 보내지 않습니다. 요약이 어디로 가는지는 AI 모드에 따라 다릅니다.\n\n• WebGPU: 모델이 기기 안에서 돌기 때문에 아무것도 밖으로 나가지 않습니다.\n• 데모, API 키: 요약이 AI 제공자에게 갑니다. 데모 요청과 Anthropic·OpenAI 키 요청은 Ropeman 프록시를 거치고, Gemini 키 요청은 Google로 바로 갑니다.',
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
					a: 'Ropeman 서버는 API 키를 저장하지 않습니다. 키는 이 브라우저의 로컬 저장소에만 있습니다.\n\n• API 키 모드: AI를 호출할 때마다 요청에 키를 담아 보냅니다. Gemini 요청은 Google로 바로 가고, Anthropic·OpenAI 요청은 Ropeman 프록시를 거치며 프록시는 키를 저장하지 않습니다.\n• WebGPU 모드: 키가 필요 없습니다.\n\n설정을 초기화하면 저장된 키가 지워집니다.',
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
		coverage: {
			summary: '파일 {read}개 중 {sent}개를 AI에 보냄',
			cut: '{count}개 잘림',
			skipped: '{count}개 건너뜀',
			failed: '{count}개 읽지 못함',
			toggle: '분석 범위 보기',
			title: '분석이 읽은 파일',
			intro:
				'프로젝트의 모든 파일과, 각 파일이 AI에 갔는지 아닌지와 그 이유입니다. 지금 설정 기준으로 셉니다.',
			filter: '경로로 찾기',
			capped: '{total}개 중 {shown}개를 보여 줍니다. 경로로 찾으면 나머지도 볼 수 있습니다.',
			noMatch: '맞는 파일이 없습니다.',
			status: {
				sent: 'AI에 보냄',
				'not-sent': '읽었지만 보내지 않음',
				cut: '파일 수 상한으로 잘림',
				skipped: '건너뜀',
				failed: '읽지 못함'
			},
			reason: {
				sent: '보냄',
				'over-budget': '코드 구조 요약 크기 한도를 넘음',
				'no-symbols': '함수, 클래스, import가 없음',
				'file-limit': '파일 {limit}개 상한을 넘음',
				'excluded-path': '분석에서 빼는 경로 (테스트, 문서, 스크립트)',
				'file-size': '{size}보다 큼',
				'total-size': '전체 {size}를 넘음',
				unsupported: '이 파일 형식을 읽는 파서가 없음',
				'env-values': '실제 값이 든 env 파일이라 분석하지 않음 (.env.example 같은 템플릿만 분석함)',
				lockfile: '잠금 파일이라 분석하지 않음 (의존성 버전만 고정함)',
				'data-file':
					'JSON 데이터 파일이라 분석하지 않음 (package.json, tsconfig.json 같은 설정 파일만 분석함)',
				'parse-failed': '파서 오류',
				unreadable: '파일을 열지 못함'
			},
			levelsTitle: '다이어그램 단계별 배정',
			levelRoot: '최상위',
			levelOverBudget: '크기 한도로 보내지 않은 파일 {count}개',
			levelExceedsBudget: '한도 안에 드는 파일이 없어 가장 작은 파일 1개를 그대로 보냄',
			levelLeftOut: 'AI 답에 없어 미분류로 옮긴 파일 {count}개',
			levelInvented: '입력에 없는 경로라 버린 항목 {count}개',
			levelDuplicated: '이미 배정된 파일이라 무시한 항목 {count}개',
			levelEmptied: '파일이 남지 않아 뺀 그룹 {count}개',
			levelClean: '모든 파일이 그룹 하나에 들어갔습니다',
			levelUnknown: '이 단계는 배정 수를 기록하기 전에 분석했습니다',
			imports:
				'import 문 {total}개 중 {project}개는 프로젝트 파일로, {external}개는 외부 패키지로 이어졌고 {unresolved}개는 대상을 찾지 못했습니다.'
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
			webgpu: 'WebGPU',
			none: '연결 안 됨',
			disconnected: '연결 안 됨'
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
		},
		openMap: {
			pageTitle: '지도 열기',
			badge: '파일',
			title: 'ropeman.json 열기',
			desc: 'Ropeman CLI나 다른 사람이 만든 지도를 엽니다. 파일은 이 브라우저 안에서만 읽고 어디로도 보내지 않습니다.',
			choose: '파일 선택',
			chooseAnother: '다른 파일 열기',
			dropHint: '파일을 여기로 끌어다 놓아도 됩니다',
			loading: '파일을 읽는 중...',
			errorTitle: '이 파일을 열 수 없습니다',
			errorRecover: '다른 파일을 고르면 다시 열어 봅니다.',
			tooLarge: '파일이 {limit}MB보다 큽니다.',
			notJson: 'JSON 형식이 아닙니다. 파일이 잘렸거나 다른 종류의 파일일 수 있습니다.',
			notAMap: 'JSON이지만 Ropeman 지도가 아닙니다. CLI가 만든 ropeman.json을 고르세요.',
			newerVersion:
				'더 새로운 Ropeman이 만든 지도입니다(스키마 {version}). 페이지를 새로 고친 뒤 다시 열어 보세요.',
			unsupportedVersion:
				'이 Ropeman이 더 이상 읽지 않는 스키마 {version}로 만든 지도입니다. CLI로 지도를 다시 만드세요.',
			invalid: '지도 내용이 형식에 맞지 않습니다. 문제가 있는 곳: {field}',
			readFailed: '파일을 읽지 못했습니다.'
		},
		bridgeAccess: {
			yourBrowser: '브라우저',
			checking: '무엇이 잘못됐는지 확인하는 중...',
			connectAnyway: '그래도 이 페이지에서 연결',
			unaskedTitle: '브라우저가 한 번 묻습니다',
			unaskedBody:
				'연결을 누르면 브라우저가 이 사이트에 이 기기의 앱과 서비스 접근을 허용할지 묻습니다. 허용을 고르세요. 이 페이지는 127.0.0.1의 serve와만 통신합니다.',
			grantedTitle: '이 기기에 접근할 수 있습니다',
			grantedBody:
				'이 브라우저는 이 사이트가 이 기기의 앱에 접근하도록 이미 허용했습니다. 포트와 토큰을 넣고 연결을 누르세요.',
			unknownTitle: '브라우저가 물으면 허용을 고르세요',
			unknownBody:
				'어떤 브라우저는 사이트가 이 기기의 앱에 접근하기 전에 묻습니다. 연결을 눌렀을 때 물으면 허용을 고르세요.',
			firefoxTitle: 'Firefox가 물으면 허용을 고르세요',
			firefoxBody:
				'최근 버전의 Firefox는 사이트가 이 기기의 앱에 접근하기 전에 묻기 시작했습니다. 연결을 눌렀을 때 물으면 허용을 고르세요. 묻지 않는 버전은 바로 연결합니다.',
			safariTitle: 'Safari에서는 로컬 모드를 쓰세요',
			safariBody:
				'Safari는 이 페이지 같은 보안 페이지가 내 컴퓨터의 serve에 접근하지 못하게 막습니다. 대신 serve가 직접 띄우는 뷰어를 여세요.',
			promptPendingTitle: '답을 기다리고 있습니다',
			promptPendingBody:
				'브라우저가 주소창 옆에서 이 사이트에 이 기기의 앱 접근을 허용할지 묻고 있습니다. 허용을 고르면 연결됩니다. 묻는 창을 닫았다면 주소 왼쪽 아이콘을 누르세요.',
			deniedTitle: '이 기기에 접근하지 못하게 막혀 있습니다',
			deniedBody:
				'브라우저가 이 사이트의 기기 앱 접근을 막아서 페이지가 serve와 통신할 수 없습니다. 다시 허용하려면 이렇게 하세요.',
			unansweredTitle: '브라우저가 연결을 막았습니다',
			unansweredBody:
				'이 사이트는 아직 이 기기의 앱에 접근할 수 없습니다. 연결을 다시 누르고 브라우저가 물으면 허용을 고르세요. 묻지 않는다면 serve가 {port} 포트에서 실행 중인지 확인하세요.',
			serveDownTitle: '{port} 포트에서 실행 중인 serve가 없습니다',
			serveDownBody:
				'지도를 만들 폴더에서 serve를 실행하고 터미널을 열어 두세요. serve가 다른 포트를 출력했다면 그 번호를 넣으세요.',
			refusedTitle: 'serve가 연결을 거부했습니다',
			refusedBody:
				'serve는 {port} 포트에서 실행 중이지만 이 페이지의 연결을 거부했습니다. 토큰이 틀렸거나 serve가 이 페이지 주소를 허용하지 않기 때문입니다. 어느 쪽인지는 serve를 실행한 터미널에 나옵니다. "wrong token"이 찍혔다면 토큰을 다시 복사해 전체 값을 붙여 넣으세요.',
			refusedHint:
				'serve를 --token이나 ROPEMAN_BRIDGE_TOKEN으로 실행했다면 그 값을 넣으세요. 다른 프로그램이 이 포트를 쓰고 있다면 serve를 --port로 실행하고 그 번호를 넣으세요.',
			allowOrigin:
				'터미널에 "not allowed"가 찍혔다면 serve가 이 페이지 주소를 허용하지 않은 것입니다. serve를 멈추고 이렇게 다시 실행하세요.',
			unexplainedTitle: '연결되지 않았습니다',
			unexplainedBody:
				'브라우저가 연결이 닫힌 이유를 알려 주지 않습니다. 아래를 하나씩 확인하세요.',
			checkServe:
				'serve가 {port} 포트에서 실행 중인지 확인하세요. 꺼져 있다면 지도를 만들 폴더에서 실행하세요.',
			checkToken: '토큰 전체를 붙여 넣었는지 확인하세요. 이 명령으로 다시 복사할 수 있습니다.',
			checkBlocked:
				'브라우저가 이 사이트의 기기 앱 접근을 물었을 때 차단했다면, 주소 왼쪽 아이콘에서 다시 허용하고 새로 고치세요.',
			refusedLocalTitle: 'serve가 이 페이지를 받지 않았습니다',
			refusedLocalBody:
				'serve는 실행 중이지만 이 페이지 주소에 든 토큰을 받지 않았습니다. serve가 시작할 때 출력한 주소를 다시 여세요.',
			stepSiteControls: '주소 왼쪽의 아이콘을 누르세요.',
			stepSiteSettings: '이 사이트의 설정을 여세요.',
			stepAllowLoopback:
				'로컬 네트워크(루프백) 접근 항목을 허용으로 바꾸거나 이 사이트의 권한을 재설정하세요.',
			stepReload: '이 탭으로 돌아와 새로 고치세요.',
			stepEdgeLock: '주소 왼쪽의 아이콘을 누르세요. 자물쇠 모양일 수 있습니다.',
			stepEdgePermissions: '이 사이트의 권한을 여세요.',
			stepFirefoxIcon: '주소 왼쪽의 아이콘을 누르세요.',
			stepFirefoxRemove: '이 기기의 앱과 서비스 접근을 막은 권한을 지우세요.',
			stepOtherSettings: '주소 왼쪽 아이콘에서 이 사이트의 설정을 여세요.',
			stepOtherAllow: '루프백이나 로컬 네트워크 접근을 허용하세요.',
			stepsMayDiffer: '메뉴 이름은 브라우저 버전과 언어에 따라 다를 수 있습니다.',
			settingsUrl: '또는 주소창에 이 주소를 붙여 넣으세요.',
			stopServe: 'Ctrl+C로 serve를 멈추세요.',
			startLocal: '로컬 모드로 다시 실행하세요.',
			openPrinted: 'serve가 출력한 http://127.0.0.1:{port}/bridge#token=... 주소를 여세요.',
			localInstead:
				'권한이 필요 없는 로컬 모드도 있습니다. Ctrl+C로 serve를 멈추고 이렇게 다시 실행하세요.'
		},
		bridge: {
			pageTitle: '브리지',
			title: 'ropeman serve에 연결',
			desc: 'ropeman serve는 내 컴퓨터에서 돌면서 폴더 하나의 지도를 내줍니다. 폴더를 누르면 로컬 CLI가 그 안의 부분에 이름을 붙이고, 파일을 누르면 serve가 디스크에서 그 파일만 읽어 옵니다. Ropeman 서버는 거치지 않습니다.',
			startServe: '지도를 만들 폴더에서 serve를 실행하세요.',
			portLabel: '포트',
			tokenLabel: '토큰',
			tokenHint:
				'serve는 토큰을 화면에 찍지 않고 어디 있는지만 알려 줍니다. 기본 위치는 {file} 파일입니다. --token이나 ROPEMAN_BRIDGE_TOKEN으로 정했다면 그 값을 넣으세요.',
			tokenMemoryOnly:
				'이 페이지는 토큰을 저장하지 않고 메모리에만 둡니다. 새로고침하면 다시 넣으세요.',
			copyToken: '토큰 파일 내용 보기:',
			connect: '연결',
			connecting: '{host}의 serve에 연결하는 중...',
			cancel: '취소',
			failedTitle: '연결하지 못했습니다',
			failedNewer:
				'serve가 더 새로운 지도 형식({version})을 씁니다. 이 페이지를 새로 고쳐 새 뷰어를 받으세요.',
			failedOlder:
				'serve가 오래된 지도 형식({version})을 씁니다. serve를 최신 버전으로 다시 실행하세요.',
			failedBadHello: '{host}에서 응답이 왔지만 ropeman serve가 아닙니다. 포트를 확인하세요.',
			connected: '연결됨',
			lostBadge: '끊김',
			serverInfo: 'serve {version} · {host}',
			disconnect: '연결 끊기',
			lost: 'serve와의 연결이 끊겼습니다. 지도는 끊기기 직전 그대로입니다.',
			reconnect: '다시 연결',
			loadingMap: 'serve에서 지도를 받는 중...',
			localMode: '로컬 모드',
			namingPending: 'CLI가 이 부분들에 이름을 붙이는 중입니다. 그동안은 폴더 이름이 보입니다.',
			namingNoCli:
				'serve가 claude도 gemini도 찾지 못해 이름을 붙이지 못했습니다. 폴더 이름을 그대로 씁니다.',
			namingFailed: 'CLI가 이름 붙이기를 끝내지 못했습니다. 폴더 이름을 그대로 씁니다.',
			namingRejected:
				'CLI가 붙인 이름이 두 번 다 검사를 통과하지 못했습니다. 폴더 이름을 그대로 씁니다.',
			namingStopped: '이름 붙이기가 멈췄습니다. 폴더 이름을 그대로 씁니다.',
			serverSaid: 'serve 메시지: {error}',
			expandFailed: '{label} 폴더를 열지 못했습니다. {reason}',
			mapFailed: '지도를 받지 못했습니다. {reason}',
			busyExpand:
				'이 페이지에서 이미 폴더 4개에 이름을 붙이는 중입니다. 하나가 끝난 뒤 다시 누르세요.',
			noRoot: 'serve가 --root 없이 실행되어 지도도 파일도 없습니다.',
			disconnected: 'serve에 연결되어 있지 않습니다.',
			otherError: 'serve가 처리하지 못했습니다: {error}',
			dismiss: '닫기',
			backToMap: '지도로 돌아가기',
			fileEnv: '실제 값이 든 .env 파일입니다. serve는 이런 파일을 보내지 않습니다.',
			fileTooLarge: '파일이 500KB를 넘어서 serve가 보내지 않습니다.',
			fileBinary: '바이너리 파일이라 보여 줄 텍스트가 없습니다.',
			fileNotFound: '파일이 없습니다. 옮겨졌거나 지워졌을 수 있습니다.',
			fileChanged: 'serve가 읽는 사이에 파일이 바뀌었습니다. 다시 여세요.',
			fileOutside: 'serve는 지도를 만든 폴더 안의 파일만 읽습니다.',
			fileNotAFile: '일반 파일이 아닙니다.',
			fileBusy: '이 페이지에서 이미 파일 8개를 읽는 중입니다. 잠시 뒤 다시 여세요.'
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
		settingsCustomIncludePatternsPlaceholder: 'One per line, e.g.:\ndocs\n.devcontainer',
		settingsCustomIncludePatternsHint:
			'Paths listed here are read even when an exclude rule matches them. A bare name matches a folder or file of that name at any depth. An entry with a slash matches that path from the project root. Agent instruction folders (.agents, .cursor, .claude/skills, .github/instructions and others) and CI pipelines (.github/workflows, .gitlab-ci.yml, .circleci) are included by default.',
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
				'Pick Demo, API Key or Browser AI. Every mode sends the AI a code summary and keeps the source files in your browser.',
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
			openMapCta: 'Open a ropeman.json',
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
			lines: '{n} {n|line|lines}',
			emptyError: 'Paste some code first',
			analyzeFailed: "Couldn't analyze the snippet: {error}"
		},
		legend: {
			title: 'Legend',
			depends_on: 'Depends on',
			calls: 'Calls',
			extends: 'Extends',
			uses: 'Uses',
			inferred: 'Dashed lines are inferred by the AI, not found in the code'
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
			demo: 'The free demo is unavailable right now. Browse pre-analyzed examples in Explore, or connect an API key to analyze your own code.',
			unknown: 'Something went wrong during AI analysis.',
			actionSize: 'Size settings',
			actionModel: 'Change model',
			actionKey: 'Check API key',
			actionExplore: 'Open Explore',
			actionConnect: 'Connect another AI'
		},
		analyze: {
			demoNotice:
				'Runs on the free tier of Google Gemini, where Google may use inputs to improve its products. For code you would not share, use an API key.',
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
			payloadTokens: '~{n} tokens',
			demoTooLarge:
				'This request body is {size}. Above {limit} the free demo may time out. Lower the code summary size in Settings, or use an API key.',
			byokTooLarge:
				'This request is about {tokens} tokens. {model} takes about {limit} tokens of input (its context window minus room for the reply), so it may reject or truncate it. Choose a model with a larger window, or lower the code summary size in Settings.',
			byokWindowUnknown: "This model's context window is unknown, so {context} tokens is assumed.",
			footerHint: 'Pick a mode to start the analysis.'
		},
		panel: {
			close: 'Close',
			description: 'Description',
			files: 'Files',
			keySymbols: 'Key symbols'
		},
		node: {
			naming: 'Naming...',
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
					a: "No. Ropeman sends the AI a code summary (symbols, signatures and imports), not the files themselves. Where the summary goes depends on the AI mode.\n\n• WebGPU: the model runs on your device, and nothing leaves it.\n• Demo and API Key: the summary goes to the AI provider. Demo requests and Anthropic or OpenAI key requests pass through Ropeman's proxy. Gemini key requests go straight to Google.",
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
					a: "Ropeman's servers don't store API keys. The key stays in this browser's local storage.\n\n• API Key mode: the key goes out with each AI request. Gemini requests go straight to Google. Anthropic and OpenAI requests pass through Ropeman's proxy, which does not store the key.\n• WebGPU mode: no key is needed.\n\nReset settings to delete stored keys.",
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
		coverage: {
			summary: 'Sent {sent} of {read} read {total|file|files}',
			cut: '{count} cut',
			skipped: '{count} skipped',
			failed: '{count} not read',
			toggle: 'Show analysis coverage',
			title: 'What the analysis read',
			intro:
				'Every file in the project, and whether it went to the AI. Counts follow your current settings.',
			filter: 'Filter by path',
			capped: 'Showing {shown} of {total}. Filter by path to see the rest.',
			noMatch: 'No file matches.',
			status: {
				sent: 'Sent to the AI',
				'not-sent': 'Read, not sent',
				cut: 'Cut by the file limit',
				skipped: 'Skipped',
				failed: 'Not read'
			},
			reason: {
				sent: 'Sent',
				'over-budget': 'Over the code summary size limit',
				'no-symbols': 'No functions, classes or imports',
				'file-limit': 'Past the {limit}-file limit',
				'excluded-path': 'Path left out of analysis (tests, docs, scripts)',
				'file-size': 'Larger than {size}',
				'total-size': 'Past the {size} total',
				unsupported: 'No parser for this file type',
				'env-values':
					'Env file with real values, not analyzed (only templates like .env.example are)',
				lockfile: 'Lockfile, not analyzed (it only pins versions)',
				'data-file':
					'JSON data file, not analyzed (only manifests like package.json and tsconfig.json are)',
				'parse-failed': 'Parser error',
				unreadable: 'Could not open the file'
			},
			levelsTitle: 'Diagram levels',
			levelRoot: 'Top level',
			levelOverBudget: '{count} {count|file|files} not sent, over the size limit',
			levelExceedsBudget: 'No file fit the size limit, so the smallest one was sent anyway',
			levelLeftOut: '{count} {count|file|files} missing from the answer, moved to Unclassified',
			levelInvented: '{count} made-up {count|path|paths} dropped',
			levelDuplicated: '{count} repeated {count|file|files} ignored',
			levelEmptied: '{count} empty {count|group|groups} removed',
			levelClean: 'Every file is in exactly one group',
			levelUnknown: 'Analyzed before these counts were recorded',
			imports:
				'Of {total} import statements, {project} lead to project files, {external} to packages, and {unresolved} to nothing found.'
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
			webgpu: 'WebGPU',
			none: 'Not connected',
			disconnected: 'Disconnected'
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
		},
		openMap: {
			pageTitle: 'Open a map',
			badge: 'File',
			title: 'Open a ropeman.json',
			desc: 'View a map that the Ropeman CLI or someone else made. The file is read in this browser and sent nowhere.',
			choose: 'Choose file',
			chooseAnother: 'Open another file',
			dropHint: 'or drop the file here',
			loading: 'Reading the file...',
			errorTitle: "Can't open this file",
			errorRecover: 'Choose another file to try again.',
			tooLarge: 'The file is larger than {limit} MB.',
			notJson: "This isn't valid JSON. The file may be cut off or of another kind.",
			notAMap: 'This is JSON but not a Ropeman map. Choose the ropeman.json the CLI wrote.',
			newerVersion:
				'A newer Ropeman made this map (schema {version}). Reload the page and open it again.',
			unsupportedVersion:
				'This map uses schema {version}, which this Ropeman no longer reads. Make the map again with the CLI.',
			invalid: "The map doesn't match the format. The problem is at {field}.",
			readFailed: "Couldn't read the file."
		},
		bridgeAccess: {
			yourBrowser: 'your browser',
			checking: 'Checking what went wrong...',
			connectAnyway: 'Connect from this page anyway',
			unaskedTitle: 'Your browser asks once',
			unaskedBody:
				'When you click Connect, {browser} asks whether this site may reach apps and services on this device. Choose Allow. The page then talks only to serve on 127.0.0.1.',
			grantedTitle: 'Access to this device is allowed',
			grantedBody:
				'{Browser} already lets this site reach apps on this device. Enter the port and token, then click Connect.',
			unknownTitle: 'If your browser asks, choose Allow',
			unknownBody:
				'Some browsers ask before a site reaches apps on this device. If yours asks when you click Connect, choose Allow.',
			firefoxTitle: 'If Firefox asks, choose Allow',
			firefoxBody:
				'Recent versions of Firefox are starting to ask before a site reaches apps on this device. If it asks when you click Connect, choose Allow. Versions that do not ask connect right away.',
			safariTitle: 'In Safari, use local mode',
			safariBody:
				'Safari blocks secure pages like this one from reaching serve on your machine. Open the viewer from serve itself instead:',
			promptPendingTitle: 'Waiting for your answer',
			promptPendingBody:
				'{Browser} is asking, next to the address bar, whether this site may reach apps on this device. Choose Allow to connect. If you closed the prompt, click the icon to the left of the address.',
			deniedTitle: 'Access to this device is blocked',
			deniedBody:
				'{Browser} does not let this site reach apps on this device, so the page cannot talk to serve. To allow it again:',
			unansweredTitle: 'The browser did not let the connection through',
			unansweredBody:
				'This site may not reach apps on this device yet. Click Connect again and choose Allow when {browser} asks. If it does not ask, check that serve is running on port {port}.',
			serveDownTitle: 'Nothing is running on port {port}',
			serveDownBody:
				'Start serve in the folder you want to map and keep the terminal open. If serve printed another port, enter that one.',
			refusedTitle: 'serve refused this connection',
			refusedBody:
				'serve is running on port {port} but turned this page down, because the token is wrong or serve does not allow this page\'s address. The terminal running serve says which. If it says "wrong token", copy the token again and paste the whole value:',
			refusedHint:
				'If you started serve with --token or ROPEMAN_BRIDGE_TOKEN, paste that value instead. If another program uses this port, start serve with --port and enter that number.',
			allowOrigin:
				'If the terminal says "not allowed", serve does not allow this page\'s address. Stop serve and start it like this:',
			unexplainedTitle: 'The connection did not go through',
			unexplainedBody: '{Browser} does not say why the connection closed, so check each of these:',
			checkServe:
				'Check that serve is running on port {port}. If not, start it in the folder you want to map:',
			checkToken: 'Check that you pasted the whole token. Copy it again with:',
			checkBlocked:
				'If {browser} asked whether this site may reach apps on this device and you blocked it, allow it again from the icon to the left of the address, then reload.',
			refusedLocalTitle: 'serve refused this page',
			refusedLocalBody:
				"serve is running but did not accept the token in this page's address. Open the address serve printed when it started again.",
			stepSiteControls: 'Click the icon to the left of the address.',
			stepSiteSettings: "Open the site's settings (the entry may be called Site settings).",
			stepAllowLoopback:
				"Set the local network entry to Allow, or reset the site's permissions. The entry may be called Loopback network, or Local network access in older versions.",
			stepReload: 'Come back to this tab and reload it.',
			stepEdgeLock: 'Click the icon to the left of the address (it may be a lock).',
			stepEdgePermissions:
				"Open the site's permissions (the entry may be called Permissions for this site).",
			stepFirefoxIcon: 'Click the icon to the left of the address.',
			stepFirefoxRemove:
				'Remove the blocked permission to reach apps on this device (the entry may be called Device apps and services).',
			stepOtherSettings: "Open this site's settings from the icon to the left of the address.",
			stepOtherAllow: 'Allow loopback or local network access.',
			stepsMayDiffer: "These menu names may differ in your browser's version or language.",
			settingsUrl: 'Or paste this into the address bar:',
			stopServe: 'Stop serve with Ctrl+C.',
			startLocal: 'Start it again in local mode:',
			openPrinted: 'Open the http://127.0.0.1:{port}/bridge#token=... address it prints.',
			localInstead:
				'Or use local mode, which needs no permission. Stop serve with Ctrl+C and start it like this:'
		},
		bridge: {
			pageTitle: 'Bridge',
			title: 'Connect to ropeman serve',
			desc: "ropeman serve runs on your machine and serves the map of one folder. Click a folder and your local CLI names its parts. Click a file and serve reads just that file from disk. Nothing goes through Ropeman's servers.",
			startServe: 'Start serve in the folder you want to map:',
			portLabel: 'Port',
			tokenLabel: 'Token',
			tokenHint:
				"serve doesn't print the token. It tells you where the token is: by default the file {file}. If you set it with --token or ROPEMAN_BRIDGE_TOKEN, paste that value.",
			tokenMemoryOnly:
				"This page keeps the token in memory and doesn't save it, so paste it again after a reload.",
			copyToken: 'Show the token file:',
			connect: 'Connect',
			connecting: 'Connecting to serve on {host}...',
			cancel: 'Cancel',
			failedTitle: "Couldn't connect",
			failedNewer:
				'serve uses a newer map format ({version}). Reload this page to get the newer viewer.',
			failedOlder: 'serve uses an older map format ({version}). Start the latest serve again.',
			failedBadHello: "Something answered on {host}, but it isn't ropeman serve. Check the port.",
			connected: 'Connected',
			lostBadge: 'Disconnected',
			serverInfo: 'serve {version} · {host}',
			disconnect: 'Disconnect',
			lost: 'The connection to serve closed. The map stays as it was.',
			reconnect: 'Reconnect',
			loadingMap: 'Loading the map from serve...',
			localMode: 'Local mode',
			namingPending: 'Your CLI is naming these parts. Folder names show until then.',
			namingNoCli:
				'serve found neither claude nor gemini, so nothing names these parts. Folder names stay.',
			namingFailed: "The CLI didn't finish naming. Folder names stay.",
			namingRejected: "The CLI's names failed the checks twice. Folder names stay.",
			namingStopped: 'Naming stopped. Folder names stay.',
			serverSaid: 'serve said: {error}',
			expandFailed: "Couldn't open {label}. {reason}",
			mapFailed: "Couldn't load the map. {reason}",
			busyExpand: 'This page already has 4 folders being named. Click again when one finishes.',
			noRoot: 'serve was started without --root, so it has no map and reads no files.',
			disconnected: 'Not connected to serve.',
			otherError: "serve couldn't do it: {error}",
			dismiss: 'Dismiss',
			backToMap: 'Back to map',
			fileEnv: 'This .env file holds real values. serve never sends those.',
			fileTooLarge: 'The file is over 500 KB, more than serve sends.',
			fileBinary: 'This is a binary file, so there is no text to show.',
			fileNotFound: "The file isn't there. It may have been moved or deleted.",
			fileChanged: 'The file changed while serve read it. Open it again.',
			fileOutside: 'serve reads only files inside the folder it maps.',
			fileNotAFile: "This isn't a regular file.",
			fileBusy: 'This page is already reading 8 files. Open it again in a moment.'
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
