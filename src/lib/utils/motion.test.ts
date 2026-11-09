import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollBehavior } from './motion';

describe('scrollBehavior', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns auto when the user prefers reduced motion', () => {
		// Arrange
		vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
		// Act
		const result = scrollBehavior();
		// Assert
		expect(result).toBe('auto');
	});

	it('returns smooth otherwise', () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
		expect(scrollBehavior()).toBe('smooth');
	});

	it('returns smooth when matchMedia is unavailable', () => {
		vi.stubGlobal('window', {});
		expect(scrollBehavior()).toBe('smooth');
	});
});
