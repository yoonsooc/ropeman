import type { Page } from '@playwright/test';

/**
 * Waits until the app has hydrated. The landing is prerendered, so its buttons are on screen
 * before their handlers attach, and a click in that window does nothing.
 */
export async function waitForApp(page: Page) {
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

export async function gotoApp(page: Page, url = '/') {
	await page.goto(url);
	await waitForApp(page);
}
