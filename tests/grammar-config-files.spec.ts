import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/tmp/ropeman-grammar-config-files';
const SECRET = 'sk-live-e2e-yaml-secret';

test.beforeAll(() => {
	fs.mkdirSync(path.join(DIR, 'k8s'), { recursive: true });
	fs.mkdirSync(path.join(DIR, 'bin'), { recursive: true });
	fs.writeFileSync(
		path.join(DIR, 'compose.yaml'),
		`services:\n  api:\n    image: node:20\n    ports: ["8080:80"]\n    depends_on: [db]\n    environment:\n      API_TOKEN: ${SECRET}\n  db:\n    image: postgres:16\n`
	);
	fs.writeFileSync(
		path.join(DIR, 'k8s', 'secret.yaml'),
		`apiVersion: v1\nkind: Secret\nmetadata:\n  name: creds\nstringData:\n  password: ${SECRET}\n`
	);
	fs.writeFileSync(
		path.join(DIR, 'pyproject.toml'),
		'[project]\nname = "svc"\ndependencies = ["fastapi>=0.110"]\n'
	);
	fs.writeFileSync(
		path.join(DIR, 'package.json'),
		'{"scripts": {"build": "vite build"}, "dependencies": {"zod": "^3"}}'
	);
	fs.writeFileSync(path.join(DIR, 'bin', 'deploy.sh'), 'source ./env.sh\ndeploy() {\n  echo\n}\n');
	fs.writeFileSync(path.join(DIR, 'package-lock.json'), '{"lockfileVersion": 3}');
	fs.writeFileSync(path.join(DIR, 'data.json'), '{"rows": []}');
	fs.writeFileSync(path.join(DIR, 'notes.txt'), 'todo\n');
});

test('sends YAML, TOML, JSON manifest and shell structure, and skips lockfiles and JSON data', async ({
	page
}) => {
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
		/Sent 5 of 5 read files · 3 skipped/
	);
	await page.getByTestId('coverage-summary').click();
	await page.getByTestId('coverage-group-skipped').click();
	const rows = page.getByTestId('coverage-rows');
	await expect(rows.locator('li', { hasText: 'package-lock.json' })).toContainText(
		'Lockfile, not analyzed'
	);
	await expect(rows.locator('li', { hasText: 'data.json' })).toContainText(
		'JSON data file, not analyzed'
	);
	await page.keyboard.press('Escape');

	await page.locator('.analyze-btn').click();
	await page.locator('.preview-toggle').click();
	const preview = page.locator('.preview-json');
	await expect(preview).toContainText(
		'{"name":"api","kind":"service","children":[{"name":"node:20","kind":"import"},{"name":"8080:80","kind":"port"},{"name":"db","kind":"import"},{"name":"API_TOKEN","kind":"env"}]}'
	);
	await expect(preview).toContainText(
		'{"name":"Secret/creds","kind":"resource","children":[{"name":"password","kind":"key"}]}'
	);
	await expect(preview).toContainText('"language":"toml"');
	await expect(preview).toContainText('{"name":"fastapi","kind":"import"}');
	await expect(preview).toContainText('{"name":"build","kind":"target"}');
	await expect(preview).toContainText('{"name":"deploy","kind":"function"}');
	await expect(preview).toContainText('{"source":"source ./env.sh","specifiers":[]}');
	await expect(preview).not.toContainText(SECRET);
	await expect(preview).not.toContainText('lockfileVersion');
});
