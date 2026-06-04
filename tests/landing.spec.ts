import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('should load the page with header and title', async ({ page }) => {
		await page.goto('/');
		const header = page.locator('header.header');
		await expect(header).toBeVisible();
		await expect(header.locator('.header-title')).toHaveText('Ropeman');
	});

	test('should display the dropzone with CTA button', async ({ page, viewport }) => {
		// M4: on compact viewports the folder CTA is hidden in favour of the
		// GitHub URL flow — a dedicated mobile-readonly-flows spec covers that.
		test.skip(!!viewport && viewport.width <= 768, 'folder CTA is desktop-only');
		await page.goto('/');
		const dropzone = page.locator('.dropzone');
		await expect(dropzone).toBeVisible();
		const ctaButton = page.locator('.cta-btn');
		await expect(ctaButton).toBeVisible();
	});

	test('should display language icons for supported languages', async ({ page }) => {
		await page.goto('/');
		const icons = page.locator('.hero-lang');
		await expect(icons).toHaveCount(8);
	});

	test('should display three feature cards', async ({ page }) => {
		await page.goto('/');
		const cards = page.locator('.feature-card');
		await expect(cards).toHaveCount(3);
	});

	test('should have theme toggle button in header', async ({ page }) => {
		await page.goto('/');
		const themeBtn = page.locator('header .header-btn').filter({ hasText: /☀|☽/ });
		await expect(themeBtn).toBeVisible();
	});

	test('should have settings button in header', async ({ page }) => {
		await page.goto('/');
		const settingsBtn = page.locator('header .header-btn[title]').last();
		await expect(settingsBtn).toBeVisible();
	});

	test('should have language toggle button', async ({ page }) => {
		await page.goto('/');
		const langBtn = page.locator('header .header-btn').filter({ hasText: /EN|한/ });
		await expect(langBtn).toBeVisible();
	});
});
