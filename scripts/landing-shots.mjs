#!/usr/bin/env node
/**
 * Takes the landing's hero screenshots (`static/landing/explore-transformers-<locale>-<theme>.webp`,
 * 2200x1360) from the published huggingface/transformers gallery page, once per language and theme:
 *
 *   node scripts/landing-shots.mjs [origin]
 *
 * `origin` is a running production build (`npx wrangler pages dev .svelte-kit/cloudflare --port
 * 4173`), default http://localhost:4173. The page loads the snapshot from explore.ropeman.dev,
 * which answers only the origins in workers/wrangler.explore.toml, so use one of those. Each shot
 * selects the same part, so the detail panel shows its description, files and key symbols.
 * CHROME_PATH picks the browser binary when Playwright's own is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'static/landing');
// A 1100x680 window at twice the pixels: the landing shows it near its own size, so the cards'
// text stays readable, where a wider window shrank it below 7px
const SHOT = { width: 1100, height: 680 };
const SCALE = 2;
/** The part the shot selects: small enough that the panel shows its key symbols under its files */
const SELECTED = 'Maintenance scripts';
const QUALITY = 0.8;

async function toWebp(page, png) {
	const dataUrl = await page.evaluate(
		async ({ b64, quality }) => {
			const img = new Image();
			img.src = `data:image/png;base64,${b64}`;
			await img.decode();
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			canvas.getContext('2d').drawImage(img, 0, 0);
			return canvas.toDataURL('image/webp', quality);
		},
		{ b64: png.toString('base64'), quality: QUALITY }
	);
	if (!dataUrl.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
	return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** The selected part's node id, read from the English page so every language selects the same part */
async function selectedId(page) {
	const node = page.locator('.svelte-flow__node', { hasText: SELECTED });
	const id = await node.getAttribute('data-id');
	if (!id) throw new Error(`no part named "${SELECTED}" on the page`);
	return id;
}

async function main() {
	const origin = process.argv[2] ?? 'http://localhost:4173';
	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
	let id;
	try {
		for (const locale of ['en', 'ko']) {
			for (const theme of ['dark', 'light']) {
				// The header and the tab bar sit above the shot, so the page is that much taller
				const context = await browser.newContext({
					viewport: { width: SHOT.width, height: SHOT.height + 200 },
					deviceScaleFactor: SCALE,
					locale: locale === 'ko' ? 'ko-KR' : 'en-US'
				});
				await context.addInitScript(
					({ locale, theme }) => {
						localStorage.setItem(
							'ropeman-onboarding',
							JSON.stringify({ phase1Completed: true, phase2Completed: true })
						);
						localStorage.setItem('ropeman-settings', JSON.stringify({ language: locale }));
						localStorage.setItem('theme', theme);
					},
					{ locale, theme }
				);
				const page = await context.newPage();
				await page.goto(`${origin}/explore/transformers`);
				await page.locator('.svelte-flow__node').first().waitFor();
				id ??= await selectedId(page);
				await page.locator(`.svelte-flow__node[data-id="${id}"]`).click();
				// The panel slides in and fitView settles after the click
				await page.waitForTimeout(1200);
				// The shot starts where the canvas and the detail panel start, below the tab bar
				const top = await page.evaluate(() =>
					Math.min(
						...['.svelte-flow', '.semantic-detail-panel'].map(
							(s) => document.querySelector(s)?.getBoundingClientRect().top ?? Infinity
						)
					)
				);
				await page.setViewportSize({ width: SHOT.width, height: Math.ceil(top) + SHOT.height });
				await page.waitForTimeout(800);
				const png = await page.screenshot({
					clip: { x: 0, y: Math.ceil(top), width: SHOT.width, height: SHOT.height }
				});
				const file = path.join(OUT, `explore-transformers-${locale}-${theme}.webp`);
				fs.writeFileSync(file, await toWebp(page, png));
				process.stdout.write(`${path.relative(ROOT, file)} ${fs.statSync(file).size} bytes\n`);
				await context.close();
			}
		}
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	process.stderr.write(`[landing-shots] ${err.message}\n`);
	process.exit(1);
});
