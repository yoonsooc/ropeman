import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-mobile-sidebar';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'src'), { recursive: true });
	for (let i = 0; i < 3; i++) {
		fs.writeFileSync(path.join(DIR, 'src', `module_${i}.py`), `def handler_${i}():\n    pass\n`);
	}
});

async function openProject(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'en' }));
	});
	await page.goto(`/?testDir=${encodeURIComponent(DIR)}`);
	await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
	await expect(page.getByTestId('coverage-summary')).toBeVisible();
}

async function hitTarget(page: Page, x: number, y: number) {
	return page.evaluate(
		([px, py]) => {
			const el = document.elementFromPoint(px, py);
			return {
				inCoverage: !!el?.closest('[data-testid="coverage-summary"]'),
				inCanvas: !!el?.closest('.canvas-area'),
				inSidebar: !!el?.closest('aside.sidebar')
			};
		},
		[x, y] as const
	);
}

async function tapBackdrop(page: Page) {
	const viewport = page.viewportSize()!;
	await page.locator('.mobile-overlay').tap({ position: { x: viewport.width - 10, y: 200 } });
}

test.describe('Mobile sidebar', { tag: '@responsive' }, () => {
	test.beforeEach(({ viewport }) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
	});

	test('a tap outside the open drawer closes it, and the rail reopens it', async ({ page }) => {
		await openProject(page);
		const aside = page.locator('aside.sidebar');
		await expect(aside).not.toHaveClass(/content-closed/);

		await tapBackdrop(page);
		await expect(aside).toHaveClass(/content-closed/);
		await expect(page.locator('.mobile-overlay')).toHaveCount(0);

		await page.getByTitle('File Explorer').tap();
		await expect(aside).not.toHaveClass(/content-closed/);
		await expect(page.getByPlaceholder('Filter files...')).toBeVisible();
	});

	test('the closed sidebar leaves only its icon rail over the canvas', async ({ page }) => {
		await openProject(page);
		await tapBackdrop(page);
		const aside = page.locator('aside.sidebar');
		await expect(aside).toHaveClass(/content-closed/);

		const rail = await page.locator('aside.sidebar .sidebar-icons').boundingBox();
		const box = await aside.boundingBox();
		if (!rail || !box) throw new Error('missing sidebar metrics');
		expect(box.x + box.width).toBeLessThanOrEqual(rail.x + rail.width + 1);

		const summary = page.getByTestId('coverage-summary');
		const bar = await summary.boundingBox();
		if (!bar) throw new Error('missing coverage summary metrics');
		const y = bar.y + bar.height / 2;
		for (const x of [box.x + box.width + 4, 120, 250, bar.x + bar.width - 4]) {
			expect(await hitTarget(page, x, y), `coverage summary at x=${x}`).toMatchObject({
				inCoverage: true,
				inSidebar: false
			});
		}
		const canvasY = Math.round((box.y + y) / 2);
		expect(await hitTarget(page, 200, canvasY), 'canvas under the old drawer').toMatchObject({
			inCanvas: true,
			inSidebar: false
		});

		await summary.tap();
		await expect(page.getByTestId('coverage-panel')).toBeVisible();
	});
});
