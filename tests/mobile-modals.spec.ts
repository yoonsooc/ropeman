import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
	await page.goto('/');
	const settingsBtn = page.locator('header .header-btn[title]').last();
	await settingsBtn.click();
	await expect(page.locator('.modal-card.settings-card')).toBeVisible();
}

async function openHelp(page: Page): Promise<void> {
	await page.goto('/');
	const helpBtn = page.locator('header .header-btn').filter({ hasText: 'help_outline' });
	await helpBtn.click();
	await expect(page.locator('.modal-card.help-card')).toBeVisible();
}

test.describe('Mobile modal sheet pattern', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('SettingsModal fills the compact viewport as a full-screen sheet', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		await openSettings(page);
		const card = page.locator('.modal-card.settings-card');
		const box = await card.boundingBox();
		if (!box || !viewport) throw new Error('missing layout metrics');
		expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
		expect(box.height).toBeGreaterThan(viewport.height * 0.9);
	});

	test('SettingsModal close button is at least 44px on compact viewports', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		await openSettings(page);
		const closeBtn = page.locator('.modal-card.settings-card .modal-close').first();
		const box = await closeBtn.boundingBox();
		if (!box) throw new Error('close button not found');
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(box.width).toBeGreaterThanOrEqual(44);
	});

	test('SettingsModal does not introduce horizontal scroll on mobile', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		await openSettings(page);
		const hasHorizontalScroll = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasHorizontalScroll).toBe(false);
	});

	test('HelpModal fills the compact viewport as a full-screen sheet', async ({
		page,
		viewport
	}) => {
		test.skip(!viewport || viewport.width > 768, 'mobile/tablet-only');
		await openHelp(page);
		const card = page.locator('.modal-card.help-card');
		const box = await card.boundingBox();
		if (!box || !viewport) throw new Error('missing layout metrics');
		expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
		expect(box.height).toBeGreaterThan(viewport.height * 0.9);
	});

	test('html has overflow hidden to prevent background scroll', async ({ page }) => {
		await page.goto('/');
		// global.css applies overflow:hidden to both html and body — the SPA
		// shell manages its own viewport.
		await expect(page.locator('header.header')).toBeVisible();
		const overflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
		expect(overflow).toBe('hidden');
	});
});

test.describe('Desktop modal sizing (regression guard)', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
	});

	test('SettingsModal stays under desktop viewport width', async ({ page, viewport }) => {
		test.skip(!viewport || viewport.width <= 768, 'desktop-only');
		await openSettings(page);
		const card = page.locator('.modal-card.settings-card');
		const box = await card.boundingBox();
		if (!box || !viewport) throw new Error('missing layout metrics');
		expect(box.width).toBeLessThan(viewport.width * 0.8);
	});
});
