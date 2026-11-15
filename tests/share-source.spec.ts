import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gotoApp } from './support/app';

const COMMIT = 'e129e22125d397b272c6c3a84bf9d11c35e3d8cc';
const SLUG = 'Ab3dEf7h';
const FOLDER = '/tmp/ropeman-share-source';
const SOURCES: Record<string, string> = {
	'app.py': 'from lib.util import helper\n\ndef run():\n    return helper()\n',
	'lib/util.py': 'def helper():\n    return 1\n'
};

test.beforeAll(() => {
	for (const [file, text] of Object.entries(SOURCES)) {
		fs.mkdirSync(path.dirname(path.join(FOLDER, file)), { recursive: true });
		fs.writeFileSync(path.join(FOLDER, file), text);
	}
});

async function start(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem(
			'ropeman-onboarding',
			JSON.stringify({ phase1Completed: true, phase2Completed: true })
		);
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: 'en' }));
	});
}

async function stubShareWorker(page: Page, served?: unknown) {
	const posted: unknown[] = [];
	await page.route('https://share.ropeman.dev/share**', (route) => {
		const request = route.request();
		if (request.method() === 'POST') {
			posted.push(request.postDataJSON());
			return route.fulfill({
				status: 201,
				json: { slug: SLUG, url: `https://ropeman.dev/share/${SLUG}` }
			});
		}
		return route.fulfill({ json: served ?? posted[posted.length - 1] });
	});
	return posted;
}

async function stubRaw(page: Page) {
	const asked: string[] = [];
	await page.route('https://raw.githubusercontent.com/**', (route) => {
		const url = route.request().url();
		asked.push(url);
		const file = Object.keys(SOURCES).find((name) => url.endsWith(`/${name}`));
		return file
			? route.fulfill({ body: SOURCES[file] })
			: route.fulfill({ status: 404, body: '404: Not Found' });
	});
	return asked;
}

async function stubDemoAnalysis(page: Page) {
	await page.route('https://demo.ropeman.dev/**', async (route) => {
		const paths = [
			...new Set(
				route
					.request()
					.postData()
					?.match(/[\w/.-]*(?:app|util)\.py/g)
			)
		];
		const text = JSON.stringify({
			roles: paths.map((p, i) => ({
				id: `role${i}`,
				label: `Role ${i}`,
				description: 'd',
				filePaths: [p],
				keySymbols: []
			})),
			edges: []
		});
		await route.fulfill({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
	});
}

async function analyzeAndShare(page: Page) {
	await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 120_000 });
	await page.locator('.analyze-btn').click();
	await page.locator('.analyze-card .start-btn').first().click();
	await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 30_000 });
	await page.locator('.share-btn').click();
}

async function openSharedFile(page: Page) {
	await page.goto(`/share/${SLUG}`);
	await page.locator('.svelte-flow__node').first().click();
	await page.locator('.semantic-detail-panel .file-item').first().click();
}

test.describe('Source in a share', () => {
	test('a share of a public GitHub repository names its commit, and the viewer reads files there', async ({
		page
	}) => {
		await start(page);
		await page.route('https://api.github.com/repos/octo/demo-repo/git/trees/**', (route) =>
			route.fulfill({
				json: {
					sha: COMMIT,
					truncated: false,
					tree: [
						{ path: 'app.py', mode: '100644', type: 'blob', sha: 'f1', size: 60 },
						{ path: 'lib', mode: '040000', type: 'tree', sha: 'd1' },
						{ path: 'lib/util.py', mode: '100644', type: 'blob', sha: 'f2', size: 30 }
					]
				}
			})
		);
		const raw = await stubRaw(page);
		await stubDemoAnalysis(page);
		const posted = await stubShareWorker(page);

		await gotoApp(page);
		await page.locator('#landing-github-url').fill('https://github.com/octo/demo-repo');
		await page.locator('#landing-github-url').press('Enter');
		await analyzeAndShare(page);
		await expect(page.getByTestId('share-includes-source')).toContainText('octo/demo-repo');
		await page.locator('.share-btn-confirm').click();
		await expect(page.locator('.share-url-input')).toHaveValue(`https://ropeman.dev/share/${SLUG}`);

		const [payload] = posted as { source?: unknown; filePaths: string[] }[];
		expect(payload.source).toEqual({ owner: 'octo', repo: 'demo-repo', commit: COMMIT });
		expect(payload.filePaths.sort()).toEqual(['demo-repo/app.py', 'demo-repo/lib/util.py']);
		expect(JSON.stringify(payload)).not.toContain('return helper()');
		expect(raw.every((url) => url.includes(`/octo/demo-repo/${COMMIT}/`))).toBe(true);

		raw.length = 0;
		await openSharedFile(page);
		await expect(page.locator('.code-viewer')).toContainText('def ');
		expect(raw).toHaveLength(1);
		expect(raw[0]).toMatch(
			new RegExp(
				`^https://raw\\.githubusercontent\\.com/octo/demo-repo/${COMMIT}/(app|lib/util)\\.py$`
			)
		);
		await expect(page.locator('.source-link')).toHaveAttribute(
			'href',
			raw[0]
				.replace('raw.githubusercontent.com', 'github.com')
				.replace('/demo-repo/', '/demo-repo/blob/')
		);
	});

	test('a share of a local folder holds no source, and the viewer says the code is not included', async ({
		page
	}) => {
		await start(page);
		const raw = await stubRaw(page);
		await stubDemoAnalysis(page);
		const posted = await stubShareWorker(page);

		await page.goto(`/?testDir=${encodeURIComponent(FOLDER)}`);
		await expect(page.locator('.main-layout')).toBeVisible({ timeout: 60_000 });
		await analyzeAndShare(page);
		await expect(page.getByTestId('share-includes-source')).toHaveCount(0);
		await page.locator('.share-btn-confirm').click();
		await expect(page.locator('.share-url-input')).toBeVisible();

		expect(posted).toHaveLength(1);
		expect(Object.keys(posted[0] as object)).not.toContain('source');

		await openSharedFile(page);
		await expect(page.locator('.code-error')).toContainText(
			'The original code is not included in this share.'
		);
		await expect(page.locator('.source-link')).toHaveCount(0);
		expect(raw).toEqual([]);
	});

	test(
		'the share viewer opens a file at the shared commit',
		{ tag: '@responsive' },
		async ({ page, viewport }) => {
			const node = (id: string, label: string, filePaths: string[]) => ({
				id,
				label,
				description: `${label} files`,
				color: '#89b4fa',
				filePaths,
				keySymbols: [],
				parentId: null,
				depth: 0,
				fileCount: filePaths.length
			});
			await stubShareWorker(page, {
				projectName: 'demo-repo',
				semanticLevels: {
					__root__: {
						parentId: null,
						breadcrumbLabel: 'demo-repo',
						nodes: [
							node('sem:app', 'App', ['demo-repo/app.py']),
							node('sem:lib', 'Lib', ['demo-repo/lib/util.py'])
						],
						edges: []
					}
				},
				filePaths: ['demo-repo/app.py', 'demo-repo/lib/util.py'],
				source: { owner: 'octo', repo: 'demo-repo', commit: COMMIT }
			});
			const raw = await stubRaw(page);

			await page.goto(`/share/${SLUG}`);
			await page.locator('.svelte-flow__node').filter({ hasText: 'App' }).click();
			await page.locator('.semantic-detail-panel .file-item').first().click();

			await expect(page.locator('.code-viewer')).toContainText('def run()');
			expect(raw).toEqual([`https://raw.githubusercontent.com/octo/demo-repo/${COMMIT}/app.py`]);
			await expect(page.locator('.source-link')).toHaveAttribute(
				'href',
				`https://github.com/octo/demo-repo/blob/${COMMIT}/app.py`
			);
			if (viewport && viewport.width <= 768) {
				await expect(page.locator('.semantic-detail-panel')).toBeHidden();
			}

			await page.getByRole('tab').first().click();
			await expect(page.locator('.code-viewer')).toHaveCount(0);
			await expect(page.locator('.svelte-flow__node').first()).toBeVisible();
		}
	);
});
