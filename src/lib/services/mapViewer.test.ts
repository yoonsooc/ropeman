import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_MAP_BYTES } from '$lib/types/ropemanMap';
import { readMapFile, toViewerLevels } from './mapViewer';
import { parseRopemanMap } from './ropemanMapSchema';

vi.mock('./semanticAnalysisService', () => ({
	SEMANTIC_COLORS: ['#111111', '#222222']
}));

const FIXTURE = fileURLToPath(
	new URL('../../../tests/fixtures/ropeman-map/ropeman.json', import.meta.url)
);
const fixtureText = fs.readFileSync(FIXTURE, 'utf8');

function fixtureMap() {
	const result = parseRopemanMap(fixtureText);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

describe('readMapFile', () => {
	it('reads a ropeman.json file', async () => {
		const result = await readMapFile(new Blob([fixtureText]));

		expect(result.ok).toBe(true);
	});

	it('refuses a file over the cap from its size, without reading it', async () => {
		const huge = { size: MAX_MAP_BYTES + 1, text: vi.fn() } as unknown as Blob;

		const result = await readMapFile(huge);

		expect(result).toMatchObject({ ok: false, code: 'too-large' });
		expect(huge.text).not.toHaveBeenCalled();
	});
});

describe('toViewerLevels', () => {
	it('keys the top level as the semantic store does and each other level by its node', () => {
		const levels = toViewerLevels(fixtureMap());

		expect([...levels.keys()]).toEqual(['__root__', 'sem:api']);
		expect(levels.get('sem:api')?.breadcrumbLabel).toBe('HTTP API');
	});

	it('derives depth, parent and file count, and colors nodes from the app palette', () => {
		const levels = toViewerLevels(fixtureMap());

		const root = levels.get('__root__')!;
		const child = levels.get('sem:api')!;
		expect(root.nodes.map((n) => n.color)).toEqual(['#111111', '#222222', '#111111']);
		expect(root.nodes[0]).toMatchObject({ depth: 0, parentId: null, fileCount: 2 });
		expect(child.nodes[0]).toMatchObject({ depth: 1, parentId: 'sem:api', fileCount: 1 });
	});

	it('keeps edge evidence and gives each edge an id', () => {
		const root = toViewerLevels(fixtureMap()).get('__root__')!;

		expect(root.edges.map((e) => [e.id, e.evidence?.confidence, e.label])).toEqual([
			['map-edge:0:sem:api->sem:storage', 'EXTRACTED', 'reads orders'],
			['map-edge:1:sem:ui->sem:api', 'INFERRED', undefined]
		]);
	});
});
