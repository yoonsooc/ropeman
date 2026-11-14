import { describe, it, expect } from 'vitest';
import {
	edgePoints,
	layoutLevel,
	screenAspect,
	type LayoutEdge,
	type LevelLayout,
	type NodePlacement,
	type Point
} from './levelLayout';

const SIZE = { width: 256, height: 176 };
const WIDE = 1.75;
const TALL = 0.55;
const ASPECTS = [WIDE, TALL];

interface Graph {
	ids: string[];
	edges: LayoutEdge[];
}

function ids(prefix: string, n: number): string[] {
	return Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`);
}

function edge(source: string, target: string): LayoutEdge {
	return { id: `${source}->${target}`, source, target };
}

function isolatedOnly(n: number): Graph {
	return { ids: ids('n', n), edges: [] };
}

function star(leaves: number): Graph {
	const leafIds = ids('leaf', leaves);
	return { ids: ['hub', ...leafIds], edges: leafIds.map((leaf) => edge(leaf, 'hub')) };
}

function chain(n: number): Graph {
	const nodes = ids('c', n);
	return { ids: nodes, edges: nodes.slice(1).map((id, i) => edge(nodes[i], id)) };
}

function cycle(): Graph {
	return {
		ids: ['a', 'b', 'c', 'd', 'loose'],
		edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('c', 'd')]
	};
}

/** Deterministic pseudo-random DAG: `linked` nodes share edges, the rest have none. */
function randomLevel(linked: number, isolated: number, edgeCount: number, seed: number): Graph {
	let state = seed;
	const next = () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
	const nodes = ids('r', linked);
	const edges: LayoutEdge[] = [];
	for (let i = 0; i < edgeCount; i++) {
		const a = Math.floor(next() * linked);
		const b = Math.floor(next() * linked);
		if (a !== b)
			edges.push({ id: `e${i}`, source: nodes[Math.min(a, b)], target: nodes[Math.max(a, b)] });
	}
	return { ids: [...nodes, ...ids('iso', isolated)], edges };
}

/** The reported file level: a tree importing a few hubs, plus many files with no imports. */
function treeWithLooseFiles(): Graph {
	const tree = ids('t', 45);
	const edges: LayoutEdge[] = [];
	tree.slice(5).forEach((id, i) => {
		edges.push(edge(id, tree[i % 5]));
		if (i % 3 === 0) edges.push(edge(id, tree[(i + 2) % 5]));
	});
	return { ids: [...tree, ...ids('loose', 29)], edges };
}

/** The same graph with its nodes and edges listed in another order. */
function shuffled(g: Graph, seed: number): Graph {
	let state = seed;
	const next = () => {
		state = (state * 48271) % 2147483647;
		return state;
	};
	const shuffle = <T>(xs: T[]) =>
		xs
			.map((x) => ({ x, k: next() }))
			.sort((a, b) => a.k - b.k)
			.map(({ x }) => x);
	return { ids: shuffle([...g.ids]), edges: shuffle(g.edges.map((e) => ({ ...e }))) };
}

const CASES: [string, Graph][] = [
	['two linked nodes', chain(2)],
	['8 nodes, no edges', isolatedOnly(8)],
	['100 nodes, no edges', isolatedOnly(100)],
	['star of 40', star(40)],
	['chain of 12', chain(12)],
	['a cycle', cycle()],
	['tree with loose files', treeWithLooseFiles()],
	['200 random nodes', randomLevel(140, 60, 220, 7)]
];

function layout(g: Graph, aspect: number): LevelLayout {
	return layoutLevel(g.ids, g.edges, SIZE, aspect);
}

function bounds(placements: Map<string, NodePlacement>) {
	const ps = [...placements.values()];
	const minX = Math.min(...ps.map((p) => p.x));
	const minY = Math.min(...ps.map((p) => p.y));
	const maxX = Math.max(...ps.map((p) => p.x + SIZE.width));
	const maxY = Math.max(...ps.map((p) => p.y + SIZE.height));
	return { width: maxX - minX, height: maxY - minY };
}

function aspectOf(placements: Map<string, NodePlacement>): number {
	const { width, height } = bounds(placements);
	return width / height;
}

/**
 * Where the canvas puts an edge's ends: the card spreads its handles evenly along the side the
 * flow leaves (source) or enters (target), in the order the level lists the edges.
 */
function handlePoints(g: Graph, nodes: Map<string, NodePlacement>): Map<string, [Point, Point]> {
	const count = (key: 'source' | 'target', id: string) =>
		g.edges.filter((e) => e[key] === id).length;
	const seen = new Map<string, number>();
	const point = (key: 'source' | 'target', id: string): Point => {
		const p = nodes.get(id)!;
		const i = seen.get(`${key}:${id}`) ?? 0;
		seen.set(`${key}:${id}`, i + 1);
		const share = (i + 1) / (count(key, id) + 1);
		if (p.direction === 'LR') {
			return { x: key === 'source' ? p.x + SIZE.width : p.x, y: p.y + SIZE.height * share };
		}
		return { x: p.x + SIZE.width * share, y: key === 'source' ? p.y + SIZE.height : p.y };
	};
	return new Map(
		g.edges.map((e) => [e.id, [point('source', e.source), point('target', e.target)]])
	);
}

/** Cards an edge's path passes over, other than the two it joins. */
function cardsCrossed(g: Graph, result: LevelLayout): string[] {
	const ends = handlePoints(g, result.nodes);
	const hits: string[] = [];
	for (const e of g.edges) {
		const route = result.routes.get(e.id);
		if (!route) continue;
		const [source, target] = ends.get(e.id)!;
		const points = edgePoints(route, source, target);
		for (let i = 1; i < points.length; i++) {
			const [a, b] = [points[i - 1], points[i]];
			if (a.x !== b.x && a.y !== b.y) hits.push(`${e.id} runs diagonally`);
			for (const [id, p] of result.nodes) {
				if (id === e.source || id === e.target) continue;
				const overX = Math.min(a.x, b.x) < p.x + SIZE.width - 0.5 && Math.max(a.x, b.x) > p.x + 0.5;
				const overY =
					Math.min(a.y, b.y) < p.y + SIZE.height - 0.5 && Math.max(a.y, b.y) > p.y + 0.5;
				if (overX && overY) hits.push(`${e.id} over ${id}`);
			}
		}
	}
	return hits;
}

describe('layoutLevel', () => {
	it.each(CASES)('places every node of %s exactly once', (_, g) => {
		for (const aspect of ASPECTS) {
			// Act
			const { nodes } = layout(g, aspect);
			// Assert
			expect([...nodes.keys()].sort()).toEqual([...g.ids].sort());
		}
	});

	it.each(CASES)('gives %s the same positions whatever order its input lists', (_, g) => {
		for (const aspect of ASPECTS) {
			// Act
			const first = layout(g, aspect);
			const reordered = layout(shuffled(g, 11), aspect);
			// Assert
			expect(Object.fromEntries(reordered.nodes)).toEqual(Object.fromEntries(first.nodes));
			expect(Object.fromEntries(reordered.routes)).toEqual(Object.fromEntries(first.routes));
		}
	});

	it.each(CASES)('keeps at least a 32px gap between the cards of %s', (_, g) => {
		for (const aspect of ASPECTS) {
			// Act
			const ps = [...layout(g, aspect).nodes.values()];
			// Assert
			for (let i = 0; i < ps.length; i++) {
				for (let j = i + 1; j < ps.length; j++) {
					const apartX = Math.abs(ps[i].x - ps[j].x) >= SIZE.width + 32;
					const apartY = Math.abs(ps[i].y - ps[j].y) >= SIZE.height + 32;
					expect(apartX || apartY, `${aspect}: nodes ${i} and ${j} overlap`).toBe(true);
				}
			}
		}
	});

	it.each([
		['100 nodes, no edges', isolatedOnly(100)],
		['star of 40', star(40)],
		['chain of 12', chain(12)],
		['chain of 30', chain(30)],
		['tree with loose files', treeWithLooseFiles()],
		['200 random nodes', randomLevel(140, 60, 220, 7)]
	] as [string, Graph][])('shapes %s within 1.5x of the screen aspect on both screens', (_, g) => {
		for (const aspect of ASPECTS) {
			// Act
			const ratio = aspectOf(layout(g, aspect).nodes) / aspect;
			// Assert
			expect(ratio, `${aspect}`).toBeGreaterThan(1 / 1.5);
			expect(ratio, `${aspect}`).toBeLessThan(1.5);
		}
	});

	it.each([
		['star of 40 on a laptop', star(40), WIDE],
		['chain of 12 on a laptop', chain(12), WIDE],
		['chain of 12 on a phone', chain(12), TALL],
		['a wrapped random DAG', randomLevel(60, 0, 90, 3), WIDE],
		['200 random nodes on a phone', randomLevel(140, 60, 220, 7), TALL],
		['a cycle', cycle(), WIDE]
	] as [string, Graph, number][])(
		'routes no edge of %s under a card it does not join',
		(_, g, aspect) => {
			// Act
			const result = layout(g, aspect);
			// Assert
			expect(result.routes.size).toBeGreaterThan(0);
			expect(cardsCrossed(g, result)).toEqual([]);
		}
	);

	// Regression: a level of unlinked directories, or of files with and without imports,
	// rendered as one vertical column on a laptop screen
	it('spreads a level that used to render as one column across a laptop screen', () => {
		for (const g of [isolatedOnly(8), treeWithLooseFiles()]) {
			// Act
			const { nodes } = layout(g, WIDE);
			// Assert
			expect(aspectOf(nodes)).toBeGreaterThan(1);
			expect(new Set([...nodes.values()].map((p) => p.x)).size).toBeGreaterThan(2);
		}
	});

	it('runs edges left to right on a laptop and top to bottom on a phone', () => {
		// Arrange
		const g = chain(2);
		// Act
		const wide = layout(g, WIDE).nodes;
		const tall = layout(g, TALL).nodes;
		// Assert
		expect(wide.get('c001')!.x).toBeGreaterThan(wide.get('c000')!.x);
		expect(wide.get('c000')!.direction).toBe('LR');
		expect(tall.get('c001')!.y).toBeGreaterThan(tall.get('c000')!.y);
		expect(tall.get('c000')!.direction).toBe('TB');
	});

	it('wraps a long rank into several lines', () => {
		// Arrange: forty files import one hub, so dagre puts all forty in one rank
		const g = star(40);
		// Act
		const leaves = [...layout(g, WIDE).nodes].filter(([id]) => id !== 'hub').map(([, p]) => p);
		// Assert: one line of forty would share one x (left to right) or one y (top to bottom)
		expect(new Set(leaves.map((p) => p.x)).size).toBeGreaterThan(1);
		expect(new Set(leaves.map((p) => p.y)).size).toBeGreaterThan(1);
	});

	it('folds a long chain into bands side by side', () => {
		// Act
		const ps = [...layout(chain(12), WIDE).nodes.values()];
		// Assert: an unfolded chain lies on one row or one column
		expect(new Set(ps.map((p) => p.x)).size).toBeGreaterThan(1);
		expect(new Set(ps.map((p) => p.y)).size).toBeGreaterThan(1);
	});

	it('runs every component of a level the same way', () => {
		// Arrange: many components of different shapes
		const g = randomLevel(140, 60, 120, 5);
		const linked = new Set(g.edges.flatMap((e) => [e.source, e.target]));
		for (const aspect of ASPECTS) {
			// Act
			const placed = [...layout(g, aspect).nodes].filter(([id]) => linked.has(id));
			// Assert
			expect(new Set(placed.map(([, p]) => p.direction)).size, `${aspect}`).toBe(1);
		}
	});

	it('routes every edge between two nodes of the level, and no self-loop or dangling edge', () => {
		// Arrange
		const g: Graph = {
			ids: ['a', 'b'],
			edges: [edge('a', 'b'), edge('a', 'a'), edge('b', 'gone')]
		};
		// Act
		const { routes } = layout(g, WIDE);
		// Assert
		expect([...routes.keys()]).toEqual(['a->b']);
	});

	it('ignores self-loops and edges to nodes outside the level when placing nodes', () => {
		// Arrange
		const g: Graph = { ids: ['a', 'b'], edges: [edge('a', 'a'), edge('b', 'gone')] };
		// Act
		const { nodes } = layout(g, WIDE);
		// Assert: both nodes are loose, so they sit side by side in the grid
		expect(nodes.get('a')!.y).toBe(nodes.get('b')!.y);
	});

	it('returns nothing for an empty level', () => {
		expect(layout({ ids: [], edges: [] }, WIDE).nodes.size).toBe(0);
	});

	it('lays out 500 nodes within three seconds', () => {
		// Arrange
		const g = randomLevel(400, 100, 700, 13);
		// Act
		const started = performance.now();
		layout(g, WIDE);
		// Assert: about half a second on a laptop; the bound leaves room for a slow CI runner
		expect(performance.now() - started).toBeLessThan(3000);
	});
});

describe('edgePoints', () => {
	it('turns alternately along and across the flow between the two handles', () => {
		// Arrange
		const route = { direction: 'LR' as const, turns: [300, 50, 500] };
		// Act
		const points = edgePoints(route, { x: 256, y: 88 }, { x: 600, y: 120 });
		// Assert
		expect(points).toEqual([
			{ x: 256, y: 88 },
			{ x: 300, y: 88 },
			{ x: 300, y: 50 },
			{ x: 500, y: 50 },
			{ x: 500, y: 120 },
			{ x: 600, y: 120 }
		]);
	});
});

describe('screenAspect', () => {
	it('measures the canvas under the header in 10% steps', () => {
		// 1440 x 900 leaves a 1440 x 852 canvas, 1.69, which rounds to the step 1.1^6
		expect(screenAspect(1440, 900)).toBe(1.772);
		expect(screenAspect(390, 844)).toBe(0.513);
	});

	it('gives the same aspect for windows within one step', () => {
		expect(screenAspect(1440, 900)).toBe(screenAspect(1460, 900));
	});

	it('falls back to a laptop canvas before the window has a size', () => {
		expect(screenAspect(0, 0)).toBe(1.75);
		expect(screenAspect(800, 40)).toBe(1.75);
	});
});
