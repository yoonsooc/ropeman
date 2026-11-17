import { test, expect } from '@playwright/test';
import { expectHeaderFits } from './support/headerFit';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-header-fit';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(DIR, 'src', 'app.py'), 'def run():\n    pass\n');
});

// The language toggle came back to the phone header, so the project buttons and it must still
// fit beside the title at the narrowest phone width. tests/bridge-mode.spec.ts runs the same check
// on the Bridge viewer, whose header adds serve's status
test('every header control fits at 320px with a project open', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'ko' }));
	});
	await page.goto(`/?testDir=${encodeURIComponent(DIR)}`);
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
	await expect(page.locator('header .analyze-btn')).toBeVisible();

	await expect(page.locator('header .lang-toggle')).toBeVisible();

	expect(await expectHeaderFits(page)).toBeGreaterThanOrEqual(6);
});
