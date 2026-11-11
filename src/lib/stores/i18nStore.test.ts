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
});
