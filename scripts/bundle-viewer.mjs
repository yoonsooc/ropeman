#!/usr/bin/env node
// Copies the built app (`npm run build`) into the bridge package as the viewer `--local` serves
// (ADR-23). Bridge mode parses nothing in the browser, so the tree-sitter .wasm files stay out,
// and so do the Cloudflare-only files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const from = path.join(repo, '.svelte-kit/cloudflare');
const to = path.join(repo, 'bridge/dist/viewer');
const SKIP = new Set(['_worker.js', '_routes.json', '_headers']);

if (!fs.existsSync(path.join(from, 'bridge.html'))) {
	console.error(`No built viewer in ${from}. Run npm run build first.`);
	process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, {
	recursive: true,
	filter: (src) => {
		const name = path.basename(src);
		return !SKIP.has(name) && !name.endsWith('.wasm');
	}
});
// The site's Cloudflare analytics beacon has no business on a page served from 127.0.0.1
const BEACON = /<script[^>]*static\.cloudflareinsights\.com[^>]*><\/script>/g;
for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
	const file = path.join(entry.parentPath, entry.name);
	const html = fs.readFileSync(file, 'utf8');
	const stripped = html.replace(BEACON, '');
	if (stripped.includes('cloudflareinsights')) {
		console.error(`The analytics beacon in ${file} did not match; update BEACON.`);
		process.exit(1);
	}
	if (stripped !== html) fs.writeFileSync(file, stripped);
}
let bytes = 0;
let files = 0;
for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile()) continue;
	files++;
	bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
}
console.log(`Viewer bundle: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${to}`);
