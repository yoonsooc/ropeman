import { describe, it, expect } from 'vitest';
import { computeKeyboardInset } from './keyboardInset';

describe('computeKeyboardInset', () => {
	it('returns 0 when visualViewport matches window (no keyboard)', () => {
		expect(computeKeyboardInset(800, 800, 0)).toBe(0);
	});

	it('returns the keyboard height when iOS keyboard appears', () => {
		expect(computeKeyboardInset(800, 510, 0)).toBe(290);
	});

	it('accounts for visualViewport offsetTop (e.g., page scrolled under keyboard)', () => {
		expect(computeKeyboardInset(800, 510, 50)).toBe(240);
	});

	it('clamps negative values to 0 (defensive against transient measurements)', () => {
		expect(computeKeyboardInset(800, 850, 0)).toBe(0);
	});

	it('handles small viewport (mobile portrait, no keyboard)', () => {
		expect(computeKeyboardInset(844, 844, 0)).toBe(0);
	});
});
