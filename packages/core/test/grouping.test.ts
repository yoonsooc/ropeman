import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
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

	it('expands only subfolders and files: nodes of two or more files', async () => {
		const grouped = groupExtraction(await extractDirectory(fixture, { wasmDir }), 'ts-monorepo');
		expect(grouped.expand('files:.')).toMatchObject({ parentId: 'files:.', fileLevel: true });
		expect(grouped.expand('files:packages/core')).toBeNull();
		expect(grouped.expand('file:package.json')).toBeNull();
		expect(grouped.expand('files:nope')).toBeNull();
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

	it('opens the files of a files: node with the imports among them, as the truth lists them', async () => {
		// Arrange
		const shop = fileURLToPath(new URL('../../../tests/fixtures/graphs/py-shop', import.meta.url));
		const truth: { edges: { kind: string; from: string; line: number; to: string }[] } = JSON.parse(
			await readFile(`${shop}.truth.json`, 'utf8')
		);
		const grouped = groupExtraction(await extractDirectory(shop, { wasmDir }), 'py-shop');
		const inShop = (path: string) => /^shop\/[^/]+$/.test(path);

		// Act
		const level = grouped.expand('files:shop')!;

		// Assert
		expect(level).toMatchObject({ parentId: 'files:shop', naming: 'grouped', fileLevel: true });
		const shopNode = grouped.expand('dir:shop')!.nodes.find((n) => n.id === 'files:shop')!;
		expect(level.nodes).toEqual(
			shopNode.filePaths.map((path) => ({
				id: `file:${path}`,
				label: path.slice('shop/'.length),
				description: '',
				filePaths: [path],
				keySymbols: []
			}))
		);
		const imports = level.edges.flatMap((edge) =>
			edge.evidence!.refs.map((ref) => {
				expect([edge.source, edge.target]).toEqual([`file:${ref.path}`, `file:${ref.toPath}`]);
				return `${ref.path}:${ref.line} -> ${ref.toPath} ${ref.confidence}`;
			})
		);
		const expected = truth.edges
			.filter((e) => e.kind === 'imports_from' && inShop(e.from) && inShop(e.to))
			.map((e) => `${e.from}:${e.line} -> ${e.to} EXTRACTED`);
		expect(imports.toSorted()).toEqual(expected.toSorted());
		expect(level.edges.every((e) => e.type === 'depends_on' && e.label === null)).toBe(true);
	});

	it('leaves a node of one file unexpanded: the file opens as it is', async () => {
		const shop = fileURLToPath(new URL('../../../tests/fixtures/graphs/py-shop', import.meta.url));
		const grouped = groupExtraction(await extractDirectory(shop, { wasmDir }), 'py-shop');
		expect(grouped.top.nodes.find((n) => n.id === 'files:.')?.filePaths).toEqual([
			'pyproject.toml'
		]);
		expect(grouped.expand('files:.')).toBeNull();
	});
});
