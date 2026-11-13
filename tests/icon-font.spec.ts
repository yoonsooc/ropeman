import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFEST = fileURLToPath(new URL('../src/lib/fonts/fonts.json', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/ropeman-map/ropeman.json', import.meta.url));
const icons: string[] = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).icons;

const MAX_GLYPH_EM = 1.25;

async function start(page: Page, theme: 'dark' | 'light') {
	await page.addInitScript((t) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'en' }));
		localStorage.setItem('theme', t);
	}, theme);
}

async function unrenderedIcons(page: Page) {
	// fonts.load resolves at once, loading nothing, until the app's CSS has declared the face
	await page.waitForFunction(() =>
		[...document.fonts].some((face) => face.family === 'Material Symbols Outlined')
	);
	return page.evaluate(async (maxEm) => {
		await document.fonts.load('24px "Material Symbols Outlined"');
		await document.fonts.ready;
		return [...document.querySelectorAll<HTMLElement>('.material-symbols-outlined')]
			.filter((el) => el.getClientRects().length > 0)
			.map((el) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				const width = range.getBoundingClientRect().width;
				const size = parseFloat(getComputedStyle(el).fontSize);
				return { text: el.textContent!.trim(), width, size };
			})
			.filter(({ width, size }) => width > size * maxEm)
			.map(({ text, width, size }) => `${text} (${Math.round(width)}/${size})`);
	}, MAX_GLYPH_EM);
}

test('every name in the self-hosted icon font renders as one glyph', async ({ page }) => {
	await start(page, 'dark');
	await page.goto('/');
	await page.evaluate((names) => {
		const box = document.createElement('div');
		box.id = 'all-icons';
		for (const name of names) {
			const span = document.createElement('span');
			span.className = 'material-symbols-outlined';
			span.textContent = name;
			box.append(span);
		}
		document.body.append(box);
	}, icons);

	expect(await page.locator('#all-icons > span').count()).toBe(icons.length);
	expect(await unrenderedIcons(page)).toEqual([]);
});

test('a name the font lacks is caught as a word', async ({ page }) => {
	await start(page, 'dark');
	await page.goto('/');
	await page.evaluate(() => {
		const span = document.createElement('span');
		span.className = 'material-symbols-outlined';
		span.textContent = 'rocket_launch';
		document.body.append(span);
	});

	expect(await unrenderedIcons(page)).toEqual([expect.stringMatching(/^rocket_launch /)]);
});

for (const theme of ['dark', 'light'] as const) {
	test(`landing, map view, explore and bridge show icons, not words (${theme})`, async ({
		page
	}) => {
		await start(page, theme);
		const seen: Record<string, string[]> = {};

		for (const path of ['/', '/explore', '/bridge']) {
			await page.goto(path);
			await expect(page.locator('.material-symbols-outlined').first()).toBeVisible();
			seen[path] = await unrenderedIcons(page);
		}

		await page.goto('/');
		await page
			.getByRole('link', { name: /Open a ropeman\.json/ })
			.first()
			.click();
		await page.getByTestId('open-map-input').setInputFiles(FIXTURE);
		await expect(page.locator('.semantic-node')).toHaveCount(3);
		seen['map view'] = await unrenderedIcons(page);

		expect(seen).toEqual({ '/': [], '/explore': [], '/bridge': [], 'map view': [] });
	});
}
