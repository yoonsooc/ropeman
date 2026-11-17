import { defineConfig, devices } from '@playwright/test';

// A port of its own, so a run never lands on a dev server from another checkout on 5173.
// Set E2E_PORT to run two checkouts' suites at the same time.
const PORT = Number(process.env.E2E_PORT ?? 5180);

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 4 : undefined,
	reporter: 'html',

	use: {
		baseURL: `http://localhost:${PORT}`,
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
		command: `npm run dev -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		// A server already on the port may serve another checkout's code, so start our own or fail
		reuseExistingServer: false,
		timeout: 60_000
	}
});
