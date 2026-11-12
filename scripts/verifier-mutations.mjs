#!/usr/bin/env node

/**
 * Mutation check for the map verifier (T2-3). Each mutant changes the verifier one way and the
 * unit tests must then fail. Three kinds: silence one `report(...)` call site (a code reported
 * from two places gets two mutants), weaken one condition (a check that looks at one end of a
 * ref instead of both), and add an app import. A mutant that passes is a behavior no test pins.
 *
 * Usage: node scripts/verifier-mutations.mjs
 * Rewrites src/lib/services/mapVerifier.ts while it runs and restores it at the end.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/lib/services/mapVerifier.ts';
const TESTS = ['src/lib/services/mapVerifier.test.ts', 'src/lib/services/ropemanMapSchema.test.ts'];
const NOOP = '((..._: unknown[]) => {})(';

/** Each `from` must appear exactly once, so a refactor that moves it fails here, not silently. */
const WEAKENED = [
	{
		name: 'evidence-ends checks only the source end',
		from: 'if (!source.has(from) || !target.has(to)) {',
		to: 'if (!source.has(from)) {'
	},
	{
		name: 'evidence-ends checks only the target end',
		from: 'if (!source.has(from) || !target.has(to)) {',
		to: 'if (!target.has(to)) {'
	},
	{
		name: 'coverage-mismatch only for a read file missing from the code map',
		from: 'if (READ_REASONS.has(reason) !== files.has(k)) {',
		to: 'if (READ_REASONS.has(reason) && !files.has(k)) {'
	},
	{
		name: 'coverage-mismatch only for an unread file the code map has',
		from: 'if (READ_REASONS.has(reason) !== files.has(k)) {',
		to: 'if (!READ_REASONS.has(reason) && files.has(k)) {'
	},
	{
		name: 'evidence-confidence only when the relation has no confidence',
		from: '} else if (!found.has(ref.confidence)) {',
		to: '} else if (found.size === 0) {'
	},
	{
		name: 'paths compared as written, not in NFC',
		from: "const nfc = (text: string) => text.normalize('NFC');",
		to: 'const nfc = (text: string) => text;'
	},
	{
		name: 'isNormalizedPath lets `..` through',
		from: "segment !== '' && segment !== '.' && segment !== '..'",
		to: "segment !== '' && segment !== '.'"
	},
	{
		name: 'endFile drops the last character of an id with no `#` (the #76 slice)',
		from: "if (to.kind === 'external') return null;",
		to: "if (to.kind === 'external') return null;\n\tif (!to.id.includes('#')) return to.id.slice(0, -1) as FilePath;"
	},
	{
		name: 'endFile takes the last `#` without asking the code map',
		from: 'if (codeFiles.has(path)) return path;',
		to: 'return path;'
	},
	{
		name: 'key symbols read top-level names only',
		from: 'walk(children, dotted);',
		to: ''
	},
	{
		name: 'key symbols looked up in every node of the level',
		from: 'const files = [...nodeFiles.get(node.id)!];',
		to: 'const files = [...nodeFiles.values()].flatMap((set) => [...set]);'
	},
	{
		name: 'assignment-left-out only checks leftOut against the scope size',
		from: 'if (leftOut > 0 && ![...owned.values()].includes(leftOut)) {',
		to: 'if (leftOut > scope.size) {'
	},
	{
		name: 'every INFERRED edge counted unverified and its refs left unchecked',
		from: 'if (edge.evidence.refs.length === 0) {',
		to: "if (edge.evidence.confidence === 'INFERRED') {"
	}
];

const original = readFileSync(SOURCE, 'utf8');

const sites = [...original.matchAll(/\breport\(\s*'([a-z-]+)'/g)];
const siteMutants = sites.map((match, i) => {
	const nth = sites.slice(0, i).filter((m) => m[1] === match[1]).length + 1;
	return {
		name: `silence report('${match[1]}') #${nth}`,
		source: original.slice(0, match.index) + NOOP + original.slice(match.index + 'report('.length)
	};
});

const conditionMutants = WEAKENED.map(({ name, from, to }) => {
	const count = original.split(from).length - 1;
	if (count !== 1) throw new Error(`${SOURCE} has ${count} copies of: ${from}`);
	return { name, source: original.replace(from, to) };
});

const codes = [
	...readFileSync('src/lib/types/mapVerification.ts', 'utf8').matchAll(
		/^\t'([a-z-]+)': '(?:assignment|path|evidence)',?$/gm
	)
].map((m) => m[1]);
const silent = codes.filter((code) => !sites.some((m) => m[1] === code));
if (silent.length > 0) throw new Error(`No report site for: ${silent.join(', ')}`);

const mutants = [
	...siteMutants,
	...conditionMutants,
	{
		name: 'import an app store',
		source: `import '$lib/stores/projectStore.svelte';\n${original}`
	}
];

function testsPass() {
	try {
		execFileSync('npx', ['vitest', 'run', ...TESTS], { stdio: 'pipe', timeout: 120_000 });
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
	`${mutants.length - survived}/${mutants.length} mutants killed (${siteMutants.length} report sites, ${conditionMutants.length} weakened conditions, ${codes.length} codes)`
);
process.exit(survived === 0 ? 0 : 1);
