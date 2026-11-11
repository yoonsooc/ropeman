import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { devFsPlugin } from './scripts/vite-dev-fs-plugin.js';

export default defineConfig({
	plugins: [devFsPlugin(), sveltekit()],
	// The parser worker imports web-tree-sitter after the first page load. Without this,
	// a cold dev server discovers it late, re-optimizes, and reloads every open page.
	optimizeDeps: {
		include: ['web-tree-sitter']
	},
	worker: {
		format: 'es'
	}
});
