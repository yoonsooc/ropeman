import { test, expect } from '@playwright/test';

test.describe('Settings Modal', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('should open settings modal when settings button is clicked', async ({ page }) => {
		await page.goto('/');

		// Click the settings gear button (last button in header-right)
		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();

		// Settings modal should appear
		const modal = page.locator('.settings-backdrop');
		await expect(modal).toBeVisible();
		const dialog = page.locator('.settings-card[role="dialog"]');
		await expect(dialog).toBeVisible();
	});

	test('should close settings modal on Escape', async ({ page }) => {
		await page.goto('/');

		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();
		await expect(page.locator('.settings-backdrop')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('.settings-backdrop')).not.toBeVisible();
	});

	test('should close settings modal when clicking backdrop', async ({ page, viewport }) => {
		// On compact viewports (M2) the modal-card becomes a full-screen sheet
		// so there is no visible backdrop to click outside of — close happens
		// via the modal-close button instead.
		test.skip(!!viewport && viewport.width <= 768, 'sheet mode — no backdrop click area');
		await page.goto('/');

		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();
		await expect(page.locator('.settings-backdrop')).toBeVisible();

		// Click on the backdrop (outside the card)
		await page.locator('.settings-backdrop').click({ position: { x: 10, y: 10 } });
		await expect(page.locator('.settings-backdrop')).not.toBeVisible();
	});

	test('should have language select with ko and en options', async ({ page }) => {
		await page.goto('/');

		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();

		const langSelect = page.locator('.settings-card .select').first();
		await expect(langSelect).toBeVisible();
		await expect(langSelect.locator('option')).toHaveCount(2);
	});

	test('should have syntax theme select', async ({ page }) => {
		await page.goto('/');

		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();

		// The second select is the syntax theme
		const selects = page.locator('.settings-card .select');
		await expect(selects).toHaveCount(2);
	});

	test('should persist language setting after reload', async ({ page }) => {
		await page.goto('/');

		// Open settings
		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();

		// Change language to English
		const langSelect = page.locator('.settings-card .select').first();
		await langSelect.selectOption('en');

		// Close settings
		await page.keyboard.press('Escape');

		// Reload the page
		await page.reload();

		// Check that localStorage persisted the setting
		const stored = await page.evaluate(() => {
			const raw = localStorage.getItem('ropeman-settings');
			return raw ? JSON.parse(raw) : null;
		});
		expect(stored).toBeTruthy();
		expect(stored.language).toBe('en');
	});

	test('should persist syntax theme setting after reload', async ({ page }) => {
		await page.goto('/');

		// Open settings
		const settingsBtn = page.locator('header .header-right .header-btn').last();
		await settingsBtn.click();

		// Get the syntax theme select (second select)
		const themeSelect = page.locator('.settings-card .select').nth(1);
		const options = themeSelect.locator('option');
		const optionCount = await options.count();

		// Select a different theme if there are multiple
		if (optionCount > 1) {
			const secondOptionValue = await options.nth(1).getAttribute('value');
			if (secondOptionValue) {
				await themeSelect.selectOption(secondOptionValue);
			}
		}

		// Close settings
		await page.keyboard.press('Escape');

		// Reload the page
		await page.reload();

		// Verify persistence
		const stored = await page.evaluate(() => {
			const raw = localStorage.getItem('ropeman-settings');
			return raw ? JSON.parse(raw) : null;
		});
		expect(stored).toBeTruthy();
		expect(stored.syntaxTheme).toBeTruthy();
	});
});
