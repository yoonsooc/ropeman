import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SMALL_DIR = '/tmp/ropeman-payload-small';
const LARGE_DIR = '/tmp/ropeman-payload-large';

test.beforeAll(() => {
	fs.mkdirSync(SMALL_DIR, { recursive: true });
	fs.writeFileSync(path.join(SMALL_DIR, 'hello.py'), 'def greet(name):\n    return name\n');

	// About 2 MB of request body: well over the demo's 300 KB limit, well under Gemini's window
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
	await expect(page.getByTestId('demo-size-warning')).toContainText('300 KB');
});

test('warns for BYOK only when the selected model cannot take the request', async ({ page }) => {
	await openAnalyze(page, LARGE_DIR, { language: 'en', skeletonUnlimited: true });
	await page.locator('.track-row', { hasText: 'API Key (BYOK)' }).click();

	// Default Gemini model: a 1M-token window takes about 1 MB
	await expect(page.locator('#analyze-provider-select')).toHaveValue('google');
	await expect(page.getByTestId('byok-size-warning')).toHaveCount(0);

	await page.locator('#analyze-provider-select').selectOption('openai');
	await expect(page.getByTestId('byok-size-warning')).toHaveCount(0);

	// A 128K-token OpenAI model cannot
	await page.locator('#analyze-model-select').selectOption('__custom__');
	await page.locator('.track-config input[type="text"]').fill('gpt-4o');
	await expect(page.getByTestId('byok-size-warning')).toContainText('gpt-4o');
	await expect(page.getByTestId('byok-size-warning')).toContainText('112K');
});
