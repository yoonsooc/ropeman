import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		alias: {
			$lib: resolve(__dirname, 'src/lib')
		}
	},
	test: {
		// edge-proxy tests run in workerd through edge-proxy/vitest.config.mts
		include: ['src/**/*.test.ts', 'bridge/test/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
		globals: true,
		environment: 'node'
	}
});
