import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			// Tests import each worker module directly, so this config only sets the workerd
			// compatibility date and flags, which the demo and proxy configs share
			wrangler: { configPath: './wrangler.proxy.toml' },
			// Local KV for the share and explore workers, emptied before each test by test/reset-kv.ts
			miniflare: { kvNamespaces: ['ROPEMAN_SHARE_STORE', 'ROPEMAN_EXPLORE_STORE'] },
		}),
	],
	test: { setupFiles: ['./test/reset-kv.ts'] },
});
