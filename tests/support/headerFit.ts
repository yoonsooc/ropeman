import { expect, type Page } from '@playwright/test';

/**
 * Checks that every visible header control sits right of the title and inside the viewport,
 * measured after the fonts swap in. Returns how many controls it measured.
 */
export async function expectHeaderFits(page: Page): Promise<number> {
	const { title, controls, width } = await page.evaluate(async () => {
		await document.fonts.ready;
		const rect = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
		return {
			title: rect(document.querySelector('header .header-title')!),
			controls: [...document.querySelectorAll('header .header-right > :is(button, a, span)')]
				.filter((el) => el.getClientRects().length > 0)
				.map(rect),
			width: window.innerWidth
		};
	});
	for (const box of controls) {
		expect(box.right).toBeLessThanOrEqual(width);
		expect(box.left).toBeGreaterThanOrEqual(title.right);
	}
	return controls.length;
}
