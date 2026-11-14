#!/usr/bin/env node
/**
 * Draws the gallery card images (`static/explore/thumbs/<slug>-{light,dark}.webp`, 800x430) from
 * built snapshots, the way the detail page shows them in English:
 *
 *   node scripts/explore/thumbs.mjs --base http://localhost:PORT [slug...] [--work DIR]
 *
 * The card shows the best connected named level (every part described) of 4 to 16 parts: the
 * most relations, weighted by the share of parts they touch, so a hub with a column of leaves
 * loses to a web. It is served to the page as the top level, because the real top level is often
 * a column of folders with no arrows.
 * `--base` is a running production build (`npx wrangler pages dev .svelte-kit/cloudflare`).
 * The snapshot is served to the page from the work folder, so nothing is uploaded. With no
 * slug it draws every built snapshot. CHROME_PATH picks the browser binary when Playwright's
 * own is missing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/explore/repos.json'), 'utf8'));
const OUT = path.join(ROOT, 'static/explore/thumbs');
// Twice the card size, so the downscale keeps labels crisp, plus the header and the tab bar
const VIEWPORT = { width: 1600, height: 960 };
const HIDE = '.svelte-flow__minimap, .svelte-flow__controls, .diagram-toolbar, .canvas-breadcrumb';

function parseArgs(argv) {
	const args = {
		base: null,
		slugs: [],
		work: path.join(os.homedir(), '.cache', 'ropeman-explore')
	};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--base') args.base = argv[++i].replace(/\/$/, '');
		else if (argv[i] === '--work') args.work = path.resolve(argv[++i]);
		else args.slugs.push(argv[i]);
	}
	if (!args.base) throw new Error('Usage: thumbs.mjs --base http://localhost:PORT [slug...]');
	if (args.slugs.length === 0) {
		args.slugs = Object.keys(REPOS).filter((s) =>
			fs.existsSync(path.join(args.work, s, 'snapshot.json'))
		);
	}
	return args;
}

/** The snapshot with its most connected readable level moved to the top. */
function cardSnapshot(text) {
	const snapshot = JSON.parse(text);
	const levels = Object.entries(snapshot.semanticLevels);
	const readable = levels.filter(
		([, l]) => l.nodes.length >= 4 && l.nodes.length <= 16 && l.nodes.every((n) => n.description)
	);
	const score = (l) => {
		const touched = new Set(l.edges.flatMap((e) => [e.source, e.target]));
		return (l.edges.length * touched.size) / l.nodes.length;
	};
	const [key, level] = readable.sort(([, a], [, b]) => score(b) - score(a))[0] ?? [];
	if (!level || level.edges.length === 0 || key === '__root__') return text;
	const nodes = level.nodes.map((n) => ({ ...n, parentId: null, depth: 0 }));
	return JSON.stringify({
		...snapshot,
		semanticLevels: { ...snapshot.semanticLevels, __root__: { ...level, parentId: null, nodes } }
	});
}

/** The PNG cut to the card's shape around its center, as WebP, encoded by the browser. */
async function toWebp(page, png) {
	const dataUrl = await page.evaluate(async (b64) => {
		const img = new Image();
		img.src = `data:image/png;base64,${b64}`;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = 800;
		canvas.height = 430;
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		const scale = Math.max(800 / img.width, 430 / img.height);
		const w = 800 / scale;
		const h = 430 / scale;
		ctx.drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, 800, 430);
		return canvas.toDataURL('image/webp', 0.82);
	}, png.toString('base64'));
	if (!dataUrl.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
	return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
	try {
		for (const slug of args.slugs) {
			const body = cardSnapshot(
				fs.readFileSync(path.join(args.work, slug, 'snapshot.json'), 'utf8')
			);
			for (const theme of ['light', 'dark']) {
				const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US' });
				await context.addInitScript((t) => localStorage.setItem('theme', t), theme);
				const page = await context.newPage();
				await page.route(`https://explore.ropeman.dev/explore/${slug}`, (r) =>
					r.fulfill({ status: 200, contentType: 'application/json', body })
				);
				await page.goto(`${args.base}/explore/${slug}`);
				await page.locator('.svelte-flow__node').first().waitFor();
				await page.addStyleTag({ content: `${HIDE} { display: none !important; }` });
				// fitView runs after layout; let it settle before the shot
				await page.waitForTimeout(800);
				const png = await page.locator('.canvas-content').screenshot();
				const file = path.join(OUT, `${slug}-${theme}.webp`);
				fs.writeFileSync(file, await toWebp(page, png));
				process.stdout.write(`${path.relative(ROOT, file)}\n`);
				await context.close();
			}
		}
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	process.stderr.write(`[thumbs] ${err.message}\n`);
	process.exit(1);
});
