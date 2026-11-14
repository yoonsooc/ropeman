#!/usr/bin/env node
// Fails when the build would stop `/` from reaching hooks.server.ts, which picks the landing's
// language at the edge. The hook's unit tests mock the build and the ASSETS binding, so only the
// adapter output shows whether `/` was prerendered again or left out of the worker's routes.
// Usage: node scripts/check-landing-build.mjs [output dir, default .svelte-kit/cloudflare]
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.svelte-kit/cloudflare');
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
const problems = [];

if (fs.existsSync(path.join(dir, 'index.html'))) {
	problems.push(
		'index.html exists: `/` was prerendered, so it is served as a file and never picks a language'
	);
}
for (const [file, headline] of [
	['en.html', 'Map a repo'],
	['ko.html', '코딩 에이전트로']
]) {
	if (!fs.existsSync(path.join(dir, file))) problems.push(`${file} is missing`);
	else if (!read(file).includes(headline))
		problems.push(`${file} lacks its headline "${headline}"`);
}
const routes = JSON.parse(read('_routes.json'));
if (routes.exclude.includes('/')) {
	problems.push('_routes.json excludes `/`, so Cloudflare serves it without running the worker');
}
if (!routes.include.some((pattern) => pattern === '/' || pattern === '/*')) {
	problems.push('_routes.json does not send `/` to the worker');
}

if (problems.length) {
	console.error(`Landing build check failed in ${dir}:\n- ${problems.join('\n- ')}`);
	process.exit(1);
}
console.log('Landing build check: `/` reaches the worker; en.html and ko.html are built');
