import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SMALL_DIR = '/tmp/ropeman-payload-small';
const LARGE_DIR = '/tmp/ropeman-payload-large';

test.beforeAll(() => {
	fs.mkdirSync(SMALL_DIR, { recursive: true });
	fs.writeFileSync(path.join(SMALL_DIR, 'hello.py'), 'def greet(name):\n    return name\n');

	// About 1 MB of skeleton: well over the demo's 250 KB safe size
	fs.mkdirSync(path.join(LARGE_DIR, 'src'), { recursive: true });
	for (let i = 0; i < 300; i++) {
		const body = Array.from(
			{ length: 80 },
			(_, j) => `def handle_request_number_${i}_${j}_with_a_long_name():\n    pass\n`
		).join('\n');
		fs.writeFileSync(path.join(LARGE_DIR, 'src', `service_${i}.py`), body);
	}
});

async function openAnalyze(page: Page, dir: string, settings: Record<string, unknown>) {
	await page.addInitScript((s) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify(s));
	}, settings);
	await page.goto(`/?testDir=${encodeURIComponent(dir)}`);
	await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
	await page.locator('.analyze-btn').click();
	await expect(page.locator('.analyze-card')).toBeVisible();
}

test('shows the payload size without a warning for a small project', async ({ page }) => {
	await openAnalyze(page, SMALL_DIR, { language: 'en' });

	await expect(page.getByTestId('payload-size')).toHaveText(/^\d+ B$/);
	await expect(page.locator('.preview-meta')).toContainText('tokens');
	await expect(page.getByTestId('demo-size-warning')).toHaveCount(0);
});

test('warns before a demo request larger than its safe size', async ({ page }) => {
	await openAnalyze(page, LARGE_DIR, { language: 'ko', skeletonUnlimited: true });

	await expect(page.getByTestId('payload-size')).toHaveText(/MB$|KB$/);
	await expect(page.getByTestId('demo-size-warning')).toContainText('250 KB');
});
