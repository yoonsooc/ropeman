export type Locale = 'ko' | 'en';

export const DEFAULT_LOCALE: Locale = 'en';

export function parseLocale(value: unknown): Locale | null {
	return value === 'ko' || value === 'en' ? value : null;
}

/** Picks the first supported locale from the browser's preference list (BCP 47 tags such as `ko-KR`). */
export function detectLocale(languages: readonly string[]): Locale {
	for (const tag of languages) {
		const locale = parseLocale(tag.toLowerCase().split('-')[0]);
		if (locale) return locale;
	}
	return DEFAULT_LOCALE;
}

export function browserLanguages(): readonly string[] {
	// Node also defines navigator, so prerendered pages would pick up the build machine's language
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return [];
	if (navigator.languages?.length) return navigator.languages;
	return navigator.language ? [navigator.language] : [];
}
