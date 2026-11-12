import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/**
 * The bridge as one ES module with the extraction core, the map parser and the verifier inside
 * it, and the tree-sitter .wasm files beside it. Only `ws` stays a dependency.
 */
export default defineConfig({
	resolve: { alias: { $lib: repo('src/lib') } },
	publicDir: false,
	build: {
		ssr: repo('bridge/src/server.ts'),
		outDir: repo('bridge/dist'),
		emptyOutDir: true,
		target: 'node22',
		minify: false,
		rollupOptions: { external: ['ws'], output: { entryFileNames: 'server.mjs' } }
	},
	ssr: { noExternal: true },
	plugins: [
		{
			name: 'copy-tree-sitter-wasm',
			async writeBundle() {
				const wasmDir = repo('bridge/dist/wasm');
				await mkdir(wasmDir, { recursive: true });
				for (const file of await readdir(repo('static'))) {
					if (file.endsWith('.wasm')) await copyFile(repo(`static/${file}`), `${wasmDir}/${file}`);
				}
			}
		}
	]
});
