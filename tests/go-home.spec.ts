import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = '/tmp/ropeman-go-home-fixture';

test.beforeAll(() => {
	fs.mkdirSync(TEST_DIR, { recursive: true });
	fs.writeFileSync(path.join(TEST_DIR, 'main.py'), 'def main() -> int:\n    return 1\n');
});

test.describe('Wordmark returns to the start page', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
		await page.goto(`/?testDir=${encodeURIComponent(TEST_DIR)}`);
		await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	});

	test('asks first, and cancel keeps the project open', async ({ page }) => {
		await page.locator('header .home-btn').click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /계속 보기|Keep working/ }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.main-layout')).toBeVisible();
	});

	test('Escape cancels', async ({ page }) => {
		await page.locator('header .home-btn').click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(page.locator('.main-layout')).toBeVisible();
	});

	test('confirm closes the project and shows the landing', async ({ page }) => {
		await page.locator('header .home-btn').click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /처음 화면으로 돌아가기|Go back to start/ })
			.click();
		await expect(page.locator('.landing')).toBeVisible();
		await expect(page.locator('header .home-btn')).toHaveCount(0);
	});
});
