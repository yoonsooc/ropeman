export type AIProviderId = 'google' | 'anthropic' | 'openai';
export type BridgeCliId = 'claude' | 'gemini' | 'auto';

function createSettingsStore() {
	const stored = typeof window !== 'undefined' ? localStorage.getItem('ropeman-settings') : null;
	const initial = stored ? JSON.parse(stored) : {};

	let geminiApiKey = $state<string>(initial.geminiApiKey ?? '');
	let anthropicApiKey = $state<string>(initial.anthropicApiKey ?? '');
	let openaiApiKey = $state<string>(initial.openaiApiKey ?? '');
	let aiProvider = $state<AIProviderId>(initial.aiProvider ?? 'google');
	let aiModel = $state<string>(initial.aiModel ?? 'gemini-2.5-flash-lite');
	let maxSkeletonKB = $state<number>(initial.maxSkeletonKB ?? 250);
	let skeletonUnlimited = $state<boolean>(initial.skeletonUnlimited ?? false);
	let cacheEnabled = $state<boolean>(initial.cacheEnabled ?? true);
	let language = $state<'ko' | 'en'>(initial.language ?? 'ko');
	let syntaxTheme = $state<string>(initial.syntaxTheme ?? 'tomorrow');
	let skipDrilldownConfirm = $state<boolean>(initial.skipDrilldownConfirm ?? false);
	let showSymbols = $state<boolean>(initial.showSymbols ?? false);
	let bridgeCli = $state<BridgeCliId>(initial.bridgeCli ?? 'auto');
	let codeFontSize = $state<number>(initial.codeFontSize ?? 13);
	let customSkipPatterns = $state<string[]>(initial.customSkipPatterns ?? []);

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
					codeFontSize,
					customSkipPatterns
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

		get language() {
			return language;
		},
		set language(v: 'ko' | 'en') {
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
			aiModel = 'gemini-2.5-flash-lite';
			maxSkeletonKB = 250;
			skeletonUnlimited = false;
			cacheEnabled = true;
			language = 'ko';
			syntaxTheme = 'tomorrow';
			skipDrilldownConfirm = false;
			showSymbols = false;
			bridgeCli = 'auto';
			codeFontSize = 13;
			customSkipPatterns = [];
			if (typeof window !== 'undefined') {
				localStorage.removeItem('ropeman-settings');
			}
		}
	};
}

export const settingsStore = createSettingsStore();
