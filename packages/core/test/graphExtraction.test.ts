import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractGraphFile, LOW_COVERAGE } from '../src/graphExtraction';

let root: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-graph-'));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text = 'export const x = 1;\n') {
	fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	fs.writeFileSync(path.join(root, rel), text);
}

/** A Graphify graph.json with one file node and one function per path. */
function graphOf(
	paths: string[],
	header: object = { schema_version: 1, graphify_version: '0.9.104' }
) {
	const nodes = paths.flatMap((p) => [
		{
			id: p,
			label: p.split('/').pop(),
			_origin: 'ast',
			file_type: 'code',
			source_file: p,
			source_location: 'L1'
		},
		{
			id: `${p}#f`,
			label: 'f()',
			_origin: 'ast',
			file_type: 'code',
			source_file: p,
			source_location: 'L2'
		}
	]);
	const links = paths.map((p) => ({
		source: p,
		target: `${p}#f`,
		relation: 'contains',
		_origin: 'ast',
		confidence: 'EXTRACTED',
		source_file: p,
		source_location: 'L2'
	}));
	return { directed: false, multigraph: false, graph: header, nodes, links };
}

function writeGraph(json: unknown, rel = 'graphify-out/graph.json'): string {
	write(rel, JSON.stringify(json));
	return path.join(root, rel);
}

describe('extractGraphFile', () => {
	it('maps the graph files on disk and counts what the graph leaves out', async () => {
		// Arrange
		for (const p of ['server/a.ts', 'server/b.ts', 'app/ui/c.tsx', 'app/ui/d.tsx', 'README.md'])
			write(p);
		write('package.json', '{}');
		const file = writeGraph(graphOf(['server/a.ts', 'server/b.ts', 'server/gone.ts']));

		// Act
		const read = await extractGraphFile(root, file);

		// Assert
		if (!read.ok) throw new Error(read.message);
		expect([...read.extraction.map.files.keys()]).toEqual(['server/a.ts', 'server/b.ts']);
		expect(read.writer).toEqual({ name: 'graphify', version: '0.9.104' });
		expect(read.coverage).toEqual({
			codeFiles: 4,
			covered: 2,
			ratio: 0.5,
			low: true,
			missing: 2,
			missingByFolder: [{ folder: 'app/ui', files: 2 }],
			missingByExtension: [{ extension: '.tsx', files: 2 }],
			notOnDisk: 1,
			notOnDiskExamples: ['server/gone.ts']
		});
		expect(read.issues['not-on-disk']).toBe(2);
		expect(read.extraction.listed).toBe(7);
		expect(read.extraction.folders).toEqual(
			expect.arrayContaining(['', 'server', 'app', 'app/ui'])
		);
	});

	it('is not low coverage at the threshold', async () => {
		// Arrange
		const paths = Array.from({ length: 10 }, (_, i) => `src/f${i}.py`);
		for (const p of paths) write(p);
		const file = writeGraph(graphOf(paths.slice(0, LOW_COVERAGE * 10)));

		// Act
		const read = await extractGraphFile(root, file);

		// Assert
		expect(read.ok && read.coverage).toMatchObject({ ratio: LOW_COVERAGE, low: false });
	});

	it('leaves out files the walk does not list and env files', async () => {
		// Arrange
		write('src/a.ts');
		write('node_modules/x/index.js');
		write('.env.ts', 'SECRET=1\n');
		const file = writeGraph(graphOf(['src/a.ts', 'node_modules/x/index.js', '.env']));

		// Act
		const read = await extractGraphFile(root, file);

		// Assert
		expect(read.ok && [...read.extraction.map.files.keys()]).toEqual(['src/a.ts']);
		expect(read.ok && read.coverage.notOnDisk).toBe(2);
	});

	it.each([
		[
			'not-json',
			() => (
				write('graphify-out/graph.json', '{"nodes": ['),
				path.join(root, 'graphify-out/graph.json')
			)
		],
		['unreadable', () => path.join(root, 'graphify-out/none.json')],
		['schema-version', () => writeGraph({ graph: {}, nodes: [], links: [] })],
		[
			'graphicle',
			() =>
				writeGraph(
					graphOf(['a.ts'], { schema_version: 1, graphicle_version: '0.9.103-graphicle.0.1.18' })
				)
		],
		['no-files-on-disk', () => writeGraph(graphOf(['elsewhere/a.ts']))],
		['malformed', () => writeGraph({ graph: { schema_version: 1, graphify_version: '0.9.104' } })],
		['no-files-on-disk', () => writeGraph(graphOf([]))]
	])('refuses with %s', async (code, make) => {
		// Arrange
		write('src/a.ts');
		const file = make();

		// Act
		const read = await extractGraphFile(root, file);

		// Assert
		expect(read).toMatchObject({ ok: false, code });
		expect(!read.ok && read.message.length).toBeGreaterThan(0);
	});
});
