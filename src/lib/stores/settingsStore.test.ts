import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { settingsStore } from './settingsStore.svelte';

describe('settingsStore', () => {
	beforeEach(() => {
		settingsStore.clearAll();
	});

	describe('initial/cleared state', () => {
		it('geminiApiKey is empty string', () => {
			expect(settingsStore.geminiApiKey).toBe('');
		});

		it('anthropicApiKey is empty string', () => {
			expect(settingsStore.anthropicApiKey).toBe('');
		});

		it('aiProvider defaults to google', () => {
			expect(settingsStore.aiProvider).toBe('google');
		});

		it('aiModel defaults to gemini-flash-lite-latest', () => {
			expect(settingsStore.aiModel).toBe('gemini-flash-lite-latest');
		});

		it('cacheEnabled defaults to true', () => {
			expect(settingsStore.cacheEnabled).toBe(true);
		});

		it('language defaults to en outside a browser', () => {
			expect(settingsStore.language).toBe('en');
		});

		it('syntaxTheme defaults to tomorrow', () => {
			expect(settingsStore.syntaxTheme).toBe('tomorrow');
		});

		it('showSymbols defaults to false', () => {
			expect(settingsStore.showSymbols).toBe(false);
		});

		it('customSkipPatterns defaults to empty array', () => {
			expect(settingsStore.customSkipPatterns).toEqual([]);
		});
	});

	describe('setters', () => {
		it('sets geminiApiKey', () => {
			settingsStore.geminiApiKey = 'test-key-123';
			expect(settingsStore.geminiApiKey).toBe('test-key-123');
		});

		it('sets anthropicApiKey', () => {
			settingsStore.anthropicApiKey = 'sk-ant-test';
			expect(settingsStore.anthropicApiKey).toBe('sk-ant-test');
		});

		it('sets aiProvider', () => {
			settingsStore.aiProvider = 'anthropic';
			expect(settingsStore.aiProvider).toBe('anthropic');
		});

		it('sets aiModel', () => {
			settingsStore.aiModel = 'claude-3-opus';
			expect(settingsStore.aiModel).toBe('claude-3-opus');
		});

		it('sets cacheEnabled', () => {
			settingsStore.cacheEnabled = false;
			expect(settingsStore.cacheEnabled).toBe(false);
		});

		it('sets language', () => {
			settingsStore.language = 'en';
			expect(settingsStore.language).toBe('en');
		});

		it('sets syntaxTheme', () => {
			settingsStore.syntaxTheme = 'monokai';
			expect(settingsStore.syntaxTheme).toBe('monokai');
		});

		it('sets showSymbols', () => {
			settingsStore.showSymbols = true;
			expect(settingsStore.showSymbols).toBe(true);
		});

		it('sets customSkipPatterns', () => {
			settingsStore.customSkipPatterns = ['target', 'third_party'];
			expect(settingsStore.customSkipPatterns).toEqual(['target', 'third_party']);
		});

		it('sets customIncludePatterns and clearAll resets them', () => {
			settingsStore.customIncludePatterns = ['docs', '.github/workflows'];
			expect(settingsStore.customIncludePatterns).toEqual(['docs', '.github/workflows']);
			settingsStore.clearAll();
			expect(settingsStore.customIncludePatterns).toEqual([]);
		});

		it('clearAll resets customSkipPatterns', () => {
			settingsStore.customSkipPatterns = ['target'];
			settingsStore.clearAll();
			expect(settingsStore.customSkipPatterns).toEqual([]);
		});
	});

	describe('hasApiKey (derived getter)', () => {
		it('returns false when no API key is set', () => {
			expect(settingsStore.hasApiKey).toBe(false);
		});

		it('returns true when geminiApiKey is set and provider is google', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'key123';
			expect(settingsStore.hasApiKey).toBe(true);
		});

		it('returns false when geminiApiKey is set but provider is anthropic', () => {
			settingsStore.aiProvider = 'anthropic';
			settingsStore.geminiApiKey = 'key123';
			expect(settingsStore.hasApiKey).toBe(false);
		});

		it('returns true when anthropicApiKey is set and provider is anthropic', () => {
			settingsStore.aiProvider = 'anthropic';
			settingsStore.anthropicApiKey = 'sk-ant-key';
			expect(settingsStore.hasApiKey).toBe(true);
		});

		it('returns false when anthropicApiKey is set but provider is google', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.anthropicApiKey = 'sk-ant-key';
			expect(settingsStore.hasApiKey).toBe(false);
		});
	});

	describe('currentApiKey (derived getter)', () => {
		it('returns empty string when no key is set', () => {
			expect(settingsStore.currentApiKey).toBe('');
		});

		it('returns geminiApiKey when provider is google', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'gemini-key';
			expect(settingsStore.currentApiKey).toBe('gemini-key');
		});

		it('returns anthropicApiKey when provider is anthropic', () => {
			settingsStore.aiProvider = 'anthropic';
			settingsStore.anthropicApiKey = 'anthropic-key';
			expect(settingsStore.currentApiKey).toBe('anthropic-key');
		});
	});

	describe('openaiApiKey getter/setter', () => {
		it('defaults to empty string', () => {
			expect(settingsStore.openaiApiKey).toBe('');
		});

		it('sets and gets openaiApiKey', () => {
			// Act
			settingsStore.openaiApiKey = 'sk-openai-test-123';

			// Assert
			expect(settingsStore.openaiApiKey).toBe('sk-openai-test-123');
		});

		it('persists openaiApiKey across setter calls', () => {
			// Act
			settingsStore.openaiApiKey = 'sk-openai-persist';

			// Assert — value survives a subsequent read
			expect(settingsStore.openaiApiKey).toBe('sk-openai-persist');
		});
	});

	describe('bridgeCli getter/setter', () => {
		it('defaults to auto', () => {
			expect(settingsStore.bridgeCli).toBe('auto');
		});

		it('sets and gets bridgeCli', () => {
			// Act
			settingsStore.bridgeCli = 'claude';

			// Assert
			expect(settingsStore.bridgeCli).toBe('claude');
		});

		it('persists bridgeCli across setter calls', () => {
			// Act
			settingsStore.bridgeCli = 'gemini';

			// Assert — value survives a subsequent read
			expect(settingsStore.bridgeCli).toBe('gemini');
		});
	});

	describe('bridgeToken getter/setter', () => {
		it('defaults to empty', () => {
			expect(settingsStore.bridgeToken).toBe('');
		});

		it('trims a pasted token', () => {
			// Act — tokens are usually copied from a terminal line with surrounding whitespace
			settingsStore.bridgeToken = '  abc123\n';

			// Assert
			expect(settingsStore.bridgeToken).toBe('abc123');
		});

		it('is cleared by clearAll', () => {
			// Arrange
			settingsStore.bridgeToken = 'abc123';

			// Act
			settingsStore.clearAll();

			// Assert
			expect(settingsStore.bridgeToken).toBe('');
		});
	});

	describe('hasApiKey for openai', () => {
		it('returns true when openaiApiKey is set and provider is openai', () => {
			// Arrange
			settingsStore.aiProvider = 'openai';
			settingsStore.openaiApiKey = 'sk-openai-key';

			// Assert
			expect(settingsStore.hasApiKey).toBe(true);
		});

		it('returns false when openaiApiKey is empty and provider is openai', () => {
			// Arrange
			settingsStore.aiProvider = 'openai';

			// Assert
			expect(settingsStore.hasApiKey).toBe(false);
		});

		it('returns false when openaiApiKey is set but provider is google', () => {
			// Arrange
			settingsStore.aiProvider = 'google';
			settingsStore.openaiApiKey = 'sk-openai-key';

			// Assert
			expect(settingsStore.hasApiKey).toBe(false);
		});
	});

	describe('currentApiKey for openai', () => {
		it('returns openaiApiKey when provider is openai', () => {
			// Arrange
			settingsStore.aiProvider = 'openai';
			settingsStore.openaiApiKey = 'sk-openai-current';

			// Assert
			expect(settingsStore.currentApiKey).toBe('sk-openai-current');
		});

		it('returns empty string when provider is openai but no key set', () => {
			// Arrange
			settingsStore.aiProvider = 'openai';

			// Assert
			expect(settingsStore.currentApiKey).toBe('');
		});
	});

	describe('clearAll', () => {
		it('resets all values to defaults', () => {
			settingsStore.geminiApiKey = 'key1';
			settingsStore.anthropicApiKey = 'key2';
			settingsStore.aiProvider = 'anthropic';
			settingsStore.aiModel = 'custom-model';
			settingsStore.cacheEnabled = false;
			settingsStore.language = 'en';
			settingsStore.syntaxTheme = 'monokai';

			settingsStore.clearAll();

			expect(settingsStore.geminiApiKey).toBe('');
			expect(settingsStore.anthropicApiKey).toBe('');
			expect(settingsStore.aiProvider).toBe('google');
			expect(settingsStore.aiModel).toBe('gemini-flash-lite-latest');
			expect(settingsStore.cacheEnabled).toBe(true);
			expect(settingsStore.language).toBe('en');
			expect(settingsStore.syntaxTheme).toBe('tomorrow');
			expect(settingsStore.showSymbols).toBe(false);
		});

		it('resets openaiApiKey to empty string', () => {
			// Arrange
			settingsStore.openaiApiKey = 'sk-openai-to-clear';

			// Act
			settingsStore.clearAll();

			// Assert
			expect(settingsStore.openaiApiKey).toBe('');
		});

		it('resets bridgeCli to auto', () => {
			// Arrange
			settingsStore.bridgeCli = 'claude';

			// Act
			settingsStore.clearAll();

			// Assert
			expect(settingsStore.bridgeCli).toBe('auto');
		});
	});

	describe('language in a browser', () => {
		const STORAGE_KEY = 'ropeman-settings';
		let storage: Map<string, string>;

		function stubBrowser(nav: { languages?: string[]; language?: string } | undefined) {
			vi.stubGlobal('window', {});
			vi.stubGlobal('navigator', nav);
			vi.stubGlobal('localStorage', {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, value),
				removeItem: (key: string) => storage.delete(key)
			});
		}

		async function loadStore() {
			vi.resetModules();
			return (await import('./settingsStore.svelte')).settingsStore;
		}

		beforeEach(() => {
			storage = new Map();
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			vi.resetModules();
		});

		it('starts in Korean when the browser prefers ko-KR', async () => {
			// Arrange
			stubBrowser({ languages: ['ko-KR', 'en-US'], language: 'ko-KR' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
		});

		it('starts in English when the browser prefers en-US', async () => {
			// Arrange
			stubBrowser({ languages: ['en-US', 'ko'], language: 'en-US' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('en');
		});

		it('skips unsupported languages and picks the first supported one', async () => {
			// Arrange
			stubBrowser({ languages: ['ja-JP', 'ko'], language: 'ja-JP' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
		});

		it('uses navigator.language when navigator.languages is empty', async () => {
			// Arrange
			stubBrowser({ languages: [], language: 'ko' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
		});

		it('falls back to English when navigator is missing', async () => {
			// Arrange
			stubBrowser(undefined);

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('en');
		});

		it('falls back to English when no browser language is supported', async () => {
			// Arrange
			stubBrowser({ languages: ['ja-JP', 'fr'], language: 'ja-JP' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('en');
		});

		it('prefers the saved choice over the browser language', async () => {
			// Arrange
			storage.set(STORAGE_KEY, JSON.stringify({ language: 'en' }));
			stubBrowser({ languages: ['ko-KR'], language: 'ko-KR' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('en');
		});

		it('keeps Korean for a user saved before English became the default', async () => {
			// Arrange
			storage.set(STORAGE_KEY, JSON.stringify({ language: 'ko' }));
			stubBrowser({ languages: ['en-US'], language: 'en-US' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
		});

		it('ignores a saved language it does not support', async () => {
			// Arrange
			storage.set(STORAGE_KEY, JSON.stringify({ language: 'ja' }));
			stubBrowser({ languages: ['ko-KR'], language: 'ko-KR' });

			// Act
			const store = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
		});

		it('keeps the chosen language after a reload', async () => {
			// Arrange
			stubBrowser({ languages: ['en-US'], language: 'en-US' });
			const store = await loadStore();

			// Act
			store.language = 'ko';
			const reloaded = await loadStore();

			// Assert
			expect(reloaded.language).toBe('ko');
		});

		it('does not save the detected language when another setting changes', async () => {
			// Arrange
			stubBrowser({ languages: ['ko-KR'], language: 'ko-KR' });
			const store = await loadStore();

			// Act
			store.syntaxTheme = 'monokai';
			stubBrowser({ languages: ['en-US'], language: 'en-US' });
			const reloaded = await loadStore();

			// Assert
			expect(reloaded.syntaxTheme).toBe('monokai');
			expect(reloaded.language).toBe('en');
		});

		it('clearAll drops the saved choice and follows the browser again', async () => {
			// Arrange
			stubBrowser({ languages: ['ko-KR'], language: 'ko-KR' });
			const store = await loadStore();
			store.language = 'en';

			// Act
			store.clearAll();
			const reloaded = await loadStore();

			// Assert
			expect(store.language).toBe('ko');
			expect(reloaded.language).toBe('ko');
		});
	});
});
