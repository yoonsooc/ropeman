import { describe, it, expect } from 'vitest';
import { computeBreakpoint, BP_MOBILE_MAX, BP_TABLET_MAX } from './responsive.svelte';

describe('computeBreakpoint', () => {
	describe('mobile range (<= 430px)', () => {
		it('identifies iPhone SE width (375) as mobile', () => {
			const bp = computeBreakpoint(375);
			expect(bp.isMobile).toBe(true);
			expect(bp.isTablet).toBe(false);
			expect(bp.isDesktop).toBe(false);
		});

		it('identifies Pixel 5 width (393) as mobile', () => {
			const bp = computeBreakpoint(393);
			expect(bp.isMobile).toBe(true);
		});

		it('treats the boundary value (430) as mobile', () => {
			const bp = computeBreakpoint(BP_MOBILE_MAX);
			expect(bp.isMobile).toBe(true);
			expect(bp.isTablet).toBe(false);
		});
	});

	describe('tablet range (431px – 768px)', () => {
		it('identifies 431 as tablet (just past mobile)', () => {
			const bp = computeBreakpoint(BP_MOBILE_MAX + 1);
			expect(bp.isMobile).toBe(false);
			expect(bp.isTablet).toBe(true);
			expect(bp.isDesktop).toBe(false);
		});

		it('identifies iPad portrait width (768) as tablet', () => {
			const bp = computeBreakpoint(BP_TABLET_MAX);
			expect(bp.isTablet).toBe(true);
			expect(bp.isMobile).toBe(false);
			expect(bp.isDesktop).toBe(false);
		});
	});

	describe('desktop range (>= 769px)', () => {
		it('identifies 769 as desktop (just past tablet)', () => {
			const bp = computeBreakpoint(BP_TABLET_MAX + 1);
			expect(bp.isMobile).toBe(false);
			expect(bp.isTablet).toBe(false);
			expect(bp.isDesktop).toBe(true);
		});

		it('identifies 1440 (laptop) as desktop', () => {
			const bp = computeBreakpoint(1440);
			expect(bp.isDesktop).toBe(true);
		});

		it('identifies 1024 (iPad Pro landscape) as desktop', () => {
			const bp = computeBreakpoint(1024);
			expect(bp.isDesktop).toBe(true);
		});
	});

	describe('mutually exclusive levels', () => {
		it('always returns exactly one true flag across the range', () => {
			const widths = [320, 375, 430, 431, 600, 768, 769, 1024, 1440, 1920];
			for (const width of widths) {
				const bp = computeBreakpoint(width);
				const trueCount = [bp.isMobile, bp.isTablet, bp.isDesktop].filter(Boolean).length;
				expect(trueCount, `width=${width}`).toBe(1);
			}
		});
	});
});
