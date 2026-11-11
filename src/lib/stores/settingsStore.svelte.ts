import { browserLanguages, detectLocale, parseLocale, type Locale } from '$lib/utils/locale';

export type AIProviderId = 'google' | 'anthropic' | 'openai';
export type BridgeCliId = 'claude' | 'gemini' | 'auto';

function loadStoredSettings() {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem('ropeman-settings');
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function createSettingsStore() {
	const initial = loadStoredSettings();
	const browserLocale = detectLocale(browserLanguages());

	let geminiApiKey = $state<string>(initial.geminiApiKey ?? '');
	let anthropicApiKey = $state<string>(initial.anthropicApiKey ?? '');
	let openaiApiKey = $state<string>(initial.openaiApiKey ?? '');
	let aiProvider = $state<AIProviderId>(initial.aiProvider ?? 'google');
	let aiModel = $state<string>(initial.aiModel ?? 'gemini-flash-lite-latest');
	let maxSkeletonKB = $state<number>(initial.maxSkeletonKB ?? 250);
	let skeletonUnlimited = $state<boolean>(initial.skeletonUnlimited ?? false);
	let cacheEnabled = $state<boolean>(initial.cacheEnabled ?? true);
	// null means the user never picked a language, so the browser's preference applies
	let language = $state<Locale | null>(parseLocale(initial.language));
	let syntaxTheme = $state<string>(initial.syntaxTheme ?? 'tomorrow');
	let skipDrilldownConfirm = $state<boolean>(initial.skipDrilldownConfirm ?? false);
	let showSymbols = $state<boolean>(initial.showSymbols ?? false);
	let bridgeCli = $state<BridgeCliId>(initial.bridgeCli ?? 'auto');
	let bridgeToken = $state<string>(initial.bridgeToken ?? '');
	let codeFontSize = $state<number>(initial.codeFontSize ?? 13);
	let customSkipPatterns = $state<string[]>(initial.customSkipPatterns ?? []);
	let customIncludePatterns = $state<string[]>(initial.customIncludePatterns ?? []);
	let skipAnalysisCancelConfirm = $state<boolean>(initial.skipAnalysisCancelConfirm ?? false);

	function persist() {
		if (typeof window !== 'undefined') {
			localStorage.setItem(
				'ropeman-settings',
				JSON.stringify({
					geminiApiKey,
					anthropicApiKey,
					openaiApiKey,
					aiProvider,
					aiModel,
					maxSkeletonKB,
					skeletonUnlimited,
					cacheEnabled,
					language,
					syntaxTheme,
					skipDrilldownConfirm,
					showSymbols,
					bridgeCli,
					bridgeToken,
					codeFontSize,
					customSkipPatterns,
					customIncludePatterns,
					skipAnalysisCancelConfirm
				})
			);
		}
	}

	return {
		get geminiApiKey() {
			return geminiApiKey;
		},
		set geminiApiKey(v: string) {
			geminiApiKey = v;
			persist();
		},

		get anthropicApiKey() {
			return anthropicApiKey;
		},
		set anthropicApiKey(v: string) {
			anthropicApiKey = v;
			persist();
		},

		get openaiApiKey() {
			return openaiApiKey;
		},
		set openaiApiKey(v: string) {
			openaiApiKey = v;
			persist();
		},

		get aiProvider() {
			return aiProvider;
		},
		set aiProvider(v: AIProviderId) {
			aiProvider = v;
			persist();
		},

		get aiModel() {
			return aiModel;
		},
		set aiModel(v: string) {
			aiModel = v;
			persist();
		},

		get maxSkeletonKB() {
			return maxSkeletonKB;
		},
		set maxSkeletonKB(v: number) {
			maxSkeletonKB = Math.max(50, Math.min(1000, v));
			persist();
		},

		get skeletonUnlimited() {
			return skeletonUnlimited;
		},
		set skeletonUnlimited(v: boolean) {
			skeletonUnlimited = v;
			persist();
		},

		get cacheEnabled() {
			return cacheEnabled;
		},
		set cacheEnabled(v: boolean) {
			cacheEnabled = v;
			persist();
		},

		get language(): Locale {
			return language ?? browserLocale;
		},
		set language(v: Locale) {
			language = v;
			persist();
		},

		get syntaxTheme() {
			return syntaxTheme;
		},
		set syntaxTheme(v: string) {
			syntaxTheme = v;
			persist();
		},

		get skipDrilldownConfirm() {
			return skipDrilldownConfirm;
		},
		set skipDrilldownConfirm(v: boolean) {
			skipDrilldownConfirm = v;
			persist();
		},

		get showSymbols() {
			return showSymbols;
		},
		set showSymbols(v: boolean) {
			showSymbols = v;
			persist();
		},

		get bridgeCli() {
			return bridgeCli;
		},
		set bridgeCli(v: BridgeCliId) {
			bridgeCli = v;
			persist();
		},

		get bridgeToken() {
			return bridgeToken;
		},
		set bridgeToken(v: string) {
			bridgeToken = v.trim();
			persist();
		},

		get codeFontSize() {
			return codeFontSize;
		},
		set codeFontSize(v: number) {
			codeFontSize = Math.max(10, Math.min(24, v));
			persist();
		},

		get customSkipPatterns() {
			return customSkipPatterns;
		},
		set customSkipPatterns(v: string[]) {
			customSkipPatterns = v;
			persist();
		},

		get customIncludePatterns() {
			return customIncludePatterns;
		},
		set customIncludePatterns(v: string[]) {
			customIncludePatterns = v;
			persist();
		},

		get skipAnalysisCancelConfirm() {
			return skipAnalysisCancelConfirm;
		},
		set skipAnalysisCancelConfirm(v: boolean) {
			skipAnalysisCancelConfirm = v;
			persist();
		},

		get hasApiKey() {
			if (aiProvider === 'google') return geminiApiKey.length > 0;
			if (aiProvider === 'anthropic') return anthropicApiKey.length > 0;
			if (aiProvider === 'openai') return openaiApiKey.length > 0;
			return false;
		},

		get currentApiKey() {
			if (aiProvider === 'google') return geminiApiKey;
			if (aiProvider === 'anthropic') return anthropicApiKey;
			if (aiProvider === 'openai') return openaiApiKey;
			return '';
		},

		clearAll() {
			geminiApiKey = '';
			anthropicApiKey = '';
			openaiApiKey = '';
			aiProvider = 'google';
			aiModel = 'gemini-flash-lite-latest';
			maxSkeletonKB = 250;
			skeletonUnlimited = false;
			cacheEnabled = true;
			language = null;
			syntaxTheme = 'tomorrow';
			skipDrilldownConfirm = false;
			showSymbols = false;
			bridgeCli = 'auto';
			bridgeToken = '';
			codeFontSize = 13;
			customSkipPatterns = [];
			customIncludePatterns = [];
			skipAnalysisCancelConfirm = false;
			if (typeof window !== 'undefined') {
				localStorage.removeItem('ropeman-settings');
			}
		}
	};
}

export const settingsStore = createSettingsStore();
