import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-analyze-focus';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(DIR, 'src', 'app.py'), 'def run():\n    pass\n');
});

const focusInCard = (page: Page) =>
	page.evaluate(() => !!document.activeElement?.closest('.analyze-card'));

test(
	'the Analyze modal keeps keyboard focus until Escape returns it',
	{ tag: '@responsive' },
	async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
			localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'en' }));
		});
		await page.goto(`/?testDir=${encodeURIComponent(DIR)}`);
		await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
		await expect(page.getByTestId('coverage-summary')).toBeVisible();
		const opener = page.locator('.analyze-btn');
		await opener.focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('.analyze-card')).toBeVisible();
		expect(await focusInCard(page), 'focus moves in on open').toBe(true);

		for (const key of ['Tab', 'Shift+Tab']) {
			for (let i = 0; i < 25; i++) {
				await page.keyboard.press(key);
				expect(await focusInCard(page), `${key} press ${i + 1}`).toBe(true);
			}
		}

		await page.keyboard.press('Escape');
		await expect(page.locator('.analyze-card')).toHaveCount(0);
		await expect(opener).toBeFocused();
	}
);
