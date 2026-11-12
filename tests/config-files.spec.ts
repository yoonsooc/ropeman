import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-config-files';
const SECRET = 'sk-live-e2e-secret-value';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'infra'), { recursive: true });
	fs.writeFileSync(
		path.join(DIR, 'Dockerfile'),
		'FROM node:20 AS build\nCOPY . .\n\nFROM nginx:1.27 AS web\nEXPOSE 8080\nCMD ["nginx"]\n'
	);
	fs.writeFileSync(
		path.join(DIR, 'infra', 'main.tf'),
		'module "vpc" {\n  source = "./modules/vpc"\n}\n\nresource "aws_s3_bucket" "logs" {\n}\n'
	);
	fs.writeFileSync(path.join(DIR, '.env'), `export API_TOKEN="${SECRET}"\nLEAKED_KEY=1\n`);
	fs.writeFileSync(path.join(DIR, '.env.example'), 'export API_TOKEN=\n');
	fs.writeFileSync(path.join(DIR, 'Makefile'), 'build: deps\n\tdocker build .\n');
	fs.writeFileSync(path.join(DIR, 'notes.txt'), 'todo\n');
});

test('sends config file structure to the AI and never opens a real .env', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem(
			'ropeman-settings',
			JSON.stringify({ language: 'en', skeletonUnlimited: true })
		);
	});
	await page.goto(`/?testDir=${encodeURIComponent(DIR)}`);
	await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });

	await expect(page.getByTestId('coverage-summary')).toHaveText(
		/Sent 4 of 4 read files · 2 skipped/
	);
	await page.getByTestId('coverage-summary').click();
	await page.getByTestId('coverage-group-skipped').click();
	const rows = page.getByTestId('coverage-rows');
	await expect(rows.locator('li', { hasText: '.env' })).toContainText(
		'Env file with real values, never opened'
	);
	await page.keyboard.press('Escape');

	await page.locator('.analyze-btn').click();
	await page.locator('.preview-toggle').click();
	const preview = page.locator('.preview-json');
	await expect(preview).toContainText('"language":"dockerfile"');
	await expect(preview).toContainText('{"name":"8080","kind":"port"}');
	await expect(preview).toContainText('{"name":"module.vpc","kind":"resource"}');
	await expect(preview).toContainText('{"name":"API_TOKEN","kind":"env"}');
	await expect(preview).toContainText('{"name":"build","kind":"target"');
	await expect(preview).toContainText(
		'"path":"ropeman-config-files/.env.example","language":"dotenv"'
	);
	await expect(preview).not.toContainText(SECRET);
	await expect(preview).not.toContainText('LEAKED_KEY');
	await expect(preview).not.toContainText('"path":"ropeman-config-files/.env",');
});
