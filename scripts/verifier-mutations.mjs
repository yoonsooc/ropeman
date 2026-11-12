#!/usr/bin/env node

/**
 * Mutation check for the map verifier (T2-3): turn off one violation code at a time, or add an
 * app import, and require the unit tests to fail. A code whose mutant passes has no test.
 *
 * Usage: node scripts/verifier-mutations.mjs
 * Rewrites src/lib/services/mapVerifier.ts while it runs and restores it at the end.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/lib/services/mapVerifier.ts';
const TESTS = ['src/lib/services/mapVerifier.test.ts', 'src/lib/services/ropemanMapSchema.test.ts'];
const REPORT = 'const report: Report = (code, at, where, message) => {';

const original = readFileSync(SOURCE, 'utf8');
if (!original.includes(REPORT)) throw new Error(`${SOURCE} no longer has the line: ${REPORT}`);
const codes = [
	...readFileSync('src/lib/types/mapVerification.ts', 'utf8').matchAll(
		/^\t'([a-z-]+)': '(?:assignment|path|evidence)',?$/gm
	)
].map((m) => m[1]);

const mutants = [
	...codes.map((code) => ({
		name: `drop ${code}`,
		source: original.replace(REPORT, `${REPORT}\n\t\tif (code === '${code}') return;`)
	})),
	{
		name: 'import an app store',
		source: `import '$lib/stores/projectStore.svelte';\n${original}`
	}
];

function testsPass() {
	try {
		execFileSync('npx', ['vitest', 'run', ...TESTS], { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

const restore = () => writeFileSync(SOURCE, original);
process.on('SIGINT', () => {
	restore();
	process.exit(130);
});

let survived = 0;
try {
	if (!testsPass()) throw new Error('The tests fail before any mutation.');
	for (const mutant of mutants) {
		writeFileSync(SOURCE, mutant.source);
		const killed = !testsPass();
		if (!killed) survived++;
		console.log(`${killed ? 'killed  ' : 'SURVIVED'} ${mutant.name}`);
	}
} finally {
	restore();
}
console.log(
	`${mutants.length - survived}/${mutants.length} mutants killed (${codes.length} codes)`
);
process.exit(survived === 0 ? 0 : 1);
