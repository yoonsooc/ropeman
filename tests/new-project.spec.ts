import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = '/tmp/ropeman-new-project-fixture';

test.beforeAll(() => {
	fs.mkdirSync(TEST_DIR, { recursive: true });
	fs.writeFileSync(path.join(TEST_DIR, 'main.py'), 'def main() -> int:\n    return 1\n');
});

test.describe('New project dialog', () => {
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

	// Regression: New used to open the folder picker only, with no way to enter a GitHub URL
	test('offers a GitHub URL field', async ({ page }) => {
		await page.locator('button[title="Open New Project"]').click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('#newproject-github')).toBeVisible();
	});

	test('replaces the open project with the GitHub repository', async ({ page }) => {
		await page.route('https://api.github.com/repos/octo/demo-repo/git/trees/**', (route) =>
			route.fulfill({
				json: {
					sha: 'abc123',
					truncated: false,
					tree: [{ path: 'app.py', mode: '100644', type: 'blob', sha: 'f1', size: 40 }]
				}
			})
		);
		await page.route('https://raw.githubusercontent.com/octo/demo-repo/**', (route) =>
			route.fulfill({ body: 'def run():\n    return 0\n' })
		);

		await page.locator('button[title="Open New Project"]').click();
		const dialog = page.getByRole('dialog');
		await dialog.locator('#newproject-github').fill('https://github.com/octo/demo-repo');
		await dialog.locator('#newproject-github').press('Enter');

		await expect(dialog).toBeHidden();
		await expect(page.locator('.header-project')).toHaveText('demo-repo');
	});

	test('keeps the open project when the URL is invalid', async ({ page }) => {
		await page.locator('button[title="Open New Project"]').click();
		const dialog = page.getByRole('dialog');
		const input = dialog.locator('#newproject-github');

		await input.fill('not a repository');
		await input.press('Enter');

		await expect(dialog.getByRole('alert')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(page.locator('.main-layout')).toBeVisible();
		await expect(page.locator('.header-project')).toHaveText('ropeman-new-project-fixture');
	});
});
