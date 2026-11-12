import { describe, it, expect, beforeEach } from 'vitest';
import { i18nStore } from './i18nStore.svelte';
import { settingsStore } from './settingsStore.svelte';

describe('i18nStore', () => {
	beforeEach(() => {
		settingsStore.language = 'ko';
	});

	describe('locale', () => {
		it('follows the language saved in settingsStore', () => {
			// Act
			settingsStore.language = 'en';

			// Assert
			expect(i18nStore.locale).toBe('en');
			expect(i18nStore.t('landing.cta')).toBe('Open Folder');
		});
	});

	describe('t (translation function)', () => {
		it('returns Korean translation for top-level key', () => {
			expect(i18nStore.t('title')).toBe('Ropeman');
		});

		it('returns English translation when locale is en', () => {
			settingsStore.language = 'en';
			expect(i18nStore.t('subtitle')).toBe('Explore codebases visually');
		});

		it('resolves nested keys with dot notation', () => {
			expect(i18nStore.t('landing.cta')).toBe('폴더 열기');
		});

		it('resolves nested English keys', () => {
			settingsStore.language = 'en';
			expect(i18nStore.t('landing.cta')).toBe('Open Folder');
		});

		it('returns key string for unknown keys', () => {
			expect(i18nStore.t('nonexistent.key')).toBe('nonexistent.key');
		});

		it('returns key for partially valid path', () => {
			expect(i18nStore.t('landing.nonexistent')).toBe('landing.nonexistent');
		});

		it('resolves snippet keys', () => {
			settingsStore.language = 'en';
			expect(i18nStore.t('snippet.analyze')).toBe('Analyze');
		});

		it('resolves legend keys', () => {
			settingsStore.language = 'en';
			expect(i18nStore.t('legend.title')).toBe('Legend');
		});

		it('resolves header and landing keys added for the redesign in both locales', () => {
			const keys = [
				'header.newLabel',
				'header.analyze',
				'header.analyzeTitle',
				'header.languageToggle',
				'header.gallery',
				'header.home',
				'node.fileOne',
				'node.fileMany',
				'node.openInside',
				'node.openCode',
				'node.notInSnapshotShort',
				'header.homeConfirmTitle',
				'header.homeConfirmMessage',
				'header.homeConfirmOk',
				'header.homeConfirmCancel',
				'landing.dropRegion',
				'landing.loadingTitle',
				'landing.parsingLabel'
			];
			for (const locale of ['ko', 'en'] as const) {
				settingsStore.language = locale;
				for (const key of keys) {
					expect(i18nStore.t(key)).not.toBe(key);
				}
			}
		});

		it('keeps the Korean landing free of the English strings it used to show', () => {
			// Regression: the ko locale showed "or drag & drop a folder here",
			// "Multi-Track AI" and "Explore Gallery" in English (the gallery link is now landing.exampleCta)
			for (const key of ['landing.dragHint', 'landing.featureBrowserTitle', 'landing.exampleCta']) {
				expect(i18nStore.t(key)).toMatch(/[가-힣]/);
			}
		});

		it('resolves docs keys in ko', () => {
			expect(i18nStore.t('docs.headerLink')).toBe('문서');
			expect(i18nStore.t('docs.backToApp')).toBe('앱으로 돌아가기');
			expect(i18nStore.t('docs.onThisPage')).toBe('이 페이지');
		});

		it('resolves docs keys in en', () => {
			settingsStore.language = 'en';
			expect(i18nStore.t('docs.headerLink')).toBe('Docs');
			expect(i18nStore.t('docs.backToApp')).toBe('Back to App');
			expect(i18nStore.t('docs.onThisPage')).toBe('On this page');
		});

		it('resolves docs category labels', () => {
			expect(i18nStore.t('docs.categoryIntro')).toBe('시작하기');
			expect(i18nStore.t('docs.categoryGuides')).toBe('가이드');
			expect(i18nStore.t('docs.categoryReference')).toBe('레퍼런스');
			expect(i18nStore.t('docs.categorySupport')).toBe('도움말');
		});
	});

	describe('t with params', () => {
		it('fills every placeholder it is given', () => {
			// Act
			const text = i18nStore.t('parsing.fileProgress', { done: 3, total: 10 });

			// Assert
			expect(text).toBe('파일 3 / 10개');
		});

		it('leaves a placeholder without a value untouched', () => {
			// Act
			const text = i18nStore.t('parsing.fileProgress', { done: 3 });

			// Assert
			expect(text).toBe('파일 3 / {total}개');
		});

		it('picks the English singular for a count of one and the plural otherwise', () => {
			// Regression: the en UI showed "1 symbols" and "1 lines"
			// Arrange
			settingsStore.language = 'en';

			// Assert
			expect(i18nStore.t('common.symbolCount', { n: 1 })).toBe('1 symbol');
			expect(i18nStore.t('common.symbolCount', { n: 0 })).toBe('0 symbols');
			expect(i18nStore.t('codeViewer.lines', { n: 1 })).toBe('1 line');
			expect(i18nStore.t('codeViewer.lines', { n: 12 })).toBe('12 lines');
			expect(i18nStore.t('snippet.lines', { n: 1 })).toBe('1 line');
			expect(i18nStore.t('snippet.lines', { n: 3 })).toBe('3 lines');
			expect(i18nStore.t('node.fileMany', { n: 1 })).toBe('1 file');
			expect(i18nStore.t('settingsUi.cacheEntries', { n: 1 })).toBe('1 entry');
			expect(i18nStore.t('analysisGroupRunning', { count: 1 })).toBe('1 analysis running');
			expect(i18nStore.t('analysisGroupRunning', { count: 4 })).toBe('4 analyses running');
		});

		it('keeps Korean counts in their single form', () => {
			// Act
			const text = i18nStore.t('common.symbolCount', { n: 1 });

			// Assert
			expect(text).toBe('심볼 1개');
		});

		it('counts snippet lines in Korean without a space', () => {
			// Act
			const text = i18nStore.t('snippet.lines', { n: 3 });

			// Assert
			expect(text).toBe('3줄');
		});

		it('leaves a plural placeholder without a value untouched', () => {
			// Arrange
			settingsStore.language = 'en';

			// Act
			const text = i18nStore.t('common.symbolCount', {});

			// Assert
			expect(text).toBe('{n} {n|symbol|symbols}');
		});
	});

	describe('locale coverage', () => {
		function leaves(value: unknown, path = ''): [string, unknown][] {
			if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
			if (value && typeof value === 'object') {
				return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
			}
			return [[path, value]];
		}

		function messagesFor(locale: 'ko' | 'en') {
			settingsStore.language = locale;
			return new Map(leaves(i18nStore.messages));
		}

		it('gives every string a non-empty value in both languages', () => {
			// Arrange
			const ko = messagesFor('ko');
			const en = messagesFor('en');

			// Assert
			expect([...ko.keys()].sort()).toEqual([...en.keys()].sort());
			for (const [path, value] of [...ko, ...en]) {
				expect(typeof value === 'string' && value.trim().length > 0, path).toBe(true);
			}
		});

		it('shows the Bridge settings in Korean for the ko locale', () => {
			// Regression: the Bridge card labels were hardcoded English in both locales
			for (const key of [
				'analyze.cliTool',
				'analyze.cliAuto',
				'analyze.token',
				'analyze.tokenPlaceholder'
			]) {
				expect(i18nStore.t(key)).toMatch(/[가-힣]/);
			}
		});

		it('words every ropeman.json rejection in both languages with its detail filled', () => {
			const rejections: [string, Record<string, string | number>][] = [
				['openMap.tooLarge', { limit: 16 }],
				['openMap.notJson', {}],
				['openMap.notAMap', {}],
				['openMap.newerVersion', { version: '2.0' }],
				['openMap.unsupportedVersion', { version: '0.9' }],
				['openMap.invalid', { field: 'levels[0].nodes[1].label' }]
			];

			for (const language of ['ko', 'en'] as const) {
				settingsStore.language = language;
				for (const [key, params] of rejections) {
					const text = i18nStore.t(key, params);
					expect(text, key).not.toBe(key);
					expect(text, key).not.toMatch(/\{\w+\}/);
					if (language === 'ko') expect(text, key).toMatch(/[가-힣]/);
				}
			}
		});

		it('keeps the English Bridge labels the E2E tests and users already know', () => {
			// Arrange
			settingsStore.language = 'en';

			// Assert
			expect(i18nStore.t('analyze.cliTool')).toBe('CLI Tool');
			expect(i18nStore.t('analyze.tokenPlaceholder')).toBe('Printed by the bridge at startup');
		});

		it('links every FAQ answer to a docs page in both languages', () => {
			for (const locale of ['ko', 'en'] as const) {
				settingsStore.language = locale;
				const items = i18nStore.messages.help.faqItems;
				expect(items.length).toBe(8);
				for (const item of items) expect(item.slug).toMatch(/^[a-z-]+$/);
			}
		});
	});
});
