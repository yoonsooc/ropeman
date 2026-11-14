import type { SemanticLevel } from '$lib/types/semantic';
import type { Node, Edge, MarkerType } from '@xyflow/svelte';
import { DEFAULT_ASPECT, layoutLevel, type LevelLayout } from './levelLayout';

const SEMANTIC_NODE_WIDTH = 256;
const SEMANTIC_NODE_HEIGHT = 176;

// The legend swatches read the same tokens, so a theme retunes strokes and legend together
const EDGE_TYPE_COLORS: Record<string, string> = {
	depends_on: 'var(--color-edge-depends-on)',
	calls: 'var(--color-edge-calls)',
	extends: 'var(--color-edge-extends)',
	uses: 'var(--color-edge-uses)'
};

// Layouts of the levels shown lately. A selection or a drag re-renders the level, and laying out
// a few hundred nodes again on every click would take a visible part of a second
const LAYOUT_CACHE_SIZE = 16;
const layoutCache = new Map<string, LevelLayout>();

/**
 * Everything a level's layout depends on: the screen aspect, its node ids and its edges. Two
 * levels with the same key are laid out the same, so the key also names a layout.
 */
export function levelLayoutKey(level: SemanticLevel, aspect: number): string {
	const ids = level.nodes.map((n) => n.id).join('\u0000');
	const edges = level.edges.map((e) => `${e.id}\u0001${e.source}\u0001${e.target}`).join('\u0000');
	return `${aspect}\u0002${ids}\u0002${edges}`;
}

function layoutFor(level: SemanticLevel, aspect: number): LevelLayout {
	const key = levelLayoutKey(level, aspect);
	const cached = layoutCache.get(key);
	if (cached) {
		layoutCache.delete(key);
		layoutCache.set(key, cached);
		return cached;
	}
	const layout = layoutLevel(
		level.nodes.map((n) => n.id),
		level.edges,
		{ width: SEMANTIC_NODE_WIDTH, height: SEMANTIC_NODE_HEIGHT },
		aspect
	);
	layoutCache.set(key, layout);
	if (layoutCache.size > LAYOUT_CACHE_SIZE) layoutCache.delete(layoutCache.keys().next().value!);
	return layout;
}

/**
 * Lay out a level for a screen of the given aspect (width over height). The node's `direction`
 * tells the card which sides carry its handles.
 */
export function toSemanticFlowNodes(level: SemanticLevel, aspect: number = DEFAULT_ASPECT): Node[] {
	const placements = layoutFor(level, aspect).nodes;

	// Count source/target connections per node for handle distribution
	const sourceCount = new Map<string, number>();
	const targetCount = new Map<string, number>();
	for (const edge of level.edges) {
		sourceCount.set(edge.source, (sourceCount.get(edge.source) ?? 0) + 1);
		targetCount.set(edge.target, (targetCount.get(edge.target) ?? 0) + 1);
	}

	return level.nodes.map((node) => {
		const { x, y, direction } = placements.get(node.id)!;
		return {
			id: node.id,
			type: 'semanticNode',
			position: { x, y },
			data: {
				label: node.label,
				description: node.description,
				color: node.color,
				filePaths: node.filePaths,
				keySymbols: node.keySymbols,
				fileCount: node.fileCount,
				parentId: node.parentId,
				depth: node.depth,
				id: node.id,
				sourceHandleCount: sourceCount.get(node.id) ?? 1,
				targetHandleCount: targetCount.get(node.id) ?? 1,
				direction
			},
			width: SEMANTIC_NODE_WIDTH,
			height: SEMANTIC_NODE_HEIGHT
		} as Node;
	});
}

/**
 * Edges for a level. Given the screen aspect the nodes were laid out for, each edge follows the
 * route the layout found through the gaps between cards; otherwise it is a plain step edge.
 */
export function toSemanticFlowEdges(level: SemanticLevel, aspect?: number): Edge[] {
	const routes = aspect === undefined ? null : layoutFor(level, aspect).routes;
	// Track per-node source/target index to assign handles
	const sourceIndex = new Map<string, number>();
	const targetIndex = new Map<string, number>();

	return level.edges.map((edge) => {
		const color = EDGE_TYPE_COLORS[edge.type] ?? EDGE_TYPE_COLORS.uses;
		const inferred = edge.evidence?.confidence === 'INFERRED';

		const sIdx = sourceIndex.get(edge.source) ?? 0;
		sourceIndex.set(edge.source, sIdx + 1);

		const tIdx = targetIndex.get(edge.target) ?? 0;
		targetIndex.set(edge.target, tIdx + 1);
		const route = routes?.get(edge.id);

		return {
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: `source-${sIdx}`,
			targetHandle: `target-${tIdx}`,
			type: route ? 'routed' : 'smoothstep',
			animated: false,
			...(edge.label ? { label: edge.label } : {}),
			// An INFERRED relation is the LLM's claim, not a fact the code map shows (A-6), so it is
			// dashed whether or not it names refs the verifier could check
			style: inferred
				? `stroke: ${color}; stroke-width: 1.5px; opacity: 0.6; stroke-dasharray: 6 4;`
				: `stroke: ${color}; stroke-width: 1.5px; opacity: 0.75;`,
			markerEnd: {
				type: 'arrowclosed' as MarkerType,
				color
			},
			data: { edgeType: edge.type, inferred, ...(route ? { route } : {}) }
		};
	});
}

/** Nodes joined to `nodeId` by an edge in either direction, so a selection can keep them lit. */
export function neighborNodeIds(level: SemanticLevel, nodeId: string): Set<string> {
	const ids = new Set<string>();
	for (const e of level.edges) {
		if (e.source === nodeId) ids.add(e.target);
		if (e.target === nodeId) ids.add(e.source);
	}
	ids.delete(nodeId);
	return ids;
}
