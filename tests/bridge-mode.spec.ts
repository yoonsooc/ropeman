import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
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
		await page.getByLabel('Token', { exact: true }).fill('not-the-token-at-all');
		await shot(page, 'en-desktop-connect');
		await page.getByRole('button', { name: 'Connect' }).click();

		// The page is on localhost, so it reaches serve ungated and can tell serve refused it
		await expect(page.getByTestId('access-guide')).toHaveAttribute('data-state', 'refused');
		await expect(page.getByRole('alert')).toContainText('serve refused this connection');
		await expect(page.getByRole('alert')).toContainText(`--allow-origin ${origin}`);
		await shot(page, 'en-desktop-connect-failed');

		await page.getByLabel('Token', { exact: true }).fill(TOKEN);
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

// ropeman.dev itself, as far as the browser can tell: an https public origin whose files are the
// viewer bundle. Chromium decides the loopback permission for it, which CDP sets per context.
const PUBLIC_ORIGIN = 'https://ropeman.test';
const VIEWER_DIR = path.dirname(VIEWER);
const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2'
};
const UA = {
	firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
	safari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
};
const PHONE = { width: 393, height: 851 };

type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';

async function publicPage(
	browser: Browser,
	options: { lang: 'en' | 'ko'; phone: boolean; permission: Permission; userAgent?: string }
): Promise<{ page: Page; context: BrowserContext }> {
	const context = await browser.newContext({
		userAgent: options.userAgent,
		viewport: options.phone ? PHONE : { width: 1280, height: 800 },
		isMobile: options.phone,
		hasTouch: options.phone
	});
	await context.route(`${PUBLIC_ORIGIN}/**`, (route) => {
		const { pathname } = new URL(route.request().url());
		const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
		const file = [rel, `${rel}.html`]
			.map((p) => path.join(VIEWER_DIR, p))
			.find((p) => p.startsWith(VIEWER_DIR) && fs.existsSync(p) && fs.statSync(p).isFile());
		if (!file) return route.fulfill({ status: 404, body: '' });
		return route.fulfill({
			status: 200,
			contentType: TYPES[path.extname(file)] ?? 'application/octet-stream',
			body: fs.readFileSync(file)
		});
	});
	const page = await context.newPage();
	if (options.permission === 'granted' || options.permission === 'denied') {
		// Playwright does not know loopback-network yet; the browser-level CDP call does
		const target = await context.newCDPSession(page);
		const { targetInfo } = await target.send('Target.getTargetInfo');
		const cdp = await browser.newBrowserCDPSession();
		await cdp.send('Browser.setPermission', {
			permission: { name: 'loopback-network' },
			setting: options.permission,
			origin: PUBLIC_ORIGIN,
			browserContextId: targetInfo.browserContextId
		});
	}
	if (options.permission === 'unsupported') {
		// Firefox and Safari reject the query: the name is not a permission they know
		await page.addInitScript(() => {
			const query = navigator.permissions.query.bind(navigator.permissions);
			navigator.permissions.query = (descriptor) =>
				descriptor.name === ('loopback-network' as PermissionName)
					? Promise.reject(new TypeError('not a valid permission name'))
					: query(descriptor);
		});
	}
	await settings(page, options.lang);
	await page.goto(`${PUBLIC_ORIGIN}/bridge`);
	await expect(page.locator('#bridge-title')).toBeVisible();
	return { page, context };
}

async function tryConnect(page: Page, port: number, token: string) {
	await page.locator('.bridge-form input[type=number]').fill(String(port));
	await page.locator('.bridge-form input[type=password]').fill(token);
	await page.locator('.bridge-form button[type=submit]').click();
}

/** A port that takes the TCP connection and never answers the upgrade, as a held prompt does. */
async function silentPort(): Promise<{ port: number; close(): void }> {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => sockets.add(socket));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		port: (server.address() as net.AddressInfo).port,
		close: () => {
			for (const s of sockets) s.destroy();
			server.close();
		}
	};
}

const guide = (page: Page) => page.getByTestId('access-guide');

test.describe('Connection guide on ropeman.dev', () => {
	for (const variant of [
		{ lang: 'en', phone: false, tag: 'en-desktop' },
		{ lang: 'ko', phone: true, tag: 'ko-mobile' }
	] as const) {
		const open = (browser: Browser, permission: Permission, userAgent?: string) =>
			publicPage(browser, { lang: variant.lang, phone: variant.phone, permission, userAgent });

		test(`${variant.tag}: not asked yet, then the prompt was not answered`, async ({ browser }) => {
			const { page, context } = await open(browser, 'prompt');
			await expect(guide(page)).toHaveAttribute('data-state', 'unasked');
			await shot(page, `${variant.tag}-guide-unasked`);

			// Nothing listens: with the permission undecided the page cannot tell which it was
			await tryConnect(page, await freePort(), TOKEN);
			await expect(guide(page)).toHaveAttribute('data-state', 'unanswered');
			await expect(guide(page)).toContainText('npx @ropeman/bridge serve --root . --local');
			await shot(page, `${variant.tag}-guide-unanswered`);
			await context.close();
		});

		test(`${variant.tag}: waiting on the prompt while the socket hangs`, async ({ browser }) => {
			const silent = await silentPort();
			const { page, context } = await open(browser, 'prompt');

			await tryConnect(page, silent.port, TOKEN);

			await expect(guide(page)).toHaveAttribute('data-state', 'prompt-pending');
			await expect(guide(page)).toBeVisible();
			await shot(page, `${variant.tag}-guide-prompt-pending`);
			await context.close();
			silent.close();
		});

		test(`${variant.tag}: granted, then serve down, then a wrong token`, async ({ browser }) => {
			const serve = await startServe(PUBLIC_ORIGIN);
			const { page, context } = await open(browser, 'granted');
			await expect(guide(page)).toHaveAttribute('data-state', 'granted');
			await shot(page, `${variant.tag}-guide-granted`);

			await tryConnect(page, await freePort(), TOKEN);
			await expect(guide(page)).toHaveAttribute('data-state', 'serve-down');
			await expect(guide(page)).toContainText('npx @ropeman/bridge serve --root .');
			await shot(page, `${variant.tag}-guide-serve-down`);

			await tryConnect(page, serve.port, 'not-the-token-at-all');
			await expect(guide(page)).toHaveAttribute('data-state', 'refused');
			await expect(guide(page)).toContainText('cat ~/.ropeman/bridge-token');
			await shot(page, `${variant.tag}-guide-refused`);

			await tryConnect(page, serve.port, TOKEN);
			await expect(page.getByTestId('bridge-status')).toBeVisible();
			await expect(node(page, /^apps$/)).toBeVisible();
			await context.close();
		});

		test(`${variant.tag}: the right token from an origin serve does not allow`, async ({
			browser
		}) => {
			const serve = await startServe('https://elsewhere.test');
			const { page, context } = await open(browser, 'granted');

			await tryConnect(page, serve.port, TOKEN);
			// serve rejects the origin at the upgrade like a wrong token, so the card names both
			await expect(guide(page)).toHaveAttribute('data-state', 'refused');
			await expect(guide(page)).toContainText('cat ~/.ropeman/bridge-token');
			await expect(guide(page)).toContainText(
				`npx @ropeman/bridge serve --root . --allow-origin ${PUBLIC_ORIGIN}`
			);
			await shot(page, `${variant.tag}-guide-refused-origin`);
			await context.close();
		});

		test(`${variant.tag}: denied shows how to allow it again and local mode`, async ({
			browser
		}) => {
			const { page, context } = await open(browser, 'denied');

			await expect(guide(page)).toHaveAttribute('data-state', 'denied');
			await expect(guide(page).locator('ol li')).toHaveCount(4);
			await expect(guide(page)).toContainText(
				'chrome://settings/content/siteDetails?site=https%3A%2F%2Fropeman.test'
			);
			await expect(guide(page)).toContainText('npx @ropeman/bridge serve --root . --local');
			await shot(page, `${variant.tag}-guide-denied`);
			await context.close();
		});

		test(`${variant.tag}: Firefox gets the honest note, then a failure it cannot explain`, async ({
			browser
		}) => {
			const { page, context } = await open(browser, 'unsupported', UA.firefox);
			await expect(guide(page)).toHaveAttribute('data-state', 'unknown');
			await expect(guide(page)).toContainText('Firefox');
			await shot(page, `${variant.tag}-guide-firefox`);

			const port = await freePort();
			const probes: string[] = [];
			page.on('request', (request) => {
				if (request.url().startsWith(`http://127.0.0.1:${port}`)) probes.push(request.url());
			});
			await tryConnect(page, port, TOKEN);
			await expect(guide(page)).toHaveAttribute('data-state', 'unexplained');
			await expect(guide(page)).toContainText('cat ~/.ropeman/bridge-token');
			await expect(guide(page)).toContainText(`--allow-origin ${PUBLIC_ORIGIN}`);
			// With no permission to read, a probe could raise the prompt again, so the page sends none
			expect(probes).toEqual([]);
			await shot(page, `${variant.tag}-guide-unexplained`);
			await context.close();
		});

		test(`${variant.tag}: Safari goes straight to local mode`, async ({ browser }) => {
			const { page, context } = await open(browser, 'unsupported', UA.safari);
			await expect(guide(page)).toHaveAttribute('data-state', 'safari');
			await expect(guide(page)).toContainText('npx @ropeman/bridge serve --root . --local');
			await expect(page.locator('.bridge-form')).toHaveCount(0);
			await shot(page, `${variant.tag}-guide-safari`);

			// The way out is a real button the keyboard reaches
			const anyway = page.getByRole('button', { name: /anyway|그래도/ });
			await anyway.focus();
			await page.keyboard.press('Enter');
			await expect(page.locator('.bridge-form')).toBeVisible();
			await context.close();
		});
	}
});
