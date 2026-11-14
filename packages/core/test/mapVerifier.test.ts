import { describe, it, expect } from 'vitest';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeMap } from '$lib/types/codeMap';
import type { MapLevel, RopemanMap } from '$lib/types/ropemanMap';
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
 * mistakes go on a file level, which expands no node, so none spills into a child level.
 */
const FAULTS: { rule: string; codes: string[]; make: (map: RopemanMap) => void }[] = [
	{
		rule: 'assignment',
		codes: ['file-duplicated', 'file-unassigned'],
		make: (map) => {
			const [first, second] = fileLevel(map).nodes;
			first.filePaths = [...second.filePaths];
		}
	},
	{
		rule: 'path',
		codes: ['path-invalid', 'file-unassigned'],
		make: (map) => {
			const [file] = fileLevel(map).nodes;
			file.filePaths = [`../${file.filePaths[0]}`];
		}
	},
	{
		rule: 'evidence on a file level',
		codes: ['evidence-ends'],
		make: (map) => {
			const level = map.levels.find((l) => l.fileLevel && l.edges.length > 0)!;
			const [edge] = level.edges;
			edge.source = level.nodes.find((n) => n.id !== edge.source && n.id !== edge.target)!.id;
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

/** The first file level, without its edges, so a fault in its files trips no evidence check. */
function fileLevel(map: RopemanMap): MapLevel {
	const level = map.levels.find((l) => l.fileLevel)!;
	level.edges = [];
	return level;
}

function check(map: RopemanMap, codeMap: CodeMap) {
	const result = verifyMap(map, codeMap);
	if (!result.parsed) throw new Error(`${result.failure.code} at ${result.failure.at}`);
	return result;
}

function faultCodes(map: RopemanMap, extraction: Extraction): Record<string, string[]> {
	return Object.fromEntries(
		FAULTS.map(({ rule, make }) => {
			const broken = structuredClone(map);
			make(broken);
			const codes = check(broken, extraction.map).violations.map((v) => v.code);
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

		const clean = check(map, extraction.map);

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
		let result = check(map, extraction.map);
		for (let i = 0; i < 7; i++) {
			const start = performance.now();
			result = check(map, extraction.map);
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
