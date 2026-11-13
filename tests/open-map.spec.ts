import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from './support/app';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/ropeman-map/ropeman.json', import.meta.url));

async function start(page: Page, language: 'en' | 'ko') {
	await page.addInitScript((lang) => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: lang }));
	}, language);
}

const chooseFile = (
	page: Page,
	file: string | { name: string; mimeType: string; buffer: Buffer }
) => page.getByTestId('open-map-input').setInputFiles(file);

test('opens a ropeman.json from the landing page and drills into a level it holds', async ({
	page
}) => {
	await start(page, 'en');
	await gotoApp(page);

	await page
		.getByRole('link', { name: /Open a ropeman\.json/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Open a ropeman.json' })).toBeVisible();
	await chooseFile(page, FIXTURE);

	const nodes = page.locator('.semantic-node');
	await expect(nodes).toHaveCount(3);
	await expect(nodes.filter({ hasText: 'HTTP API' })).toBeVisible();
	await expect(page.locator('.open-project-name')).toHaveText('sample-shop');
	// A frozen map offers no re-analysis that would call the AI
	await expect(page.locator('.reanalyze-btn')).toHaveCount(0);

	await nodes.filter({ hasText: 'HTTP API' }).locator('.open-btn').click();
	await expect(page.locator('.semantic-node').filter({ hasText: 'routes.ts' })).toBeVisible();
	await expect(page.locator('.semantic-node')).toHaveCount(2);
});

test(
	'explains a rejected file and opens the next one',
	{ tag: '@responsive' },
	async ({ page }) => {
		await start(page, 'en');
		await page.goto('/open');

		await chooseFile(page, {
			name: 'graph.json',
			mimeType: 'application/json',
			buffer: Buffer.from('{"directed": true, "nodes": []}')
		});
		await expect(page.getByRole('heading', { name: "Can't open this file" })).toBeVisible();
		await expect(page.getByRole('alert')).toHaveText(/not a Ropeman map/);

		const newer = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
		newer.schemaVersion = '2.0';
		await chooseFile(page, {
			name: 'ropeman.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(newer))
		});
		await expect(page.getByRole('alert')).toHaveText(/newer Ropeman made this map \(schema 2\.0\)/);

		await chooseFile(page, FIXTURE);
		await expect(page.locator('.semantic-node')).toHaveCount(3);
		await expect(page.getByRole('alert')).toHaveCount(0);
	}
);

test('speaks Korean on the open page and its errors', async ({ page }) => {
	await start(page, 'ko');
	await gotoApp(page);

	await page
		.getByRole('link', { name: /ropeman\.json 열기/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'ropeman.json 열기' })).toBeVisible();
	await expect(page.getByRole('button', { name: '파일 선택' })).toBeVisible();

	await chooseFile(page, {
		name: 'broken.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"format": "ropeman-map",')
	});
	await expect(page.getByRole('heading', { name: '이 파일을 열 수 없습니다' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveText(/JSON 형식이 아닙니다/);
	await expect(page.getByRole('button', { name: '다른 파일 열기' })).toBeVisible();
});
