import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('should toggle between dark and light themes', async ({ page }) => {
		await page.goto('/');

		// Get initial theme from html data attribute or body class
		const initialTheme = await page.evaluate(() => {
			return document.documentElement.getAttribute('data-theme') ?? 'dark';
		});

		// Click the theme toggle button (the one with sun/moon emoji)
		const themeBtn = page.locator('header .header-btn').filter({ hasText: /☀|☽/ });
		await themeBtn.click();

		// Theme should have changed
		const newTheme = await page.evaluate(() => {
			return document.documentElement.getAttribute('data-theme');
		});
		expect(newTheme).not.toBe(initialTheme);
	});

	test('should persist theme setting after reload', async ({ page }) => {
		await page.goto('/');

		// Toggle theme
		const themeBtn = page.locator('header .header-btn').filter({ hasText: /☀|☽/ });
		await themeBtn.click();

		const themeAfterToggle = await page.evaluate(() => {
			return document.documentElement.getAttribute('data-theme');
		});

		// Reload and wait for app to fully initialize
		await page.reload();
		await page.locator('header.header').waitFor({ state: 'visible' });

		// Wait for theme attribute to be set (module initialization may be async in dev mode)
		await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') !== null, {
			timeout: 5_000
		});

		const themeAfterReload = await page.evaluate(() => {
			return document.documentElement.getAttribute('data-theme');
		});

		expect(themeAfterReload).toBe(themeAfterToggle);
	});
});

test.describe('Language Toggle', () => {
	test('should toggle header subtitle language', { tag: '@responsive' }, async ({ page }) => {
		await page.goto('/');

		// Default locale is en for the en-US test browser
		const subtitle = page.locator('.header-subtitle');
		const initialText = await subtitle.textContent();

		const width = page.viewportSize()?.width ?? 1280;
		if (width <= 430) {
			// Phones switch language from Settings, not the header
			await page.locator('header [data-tour-step="3"]').click();
			await page.locator('#lang-select').selectOption('ko');
		} else {
			await page.locator('header .lang-toggle').click();
		}

		// Subtitle should have changed
		const newText = await subtitle.textContent();
		expect(newText).not.toBe(initialText);
	});
});
