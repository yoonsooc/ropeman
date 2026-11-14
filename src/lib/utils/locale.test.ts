import { describe, it, expect } from 'vitest';
import { acceptedLanguages, requestLocale } from './locale';

describe('acceptedLanguages', () => {
	it('orders tags by q value, keeping header order for ties', () => {
		// Arrange
		const header = 'en;q=0.8, ko-KR, fr;q=0.8, ko;q=0.9';

		// Act
		const tags = acceptedLanguages(header);

		// Assert
		expect(tags).toEqual(['ko-KR', 'ko', 'en', 'fr']);
	});

	it('drops the wildcard and tags the browser refuses with q=0', () => {
		// Arrange
		const header = 'ko;q=0, *;q=0.5, en';

		// Act
		const tags = acceptedLanguages(header);

		// Assert
		expect(tags).toEqual(['en']);
	});

	it('returns nothing for a missing header', () => {
		// Arrange
		const header = null;

		// Act
		const tags = acceptedLanguages(header);

		// Assert
		expect(tags).toEqual([]);
	});
});

describe('requestLocale', () => {
	it('serves Korean to a Korean browser', () => {
		// Arrange
		const header = 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7';

		// Act
		const locale = requestLocale(undefined, header);

		// Assert
		expect(locale).toBe('ko');
	});

	it('serves the language saved in the cookie over the browser one', () => {
		// Arrange
		const header = 'ko-KR,ko;q=0.9';

		// Act
		const locale = requestLocale('en', header);

		// Assert
		expect(locale).toBe('en');
	});

	it('ignores a cookie value that is not a supported language', () => {
		// Arrange
		const header = 'ja-JP,ko;q=0.5';

		// Act
		const locale = requestLocale('ja', header);

		// Assert
		expect(locale).toBe('ko');
	});

	it('serves English to a crawler that sends no Accept-Language', () => {
		// Arrange
		const header = null;

		// Act
		const locale = requestLocale(undefined, header);

		// Assert
		expect(locale).toBe('en');
	});
});
