import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const NAME = 'payments-reconciliation-service-with-a-very-long-directory-name';
const DIR = path.join('/tmp', NAME);

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(DIR, 'src', 'main.py'), 'def main():\n    pass\n');
});

test(
	'a long project name stays on one line with the full name on hover',
	{ tag: '@responsive' },
	async ({ page, viewport }) => {
		test.skip(!viewport || viewport.width <= 430, 'phones hide the project name');
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
		// Icon ligatures render as wide text until the symbol font loads
		await page.evaluate(() => document.fonts.ready);
		const name = page.locator('.header-project');

		await expect(name).toHaveText(NAME);
		await expect(name).toHaveAttribute('title', NAME);
		const metrics = await name.evaluate((el) => ({
			height: el.getBoundingClientRect().height,
			lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 20
		}));
		expect(metrics.height).toBeLessThan(metrics.lineHeight * 1.5);
		const rightEdge = () =>
			page.locator('.header-right').evaluate((el) => el.getBoundingClientRect().right);
		await expect.poll(rightEdge).toBeLessThanOrEqual(viewport!.width);
	}
);
