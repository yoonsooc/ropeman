import { test, expect } from '@playwright/test';
import { gotoApp } from './support/app';

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
		await gotoApp(page);
		const header = page.locator('header.header');
		await expect(header).toBeVisible();
		await expect(header.locator('.header-title')).toHaveText('Ropeman');
	});

	test('should display the dropzone with CTA button', async ({ page, viewport }) => {
		// M4: on compact viewports the folder CTA is hidden in favour of the
		// GitHub URL flow — a dedicated mobile-readonly-flows spec covers that.
		test.skip(!!viewport && viewport.width <= 768, 'folder CTA is desktop-only');
		await gotoApp(page);
		const dropzone = page.locator('.dropzone');
		await expect(dropzone).toBeVisible();
		const ctaButton = page.locator('.cta-btn');
		await expect(ctaButton).toBeVisible();
	});

	test('should display language icons for supported languages', async ({ page }) => {
		await gotoApp(page);
		const icons = page.locator('.hero-lang');
		await expect(icons).toHaveCount(8);
	});

	test('should display three feature cards', async ({ page }) => {
		await gotoApp(page);
		const cards = page.locator('.feature-card');
		await expect(cards).toHaveCount(3);
	});

	test('should have theme toggle button in header', async ({ page }) => {
		await gotoApp(page);
		const themeBtn = page.locator('header .header-btn').filter({ hasText: /☀|☽/ });
		await expect(themeBtn).toBeVisible();
	});

	test('should have settings button in header', async ({ page }) => {
		await gotoApp(page);
		const settingsBtn = page.locator('header .header-btn[title]').last();
		await expect(settingsBtn).toBeVisible();
	});

	test('should have language toggle button', { tag: '@responsive' }, async ({ page }) => {
		await gotoApp(page);
		const langBtn = page.locator('header .lang-toggle');
		const width = page.viewportSize()?.width ?? 1280;
		if (width <= 430) {
			// Phones keep language in Settings so every header control fits at 320px
			await expect(langBtn).toBeHidden();
		} else {
			await expect(langBtn).toBeVisible();
		}
	});
});
