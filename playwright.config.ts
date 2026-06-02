import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',

	use: {
		baseURL: 'http://localhost:5173',
		screenshot: 'only-on-failure',
		trace: 'on-first-retry'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile-chromium',
			use: { ...devices['Pixel 5'] }
		},
		{
			// Galaxy Tab S9 (Chromium) — used in place of iPad Pro 11 (WebKit)
			// because we only download Chromium browsers in CI. iOS Safari is
			// covered manually via Simulator.
			name: 'tablet-chromium',
			use: { ...devices['Galaxy Tab S9'] }
		}
	],

	webServer: {
		command: 'npm run dev -- --port 5173',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
