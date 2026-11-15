import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const repo = fileURLToPath(new URL('../..', import.meta.url));

export async function buildBundle(): Promise<{ dir: string; bundle: string }> {
	const cache = path.join(repo, 'node_modules', '.cache');
	fs.mkdirSync(cache, { recursive: true });
	// Under node_modules, so the bundle finds `ws`, its one runtime dependency
	const dir = fs.mkdtempSync(path.join(cache, 'ropeman-bridge-test-'));
	await build({
		configFile: path.join(repo, 'bridge/vite.config.ts'),
		logLevel: 'silent',
		build: { outDir: dir, emptyOutDir: true }
	});
	return { dir, bundle: path.join(dir, 'server.mjs') };
}
