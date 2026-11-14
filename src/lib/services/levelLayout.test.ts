import { describe, it, expect } from 'vitest';
import {
	layoutLevel,
	TARGET_ASPECT,
	type LayoutEdge,
	type NodePlacement,
	type ViewportShape
} from './levelLayout';

const SIZE = { width: 256, height: 176 };
const SHAPES: ViewportShape[] = ['wide', 'tall'];

interface Graph {
	ids: string[];
	edges: LayoutEdge[];
}

function ids(prefix: string, n: number): string[] {
	return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

function isolatedOnly(n: number): Graph {
	return { ids: ids('n', n), edges: [] };
}

function star(leaves: number): Graph {
	const leafIds = ids('leaf', leaves);
	return {
		ids: ['hub', ...leafIds],
		edges: leafIds.map((leaf) => ({ source: leaf, target: 'hub' }))
	};
}

function chain(n: number): Graph {
	const nodes = ids('c', n);
	return {
		ids: nodes,
		edges: nodes.slice(1).map((id, i) => ({ source: nodes[i], target: id }))
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
		if (a !== b) edges.push({ source: nodes[Math.min(a, b)], target: nodes[Math.max(a, b)] });
	}
	return { ids: [...nodes, ...ids('iso', isolated)], edges };
}

/** The reported file level: a tree importing a few hubs, plus many files with no imports. */
function treeWithLooseFiles(): Graph {
	const tree = ids('t', 45);
	const edges: LayoutEdge[] = [];
	tree.slice(5).forEach((id, i) => {
		edges.push({ source: id, target: tree[i % 5] });
		if (i % 3 === 0) edges.push({ source: id, target: tree[(i + 2) % 5] });
	});
	return { ids: [...tree, ...ids('loose', 29)], edges };
}

const CASES: [string, Graph][] = [
	['two linked nodes', chain(2)],
	['8 nodes, no edges', isolatedOnly(8)],
	['100 nodes, no edges', isolatedOnly(100)],
	['star of 40', star(40)],
	['chain of 12', chain(12)],
	['tree with loose files', treeWithLooseFiles()],
	['200 random nodes', randomLevel(140, 60, 220, 7)]
];

function layout(g: Graph, shape: ViewportShape): Map<string, NodePlacement> {
	return layoutLevel(g.ids, g.edges, SIZE, shape);
}

function bounds(placements: Map<string, NodePlacement>) {
	const ps = [...placements.values()];
	const minX = Math.min(...ps.map((p) => p.x));
	const minY = Math.min(...ps.map((p) => p.y));
	const maxX = Math.max(...ps.map((p) => p.x + SIZE.width));
	const maxY = Math.max(...ps.map((p) => p.y + SIZE.height));
	return { width: maxX - minX, height: maxY - minY };
}

function aspect(placements: Map<string, NodePlacement>): number {
	const { width, height } = bounds(placements);
	return width / height;
}

describe('layoutLevel', () => {
	it.each(CASES)('places every node of %s exactly once', (_, g) => {
		for (const shape of SHAPES) {
			// Act
			const placements = layout(g, shape);
			// Assert
			expect([...placements.keys()].sort()).toEqual([...g.ids].sort());
		}
	});

	it.each(CASES)('gives the same positions for the same input: %s', (_, g) => {
		for (const shape of SHAPES) {
			// Act
			const first = layout(g, shape);
			const second = layout({ ids: [...g.ids], edges: g.edges.map((e) => ({ ...e })) }, shape);
			// Assert
			expect([...second.entries()]).toEqual([...first.entries()]);
		}
	});

	it.each(CASES)('keeps at least a 32px gap between the cards of %s', (_, g) => {
		for (const shape of SHAPES) {
			// Act
			const ps = [...layout(g, shape).values()];
			// Assert
			for (let i = 0; i < ps.length; i++) {
				for (let j = i + 1; j < ps.length; j++) {
					const apartX = Math.abs(ps[i].x - ps[j].x) >= SIZE.width + 32;
					const apartY = Math.abs(ps[i].y - ps[j].y) >= SIZE.height + 32;
					expect(apartX || apartY, `${shape}: nodes ${i} and ${j} overlap`).toBe(true);
				}
			}
		}
	});

	it.each([
		['100 nodes, no edges', isolatedOnly(100)],
		['star of 40', star(40)],
		['tree with loose files', treeWithLooseFiles()],
		['200 random nodes', randomLevel(140, 60, 220, 7)]
	] as [string, Graph][])('shapes %s within 1.5x of the screen aspect on both screens', (_, g) => {
		for (const shape of SHAPES) {
			// Act
			const ratio = aspect(layout(g, shape)) / TARGET_ASPECT[shape];
			// Assert
			expect(ratio, shape).toBeGreaterThan(1 / 1.5);
			expect(ratio, shape).toBeLessThan(1.5);
		}
	});

	// Regression: a level of unlinked directories, or of files with and without imports,
	// rendered as one vertical column on a laptop screen
	it('spreads a level that used to render as one column across a laptop screen', () => {
		for (const g of [isolatedOnly(8), treeWithLooseFiles()]) {
			// Act
			const placements = layout(g, 'wide');
			// Assert
			expect(aspect(placements)).toBeGreaterThan(1);
			expect(new Set([...placements.values()].map((p) => p.x)).size).toBeGreaterThan(2);
		}
	});

	it('runs edges left to right on a laptop and top to bottom on a phone', () => {
		// Arrange
		const g = chain(2);
		// Act
		const wide = layout(g, 'wide');
		const tall = layout(g, 'tall');
		// Assert
		expect(wide.get('c1')!.x).toBeGreaterThan(wide.get('c0')!.x);
		expect(wide.get('c0')!.direction).toBe('LR');
		expect(tall.get('c1')!.y).toBeGreaterThan(tall.get('c0')!.y);
		expect(tall.get('c0')!.direction).toBe('TB');
	});

	it('wraps a long rank instead of stretching it across the screen', () => {
		// Arrange: forty files import one hub, so dagre puts all forty in one rank
		const g = star(40);
		// Act
		const { width, height } = bounds(layout(g, 'wide'));
		// Assert: one rank of forty cards would be about 7,000px long
		expect(Math.max(width, height)).toBeLessThan(3000);
	});

	it('gives every node of one component the same direction', () => {
		// Arrange
		const g = randomLevel(60, 0, 90, 3);
		// Act
		const directions = new Set([...layout(g, 'wide').values()].map((p) => p.direction));
		// Assert: the random edges link all sixty nodes into one component
		expect(directions.size).toBe(1);
	});

	it('ignores self-loops and edges to nodes outside the level', () => {
		// Arrange
		const g: Graph = {
			ids: ['a', 'b'],
			edges: [
				{ source: 'a', target: 'a' },
				{ source: 'b', target: 'gone' }
			]
		};
		// Act
		const placements = layout(g, 'wide');
		// Assert: both nodes are loose, so they sit side by side in the grid
		expect(placements.get('a')!.y).toBe(placements.get('b')!.y);
	});

	it('returns nothing for an empty level', () => {
		expect(layout({ ids: [], edges: [] }, 'wide').size).toBe(0);
	});
});
