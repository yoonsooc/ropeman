import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from './support/app';

const HEADLINE = /^Map a repo\s*from your coding agent$/;
const KO_HEADLINE = /^코딩 에이전트로\s*저장소 지도를 그리세요$/;
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

function headlineBox(page: Page) {
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

		test('`/` shows the Korean landing, picked before any script runs', async ({ page }) => {
			await page.goto('/');

			await expect(page.locator('#app')).toBeVisible();
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
			await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
		});
	});

	test('`/ko` shows the Korean landing in an English browser', async ({ page }) => {
		await page.goto('/ko');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
		await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
	});
});

test('the first screen is fully visible before the app boots', async ({ page }) => {
	await useSettings(page, { language: 'en' });
	await withoutAppScripts(page);
	await page.goto('/');

	// Regression: the landing faded in from opacity 0, so LCP waited for a later repaint
	const firstScreen = await page.evaluate(() =>
		['h1', '[data-testid="install-command"]', '.hero-shot img'].map((selector) => {
			const el = [...document.querySelectorAll(selector)].find((e) => e.checkVisibility());
			if (!el) return { selector, found: false };
			let opacity = 1;
			for (let node: Element | null = el; node; node = node.parentElement) {
				opacity *= Number(getComputedStyle(node).opacity);
			}
			const visibility = getComputedStyle(el).visibility;
			const animated = document
				.getAnimations()
				.some((a) => (a.effect as KeyframeEffect | null)?.target?.contains(el));
			return { selector, found: true, opacity, visibility, animated };
		})
	);

	expect(firstScreen).toEqual(
		firstScreen.map(({ selector }) => ({
			selector,
			found: true,
			opacity: 1,
			visibility: 'visible',
			animated: false
		}))
	);
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

test.describe('in a Korean browser', () => {
	test.use({ locale: 'ko-KR' });

	test('`/` paints in Korean with no English frame before the app boots', async ({ page }) => {
		await withoutAppScripts(page);
		const response = await page.goto('/');

		expect(await response!.text()).not.toContain('Map a repo');
		await expect(page.locator('#app')).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);

		await page.unrouteAll();
		await page.reload();
		await waitForApp(page);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
		await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
	});

	test('`/` serves the language picked in the app', async ({ page }) => {
		await useSettings(page, {});
		await page.goto('/');
		await waitForApp(page);
		await page.locator('header .lang-toggle').click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);

		await withoutAppScripts(page);
		await page.reload();

		await expect(page.locator('#app')).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
	});
});

test('a language saved before the cookie existed never shows the other language', async ({
	page
}) => {
	await useSettings(page, { language: 'ko' });
	await withoutAppScripts(page);
	await page.goto('/');
	await expect(page.locator('#app')).toBeHidden();

	await page.unrouteAll();
	await page.reload();
	await waitForApp(page);

	// Regression: {@html} keeps the prerendered markup on hydration, so the headline stayed English
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
	await expect(page.locator('#app')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

	// The app wrote the cookie, so the next visit gets Korean from the first byte
	await withoutAppScripts(page);
	await page.reload();
	await expect(page.locator('#app')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
});

test('a saved language whose app never loads gets the served landing, not a blank page', async ({
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

test('`/ko` stays Korean over a saved English choice and leaves the choice alone', async ({
	page
}) => {
	await useSettings(page, { language: 'en' });
	await page.goto('/ko');
	await waitForApp(page);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText(KO_HEADLINE);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
	const saved = await page.evaluate(() => localStorage.getItem('ropeman-settings'));
	expect(JSON.parse(saved!).language).toBe('en');
});

test('picking English on `/ko` moves to `/` in English', async ({ page }) => {
	await useSettings(page, {});
	await page.goto('/ko');
	await waitForApp(page);

	await page.locator('header .lang-toggle').click();

	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
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
