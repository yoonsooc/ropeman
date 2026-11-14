import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const snapshot = read('./fixtures/explore/react-snapshot.json');
const curated: { entries: { slug: string; ref?: string }[] } = JSON.parse(
	read('../src/lib/data/explore-curated.json')
);
const reactRef = curated.entries.find((e) => e.slug === 'react')?.ref;

async function mockReactSnapshot(page: Page) {
	await page.route('https://explore.ropeman.dev/explore/react', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: snapshot })
	);
}

test.describe('Explore', { tag: '@responsive' }, () => {
	// Regression: global CSS pins html and body with overflow hidden, so the gallery
	// below the first screen was unreachable on every viewport
	test('the gallery scrolls to its last card', async ({ page }) => {
		await page.goto('/explore');
		const last = page.locator('.explore-card').last();
		await expect(last).toBeAttached();
		await expect(last).not.toBeInViewport();

		await page.mouse.move(100, 300);
		await expect(async () => {
			await page.mouse.wheel(0, 600);
			await expect(last).toBeInViewport({ timeout: 250 });
		}).toPass({ timeout: 10_000 });
	});

	// Regression: the detail page had no file view, so a file in the panel did nothing
	test('a file in the node panel opens its source from the analyzed commit', async ({
		page,
		viewport
	}) => {
		await mockReactSnapshot(page);
		const sourceRequests: string[] = [];
		await page.route('https://raw.githubusercontent.com/**', (route) => {
			sourceRequests.push(route.request().url());
			return route.fulfill({ status: 200, body: 'export function commitWork() {}\n' });
		});

		await page.goto('/explore/react');
		await page.locator('.svelte-flow__node').first().click();
		await page.locator('.semantic-detail-panel .file-item').first().click();

		await expect(page.locator('.code-viewer')).toContainText('commitWork');
		await expect(page.getByRole('tab', { selected: true })).toHaveText(/ReactFiberCommitWork\.js/);
		expect(sourceRequests).toEqual([
			`https://raw.githubusercontent.com/facebook/react/${reactRef}/packages/react-reconciler/src/ReactFiberCommitWork.js`
		]);
		await expect(page.locator('.source-link')).toHaveAttribute(
			'href',
			`https://github.com/facebook/react/blob/${reactRef}/packages/react-reconciler/src/ReactFiberCommitWork.js`
		);
		if (viewport && viewport.width <= 768) {
			await expect(page.locator('.semantic-detail-panel')).toBeHidden();
		}

		await page.getByRole('tab').first().click();
		await expect(page.locator('.svelte-flow__node').first()).toBeVisible();
		await expect(page.locator('.code-viewer')).toHaveCount(0);
	});

	test('a file missing at the analyzed commit says so and keeps the GitHub link', async ({
		page
	}) => {
		await mockReactSnapshot(page);
		await page.route('https://raw.githubusercontent.com/**', (route) =>
			route.fulfill({ status: 404, body: '404: Not Found' })
		);

		await page.goto('/explore/react');
		await page.locator('.svelte-flow__node').first().click();
		await page.locator('.semantic-detail-panel .file-item').first().click();

		await expect(page.locator('.code-error')).toContainText('HTTP 404');
		await expect(page.locator('.source-link')).toBeVisible();
	});
});
