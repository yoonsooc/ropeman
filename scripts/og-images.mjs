// Writes the landing's share images (og:image), one per language, at 1200x630, the size
// LinkedIn, KakaoTalk and X show uncropped: the landing's own headline over its hero screenshot.
// The page supplies the text, fonts and colors, so the images follow the landing when it changes.
// Run against a server with the built app: node scripts/og-images.mjs http://127.0.0.1:8788
// CHROME_PATH picks a Chromium other than the one Playwright pins.
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://localhost:5173';
const out = new URL('../static/og/', import.meta.url);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
for (const locale of ['en', 'ko']) {
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
	await page.goto(`${origin}/${locale}`);
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
	await page.evaluate(async () => {
		const h1 = document.querySelector('h1');
		const lead = h1.childNodes[0].textContent.trim();
		const accent = h1.querySelector('.headline-accent').textContent.trim();
		const style = (el, css) => (Object.assign(el.style, css), el);

		const card = style(document.createElement('div'), {
			position: 'fixed',
			inset: '0',
			zIndex: '1000',
			padding: '56px 64px',
			background: 'var(--color-background-body)',
			fontFamily: getComputedStyle(h1).fontFamily,
			overflow: 'hidden'
		});
		const brand = style(document.createElement('div'), {
			fontSize: '26px',
			fontWeight: '600',
			color: 'var(--color-accent)',
			marginBottom: '24px'
		});
		brand.textContent = 'Ropeman';
		const headline = style(document.createElement('div'), {
			fontSize: '60px',
			lineHeight: '1.12',
			fontWeight: '700',
			letterSpacing: '-0.02em',
			color: 'var(--color-text-primary)'
		});
		const accentLine = style(document.createElement('span'), { color: 'var(--color-accent)' });
		accentLine.textContent = accent;
		headline.append(lead, document.createElement('br'), accentLine);
		const shot = style(document.createElement('img'), {
			position: 'absolute',
			left: '64px',
			top: '316px',
			width: '1072px',
			borderRadius: '12px',
			border: '1px solid var(--color-border)'
		});
		shot.src = '/landing/explore-transformers-dark.webp';
		card.append(brand, headline, shot);
		document.body.append(card);
		await shot.decode();
		await document.fonts.ready;
	});
	await page.screenshot({ path: new URL(`landing-${locale}.png`, out).pathname });
	await page.close();
}
await browser.close();
