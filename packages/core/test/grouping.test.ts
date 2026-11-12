import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { extractDirectory } from '../src/extract';
import { groupExtraction } from '../src/groupedMap';

const wasmDir = fileURLToPath(new URL('../../../static', import.meta.url));
const fixture = fileURLToPath(
	new URL('../../../tests/fixtures/graphs/ts-monorepo', import.meta.url)
);

describe('groupExtraction', () => {
	it('names each node by the folder part it holds, so any level rebuilds from its id', async () => {
		// Arrange
		const extraction = await extractDirectory(fixture, { wasmDir });

		// Act
		const grouped = groupExtraction(extraction, 'ts-monorepo');
		const apps = grouped.expand('dir:apps')!;
		const web = grouped.expand('dir:apps/web')!;

		// Assert
		expect(grouped.top.nodes.map((n) => n.id)).toEqual([
			'dir:apps',
			'dir:packages',
			'dir:shared',
			'files:.'
		]);
		expect(apps).toMatchObject({ parentId: 'dir:apps', naming: 'grouped' });
		expect(apps.nodes.map((n) => n.id)).toEqual(['dir:apps/web']);
		expect(web.nodes.find((n) => n.id === 'files:apps/web')?.filePaths).toContain(
			'apps/web/package.json'
		);
		expect(grouped.parentOf('dir:apps')).toBeNull();
		expect(grouped.parentOf('files:.')).toBeNull();
		expect(grouped.parentOf('dir:apps/web/src')).toBe('dir:apps/web');
		expect(grouped.parentOf('files:apps/web')).toBe('dir:apps/web');
	});

	it('expands only subfolders', async () => {
		const grouped = groupExtraction(await extractDirectory(fixture, { wasmDir }), 'ts-monorepo');
		expect(grouped.expand('files:.')).toBeNull();
		expect(grouped.expand('dir:')).toBeNull();
		expect(grouped.expand('dir:nope')).toBeNull();
		expect(grouped.parentOf('dir:nope')).toBeUndefined();
		expect(grouped.parentOf('files:nope')).toBeUndefined();
	});

	it('lists every file of a folder node, nested ones included', async () => {
		const extraction = await extractDirectory(fixture, { wasmDir });
		const grouped = groupExtraction(extraction, 'ts-monorepo');
		const under = [...extraction.map.files.keys()].filter((p) => p.startsWith('apps/'));
		expect(grouped.filesOf('dir:apps').toSorted()).toEqual(under.toSorted());
	});
});
