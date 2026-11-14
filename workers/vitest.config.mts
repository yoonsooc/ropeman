import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				// Tests import each worker module directly, so this config only sets the workerd
				// compatibility date and flags, which the demo and proxy configs share
				wrangler: { configPath: './wrangler.proxy.toml' },
				// Local KV for the share and explore workers, emptied between tests
				miniflare: { kvNamespaces: ['ROPEMAN_SHARE_STORE', 'ROPEMAN_EXPLORE_STORE'] },
			},
		},
	},
});
