import dagre from '@dagrejs/dagre';

export type FlowDirection = 'LR' | 'TB';
export type ViewportShape = 'wide' | 'tall';

export interface NodeSize {
	width: number;
	height: number;
}

export interface LayoutEdge {
	source: string;
	target: string;
}

/** Top-left corner of a node, and the axis its component's edges flow along. */
export interface NodePlacement {
	x: number;
	y: number;
	direction: FlowDirection;
}

// Width over height of the canvas each shape stands for: a laptop canvas under the header,
// and a phone held upright
export const TARGET_ASPECT: Record<ViewportShape, number> = { wide: 1.75, tall: 0.55 };
const NATURAL_DIRECTION: Record<ViewportShape, FlowDirection> = { wide: 'LR', tall: 'TB' };

const SPACING: Record<FlowDirection, { node: number; rank: number }> = {
	LR: { node: 40, rank: 140 },
	TB: { node: 40, rank: 96 }
};
// Gap between the lines a wrapped rank breaks into; smaller than a rank gap so the lines read as one rank
const WRAP_GAP = 32;
const BLOCK_GAP = 96;
const GRID_GAP = 40;
// Gap between bands of a folded component; the edges that run back to the next band cross it
const BAND_GAP = 120;
// A wrapped rank costs edge clarity, so it must shrink the fit by more than this to win
const WRAP_PENALTY = 1.1;
// A fold sends edges backwards across a band, so it must win by a wider margin
const FOLD_PENALTY = 1.25;

interface Block {
	width: number;
	height: number;
	/** Placements relative to the block's top-left corner. */
	nodes: Map<string, NodePlacement>;
}

/**
 * Place a level's nodes so the whole level fits a screen of the given shape at the largest zoom.
 * Each connected component is layered by dagre and laid out in whichever direction fits the
 * screen better, wrapping over-long ranks into several lines and folding a long run of ranks
 * into side-by-side bands when that pays off. Nodes without edges form a grid, and the blocks
 * are packed into rows whose overall width-to-height ratio stays close to the screen's.
 * The same input always gives the same positions.
 */
export function layoutLevel(
	nodeIds: readonly string[],
	edges: readonly LayoutEdge[],
	size: NodeSize,
	shape: ViewportShape
): Map<string, NodePlacement> {
	const aspect = TARGET_ASPECT[shape];
	const natural = NATURAL_DIRECTION[shape];
	const { components, isolated } = splitComponents(nodeIds, edges);
	const blocks = components.map((c) => componentBlock(c, edges, size, aspect, natural));
	return packBlocks(blocks, isolated, size, aspect, natural);
}

/** Connected components with two or more nodes, largest first, and the nodes with no edges. */
function splitComponents(
	nodeIds: readonly string[],
	edges: readonly LayoutEdge[]
): { components: string[][]; isolated: string[] } {
	const index = new Map(nodeIds.map((id, i) => [id, i]));
	const parent = nodeIds.map((_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]];
			i = parent[i];
		}
		return i;
	};
	const linked = new Set<number>();
	for (const e of edges) {
		const a = index.get(e.source);
		const b = index.get(e.target);
		if (a === undefined || b === undefined || a === b) continue;
		linked.add(a).add(b);
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
	}

	const groups = new Map<number, string[]>();
	const isolated: string[] = [];
	nodeIds.forEach((id, i) => {
		if (!linked.has(i)) {
			isolated.push(id);
			return;
		}
		const root = find(i);
		const group = groups.get(root);
		if (group) group.push(id);
		else groups.set(root, [id]);
	});
	// Groups keep the order of their first member and the sort is stable, so ties keep input order
	const components = [...groups.values()].sort((a, b) => b.length - a.length);
	return { components, isolated };
}

function componentBlock(
	ids: string[],
	edges: readonly LayoutEdge[],
	size: NodeSize,
	aspect: number,
	natural: FlowDirection
): Block {
	const members = new Set(ids);
	const own = edges.filter(
		(e) => e.source !== e.target && members.has(e.source) && members.has(e.target)
	);
	const ranks = dagreRanks(ids, own);
	const longest = Math.max(...ranks.map((r) => r.length));

	let best: { shape: BandShape; score: number } | null = null;
	for (const direction of [natural, flip(natural)]) {
		for (let cap = longest; cap >= 1; cap--) {
			for (let fold = ranks.length; fold >= 1; fold--) {
				const shape = { direction, cap, fold };
				const { width, height } = bandedExtent(ranks, size, shape);
				const score =
					fitSize(width, height, aspect) *
					(cap < longest ? WRAP_PENALTY : 1) *
					(fold < ranks.length ? FOLD_PENALTY : 1);
				if (!best || score < best.score) best = { shape, score };
			}
		}
	}
	return bandedBlock(ranks, size, best!.shape);
}

function flip(direction: FlowDirection): FlowDirection {
	return direction === 'LR' ? 'TB' : 'LR';
}

/** The side of the aspect-shaped box that holds a width x height block; smaller fits larger on screen. */
function fitSize(width: number, height: number, aspect: number): number {
	return Math.max(width, height * aspect);
}

/**
 * Dagre's layering: ranks in flow order, each in the order dagre chose to reduce edge crossings.
 * Ranks and order do not depend on the flow direction or the node size, so one run serves both
 * directions; positions come from `bandedBlock`, whose extent the scoring computes exactly.
 */
function dagreRanks(ids: readonly string[], edges: readonly LayoutEdge[]): string[][] {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: 'TB' });
	g.setDefaultEdgeLabel(() => ({}));
	for (const id of ids) g.setNode(id, { width: 1, height: 1 });
	for (const e of edges) g.setEdge(e.source, e.target);
	dagre.layout(g);

	const byRank = new Map<number, { id: string; x: number }[]>();
	for (const id of ids) {
		const { x, y } = g.node(id);
		const line = byRank.get(y);
		if (line) line.push({ id, x });
		else byRank.set(y, [{ id, x }]);
	}
	return [...byRank.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, line]) => line.sort((a, b) => a.x - b.x).map((n) => n.id));
}

/** Node extent along the flow (from rank to rank) and across it (within a rank). */
function axes(size: NodeSize, direction: FlowDirection) {
	return direction === 'LR'
		? { along: size.width, across: size.height }
		: { along: size.height, across: size.width };
}

/**
 * How a component's ranks are arranged: each rank breaks into lines of at most `cap` nodes, and
 * every `fold` consecutive ranks form a band; bands stack across the flow. With `cap` at the
 * longest rank and `fold` at the rank count, this is a plain layered layout.
 */
interface BandShape {
	direction: FlowDirection;
	cap: number;
	fold: number;
}

interface BandMetrics {
	/** Each band's ranks and its extent across the flow. */
	bands: { ranks: string[][]; across: number }[];
	along: number;
	across: number;
}

function bandMetrics(ranks: string[][], size: NodeSize, shape: BandShape): BandMetrics {
	const unit = axes(size, shape.direction);
	const spacing = SPACING[shape.direction];
	const bands: BandMetrics['bands'] = [];
	let along = 0;
	let across = 0;
	for (let first = 0; first < ranks.length; first += shape.fold) {
		const bandRanks = ranks.slice(first, first + shape.fold);
		const rankAlong = bandRanks.map((r) => {
			const lines = Math.ceil(r.length / shape.cap);
			return lines * unit.along + (lines - 1) * WRAP_GAP;
		});
		const widest = Math.min(shape.cap, Math.max(...bandRanks.map((r) => r.length)));
		const bandAcross = widest * unit.across + (widest - 1) * spacing.node;
		const bandAlong =
			rankAlong.reduce((sum, a) => sum + a, 0) + (bandRanks.length - 1) * spacing.rank;
		bands.push({ ranks: bandRanks, across: bandAcross });
		along = Math.max(along, bandAlong);
		across += bandAcross + (first > 0 ? BAND_GAP : 0);
	}
	return { bands, along, across };
}

function bandedExtent(ranks: string[][], size: NodeSize, shape: BandShape): NodeSize {
	const { along, across } = bandMetrics(ranks, size, shape);
	return shape.direction === 'LR'
		? { width: along, height: across }
		: { width: across, height: along };
}

/** Lines keep dagre's order and are centered across their band. */
function bandedBlock(ranks: string[][], size: NodeSize, shape: BandShape): Block {
	const { direction, cap } = shape;
	const unit = axes(size, direction);
	const spacing = SPACING[direction];
	const metrics = bandMetrics(ranks, size, shape);
	const nodes = new Map<string, NodePlacement>();
	let bandStart = 0;
	for (const band of metrics.bands) {
		let a = 0;
		for (const rank of band.ranks) {
			for (let start = 0; start < rank.length; start += cap) {
				const line = rank.slice(start, start + cap);
				const lineAcross = line.length * unit.across + (line.length - 1) * spacing.node;
				let c = bandStart + (band.across - lineAcross) / 2;
				for (const id of line) {
					nodes.set(id, direction === 'LR' ? { x: a, y: c, direction } : { x: c, y: a, direction });
					c += unit.across + spacing.node;
				}
				a += unit.along + (start + cap < rank.length ? WRAP_GAP : spacing.rank);
			}
		}
		bandStart += band.across + BAND_GAP;
	}
	const { width, height } = bandedExtent(ranks, size, shape);
	return { width, height, nodes };
}

function gridExtent(count: number, size: NodeSize, columns: number): NodeSize {
	const rows = Math.ceil(count / columns);
	return {
		width: columns * size.width + (columns - 1) * GRID_GAP,
		height: rows * size.height + (rows - 1) * GRID_GAP
	};
}

function gridBlock(
	ids: readonly string[],
	size: NodeSize,
	columns: number,
	direction: FlowDirection
): Block {
	const nodes = new Map<string, NodePlacement>();
	ids.forEach((id, i) => {
		nodes.set(id, {
			x: (i % columns) * (size.width + GRID_GAP),
			y: Math.floor(i / columns) * (size.height + GRID_GAP),
			direction
		});
	});
	return { ...gridExtent(ids.length, size, columns), nodes };
}

interface Packing {
	width: number;
	height: number;
	/** Top-left corner of each block, in the order the blocks were given. */
	corners: { x: number; y: number }[];
}

/** Next-fit rows: blocks left to right, a new row when the next one would pass `maxWidth`. */
function shelve(blocks: readonly NodeSize[], maxWidth: number): Packing {
	const corners: { x: number; y: number }[] = [];
	let x = 0;
	let y = 0;
	let rowHeight = 0;
	let width = 0;
	for (const block of blocks) {
		if (x > 0 && x + block.width > maxWidth) {
			y += rowHeight + BLOCK_GAP;
			x = 0;
			rowHeight = 0;
		}
		corners.push({ x, y });
		rowHeight = Math.max(rowHeight, block.height);
		width = Math.max(width, x + block.width);
		x += block.width + BLOCK_GAP;
	}
	return { width, height: y + rowHeight, corners };
}

/**
 * Components go first, tallest first, and the grid of unconnected nodes last. Every grid column
 * count and every row width that changes the packing is tried; the packing that fits the target
 * aspect at the largest zoom wins, then the smaller area.
 */
function packBlocks(
	components: readonly Block[],
	isolated: readonly string[],
	size: NodeSize,
	aspect: number,
	natural: FlowDirection
): Map<string, NodePlacement> {
	const sorted = [...components].sort((a, b) => b.height - a.height);
	const columnChoices = isolated.length ? Array.from(isolated, (_, i) => i + 1) : [0];

	let best: { columns: number; maxWidth: number; score: number; area: number } | null = null;
	for (const columns of columnChoices) {
		const extents: NodeSize[] = columns
			? [...sorted, gridExtent(isolated.length, size, columns)]
			: sorted;
		const minWidth = Math.max(...extents.map((b) => b.width));
		const widths = new Set<number>([minWidth]);
		let run = 0;
		for (const b of extents) {
			run += b.width;
			if (run > minWidth) widths.add(run);
			run += BLOCK_GAP;
		}
		for (const maxWidth of [...widths].sort((a, b) => a - b)) {
			const packing = shelve(extents, maxWidth);
			const score = fitSize(packing.width, packing.height, aspect);
			const area = packing.width * packing.height;
			if (!best || score < best.score || (score === best.score && area < best.area)) {
				best = { columns, maxWidth, score, area };
			}
		}
	}

	const out = new Map<string, NodePlacement>();
	const blocks = best!.columns
		? [...sorted, gridBlock(isolated, size, best!.columns, natural)]
		: sorted;
	const { corners } = shelve(blocks, best!.maxWidth);
	blocks.forEach((block, i) => {
		for (const [id, p] of block.nodes) {
			out.set(id, { ...p, x: p.x + corners[i].x, y: p.y + corners[i].y });
		}
	});
	return out;
}
