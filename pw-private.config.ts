import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: '/Users/yoonsoochang/Documents/Projects/nknb/ropeman-wt/t2-5/tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 4 : undefined,
	reporter: 'list',

	use: {
		baseURL: 'http://localhost:5291',
		screenshot: 'only-on-failure',
		trace: 'on-first-retry'
	},

	// Mobile and tablet run only the tests whose behavior depends on the viewport
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile-chromium',
			grep: /@responsive/,
			use: { ...devices['Pixel 5'] }
		},
		{
			// Galaxy Tab S9 (Chromium) — used in place of iPad Pro 11 (WebKit)
			// because we only download Chromium browsers in CI. iOS Safari is
			// covered manually via Simulator.
			name: 'tablet-chromium',
			grep: /@responsive/,
			use: { ...devices['Galaxy Tab S9'] }
		}
	],

	webServer: {
		command: 'npm run dev -- --port 5291',
		cwd: '/Users/yoonsoochang/Documents/Projects/nknb/ropeman-wt/t2-5',
		url: 'http://localhost:5291',
		reuseExistingServer: false,
		timeout: 60_000
	}
});
