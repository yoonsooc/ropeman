import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { devFsPlugin } from './scripts/vite-dev-fs-plugin.js';

const WEBLLM_BUNDLE = '/node_modules/@mlc-ai/web-llm/lib/index.js';
const WEBLLM_DOC_EXAMPLE = "new URL('./worker.ts', import.meta.url)";

// web-llm inlines its tokenizer wasm as one ~1 MB base64 string, and a JSDoc example in the
// bundle mentions import.meta.url. That mention alone makes vite's worker and asset URL
// plugins run stripLiteral over the file. V8 stops optimizing new regexps once a process has
// generated enough code, and the unoptimized js-tokens string regex overflows its backtrack
// stack on that literal, so about one build in ten failed. Blanking the example skips both
// scans. The minifier drops comments, so the shipped worker is byte-identical.
/** @returns {import('vite').Plugin} */
function webllmSkipLiteralScan() {
	return {
		name: 'ropeman:webllm-skip-literal-scan',
		enforce: 'pre',
		transform(code, id) {
			if (!id.split('?')[0].endsWith(WEBLLM_BUNDLE)) return;
			const blanked = code.replace(WEBLLM_DOC_EXAMPLE, ' '.repeat(WEBLLM_DOC_EXAMPLE.length));
			if (blanked.includes('import.meta.url')) {
				this.error(
					'@mlc-ai/web-llm mentions import.meta.url outside the known JSDoc example, so vite ' +
						'would scan its wasm literal again (see docs/ARCH.md section 7). Update ' +
						'webllmSkipLiteralScan in vite.config.js.'
				);
			}
			return { code: blanked, map: null };
		}
	};
}

export default defineConfig({
	plugins: [devFsPlugin(), sveltekit()],
	// The parser worker imports web-tree-sitter after the first page load. Without this,
	// a cold dev server discovers it late, re-optimizes, and reloads every open page.
	optimizeDeps: {
		include: ['web-tree-sitter']
	},
	worker: {
		format: 'es',
		plugins: () => [webllmSkipLiteralScan()]
	}
});
