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

	test('shows the example map with the three things it demonstrates', async ({ page }) => {
		await gotoApp(page);
		const stage = page.locator('.landing-stage');
		await expect(stage.locator('.hero-shot')).toHaveAttribute('href', '/explore/transformers');
		await expect(stage.locator('.stage-facts dt')).toHaveText([
			'A map from the code itself',
			'Names checked against the code',
			'Click to go deeper'
		]);
	});

	test('should have theme toggle button in header', async ({ page }) => {
		await gotoApp(page);
		const themeBtn = page.locator('header .theme-toggle');
		await expect(themeBtn).toBeVisible();
		await expect(themeBtn.locator('.material-symbols-outlined')).toHaveText(/light_mode|dark_mode/);
	});

	test('should have settings button in header', async ({ page }) => {
		await gotoApp(page);
		const settingsBtn = page.locator('header .header-btn[title]').last();
		await expect(settingsBtn).toBeVisible();
	});

	// Phones used to hide the toggle and leave language in Settings only
	test(
		'keeps the language toggle in the header on every viewport',
		{ tag: '@responsive' },
		async ({ page }) => {
			await gotoApp(page);
			await expect(page.locator('header .lang-toggle')).toBeVisible();
		}
	);
});
