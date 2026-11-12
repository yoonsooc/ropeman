import { test, expect, type Locator, type Page } from '@playwright/test';

const MODALS = [
	{
		name: 'Settings',
		card: '.settings-card',
		opener: (page: Page) => page.locator('header .header-right .header-btn').last()
	},
	{
		name: 'Help',
		card: '.help-card',
		opener: (page: Page) => page.locator('header .header-btn').filter({ hasText: 'help_outline' })
	}
];

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'en' }));
	});
});

for (const modal of MODALS) {
	test(
		`the ${modal.name} modal keeps keyboard focus until Escape returns it`,
		{ tag: '@responsive' },
		async ({ page }) => {
			await page.goto('/');
			const opener: Locator = modal.opener(page);
			await opener.focus();
			await page.keyboard.press('Enter');
			await expect(page.locator(modal.card)).toBeVisible();
			const focusInCard = () =>
				page.evaluate((card) => !!document.activeElement?.closest(card), modal.card);
			expect(await focusInCard(), 'focus moves in on open').toBe(true);

			for (const key of ['Tab', 'Shift+Tab']) {
				for (let i = 0; i < 25; i++) {
					await page.keyboard.press(key);
					expect(await focusInCard(), `${key} press ${i + 1}`).toBe(true);
				}
			}

			await page.keyboard.press('Escape');
			await expect(page.locator(modal.card)).toHaveCount(0);
			await expect(opener).toBeFocused();
		}
	);
}
