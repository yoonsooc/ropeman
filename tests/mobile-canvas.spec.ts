import { test, expect } from '@playwright/test';

// The full SvelteFlow canvas only mounts after AI semantic analysis (which
// requires either a live API key / Bridge / WebGPU model — none available in
// CI). So these smoke tests verify the *CSS rules* and *DOM templates* that
// drive M3's mobile behaviour, rather than driving the live canvas. Pinch /
// pan / tap gestures remain validated manually via the iOS Simulator.

test.describe('M3 canvas CSS rules', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'ropeman-onboarding',
				JSON.stringify({ phase1Completed: true, phase2Completed: true })
			);
		});
		await page.goto('/');
		await expect(page.locator('header.header')).toBeVisible();
	});

	test('media query for compact viewport enlarges svelte-flow controls', async ({ page }) => {
		// Walk the stylesheets and confirm the @media block exists with the
		// 44px override for .svelte-flow__controls button.
		const cssHasRule = await page.evaluate(() => {
			for (const sheet of Array.from(document.styleSheets)) {
				let rules: CSSRuleList;
				try {
					rules = sheet.cssRules;
				} catch {
					continue;
				}
				for (const rule of Array.from(rules)) {
					if (!(rule instanceof CSSMediaRule)) continue;
					if (!/max-width:\s*768px/.test(rule.conditionText)) continue;
					for (const inner of Array.from(rule.cssRules)) {
						if (!(inner instanceof CSSStyleRule)) continue;
						if (
							inner.selectorText.includes('.svelte-flow__controls') &&
							inner.selectorText.includes('button')
						) {
							const width = inner.style.getPropertyValue('width').trim();
							const height = inner.style.getPropertyValue('height').trim();
							if (width === '44px' && height === '44px') return true;
						}
					}
				}
			}
			return false;
		});
		expect(cssHasRule).toBe(true);
	});

	test('detail-panel becomes a bottom sheet (50dvh) on compact viewports', async ({ page }) => {
		const sheetRule = await page.evaluate(() => {
			for (const sheet of Array.from(document.styleSheets)) {
				let rules: CSSRuleList;
				try {
					rules = sheet.cssRules;
				} catch {
					continue;
				}
				for (const rule of Array.from(rules)) {
					if (!(rule instanceof CSSMediaRule)) continue;
					if (!/max-width:\s*768px/.test(rule.conditionText)) continue;
					for (const inner of Array.from(rule.cssRules)) {
						if (!(inner instanceof CSSStyleRule)) continue;
						if (!inner.selectorText.includes('.detail-panel')) continue;
						const height = inner.style.getPropertyValue('height').trim();
						if (height === '50dvh') return true;
					}
				}
			}
			return false;
		});
		expect(sheetRule).toBe(true);
	});

	// TabBar mobile CSS lives inside the component's scoped style block and
	// is only loaded once the component is mounted (which requires a tab to
	// exist — i.e. a parsed project + open file). That interactive flow is
	// covered by iOS Simulator manual tests; we don't drive it from CI.
});
