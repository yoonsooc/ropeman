import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CodeMap, RelationRef } from '$lib/types/codeMap';
import type { MapEdge, MapLevel } from '$lib/types/ropemanMap';
import { summarizeHierarchy } from '$lib/services/hierarchySummary';
import { extractDirectory, type Extraction } from '../src/extract';
import {
	MAX_CITED_REFERENCES,
	citedRefs,
	groupExtraction,
	type GroupedMap
} from '../src/groupedMap';

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
		const web = grouped.expand('dir:apps/web')!;

		// Assert: apps/ and packages/ hold one folder each, so their nodes are apps/web and packages/core
		expect(grouped.top.nodes.map((n) => [n.id, n.label])).toEqual([
			['dir:apps/web', 'apps/web'],
			['dir:packages/core', 'packages/core'],
			['dir:shared', 'shared'],
			['files:.', 'ts-monorepo/*']
		]);
		expect(web).toMatchObject({ parentId: 'dir:apps/web', naming: 'grouped' });
		expect(web.nodes.map((n) => n.id)).toEqual(['dir:apps/web/src', 'files:apps/web']);
		expect(web.nodes.find((n) => n.id === 'files:apps/web')?.filePaths).toContain(
			'apps/web/package.json'
		);
		expect(grouped.parentOf('dir:apps/web')).toBeNull();
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
		expect(grouped.expand('dir:apps')).toBeNull();
		expect(grouped.parentOf('dir:nope')).toBeUndefined();
		expect(grouped.parentOf('dir:apps')).toBeUndefined();
		expect(grouped.parentOf('files:nope')).toBeUndefined();
	});

	it('lists every file of a folder node, nested ones included', async () => {
		const extraction = await extractDirectory(fixture, { wasmDir });
		const grouped = groupExtraction(extraction, 'ts-monorepo');
		const under = [...extraction.map.files.keys()].filter((p) => p.startsWith('apps/web/'));
		expect(grouped.filesOf('dir:apps/web').toSorted()).toEqual(under.toSorted());
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
			edge
				.evidence!.refs.filter((ref) => ref.relation === 'imports_from')
				.map((ref) => {
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

	it('adds to the imports only the references the code decides, so an imports-only map is unchanged', async () => {
		// Arrange: go-shop calls across packages and files; stripping its references leaves the imports
		const extraction = await extractDirectory(goShop, { wasmDir });
		const map: CodeMap = {
			...extraction.map,
			files: new Map([...extraction.map.files].map(([p, r]) => [p, { ...r, refs: [] }]))
		};
		const importsOnly: Extraction = { ...extraction, map, hierarchy: summarizeHierarchy(map) };

		// Act
		const full = levels(groupExtraction(extraction, 'go-shop'));
		const bare = levels(groupExtraction(importsOnly, 'go-shop'));

		// Assert: every imports-only edge is there with the same imports, and what is new is EXTRACTED
		const ends = (e: MapEdge) => `${e.source} -> ${e.target}`;
		const refsOf = (e: MapEdge): RelationRef[] => [...e.evidence!.refs];
		expect(full.map((l) => l.parentId)).toEqual(bare.map((l) => l.parentId));
		full.forEach((level, i) => {
			const before = new Map(bare[i].edges.map((e) => [ends(e), e]));
			for (const edge of level.edges) {
				const old = before.get(ends(edge));
				const imports = refsOf(edge).filter((r) => r.relation === 'imports_from');
				expect(imports).toEqual(old ? refsOf(old) : []);
			}
			expect([...before.keys()].every((key) => level.edges.some((e) => ends(e) === key))).toBe(
				true
			);
		});
		const added = full
			.flatMap((l) => l.edges.flatMap(refsOf))
			.filter((r) => r.relation !== 'imports_from');
		expect(added.length).toBeGreaterThan(0);
		expect(added.every((r) => r.confidence === 'EXTRACTED')).toBe(true);
	});
});

describe('groupExtraction on a chain of folders that hold one folder each', () => {
	const scala = fileURLToPath(
		new URL('../../../tests/fixtures/graphs/scala-deep', import.meta.url)
	);
	type Expected = {
		topFolder: string;
		levels: {
			parentId: string | null;
			fileLevel?: true;
			nodes: { id: string; label: string; filePaths: string[] }[];
			edges: [string, string][];
		}[];
	};

	it('shows the first folder that branches, with chains as one node, as the fixture lists them', async () => {
		// Arrange
		const expected: Expected = JSON.parse(await readFile(`${scala}.levels.json`, 'utf8'));
		const grouped = groupExtraction(await extractDirectory(scala, { wasmDir }), 'scala-deep');

		// Act
		const shown = levels(grouped).map((level) => ({
			parentId: level.parentId,
			...(level.fileLevel ? { fileLevel: level.fileLevel } : {}),
			nodes: level.nodes
				.map(({ id, label, filePaths }) => ({ id, label, filePaths: filePaths.toSorted() }))
				.toSorted((a, b) => (a.id < b.id ? -1 : 1)),
			edges: level.edges.map((e): [string, string] => [e.source, e.target]).toSorted()
		}));

		// Assert
		expect(grouped.topFolder).toBe(expected.topFolder);
		expect(shown).toEqual(
			expected.levels.map((level) => ({ ...level, edges: level.edges.toSorted() }))
		);
	});

	it('keeps the folders inside a chain off the map, and answers a chain node by its last folder', async () => {
		const grouped = groupExtraction(await extractDirectory(scala, { wasmDir }), 'scala-deep');
		const app = 'src/main/scala/com/example/app';

		for (const folder of ['src', 'src/main', `${app}`, `${app}/store`, `${app}/web`]) {
			expect(grouped.expand(`dir:${folder}`)).toBeNull();
			expect(grouped.parentOf(`dir:${folder}`)).toBeUndefined();
			expect(grouped.group(`dir:${folder}`)).toBeUndefined();
		}
		expect(grouped.group(`dir:${app}/web/http`)?.path).toBe(`${app}/web/http`);
		expect(grouped.parentOf(`dir:${app}/web/http`)).toBeNull();
		expect(grouped.parentOf(`files:${app}`)).toBeNull();
		expect(grouped.parentOf(`dir:${app}/web/http/json`)).toBe(`dir:${app}/web/http`);
		// A folder of files alone opens to its files: its files: part is never a node
		expect(grouped.expand(`files:${app}/store/memory`)).toBeNull();
		expect(grouped.parentOf(`files:${app}/store/memory`)).toBeUndefined();
		expect(grouped.filesOf(`dir:${app}/store`)).toEqual([]);
	});

	it.each([
		'go-shop',
		'poly-shop',
		'py-shop',
		'rust-shop',
		'scala-deep',
		'svelte-app',
		'ts-monorepo'
	])('leaves no folder level of %s with a single part', async (name) => {
		const dir = fileURLToPath(new URL(`../../../tests/fixtures/graphs/${name}`, import.meta.url));
		const extraction = await extractDirectory(dir, { wasmDir });

		const all = levels(groupExtraction(extraction, name));

		expect(all.filter((l) => l.nodes.length < 2).map((l) => l.parentId)).toEqual([]);
		const top = all[0].nodes.flatMap((n) => n.filePaths).toSorted();
		expect(top).toEqual([...extraction.map.files.keys()].toSorted());
	});
});

describe('citedRefs', () => {
	const ref = (path: string, line: number, relation: RelationRef['relation'], toPath = 'b.ts') =>
		({
			path,
			line,
			relation,
			toPath,
			confidence: 'EXTRACTED'
		}) as RelationRef;

	it('keeps every import, then one call per file pair and kind at its lowest line', () => {
		// Arrange
		const refs = [
			ref('a.ts', 9, 'calls'),
			ref('a.ts', 1, 'imports_from'),
			ref('a.ts', 2, 'imports_from'),
			ref('a.ts', 4, 'calls'),
			ref('a.ts', 5, 'inherits'),
			ref('c.ts', 7, 'calls')
		];

		// Act
		const cited = citedRefs(refs);

		// Assert
		expect(cited.map((r) => `${r.path}:${r.line} ${r.relation}`)).toEqual([
			'a.ts:1 imports_from',
			'a.ts:2 imports_from',
			'a.ts:4 calls',
			'a.ts:5 inherits',
			'c.ts:7 calls'
		]);
	});

	it('cites at most MAX_CITED_REFERENCES references beside the imports', () => {
		// Arrange: as many caller files as twice the cap, and three imports
		const calls = Array.from({ length: 2 * MAX_CITED_REFERENCES }, (_, i) =>
			ref(`f${i}.ts`, 3, 'calls')
		);
		const imports = [1, 2, 3].map((line) => ref('a.ts', line, 'imports_from'));

		// Act
		const cited = citedRefs([...calls, ...imports]);

		// Assert
		expect(cited.filter((r) => r.relation === 'imports_from')).toEqual(imports);
		expect(cited.filter((r) => r.relation === 'calls')).toEqual(
			calls.slice(0, MAX_CITED_REFERENCES)
		);
	});
});

const goShop = fileURLToPath(new URL('../../../tests/fixtures/graphs/go-shop', import.meta.url));

/** Every level of a grouped map, top first, each expanded node after its parent's level */
function levels(grouped: GroupedMap): MapLevel[] {
	const out: MapLevel[] = [];
	const visit = (level: MapLevel) => {
		out.push(level);
		for (const node of level.nodes) {
			const child = grouped.expand(node.id);
			if (child) visit(child);
		}
	};
	visit(grouped.top);
	return out;
}
