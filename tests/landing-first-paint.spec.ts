import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './support/app';

const HEADLINE = /^Map a repo\s*from your coding agent$/;
const { version } = JSON.parse(
	readFileSync(new URL('../bridge/package.json', import.meta.url), 'utf8')
);
const INSTALL = `npm install -g @ropeman/bridge@${version}`;

async function useSettings(page: Page, settings: { language?: 'en' | 'ko'; theme?: string }) {
	await page.addInitScript(({ language, theme }) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		if (language) localStorage.setItem('ropeman-settings', JSON.stringify({ language }));
		if (theme) localStorage.setItem('theme', theme);
	}, settings);
}

/** Stops every script request, so the page stays as the HTML and app.html's inline script left it */
async function withoutAppScripts(page: Page) {
	await page.route('**/*', (route) =>
		route.request().resourceType() === 'script' ? route.abort() : route.fallback()
	);
}

async function headlineBox(page: Page) {
	// The landing fades up as it appears, so measure where it comes to rest
	await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
	return page.getByRole('heading', { level: 1 }).boundingBox();
}

async function copyInstall(page: Page) {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	const button = page.locator('#agent-setup').getByRole('button', { name: 'Copy install command' });
	await button.click();
	await expect(button).toHaveText(/Copied/);
}

test('the first HTML response already holds the landing', async ({ request }) => {
	const html = await (await request.get('/')).text();

	expect(html).toContain('Map a repo<br');
	expect(html).toContain('from your coding agent');
	expect(html).toContain('Set it up in three steps');
	expect(html).toContain(INSTALL);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the landing shows its first screen', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
		await expect(page.getByTestId('install-command')).toBeVisible();
		await expect(page.getByTestId('install-command')).toHaveText(INSTALL);
	});

	test.describe('in a Korean browser', () => {
		test.use({ locale: 'ko-KR' });

		test('the English landing still shows, since nothing hides it', async ({ page }) => {
			await page.goto('/');

			await expect(page.locator('#app')).toBeVisible();
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
		});
	});
});

test('the app takes over the prerendered landing in place', async ({ page }) => {
	await useSettings(page, { language: 'en' });
	await withoutAppScripts(page);
	await page.goto('/');
	const before = await headlineBox(page);

	await page.unrouteAll();
	await page.reload();
	await waitForApp(page);
	await copyInstall(page);

	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await expect(page.getByText('Map a repo')).toHaveCount(1);
	await expect(page.getByTestId('install-command')).toHaveCount(1);
	expect(await headlineBox(page)).toEqual(before);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(INSTALL);
});

test('a Korean visitor never sees the English prerender', async ({ page }) => {
	await useSettings(page, { language: 'ko' });
	await withoutAppScripts(page);
	await page.goto('/');
	await expect(page.locator('#app')).toBeHidden();

	await page.unrouteAll();
	await page.reload();
	await waitForApp(page);

	// Regression: {@html} keeps the prerendered markup on hydration, so the headline stayed English
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		/^코딩 에이전트로\s*저장소 지도를 그리세요$/
	);
	await expect(page.locator('#app')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
});

test('a Korean visitor whose app never loads gets the English landing, not a blank page', async ({
	page
}) => {
	await useSettings(page, { language: 'ko' });
	await withoutAppScripts(page);
	await page.clock.install();
	await page.goto('/');
	await expect(page.locator('#app')).toBeHidden();

	await page.clock.runFor(8_000);

	await expect(page.locator('#app')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
});

test('the stored light theme applies before the app boots', async ({ page }) => {
	await useSettings(page, { language: 'en', theme: 'light' });
	await withoutAppScripts(page);
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	// Regression: hydration keeps a prerendered src, so the light theme showed the dark screenshot
	await expect(page.locator('.hero-shot img:visible')).toHaveAttribute(
		'src',
		'/landing/explore-transformers-light.webp'
	);

	await page.unrouteAll();
	await page.reload();
	await waitForApp(page);
	await copyInstall(page);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(page.locator('.hero-shot img:visible')).toHaveAttribute(
		'src',
		'/landing/explore-transformers-light.webp'
	);
});
