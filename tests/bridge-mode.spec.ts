import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A real `ropeman serve` (the built bundle) on a copy of a fixture repo, with the test fake on
// PATH as `claude`, so the whole RPC runs and no model is called.
const repo = fileURLToPath(new URL('..', import.meta.url));
const SERVER = path.join(repo, 'bridge/dist/server.mjs');
const VIEWER = path.join(repo, 'bridge/dist/viewer/bridge.html');
const FAKE_CLI = path.join(repo, 'bridge/test/fixtures/fake-cli.mjs');
const FIXTURE = path.join(repo, 'tests/fixtures/graphs/ts-monorepo');
const TOKEN = 'bridge-e2e-token-0123456789';
// Screenshots for review go here when set; CI leaves it unset
const SHOTS = process.env.BRIDGE_SHOTS_DIR;

const built = fs.existsSync(SERVER) && fs.existsSync(VIEWER);
// CI builds both before E2E, so a missing bundle there is a failure, not a skip
test.skip(!built && !process.env.CI, 'Run npm run build, build:bridge and bundle:viewer first');

interface Serve {
	port: number;
	root: string;
	cliDir: string;
	release(): void;
	stop(): void;
}

const running: ChildProcess[] = [];
// SvelteKit's replaceState threw before its router mounted, and the page looked fine until a click
let pageErrors: string[] = [];
test.beforeEach(() => {
	pageErrors = [];
});
test.afterEach(() => {
	for (const child of running.splice(0)) child.kill('SIGTERM');
	expect(pageErrors, 'uncaught errors in the page').toEqual([]);
});

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const probe = net.createServer().listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

async function startServe(allowOrigin: string): Promise<Serve> {
	const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-bridge-e2e-'));
	const root = path.join(work, 'shop');
	fs.cpSync(FIXTURE, root, { recursive: true });
	const bin = path.join(work, 'bin');
	fs.mkdirSync(bin);
	fs.symlinkSync(FAKE_CLI, path.join(bin, 'claude'));
	const cliDir = path.join(work, 'cli');
	fs.mkdirSync(cliDir);
	// Every naming run waits for the release file, so the pending state stays on screen
	fs.writeFileSync(path.join(cliDir, 'plan.json'), JSON.stringify(Array(40).fill('gate')));

	const port = await freePort();
	const child = spawn(
		process.execPath,
		[
			SERVER,
			'serve',
			'--root',
			root,
			'--port',
			String(port),
			'--token',
			TOKEN,
			'--cli',
			'claude',
			'--local',
			'--allow-origin',
			allowOrigin
		],
		{
			env: {
				...process.env,
				PATH: `${bin}${path.delimiter}${process.env.PATH}`,
				FAKE_CLI_DIR: cliDir
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	running.push(child);
	let output = '';
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`serve did not start:\n${output}`)), 20_000);
		child.stdout!.on('data', (chunk) => {
			output += chunk;
			if (output.includes('Local mode: open')) {
				clearTimeout(timer);
				resolve();
			}
		});
		child.stderr!.on('data', (chunk) => (output += chunk));
		child.on('exit', () => reject(new Error(`serve exited:\n${output}`)));
	});
	expect(output, 'Bridge mode never prints the token').not.toMatch(
		new RegExp(`Token: ${TOKEN}|paste the token \\(${TOKEN}`)
	);
	return {
		port,
		root,
		cliDir,
		release: () => fs.writeFileSync(path.join(cliDir, 'release'), ''),
		stop: () => child.kill('SIGTERM')
	};
}

async function settings(page: Page, language: 'en' | 'ko') {
	page.on('pageerror', (e) => pageErrors.push(e.message));
	await page.addInitScript((lang) => {
		localStorage.setItem('ropeman-settings', JSON.stringify({ language: lang }));
	}, language);
}

async function shot(page: Page, name: string) {
	if (!SHOTS) return;
	fs.mkdirSync(SHOTS, { recursive: true });
	// Let the canvas finish fitting the new level
	await page.waitForTimeout(500);
	await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const node = (page: Page, label: string | RegExp) =>
	page.locator('.semantic-node').filter({ has: page.locator('.node-label', { hasText: label }) });

/**
 * map.get → node.expand → node.named → file.read → edit → map.changed, then a refusal.
 * `tag` names the screenshots.
 */
async function walkThrough(page: Page, serve: Serve, tag: string) {
	await expect(node(page, /^apps$/)).toBeVisible();
	await expect(node(page, /^packages$/)).toBeVisible();
	await expect(node(page, /^shared$/)).toBeVisible();

	// The folder grouping shows at once, the names follow
	await node(page, /^apps$/)
		.locator('.open-btn')
		.click();
	await expect(node(page, /^web$/)).toBeVisible();
	await expect(page.getByTestId('naming-status')).toBeVisible();
	await expect(node(page, /^web$/).locator('.node-naming')).toBeVisible();
	await shot(page, `${tag}-pending`);

	serve.release();
	await expect(node(page, 'Named apps/web')).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId('naming-status')).toHaveCount(0);
	await expect(page.locator('.breadcrumb-bar .crumb.active')).toHaveText(/apps/);
	await shot(page, `${tag}-named`);

	// Back to the top; shared/'s one file opens from disk with line numbers
	await page.locator('.breadcrumb-bar .group-crumb').click();
	await expect(node(page, /^shared$/)).toBeVisible();
	// shared/ holds one file, so its card opens that file instead of a level
	await node(page, /^shared$/)
		.locator('.open-btn')
		.click();
	await expect(page.locator('.code-filepath')).toHaveText('shared/config.ts');
	await expect(page.locator('.code-line .line-number').first()).toHaveText('1');
	await shot(page, `${tag}-source`);

	// An edit on disk reaches the open file through map.changed
	const configPath = path.join(serve.root, 'shared/config.ts');
	fs.appendFileSync(configPath, '\nexport const editedInTest = true;\n');
	await expect(page.locator('.code-viewer')).toContainText('editedInTest', { timeout: 10_000 });

	// A file that turns binary is refused by code, and the viewer says why
	fs.writeFileSync(configPath, Buffer.from([0x00, 0x01, 0x02, 0x00]));
	await expect(page.locator('.code-viewer')).toContainText(/binary|바이너리/, { timeout: 10_000 });
	await shot(page, `${tag}-refused`);

	await page.getByRole('button', { name: /Back to map|지도로 돌아가기/ }).click();
	await expect(page.locator('.semantic-node').first()).toBeVisible();
}

test.describe('Bridge mode against a real ropeman serve', () => {
	test('local mode: serve hosts the viewer, the token comes from the hash and leaves the URL', async ({
		page
	}) => {
		const serve = await startServe('http://localhost:1');
		await settings(page, 'en');

		await page.goto(`http://127.0.0.1:${serve.port}/bridge#token=${TOKEN}`);

		await expect(page.getByTestId('bridge-status')).toHaveText('Connected');
		await expect(page).toHaveURL(`http://127.0.0.1:${serve.port}/bridge`);
		await walkThrough(page, serve, 'en-desktop-local');

		// The tab keeps the token, so a reload reconnects without the hash
		await page.reload();
		await expect(page.getByTestId('bridge-status')).toHaveText('Connected');
	});

	test('local mode in Korean on a phone', { tag: '@responsive' }, async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile-chromium' && !SHOTS, 'phone layout only');
		if (testInfo.project.name !== 'mobile-chromium')
			await page.setViewportSize({ width: 393, height: 851 });
		const serve = await startServe('http://localhost:1');
		await settings(page, 'ko');

		await page.goto(`http://127.0.0.1:${serve.port}/bridge#token=${TOKEN}`);

		await expect(page.getByTestId('bridge-status')).toHaveText('연결됨');
		await walkThrough(page, serve, 'ko-mobile-local');
	});

	test('ropeman.dev style: the page connects across origins with the pasted token', async ({
		page,
		context,
		baseURL
	}) => {
		const origin = new URL(baseURL!).origin;
		const serve = await startServe(origin);
		// Chromium 148+ asks before a public page reaches 127.0.0.1; a page on localhost does not.
		// Grant it where Playwright knows the permission, so the run matches a user who allowed it
		await context.grantPermissions(['loopback-network' as never]).catch(() => {});
		await settings(page, 'en');

		await page.goto('/bridge');
		await expect(page.getByRole('heading', { name: 'Connect to ropeman serve' })).toBeVisible();
		await expect(page.getByText('npx @ropeman/bridge serve --root .')).toBeVisible();
		await page.getByLabel('Port').fill(String(serve.port));
		await page.getByLabel('Token').fill('not-the-token-at-all');
		await shot(page, 'en-desktop-connect');
		await page.getByRole('button', { name: 'Connect' }).click();

		await expect(page.getByRole('alert')).toContainText(
			`serve didn't answer on 127.0.0.1:${serve.port}`
		);
		await shot(page, 'en-desktop-connect-failed');

		await page.getByLabel('Token').fill(TOKEN);
		await page.getByRole('button', { name: 'Connect' }).click();
		await expect(page.getByTestId('bridge-status')).toHaveText('Connected');
		// A page that serve does not host keeps the pasted token in memory only
		expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
		await walkThrough(page, serve, 'en-desktop-bridge');

		// serve going away keeps the map and offers to reconnect
		serve.stop();
		await expect(page.getByTestId('bridge-status')).toHaveText('Disconnected');
		await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
		await expect(page.locator('.semantic-node').first()).toBeVisible();
		await shot(page, 'en-desktop-lost');
	});
});
