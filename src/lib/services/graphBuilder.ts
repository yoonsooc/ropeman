import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';
import type { GraphNode, GraphEdge, NodeKind } from '$lib/types/graph';
import type { ArchitectureGroup } from '$lib/stores/architectureStore.svelte';
import type { Node, Edge } from '@xyflow/svelte';
import dagre from '@dagrejs/dagre';

// --- Blacklist constants ---

export const BLACKLIST_EXTENSIONS = new Set([
	// Images
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.svg',
	'.ico',
	'.webp',
	'.bmp',
	// Source maps & minified
	'.map',
	'.min.js',
	'.min.css',
	// Type declarations
	'.d.ts',
	// Markdown (except README.md — handled separately)
	'.md'
]);

export const BLACKLIST_FILES = new Set([
	// Lock files
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'poetry.lock',
	'Pipfile.lock',
	'bun.lockb',
	'composer.lock',
	'Gemfile.lock',
	'Cargo.lock',
	// Config / meta
	'.gitignore',
	'.DS_Store',
	'.editorconfig',
	'.prettierrc',
	'.eslintrc',
	'LICENSE',
	'LICENCE',
	'CHANGELOG',
	'.dockerignore',
	'Dockerfile',
	'docker-compose.yml'
]);

function isBlacklisted(filePath: string): boolean {
	const name = filePath.substring(filePath.lastIndexOf('/') + 1);
	const nameLower = name.toLowerCase();

	// Exact file name match
	if (BLACKLIST_FILES.has(name)) return true;

	// README.md is allowed
	if (nameLower === 'readme.md') return false;

	// Extension match (check longest extensions first for .d.ts, .min.js, .min.css)
	for (const ext of BLACKLIST_EXTENSIONS) {
		if (nameLower.endsWith(ext)) return true;
	}

	return false;
}

export function filterBlacklistedNodes(
	nodes: GraphNode[],
	edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const removedIds = new Set<string>();

	for (const node of nodes) {
		if ((node.kind === 'file' || node.kind === 'directory') && isBlacklisted(node.filePath)) {
			removedIds.add(node.id);
		}
	}

	// Also remove child nodes (symbols) whose parent was removed
	for (const node of nodes) {
		if (node.parentId && removedIds.has(node.parentId)) {
			removedIds.add(node.id);
		}
	}

	const filteredNodes = nodes.filter((n) => !removedIds.has(n.id));
	const filteredEdges = edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target));

	return { nodes: filteredNodes, edges: filteredEdges };
}

// --- Utility node detection ---

const UTILITY_DIR_NAMES = new Set(['utils', 'helpers', 'constants', 'common', 'shared']);

const UTILITY_FILE_PREFIXES = ['utils.', 'helpers.', 'constants.', 'config.', 'types.', 'index.'];

export function identifyUtilityNodes(nodes: GraphNode[]): Set<string> {
	const utilIds = new Set<string>();

	for (const node of nodes) {
		if (node.kind === 'directory') {
			const dirName = node.label.toLowerCase();
			if (UTILITY_DIR_NAMES.has(dirName)) {
				utilIds.add(node.id);
			}
			// Also check lib/utils, lib/helpers patterns
			const pathParts = node.filePath.toLowerCase().split('/');
			const idx = pathParts.indexOf('lib');
			if (idx >= 0 && idx + 1 < pathParts.length) {
				const next = pathParts[idx + 1];
				if (next === 'utils' || next === 'helpers') {
					utilIds.add(node.id);
				}
			}
		} else if (node.kind === 'file') {
			const fileName = node.label.toLowerCase();
			for (const prefix of UTILITY_FILE_PREFIXES) {
				if (fileName.startsWith(prefix)) {
					utilIds.add(node.id);
					break;
				}
			}
		}
	}

	// Mark children of utility directories as utility too
	const utilDirIds = new Set<string>();
	for (const id of utilIds) {
		const node = nodes.find((n) => n.id === id);
		if (node?.kind === 'directory') utilDirIds.add(id);
	}
	for (const node of nodes) {
		if (node.parentId && utilDirIds.has(node.parentId)) {
			utilIds.add(node.id);
		}
	}

	return utilIds;
}

const NODE_SIZES: Record<string, { width: number; height: number }> = {
	directory: { width: 200, height: 36 },
	file: { width: 200, height: 36 },
	symbol: { width: 180, height: 30 }
};

const INDENT_PX = 28;
const ROW_GAP = 4;

function symbolKindToNodeKind(kind: string): NodeKind {
	if (kind === 'function' || kind === 'class' || kind === 'method' || kind === 'import') {
		return kind;
	}
	return 'function';
}

export function buildGraph(
	fileTree: FileNode,
	astMap: Map<string, ASTSymbol[]>
): { nodes: GraphNode[]; edges: GraphEdge[]; utilityNodeIds: Set<string> } {
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	// Iterative walk of the file tree
	const stack: Array<{ node: FileNode; parentId: string | null }> = [
		{ node: fileTree, parentId: null }
	];

	while (stack.length > 0) {
		const { node, parentId } = stack.pop()!;
		const nodeId = `node:${node.path}`;

		if (node.kind === 'directory') {
			const childCount = node.children?.length ?? 0;
			nodes.push({
				id: nodeId,
				kind: 'directory',
				label: node.name,
				filePath: node.path,
				parentId,
				childCount,
				isExpanded: parentId === null,
				language: undefined
			});

			if (parentId) {
				edges.push({
					id: `edge:${parentId}->${nodeId}`,
					source: parentId,
					target: nodeId,
					type: 'contains'
				});
			}

			if (node.children) {
				for (let i = node.children.length - 1; i >= 0; i--) {
					stack.push({ node: node.children[i], parentId: nodeId });
				}
			}
		} else {
			const symbols = astMap.get(node.path) ?? [];
			const symbolCount = symbols.filter(
				(s) => s.kind === 'function' || s.kind === 'class' || s.kind === 'method'
			).length;

			nodes.push({
				id: nodeId,
				kind: 'file',
				label: node.name,
				filePath: node.path,
				parentId,
				childCount: symbolCount,
				isExpanded: false,
				language: node.language
			});

			if (parentId) {
				edges.push({
					id: `edge:${parentId}->${nodeId}`,
					source: parentId,
					target: nodeId,
					type: 'contains'
				});
			}

			for (const sym of symbols) {
				// The file graph shows code symbols; Markdown outlines only feed the AI skeleton
				if (
					sym.kind === 'variable' ||
					sym.kind === 'interface' ||
					sym.kind === 'type' ||
					sym.kind === 'heading' ||
					sym.kind === 'frontmatter'
				) {
					continue;
				}

				const symId = `sym:${node.path}:${sym.name}:${sym.lineStart}`;
				const kind = symbolKindToNodeKind(sym.kind);

				nodes.push({
					id: symId,
					kind,
					label: sym.name,
					filePath: node.path,
					lineStart: sym.lineStart,
					lineEnd: sym.lineEnd,
					parentId: nodeId,
					childCount: sym.children?.length ?? 0,
					isExpanded: false,
					language: node.language,
					code: sym.code,
					badges: sym.badges
				});

				edges.push({
					id: `edge:${nodeId}->${symId}`,
					source: nodeId,
					target: symId,
					type: 'contains'
				});
			}
		}
	}

	// Filter blacklisted nodes
	const filtered = filterBlacklistedNodes(nodes, edges);

	// Detect utility nodes
	const utilityNodeIds = identifyUtilityNodes(filtered.nodes);

	// Apply vertical indented tree layout
	applyTreeLayout(filtered.nodes);

	return { nodes: filtered.nodes, edges: filtered.edges, utilityNodeIds };
}

/**
 * Vertical indented tree layout — like a file explorer sidebar.
 * Each node is placed at (depth * INDENT_PX, yOffset) in DFS order.
 */
function applyTreeLayout(nodes: GraphNode[]) {
	// Build parent → children map
	const childrenMap = new Map<string | null, GraphNode[]>();
	for (const node of nodes) {
		const list = childrenMap.get(node.parentId) ?? [];
		list.push(node);
		childrenMap.set(node.parentId, list);
	}

	let yOffset = 0;

	// Iterative DFS
	const layoutStack: Array<{ node: GraphNode; depth: number }> = [];

	const roots = childrenMap.get(null) ?? [];
	for (let i = roots.length - 1; i >= 0; i--) {
		layoutStack.push({ node: roots[i], depth: 0 });
	}

	while (layoutStack.length > 0) {
		const { node, depth } = layoutStack.pop()!;
		const sizeKey =
			node.kind === 'directory' ? 'directory' : node.kind === 'file' ? 'file' : 'symbol';
		const h = NODE_SIZES[sizeKey].height;

		(node as any)._x = depth * INDENT_PX;
		(node as any)._y = yOffset;
		yOffset += h + ROW_GAP;

		const children = childrenMap.get(node.id) ?? [];
		for (let i = children.length - 1; i >= 0; i--) {
			layoutStack.push({ node: children[i], depth: depth + 1 });
		}
	}
}

/** Convert GraphNode[] to SvelteFlow node objects */
export function toFlowNodes(graphNodes: GraphNode[]) {
	return graphNodes.map((n) => {
		const sizeKey = n.kind === 'directory' ? 'directory' : n.kind === 'file' ? 'file' : 'symbol';
		const size = NODE_SIZES[sizeKey];
		const type = n.kind === 'directory' ? 'directory' : n.kind === 'file' ? 'file' : 'symbol';

		return {
			id: n.id,
			type,
			position: { x: (n as any)._x ?? 0, y: (n as any)._y ?? 0 },
			data: {
				label: n.label,
				kind: n.kind,
				filePath: n.filePath,
				lineStart: n.lineStart,
				lineEnd: n.lineEnd,
				childCount: n.childCount,
				language: n.language,
				isExpanded: n.isExpanded,
				code: n.code,
				parentId: n.parentId,
				badges: n.badges
			},
			width: size.width,
			height: size.height
		};
	});
}

/** Convert GraphEdge[] to SvelteFlow edge objects */
export function toFlowEdges(graphEdges: GraphEdge[]) {
	return graphEdges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		type: e.type === 'imports' ? 'smoothstep' : 'default',
		animated: e.type === 'imports',
		style:
			e.type === 'imports'
				? 'stroke: #3b82f6; stroke-width: 1.5px;'
				: 'stroke: #666; stroke-width: 1px;',
		data: { edgeType: e.type }
	}));
}

// --- Group layout with dagre ---

const GROUP_PADDING = 30;
const GROUP_LABEL_HEIGHT = 32;

/**
 * Applies dagre-based group layout.
 * Creates SvelteFlow parent nodes for each group, positions member nodes
 * within groups using dagre, and positions the groups themselves using dagre.
 */
export function applyGroupLayout(
	flowNodes: Node[],
	flowEdges: Edge[],
	groups: ArchitectureGroup[]
): Node[] {
	const nodeMap = new Map<string, Node>();
	for (const n of flowNodes) nodeMap.set(n.id, { ...n });

	// Track which nodes belong to a group
	const nodeToGroup = new Map<string, string>();
	for (const group of groups) {
		const groupId = `arch-group:${group.name}`;
		for (const nid of group.nodeIds) {
			nodeToGroup.set(nid, groupId);
		}
	}

	const groupNodes: Node[] = [];
	const groupSizes = new Map<string, { width: number; height: number }>();
	const memberIds = new Set(nodeToGroup.keys());

	// Layout nodes within each group using dagre
	for (const group of groups) {
		const groupId = `arch-group:${group.name}`;
		const members = group.nodeIds
			.map((id) => nodeMap.get(id))
			.filter((n): n is Node => n !== undefined);

		if (members.length === 0) continue;

		const memberSet = new Set(members.map((n) => n.id));

		// Create dagre graph for intra-group layout
		const g = new dagre.graphlib.Graph();
		g.setGraph({
			rankdir: 'TB',
			nodesep: 16,
			ranksep: 32,
			marginx: GROUP_PADDING,
			marginy: GROUP_PADDING + GROUP_LABEL_HEIGHT
		});
		g.setDefaultEdgeLabel(() => ({}));

		for (const node of members) {
			g.setNode(node.id, {
				width: node.width ?? 200,
				height: node.height ?? 36
			});
		}

		// Add intra-group edges (imports between members)
		for (const edge of flowEdges) {
			if (memberSet.has(edge.source) && memberSet.has(edge.target)) {
				g.setEdge(edge.source, edge.target);
			}
		}

		dagre.layout(g);

		// Read back group size from dagre
		const graphInfo = g.graph();
		const groupWidth = Math.max(graphInfo.width ?? 250, 250);
		const groupHeight = Math.max(graphInfo.height ?? 150, 150);
		groupSizes.set(groupId, { width: groupWidth, height: groupHeight });

		// Set member positions relative to the group parent
		for (const node of members) {
			const pos = g.node(node.id);
			const w = node.width ?? 200;
			const h = node.height ?? 36;
			node.position = {
				x: pos.x - w / 2,
				y: pos.y - h / 2
			};
			(node as any).parentId = groupId;
			(node as any).extent = 'parent';
		}

		// Create group parent node
		groupNodes.push({
			id: groupId,
			type: 'architectureGroup',
			position: { x: 0, y: 0 }, // Will be set by group-level dagre
			data: {
				label: group.name,
				color: group.color,
				width: groupWidth,
				height: groupHeight,
				nodeIds: group.nodeIds
			},
			style: `width: ${groupWidth}px; height: ${groupHeight}px;`,
			width: groupWidth,
			height: groupHeight,
			selectable: true,
			draggable: true
		} as Node);
	}

	// Layout groups themselves using dagre
	const groupGraph = new dagre.graphlib.Graph();
	groupGraph.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 });
	groupGraph.setDefaultEdgeLabel(() => ({}));

	for (const gn of groupNodes) {
		const size = groupSizes.get(gn.id)!;
		groupGraph.setNode(gn.id, { width: size.width, height: size.height });
	}

	// Add inter-group edges (imports crossing group boundaries)
	const addedGroupEdges = new Set<string>();
	for (const edge of flowEdges) {
		const srcGroup = nodeToGroup.get(edge.source);
		const tgtGroup = nodeToGroup.get(edge.target);
		if (srcGroup && tgtGroup && srcGroup !== tgtGroup) {
			const key = `${srcGroup}->${tgtGroup}`;
			if (!addedGroupEdges.has(key)) {
				addedGroupEdges.add(key);
				groupGraph.setEdge(srcGroup, tgtGroup);
			}
		}
	}

	dagre.layout(groupGraph);

	// Set group positions from dagre output
	for (const gn of groupNodes) {
		const pos = groupGraph.node(gn.id);
		const size = groupSizes.get(gn.id)!;
		gn.position = {
			x: pos.x - size.width / 2,
			y: pos.y - size.height / 2
		};
	}

	// Build result: group parents first, then grouped members, then non-grouped nodes
	const groupedMembers = Array.from(nodeMap.values()).filter((n) => memberIds.has(n.id));
	const nonGrouped = Array.from(nodeMap.values()).filter((n) => !memberIds.has(n.id));

	return [...groupNodes, ...groupedMembers, ...nonGrouped];
}
