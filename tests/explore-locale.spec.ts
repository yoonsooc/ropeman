import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Made by scripts/explore/pipeline.mjs: English levels with a Korean side map
const snapshot = readFileSync(
	new URL('./fixtures/explore/gin-snapshot.json', import.meta.url),
	'utf8'
);
const { commit, translations } = JSON.parse(snapshot);
const rootFiles = translations.ko['files:.'];

async function openGin(page: Page) {
	await page.route('https://explore.ropeman.dev/explore/gin', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: snapshot })
	);
	await page.goto('/explore/gin');
}

const engine = (page: Page, label: string) =>
	page.locator('.svelte-flow__node', { hasText: label });

test.describe('Explore snapshot language', () => {
	test.describe('English UI', () => {
		test.use({ locale: 'en-US' });

		test('shows the English part names', async ({ page }) => {
			await openGin(page);

			await expect(engine(page, 'Core engine and routing')).toBeVisible();
			await expect(page.locator('.svelte-flow__node', { hasText: '핵심 엔진' })).toHaveCount(0);
		});
	});

	test.describe('Korean UI', () => {
		test.use({ locale: 'ko-KR' });

		test('shows the Korean part names and descriptions', async ({ page }) => {
			await openGin(page);

			await engine(page, rootFiles.label).click();

			await expect(page.locator('.semantic-detail-panel .panel-label')).toHaveText(rootFiles.label);
			await expect(page.locator('.semantic-detail-panel .panel-description')).toHaveText(
				rootFiles.description
			);
		});

		// Regression: a group of several files had no level below it, so opening it said
		// "not in snapshot"; now it lists its files, and a file opens at the analyzed commit
		test('opens a group of files and then one file from it', async ({ page }) => {
			const sourceRequests: string[] = [];
			await page.route('https://raw.githubusercontent.com/**', (route) => {
				sourceRequests.push(route.request().url());
				return route.fulfill({ status: 200, body: 'package gin\n' });
			});
			await openGin(page);

			await engine(page, rootFiles.label).dblclick();
			await expect(page.locator('.breadcrumb-bar')).toContainText(rootFiles.label);
			await engine(page, 'gin.go').click();
			await page.locator('.semantic-detail-panel .file-item').click();

			await expect(page.locator('.code-viewer')).toContainText('package gin');
			expect(sourceRequests).toEqual([
				`https://raw.githubusercontent.com/gin-gonic/gin/${commit}/gin.go`
			]);
		});
	});
});
