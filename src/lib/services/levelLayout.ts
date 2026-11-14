import dagre from '@dagrejs/dagre';

export type FlowDirection = 'LR' | 'TB';

export interface NodeSize {
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface LayoutEdge {
	id: string;
	source: string;
	target: string;
}

/** Top-left corner of a node, and the axis its component's edges flow along. */
export interface NodePlacement {
	x: number;
	y: number;
	direction: FlowDirection;
}

/**
 * Where an edge turns between its source handle and its target handle: alternately a coordinate
 * along the flow and one across it, starting and ending along. Every stretch runs in a gap
 * between cards, so no edge passes under a card it does not join.
 */
export interface EdgeRoute {
	direction: FlowDirection;
	turns: number[];
}

export interface LevelLayout {
	nodes: Map<string, NodePlacement>;
	/** By edge id; self-loops and edges to nodes outside the level have none. */
	routes: Map<string, EdgeRoute>;
}

/** Width over height of a laptop canvas under the app header. */
export const DEFAULT_ASPECT = 1.75;
// The app header above every canvas
const HEADER_PX = 48;
// Aspect steps of 10%, so resizing a window re-lays a level a few times, not on every pixel
const ASPECT_STEP = 1.1;

const SPACING: Record<FlowDirection, { node: number; rank: number }> = {
	LR: { node: 40, rank: 140 },
	TB: { node: 40, rank: 96 }
};
// Gap between the lines a wrapped rank breaks into; smaller than a rank gap so the lines read as one rank
const WRAP_GAP = 32;
const BLOCK_GAP = 96;
const GRID_GAP = 40;
// Gap between bands of a folded component; edges that continue in the next band run along it
const BAND_GAP = 120;
// How far outside a component an edge may run: before its first line, after its last line
const EDGE_MARGIN = 24;
// A wrapped rank sends edges around its lines, so it must shrink the fit by more than this to win
const WRAP_PENALTY = 1.1;
// A fold sends edges backwards along a band gap, so it must win by a wider margin
const FOLD_PENALTY = 1.25;
// Components flowing in different directions read as unrelated diagrams; mixing must win by this
const MIX_PENALTY = 1.15;

/** The target aspect for a window: its canvas below the header, in 10% steps. */
export function screenAspect(width: number, height: number): number {
	if (!(width > 0) || !(height > HEADER_PX)) return DEFAULT_ASPECT;
	const step = Math.round(Math.log(width / (height - HEADER_PX)) / Math.log(ASPECT_STEP));
	return Number((ASPECT_STEP ** step).toFixed(3));
}

/**
 * Place a level's nodes and route its edges so the whole level fits a screen of the given
 * aspect (width over height) at the largest zoom.
 *
 * Each connected component is layered by dagre. It flows left to right or top to bottom,
 * wraps an over-long rank into several lines and folds a long run of ranks into side-by-side
 * bands when that pays off. Nodes without edges form a grid. The blocks are packed into rows
 * whose overall shape stays close to the screen's. Every component flows the same way unless
 * mixing directions fits clearly better. The result depends only on the set of nodes and
 * edges, not on their order.
 */
export function layoutLevel(
	nodeIds: readonly string[],
	edges: readonly LayoutEdge[],
	size: NodeSize,
	aspect: number
): LevelLayout {
	const natural: FlowDirection = aspect >= 1 ? 'LR' : 'TB';
	const ids = [...nodeIds].sort(byText);
	const ordered = [...edges].sort(
		(a, b) => byText(a.source, b.source) || byText(a.target, b.target) || byText(a.id, b.id)
	);
	const { components, isolated } = splitComponents(ids, ordered);
	const shapes = components.map((c) => componentShapes(c, ordered, size, aspect, natural));

	const candidates: { blocks: Block[]; penalty: number }[] = [natural, flip(natural)].map(
		(direction) => ({
			blocks: shapes.map((s) => bandedBlock(s.ranks, s.edges, size, s.best[direction].shape)),
			penalty: 1
		})
	);
	const mixed = shapes.map((s) =>
		s.best.LR.score <= s.best.TB.score ? s.best.LR.shape : s.best.TB.shape
	);
	if (new Set(mixed.map((m) => m.direction)).size > 1) {
		candidates.push({
			blocks: shapes.map((s, i) => bandedBlock(s.ranks, s.edges, size, mixed[i])),
			penalty: MIX_PENALTY
		});
	}

	let best: { layout: LevelLayout; score: number } | null = null;
	for (const { blocks, penalty } of candidates) {
		const packed = packBlocks(blocks, isolated, size, aspect, natural);
		const score = packed.score * penalty;
		if (!best || score < best.score) best = { layout: packed.layout, score };
	}
	return best!.layout;
}

/** Corners of the path an edge takes, from its source handle to its target handle. */
export function edgePoints(route: EdgeRoute, source: Point, target: Point): Point[] {
	const lr = route.direction === 'LR';
	const at = (along: number, across: number): Point =>
		lr ? { x: along, y: across } : { x: across, y: along };
	let across = lr ? source.y : source.x;
	let along = lr ? source.x : source.y;
	const points = [source];
	route.turns.forEach((value, i) => {
		if (i % 2 === 0) along = value;
		else across = value;
		points.push(at(along, across));
	});
	points.push(at(along, lr ? target.y : target.x), target);
	return points;
}

function byText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function flip(direction: FlowDirection): FlowDirection {
	return direction === 'LR' ? 'TB' : 'LR';
}

/** The side of the aspect-shaped box that holds a width x height block; smaller fits larger on screen. */
function fitSize(width: number, height: number, aspect: number): number {
	return Math.max(width, height * aspect);
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
	// Groups keep the order of their first member and the sort is stable, so ties keep id order
	const components = [...groups.values()].sort((a, b) => b.length - a.length);
	return { components, isolated };
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

interface ComponentShapes {
	ranks: string[][];
	edges: LayoutEdge[];
	/** The best arrangement in each direction, with its score. */
	best: Record<FlowDirection, { shape: BandShape; score: number }>;
}

function componentShapes(
	ids: string[],
	edges: readonly LayoutEdge[],
	size: NodeSize,
	aspect: number,
	natural: FlowDirection
): ComponentShapes {
	const members = new Set(ids);
	const own = edges.filter(
		(e) => e.source !== e.target && members.has(e.source) && members.has(e.target)
	);
	const ranks = dagreRanks(ids, own);
	const longest = Math.max(...ranks.map((r) => r.length));

	const best = {} as ComponentShapes['best'];
	for (const direction of [natural, flip(natural)]) {
		for (let cap = longest; cap >= 1; cap--) {
			for (let fold = ranks.length; fold >= 1; fold--) {
				const shape = { direction, cap, fold };
				const { width, height } = bandedExtent(ranks, size, shape);
				const score =
					fitSize(width, height, aspect) *
					(cap < longest ? WRAP_PENALTY : 1) *
					(fold < ranks.length ? FOLD_PENALTY : 1);
				if (!best[direction] || score < best[direction].score) best[direction] = { shape, score };
			}
		}
	}
	return { ranks, edges: own, best };
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

interface BandMetrics {
	/** Each band's ranks, its node slots across the flow, and its extent across. */
	bands: { ranks: string[][]; slots: number; across: number }[];
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
		const lines = bandRanks.reduce((n, r) => n + Math.ceil(r.length / shape.cap), 0);
		const bandAlong =
			lines * unit.along +
			(bandRanks.length - 1) * spacing.rank +
			(lines - bandRanks.length) * WRAP_GAP;
		const slots = Math.min(shape.cap, Math.max(...bandRanks.map((r) => r.length)));
		const bandAcross = slots * unit.across + (slots - 1) * spacing.node;
		bands.push({ ranks: bandRanks, slots, across: bandAcross });
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

interface Block {
	width: number;
	height: number;
	/** Placements relative to the block's top-left corner. */
	nodes: Map<string, NodePlacement>;
	/** Routes relative to the block's top-left corner. */
	routes: Map<string, EdgeRoute>;
}

interface Line {
	band: number;
	/** Position among the lines of its band, in flow order. */
	index: number;
	start: number;
	end: number;
}

interface Band {
	start: number;
	end: number;
	/** Across-flow centers of the gaps an edge can run along: between slots and at both edges. */
	channels: number[];
	lines: Line[];
}

/**
 * Lines keep dagre's order and sit on the band's slots, so the gaps between slots run clear
 * through every line of the band. Edges between neighboring lines cross the one gap between
 * them; every other edge runs out to the gap after its source line, along a slot gap or a band
 * gap, and in from the gap before its target line.
 */
function bandedBlock(
	ranks: string[][],
	edges: readonly LayoutEdge[],
	size: NodeSize,
	shape: BandShape
): Block {
	const { direction, cap } = shape;
	const unit = axes(size, direction);
	const spacing = SPACING[direction];
	const step = unit.across + spacing.node;
	const metrics = bandMetrics(ranks, size, shape);
	const place = (along: number, across: number): NodePlacement =>
		direction === 'LR' ? { x: along, y: across, direction } : { x: across, y: along, direction };

	const nodes = new Map<string, NodePlacement>();
	const where = new Map<string, { line: Line; center: number }>();
	const bands: Band[] = [];
	let bandStart = 0;
	for (const metric of metrics.bands) {
		const band: Band = {
			start: bandStart,
			end: bandStart + metric.across,
			channels: [
				bandStart - spacing.node / 2,
				...Array.from(
					{ length: metric.slots - 1 },
					(_, j) => bandStart + (j + 1) * step - spacing.node / 2
				),
				bandStart + metric.across + spacing.node / 2
			],
			lines: []
		};
		let a = 0;
		for (const rank of metric.ranks) {
			for (let first = 0; first < rank.length; first += cap) {
				const members = rank.slice(first, first + cap);
				const line: Line = {
					band: bands.length,
					index: band.lines.length,
					start: a,
					end: a + unit.along
				};
				const offset = Math.floor((metric.slots - members.length) / 2);
				members.forEach((id, k) => {
					const across = bandStart + (offset + k) * step;
					nodes.set(id, place(a, across));
					where.set(id, { line, center: across + unit.across / 2 });
				});
				band.lines.push(line);
				a += unit.along + (first + cap < rank.length ? WRAP_GAP : spacing.rank);
			}
		}
		bands.push(band);
		bandStart += metric.across + BAND_GAP;
	}

	const after = (line: Line) => {
		const next = bands[line.band].lines[line.index + 1];
		return next ? (line.end + next.start) / 2 : line.end + EDGE_MARGIN;
	};
	const before = (line: Line) => {
		const prev = bands[line.band].lines[line.index - 1];
		return prev ? (prev.end + line.start) / 2 : line.start - EDGE_MARGIN;
	};
	const bandGap = (from: number, toward: number) =>
		toward > from ? bands[from].end + BAND_GAP / 2 : bands[from].start - BAND_GAP / 2;

	const routes = new Map<string, EdgeRoute>();
	for (const e of edges) {
		const s = where.get(e.source)!;
		const t = where.get(e.target)!;
		let turns: number[];
		if (s.line.band === t.line.band && t.line.index === s.line.index + 1) {
			turns = [(s.line.end + t.line.start) / 2];
		} else if (s.line.band === t.line.band) {
			const channels = bands[s.line.band].channels;
			const cost = (c: number) => Math.abs(c - s.center) + Math.abs(c - t.center);
			const channel = channels.reduce((best, c) => (cost(c) < cost(best) ? c : best));
			turns = [after(s.line), channel, before(t.line)];
		} else if (Math.abs(s.line.band - t.line.band) === 1) {
			turns = [after(s.line), bandGap(s.line.band, t.line.band), before(t.line)];
		} else {
			// Bands in between are crossed ahead of every line, where no card stands
			turns = [
				after(s.line),
				bandGap(s.line.band, t.line.band),
				-EDGE_MARGIN,
				bandGap(t.line.band, s.line.band),
				before(t.line)
			];
		}
		routes.set(e.id, { direction, turns });
	}

	const { width, height } = bandedExtent(ranks, size, shape);
	return { width, height, nodes, routes };
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
	return { ...gridExtent(ids.length, size, columns), nodes, routes: new Map() };
}

interface Packing {
	width: number;
	height: number;
	/** Top-left corner of each block, in the order the blocks were given. */
	corners: Point[];
}

/** Next-fit rows: blocks left to right, a new row when the next one would pass `maxWidth`. */
function shelve(blocks: readonly NodeSize[], maxWidth: number): Packing {
	const corners: Point[] = [];
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
): { layout: LevelLayout; score: number } {
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

	const chosen = best!;
	const blocks = chosen.columns
		? [...sorted, gridBlock(isolated, size, chosen.columns, natural)]
		: sorted;
	const { corners } = shelve(blocks, chosen.maxWidth);
	const layout: LevelLayout = { nodes: new Map(), routes: new Map() };
	blocks.forEach((block, i) => {
		const { x, y } = corners[i];
		for (const [id, p] of block.nodes) layout.nodes.set(id, { ...p, x: p.x + x, y: p.y + y });
		for (const [id, route] of block.routes) {
			const [along, across] = route.direction === 'LR' ? [x, y] : [y, x];
			const turns = route.turns.map((v, k) => v + (k % 2 === 0 ? along : across));
			layout.routes.set(id, { direction: route.direction, turns });
		}
	});
	return { layout, score: chosen.score };
}
