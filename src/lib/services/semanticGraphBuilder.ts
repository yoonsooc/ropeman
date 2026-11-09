import type { SemanticLevel } from '$lib/types/semantic';
import type { Node, Edge, MarkerType } from '@xyflow/svelte';
import dagre from '@dagrejs/dagre';

const SEMANTIC_NODE_WIDTH = 256;
const SEMANTIC_NODE_HEIGHT = 176;

const EDGE_TYPE_COLORS: Record<string, string> = {
	depends_on: '#94a3b8',
	calls: '#53ddfc',
	extends: '#ac8aff',
	uses: '#7ad4a0'
};

export type LayoutDirection = 'LR' | 'TB';

/**
 * Lay out a level with dagre. `TB` stacks ranks vertically for narrow screens,
 * where a left-to-right graph would shrink to an unreadable strip.
 */
export function toSemanticFlowNodes(
	level: SemanticLevel,
	direction: LayoutDirection = 'LR'
): Node[] {
	const g = new dagre.graphlib.Graph();
	g.setGraph({
		rankdir: direction,
		nodesep: direction === 'LR' ? 80 : 40,
		ranksep: direction === 'LR' ? 200 : 120,
		marginx: 40,
		marginy: 40
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of level.nodes) {
		g.setNode(node.id, {
			width: SEMANTIC_NODE_WIDTH,
			height: SEMANTIC_NODE_HEIGHT
		});
	}

	for (const edge of level.edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	// Count source/target connections per node for handle distribution
	const sourceCount = new Map<string, number>();
	const targetCount = new Map<string, number>();
	for (const edge of level.edges) {
		sourceCount.set(edge.source, (sourceCount.get(edge.source) ?? 0) + 1);
		targetCount.set(edge.target, (targetCount.get(edge.target) ?? 0) + 1);
	}

	return level.nodes.map((node) => {
		const pos = g.node(node.id);
		return {
			id: node.id,
			type: 'semanticNode',
			position: {
				x: pos.x - SEMANTIC_NODE_WIDTH / 2,
				y: pos.y - SEMANTIC_NODE_HEIGHT / 2
			},
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

export function toSemanticFlowEdges(level: SemanticLevel): Edge[] {
	// Track per-node source/target index to assign handles
	const sourceIndex = new Map<string, number>();
	const targetIndex = new Map<string, number>();

	return level.edges.map((edge) => {
		const color = EDGE_TYPE_COLORS[edge.type] ?? EDGE_TYPE_COLORS.uses;

		const sIdx = sourceIndex.get(edge.source) ?? 0;
		sourceIndex.set(edge.source, sIdx + 1);

		const tIdx = targetIndex.get(edge.target) ?? 0;
		targetIndex.set(edge.target, tIdx + 1);

		return {
			id: edge.id,
			source: edge.source,
			target: edge.target,
			sourceHandle: `source-${sIdx}`,
			targetHandle: `target-${tIdx}`,
			type: 'smoothstep',
			animated: false,
			...(edge.label ? { label: edge.label } : {}),
			style: `stroke: ${color}; stroke-width: 1.5px; opacity: 0.75;`,
			markerEnd: {
				type: 'arrowclosed' as MarkerType,
				color
			},
			data: { edgeType: edge.type }
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
