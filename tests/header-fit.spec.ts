import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-header-fit';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	fs.writeFileSync(path.join(DIR, 'src', 'app.py'), 'def run():\n    pass\n');
});

// The language toggle came back to the phone header, so the project buttons and it must still
// fit beside the title at the narrowest phone width
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

	const title = await page.locator('header .header-title').boundingBox();
	const controls = page.locator(
		'header .header-right > :is(button, a):visible, header .header-right > .track-badge:visible'
	);
	expect(await controls.count()).toBeGreaterThanOrEqual(6);
	await expect(page.locator('header .lang-toggle')).toBeVisible();
	for (const box of await controls.evaluateAll((els) =>
		els.map((el) => el.getBoundingClientRect().toJSON())
	)) {
		expect(box.right).toBeLessThanOrEqual(320);
		expect(box.left).toBeGreaterThanOrEqual(title!.x + title!.width);
	}
});
