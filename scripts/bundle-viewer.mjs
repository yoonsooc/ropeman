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
// A page served from 127.0.0.1 makes no third-party request (ADR-23): the site's Cloudflare
// analytics beacon and its Google Fonts go. Text falls back to the system fonts the CSS stacks
// name; the Material Symbols icons have no fallback and would show their ligature names
// ("arrow_back"), so they are hidden. Every icon in Bridge mode sits next to a text label.
const STRIP = [
	/<script[^>]*static\.cloudflareinsights\.com[^>]*><\/script>/g,
	/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g
];
const NO_ICON_FONT = '<style>.material-symbols-outlined{display:none!important}</style>';
// Anything still loading from another host fails the bundle, so a new tag in app.html is not
// shipped to local mode by accident
const LOADING_TAG = /<(?:script|link|img|iframe|source|video|audio)\b[^>]*>/gi;
const REMOTE = /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i;
// A <link> that only names a page (the docs' hreflang alternates, canonical) loads nothing
const NAMES_A_PAGE = /\brel\s*=\s*["']?(?:alternate|canonical)\b/i;
const offHost = (html) =>
	html.match(LOADING_TAG)?.find((tag) => REMOTE.test(tag) && !NAMES_A_PAGE.test(tag));
function fail(message) {
	console.error(message);
	process.exit(1);
}
for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || !/\.(html|css)$/.test(entry.name)) continue;
	const file = path.join(entry.parentPath, entry.name);
	const text = fs.readFileSync(file, 'utf8');
	if (entry.name.endsWith('.css')) {
		const remote = text.match(
			/@import\s+(?:url\()?["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//
		);
		if (remote) fail(`${file} loads from another host (${remote[0]}); self-host it or strip it.`);
		continue;
	}
	let html = STRIP.reduce((out, pattern) => out.replace(pattern, ''), text);
	const left = offHost(html);
	if (left)
		fail(
			`${file} still loads from another host: ${left}\nUpdate STRIP in scripts/bundle-viewer.mjs.`
		);
	// 404.html is a bare text page with no head and no icons
	html = html.replace('</head>', `${NO_ICON_FONT}</head>`);
	if (html !== text) fs.writeFileSync(file, html);
}
let bytes = 0;
let files = 0;
for (const entry of fs.readdirSync(to, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile()) continue;
	files++;
	bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
}
console.log(`Viewer bundle: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${to}`);
