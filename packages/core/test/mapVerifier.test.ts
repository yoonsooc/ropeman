import { describe, it, expect } from 'vitest';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RopemanMap } from '$lib/types/ropemanMap';
import { parseRopemanMap } from '$lib/services/ropemanMapSchema';
import { verifyMap } from '$lib/services/mapVerifier';
import { extractDirectory, type Extraction } from '../src/extract';
import { groupedMap } from './groupedMap';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const wasmDir = join(repo, 'static');

/** The map as a reader gets it: written to JSON and parsed back. */
function roundTrip(map: RopemanMap): { map: RopemanMap; bytes: number } {
	const text = JSON.stringify(map);
	const parsed = parseRopemanMap(text);
	if (!parsed.ok) throw new Error(`${parsed.code} at ${parsed.at}: ${parsed.message}`);
	return { map: parsed.value, bytes: Buffer.byteLength(text) };
}

/**
 * One mistake per rule, each on its own copy of a real map, with the codes it must raise. The
 * mistakes go on `files:` nodes, which no level expands, so none spills into a child level.
 */
const FAULTS: { rule: string; codes: string[]; make: (map: RopemanMap) => void }[] = [
	{
		rule: 'assignment',
		codes: ['file-duplicated'],
		make: (map) => {
			const level = map.levels.find((l) => l.nodes.length > 1 && l.nodes.some(isLeaf))!;
			const leaf = level.nodes.find(isLeaf)!;
			leaf.filePaths.push(level.nodes.find((n) => n !== leaf)!.filePaths[0]);
		}
	},
	{
		rule: 'path',
		codes: ['path-invalid'],
		make: (map) => {
			const leaf = map.levels.flatMap((l) => l.nodes).find(isLeaf)!;
			leaf.filePaths.push(`../${leaf.filePaths[0]}`);
		}
	},
	{
		rule: 'evidence',
		codes: ['evidence-unknown'],
		make: (map) => {
			const edge = map.levels.flatMap((l) => l.edges).find((e) => e.evidence?.refs.length)!;
			edge.evidence!.refs[0].line += 1000;
		}
	}
];

const isLeaf = (node: { id: string }) => node.id.startsWith('files:');

function faultCodes(map: RopemanMap, extraction: Extraction): Record<string, string[]> {
	return Object.fromEntries(
		FAULTS.map(({ rule, make }) => {
			const broken = structuredClone(map);
			make(broken);
			const codes = verifyMap(broken, extraction.map).violations.map((v) => v.code);
			return [rule, [...new Set(codes)]];
		})
	);
}

const expectedFaults = Object.fromEntries(FAULTS.map(({ rule, codes }) => [rule, codes]));

describe('verifyMap on maps grouped from a Node extraction', () => {
	it.each([
		'tests/fixtures/graphs/py-shop',
		'tests/fixtures/graphs/svelte-app',
		'tests/fixtures/graphs/ts-monorepo'
	])('passes the grouped map of %s and reports faults put into it', async (relative) => {
		const extraction = await extractDirectory(join(repo, relative), { wasmDir });
		const { map } = roundTrip(groupedMap(extraction, basename(relative)));

		const clean = verifyMap(map, extraction.map);

		expect(clean.violations).toEqual([]);
		expect(clean.checked.files).toBe(extraction.map.files.size + extraction.skipped.length);
		expect(clean.checked.refs).toBeGreaterThan(0);
		expect(faultCodes(map, extraction)).toEqual(expectedFaults);
	});
});

/**
 * The PASEO measurement for docs/ARCH.md: `ROPEMAN_VERIFY_DIR=<folder> npx vitest run
 * packages/core/test/mapVerifier.test.ts`. Skipped when the variable is not set.
 */
describe.runIf(process.env.ROPEMAN_VERIFY_DIR)('verifyMap on ROPEMAN_VERIFY_DIR', () => {
	it('verifies the grouped map and reports its numbers', { timeout: 300_000 }, async () => {
		const dir = process.env.ROPEMAN_VERIFY_DIR!;
		const extraction = await extractDirectory(dir, { wasmDir });
		const built = groupedMap(extraction, basename(dir));
		const parseStart = performance.now();
		const { map, bytes } = roundTrip(built);
		const parseMs = performance.now() - parseStart;

		const runs: number[] = [];
		let result = verifyMap(map, extraction.map);
		for (let i = 0; i < 7; i++) {
			const start = performance.now();
			result = verifyMap(map, extraction.map);
			runs.push(performance.now() - start);
		}
		runs.sort((a, b) => a - b);
		const faults = faultCodes(map, extraction);

		process.stdout.write(
			`${JSON.stringify({
				files: extraction.map.files.size,
				skipped: extraction.skipped.length,
				mapBytes: bytes,
				parseMs: Math.round(parseMs),
				checked: result.checked,
				violations: result.violations.length,
				verifyMs: {
					median: +runs[3].toFixed(1),
					min: +runs[0].toFixed(1),
					max: +runs[6].toFixed(1),
					runs: 7
				},
				faults
			})}\n`
		);
		expect(result.violations).toEqual([]);
		expect(faults).toEqual(expectedFaults);
	});
});
