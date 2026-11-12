import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** The Node extractor as one ES module, with the tree-sitter .wasm files it loads beside it. */
export default defineConfig({
	resolve: { alias: { $lib: repo('src/lib') } },
	publicDir: false,
	build: {
		ssr: repo('packages/core/src/cli.ts'),
		outDir: repo('packages/core/dist'),
		emptyOutDir: true,
		target: 'node22',
		rollupOptions: { output: { entryFileNames: 'cli.mjs' } }
	},
	ssr: { noExternal: true },
	plugins: [
		{
			name: 'copy-tree-sitter-wasm',
			async writeBundle() {
				const wasmDir = repo('packages/core/dist/wasm');
				await mkdir(wasmDir, { recursive: true });
				for (const file of await readdir(repo('static'))) {
					if (file.endsWith('.wasm')) await copyFile(repo(`static/${file}`), `${wasmDir}/${file}`);
				}
			}
		}
	]
});
