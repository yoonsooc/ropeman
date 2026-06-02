import { test, expect } from '@playwright/test';

test.describe('Mobile read-only routes', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('Landing hides folder picker on mobile and surfaces the GitHub hint', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		await page.goto('/');
		// CTA folder button should not be rendered on compact viewports
		await expect(page.locator('.cta-btn')).toHaveCount(0);
		// GitHub URL input remains accessible
		await expect(page.locator('.github-input')).toBeVisible();
		// Mobile hint informs the user about the folder-picker constraint
		await expect(page.locator('.mobile-folder-hint')).toBeVisible();
	});

	test('Landing keeps folder picker on desktop (regression)', async ({ page, viewport }) => {
		test.skip(!viewport || viewport.width <= 768, 'desktop-only');
		await page.goto('/');
		await expect(page.locator('.cta-btn')).toBeVisible();
		await expect(page.locator('.mobile-folder-hint')).toHaveCount(0);
	});

	test('/explore renders without horizontal overflow on mobile', async ({ page, viewport }) => {
		test.skip(!viewport, 'viewport required');
		await page.goto('/explore');
		await expect(page.locator('.explore-grid')).toBeVisible({ timeout: 10_000 });
		const hasHorizontalScroll = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasHorizontalScroll).toBe(false);
	});

	test('/docs opens a slide-in drawer on mobile via the hamburger button', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 960, 'mobile/tablet-only');
		await page.goto('/docs/en/getting-started');
		const menuBtn = page.locator('.menu-btn');
		await expect(menuBtn).toBeVisible({ timeout: 10_000 });
		await menuBtn.click();
		await expect(page.locator('.docs-sidebar.open')).toBeVisible();
	});

	test('/share/[slug] gallery viewer renders without horizontal overflow', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		const res = await page.goto('/share/test-not-found-slug', { waitUntil: 'domcontentloaded' });
		// 404 or empty state — either is acceptable; we just guard against
		// horizontal overflow being introduced by the mobile layout.
		expect(res).not.toBeNull();
		const hasHorizontalScroll = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasHorizontalScroll).toBe(false);
	});
});
