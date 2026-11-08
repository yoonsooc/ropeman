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
		// edge-proxy workers only use fetch/Request/Response, so they run in Node as well
		include: ['src/**/*.test.ts', 'edge-proxy/test/**/*.test.ts'],
		globals: true,
		environment: 'node'
	}
});
