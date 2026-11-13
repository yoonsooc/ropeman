import { test, expect } from '@playwright/test';
import { gotoApp } from './support/app';

test.describe('Mobile foundation (viewport + safe-area)', { tag: '@responsive' }, () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('viewport meta declares viewport-fit=cover', async ({ page }) => {
		await gotoApp(page);
		const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
		expect(viewportMeta).toContain('viewport-fit=cover');
	});

	test('breakpoint tokens are defined on :root', async ({ page }) => {
		await gotoApp(page);
		// In dev mode global.css is injected by JS after hydration — wait for
		// any CSS-driven layout to settle before reading custom properties.
		await expect(page.locator('header.header')).toBeVisible();
		const tokens = await page.evaluate(() => {
			const styles = getComputedStyle(document.documentElement);
			return {
				mobile: styles.getPropertyValue('--bp-mobile').trim(),
				tablet: styles.getPropertyValue('--bp-tablet').trim(),
				desktop: styles.getPropertyValue('--bp-desktop').trim()
			};
		});
		expect(tokens.mobile).toBe('430px');
		expect(tokens.tablet).toBe('768px');
		expect(tokens.desktop).toBe('1024px');
	});

	test('header renders and stays within viewport on mobile', async ({ page }) => {
		await gotoApp(page);
		const header = page.locator('header.header');
		await expect(header).toBeVisible();
		const headerBox = await header.boundingBox();
		const viewport = page.viewportSize();
		if (!headerBox || !viewport) throw new Error('missing layout metrics');
		expect(headerBox.x).toBeGreaterThanOrEqual(0);
		expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(viewport.width);
	});

	test('landing page has no horizontal scroll on mobile viewport', async ({ page }) => {
		await gotoApp(page);
		const hasHorizontalScroll = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasHorizontalScroll).toBe(false);
	});
});
