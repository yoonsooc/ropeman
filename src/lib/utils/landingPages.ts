import type { Locale } from './locale';

export const SITE_URL = 'https://ropeman.dev';

/**
 * The landing in each language. Each is prerendered at `/<locale>`, and `/` serves the one that
 * matches the visitor (hooks.server.ts). `url` is the address shared and indexed: `/` for English,
 * which crawlers get, and `/ko`, which shows Korean to everyone.
 */
export const LANDING_PAGES = {
	en: { url: '/', ogLocale: 'en_US', image: '/og/landing-en.png' },
	ko: { url: '/ko', ogLocale: 'ko_KR', image: '/og/landing-ko.png' }
} as const satisfies Record<Locale, { url: string; ogLocale: string; image: string }>;

/** Size of the share images under static/og, written by scripts/og-images.mjs */
export const SHARE_IMAGE = { width: 1200, height: 630 };
