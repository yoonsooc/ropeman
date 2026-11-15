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

type Folder = { name: string; files: Record<string, string> };

const SHOP: Folder = {
	name: 'sample-shop',
	files: {
		'src/api/routes.ts': 'export const routes = ["/cart"];\n',
		'src/api/auth.ts': 'export function login() {}\n',
		'src/db/client.ts': 'export const db = {};\n',
		'src/db/schema.ts': 'export const schema = {};\n',
		'src/ui/Cart.svelte': '<p>cart</p>\n',
		'.env': 'STRIPE_KEY=sk_live_secret\n'
	}
};

/**
 * Playwright cannot drive the folder picker, so it returns these folders in turn, as in-memory
 * handles that refuse `.`, `..` and `/` like Chromium's.
 */
async function stubFolderPicker(page: Page, folders: Folder[]) {
	await page.addInitScript((list: Folder[]) => {
		type Tree = { [name: string]: string | Tree };
		const w = window as unknown as Record<string, unknown>;
		const asked: string[] = [];
		w.__folderNames = asked;
		const toTree = (files: Record<string, string>) => {
			const root: Tree = {};
			for (const [path, text] of Object.entries(files)) {
				const parts = path.split('/');
				let dir = root;
				for (const part of parts.slice(0, -1)) dir = (dir[part] ??= {}) as Tree;
				dir[parts[parts.length - 1]] = text;
			}
			return root;
		};
		const entry = (tree: Tree, name: string) => {
			asked.push(name);
			if (name === '.' || name === '..' || name.includes('/'))
				throw new TypeError('Name is not allowed.');
			if (!(name in tree)) throw new DOMException('Not found', 'NotFoundError');
			return tree[name];
		};
		const directory = (name: string, tree: Tree): unknown => ({
			kind: 'directory',
			name,
			async getDirectoryHandle(child: string) {
				const value = entry(tree, child);
				if (typeof value === 'string') throw new DOMException('A file', 'TypeMismatchError');
				return directory(child, value);
			},
			async getFileHandle(child: string) {
				const value = entry(tree, child);
				if (typeof value !== 'string') throw new DOMException('A folder', 'TypeMismatchError');
				return { kind: 'file', name: child, getFile: async () => new File([value], child) };
			}
		});
		let next = 0;
		w.showDirectoryPicker = async (options: unknown) => {
			w.__pickerOptions = options;
			const folder = list[Math.min(next++, list.length - 1)];
			return directory(folder.name, toTree(folder.files));
		};
	}, folders);
}

async function openFileInPanel(
	page: Page,
	map: string | { name: string; mimeType: string; buffer: Buffer }
) {
	await page.goto('/open');
	await chooseFile(page, map);
	await page.locator('.semantic-node').filter({ hasText: 'HTTP API' }).click();
	await page.locator('.semantic-detail-panel .file-item').first().click();
}

test.describe('Source from a connected folder', () => {
	test(
		'reads a clicked file from the folder the user connects, and sends it nowhere',
		{ tag: '@responsive' },
		async ({ page }) => {
			await start(page, 'en');
			await stubFolderPicker(page, [SHOP]);
			await openFileInPanel(page, FIXTURE);

			await expect(page.locator('.code-error')).toContainText('Connect the project folder');
			const leaving: string[] = [];
			page.on('request', (request) => {
				if (new URL(request.url()).hostname !== 'localhost') leaving.push(request.url());
			});
			await page.getByRole('button', { name: 'Connect folder' }).click();

			await expect(page.locator('.code-viewer')).toContainText('export const routes');
			await expect(page.locator('.source-note')).toHaveText('Reading from sample-shop');
			expect(
				await page.evaluate(() => (window as unknown as Record<string, unknown>).__pickerOptions)
			).toEqual({
				mode: 'read'
			});
			expect(leaving).toEqual([]);

			await page.getByRole('tab').first().click();
			await page.locator('.semantic-detail-panel .file-item').nth(1).click();
			await expect(page.locator('.code-viewer')).toContainText('export function login');
		}
	);

	test('says so when the folder does not look like the map, and takes another', async ({
		page
	}) => {
		await start(page, 'en');
		await stubFolderPicker(page, [{ name: 'Downloads', files: { 'notes.txt': 'x' } }, SHOP]);
		await openFileInPanel(page, FIXTURE);

		await page.getByRole('button', { name: 'Connect folder' }).click();
		await expect(page.locator('.code-error')).toHaveText(
			"Downloads doesn't look like the folder this map was made from: 0 of 5 files from the map are in it. Choose the folder that holds src/api/auth.ts."
		);

		await page.getByRole('button', { name: 'Choose another folder' }).click();
		await expect(page.locator('.code-viewer')).toContainText('export const routes');
	});

	test('refuses a map path that leaves the folder or names an env file', async ({ page }) => {
		const map = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
		map.levels[0].nodes[0].filePaths = ['../outside.txt', '.env', 'src/api/routes.ts'];
		await start(page, 'en');
		await stubFolderPicker(page, [SHOP]);
		await openFileInPanel(page, {
			name: 'ropeman.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(map))
		});
		await page.getByRole('button', { name: 'Connect folder' }).click();

		await expect(page.locator('.code-error')).toHaveText(
			'This file path is not valid, so it cannot be opened.'
		);
		await page.getByRole('tab').first().click();
		await page.locator('.semantic-detail-panel .file-item').nth(1).click();
		await expect(page.locator('.code-error')).toHaveText(
			'This file holds environment values, so it is not shown.'
		);
		const asked = await page.evaluate(
			() => (window as unknown as Record<string, string[]>).__folderNames
		);
		expect(asked).not.toContain('..');
		expect(asked).not.toContain('.env');
	});

	test('a browser without a folder picker says so instead of offering the button', async ({
		page
	}) => {
		await start(page, 'en');
		await page.addInitScript(() => {
			delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
			delete (Window.prototype as unknown as Record<string, unknown>).showDirectoryPicker;
		});
		await openFileInPanel(page, FIXTURE);

		await expect(page.locator('.code-error')).toContainText("This browser can't open a folder");
		await expect(page.getByRole('button', { name: 'Connect folder' })).toHaveCount(0);
	});

	test('speaks Korean about the folder', async ({ page }) => {
		await start(page, 'ko');
		await stubFolderPicker(page, [SHOP]);
		await openFileInPanel(page, FIXTURE);

		await expect(page.locator('.code-error')).toContainText('프로젝트 폴더를 연결하세요');
		await page.getByRole('button', { name: '폴더 연결' }).click();
		await expect(page.locator('.source-note')).toHaveText('sample-shop 폴더에서 읽는 중');
	});
});
