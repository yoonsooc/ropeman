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

/**
 * Cookie that mirrors the language saved in settings. The edge reads it to pick which prerendered
 * landing `/` serves, since it cannot read localStorage.
 */
export const LANGUAGE_COOKIE = 'ropeman-lang';

/** Tags of an Accept-Language header, most preferred first (`ko-KR,ko;q=0.9,en;q=0.8`) */
export function acceptedLanguages(header: string | null): string[] {
	if (!header) return [];
	return (
		header
			.split(',')
			.map((part) => {
				const [tag, ...params] = part.trim().split(';');
				const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
				return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 };
			})
			.filter(({ tag, q }) => tag && tag !== '*' && q > 0)
			// sort is stable, so tags with the same q keep the header's order
			.sort((a, b) => b.q - a.q)
			.map(({ tag }) => tag)
	);
}

/** The language `/` serves: the saved choice from the cookie, else the browser's preference */
export function requestLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
	return parseLocale(cookie) ?? detectLocale(acceptedLanguages(acceptLanguage));
}
