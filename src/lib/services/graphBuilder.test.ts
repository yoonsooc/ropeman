import { describe, it, expect } from 'vitest';
import {
	BLACKLIST_EXTENSIONS,
	BLACKLIST_FILES,
	filterBlacklistedNodes,
	identifyUtilityNodes,
	buildGraph,
	toFlowNodes,
	toFlowEdges
} from './graphBuilder';
import type { GraphNode, GraphEdge } from '$lib/types/graph';
import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';

// --- Test helpers ---

function makeNode(overrides: Partial<GraphNode> & { id: string; filePath: string }): GraphNode {
	return {
		kind: 'file',
		label: overrides.filePath.split('/').pop() ?? '',
		parentId: null,
		childCount: 0,
		isExpanded: false,
		...overrides
	};
}

function makeEdge(source: string, target: string, type: GraphEdge['type'] = 'contains'): GraphEdge {
	return {
		id: `edge:${source}->${target}`,
		source,
		target,
		type
	};
}

// --- Tests ---

describe('BLACKLIST_EXTENSIONS', () => {
	it('includes image extensions', () => {
		expect(BLACKLIST_EXTENSIONS.has('.png')).toBe(true);
		expect(BLACKLIST_EXTENSIONS.has('.jpg')).toBe(true);
		expect(BLACKLIST_EXTENSIONS.has('.svg')).toBe(true);
	});

	it('includes source maps', () => {
		expect(BLACKLIST_EXTENSIONS.has('.map')).toBe(true);
	});

	it('includes type declarations', () => {
		expect(BLACKLIST_EXTENSIONS.has('.d.ts')).toBe(true);
	});
});

describe('BLACKLIST_FILES', () => {
	it('includes lock files', () => {
		expect(BLACKLIST_FILES.has('package-lock.json')).toBe(true);
		expect(BLACKLIST_FILES.has('yarn.lock')).toBe(true);
	});

	it('includes config files', () => {
		expect(BLACKLIST_FILES.has('.gitignore')).toBe(true);
		expect(BLACKLIST_FILES.has('Dockerfile')).toBe(true);
	});
});

describe('filterBlacklistedNodes', () => {
	it('removes image files', () => {
		const nodes = [
			makeNode({ id: 'n1', filePath: 'src/logo.png' }),
			makeNode({ id: 'n2', filePath: 'src/main.ts' })
		];
		const edges = [makeEdge('root', 'n1'), makeEdge('root', 'n2')];

		const result = filterBlacklistedNodes(nodes, edges);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe('n2');
	});

	it('removes lock files', () => {
		const nodes = [
			makeNode({ id: 'n1', filePath: 'package-lock.json' }),
			makeNode({ id: 'n2', filePath: 'src/app.ts' })
		];
		const result = filterBlacklistedNodes(nodes, []);
		expect(result.nodes).toHaveLength(1);
	});

	it('allows README.md', () => {
		const nodes = [
			makeNode({ id: 'n1', filePath: 'README.md' }),
			makeNode({ id: 'n2', filePath: 'docs/DESIGN.md' })
		];
		const result = filterBlacklistedNodes(nodes, []);
		// README.md is allowed, DESIGN.md is filtered (.md extension)
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].filePath).toBe('README.md');
	});

	it('removes child nodes of blacklisted parents', () => {
		const nodes = [
			makeNode({ id: 'dir1', filePath: 'assets', kind: 'directory' }),
			makeNode({ id: 'n1', filePath: 'assets/logo.png', parentId: 'dir1' })
		];
		// dir1 won't be blacklisted (directories aren't matched by extension unless explicitly)
		// but n1 (logo.png) will be blacklisted directly
		const result = filterBlacklistedNodes(nodes, []);
		expect(result.nodes.some((n) => n.id === 'n1')).toBe(false);
	});

	it('removes associated edges when nodes are filtered', () => {
		const nodes = [
			makeNode({ id: 'n1', filePath: 'icon.svg' }),
			makeNode({ id: 'n2', filePath: 'app.ts' })
		];
		const edges = [makeEdge('n1', 'n2'), makeEdge('n2', 'n1'), makeEdge('n2', 'n2')];

		const result = filterBlacklistedNodes(nodes, edges);
		expect(result.edges).toHaveLength(1);
		expect(result.edges[0].source).toBe('n2');
		expect(result.edges[0].target).toBe('n2');
	});
});

describe('identifyUtilityNodes', () => {
	it('identifies utils directory', () => {
		const nodes = [
			makeNode({ id: 'd1', filePath: 'src/utils', kind: 'directory', label: 'utils' }),
			makeNode({ id: 'f1', filePath: 'src/utils/helper.ts', label: 'helper.ts', parentId: 'd1' })
		];

		const utilIds = identifyUtilityNodes(nodes);
		expect(utilIds.has('d1')).toBe(true);
		expect(utilIds.has('f1')).toBe(true); // child of utility dir
	});

	it('identifies helpers directory', () => {
		const nodes = [
			makeNode({ id: 'd1', filePath: 'src/helpers', kind: 'directory', label: 'helpers' })
		];
		const utilIds = identifyUtilityNodes(nodes);
		expect(utilIds.has('d1')).toBe(true);
	});

	it('identifies utility file names', () => {
		const nodes = [
			makeNode({ id: 'f1', filePath: 'src/utils.ts', label: 'utils.ts' }),
			makeNode({ id: 'f2', filePath: 'src/helpers.js', label: 'helpers.js' }),
			makeNode({ id: 'f3', filePath: 'src/constants.py', label: 'constants.py' }),
			makeNode({ id: 'f4', filePath: 'src/config.ts', label: 'config.ts' }),
			makeNode({ id: 'f5', filePath: 'src/types.ts', label: 'types.ts' }),
			makeNode({ id: 'f6', filePath: 'src/index.ts', label: 'index.ts' })
		];
		const utilIds = identifyUtilityNodes(nodes);
		for (const node of nodes) {
			expect(utilIds.has(node.id)).toBe(true);
		}
	});

	it('does not flag non-utility files', () => {
		const nodes = [
			makeNode({ id: 'f1', filePath: 'src/app.ts', label: 'app.ts' }),
			makeNode({ id: 'f2', filePath: 'src/server.py', label: 'server.py' })
		];
		const utilIds = identifyUtilityNodes(nodes);
		expect(utilIds.size).toBe(0);
	});

	it('identifies lib/utils path pattern', () => {
		const nodes = [
			makeNode({ id: 'd1', filePath: 'src/lib/utils', kind: 'directory', label: 'utils' })
		];
		const utilIds = identifyUtilityNodes(nodes);
		expect(utilIds.has('d1')).toBe(true);
	});
});

describe('buildGraph', () => {
	it('creates nodes and edges from file tree', () => {
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [{ name: 'main.py', path: 'main.py', kind: 'file', language: 'python' }]
		};
		const astMap = new Map<string, ASTSymbol[]>();
		astMap.set('main.py', [{ name: 'main', kind: 'function', lineStart: 1, lineEnd: 5 }]);

		const result = buildGraph(tree, astMap);

		// Should have: root dir + file + symbol
		expect(result.nodes.length).toBeGreaterThanOrEqual(2);
		expect(result.edges.length).toBeGreaterThanOrEqual(1);
	});

	it('creates symbol nodes from AST', () => {
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [{ name: 'app.ts', path: 'app.ts', kind: 'file', language: 'typescript' }]
		};
		const astMap = new Map<string, ASTSymbol[]>();
		astMap.set('app.ts', [
			{ name: 'greet', kind: 'function', lineStart: 1, lineEnd: 3 },
			{ name: 'User', kind: 'class', lineStart: 5, lineEnd: 20 }
		]);

		const result = buildGraph(tree, astMap);
		const symbolNodes = result.nodes.filter((n) => n.kind === 'function' || n.kind === 'class');
		expect(symbolNodes.length).toBe(2);
	});

	it('skips variable, interface, and type symbols', () => {
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [{ name: 'types.ts', path: 'types.ts', kind: 'file', language: 'typescript' }]
		};
		const astMap = new Map<string, ASTSymbol[]>();
		astMap.set('types.ts', [
			{ name: 'Config', kind: 'interface', lineStart: 1, lineEnd: 5 },
			{ name: 'VERSION', kind: 'variable', lineStart: 7, lineEnd: 7 },
			{ name: 'ID', kind: 'type', lineStart: 9, lineEnd: 9 },
			{ name: 'init', kind: 'function', lineStart: 11, lineEnd: 15 }
		]);

		const result = buildGraph(tree, astMap);
		const symbolNodes = result.nodes.filter((n) => n.kind !== 'directory' && n.kind !== 'file');
		expect(symbolNodes).toHaveLength(1);
		expect(symbolNodes[0].label).toBe('init');
	});

	it('keeps config outlines out of the file graph, as it does Markdown outlines', () => {
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [{ name: 'Makefile', path: 'Makefile', kind: 'file', language: 'makefile' }]
		};
		const astMap = new Map<string, ASTSymbol[]>();
		astMap.set('Makefile', [
			{ name: 'build', kind: 'target', lineStart: 1, lineEnd: 2 },
			{ name: 'main.tf', kind: 'resource', lineStart: 3, lineEnd: 3 },
			{ name: 'API_KEY', kind: 'env', lineStart: 4, lineEnd: 4 },
			{ name: 'run', kind: 'function', lineStart: 5, lineEnd: 6 }
		]);

		const result = buildGraph(tree, astMap);
		const symbolNodes = result.nodes.filter((n) => n.kind !== 'directory' && n.kind !== 'file');
		expect(symbolNodes.map((n) => n.label)).toEqual(['run']);
	});

	it('root directory is expanded by default', () => {
		const tree: FileNode = {
			name: 'root',
			path: '',
			kind: 'directory',
			children: []
		};
		const result = buildGraph(tree, new Map());
		const rootNode = result.nodes.find((n) => n.kind === 'directory');
		expect(rootNode?.isExpanded).toBe(true);
	});

	it('identifies utility nodes', () => {
		const tree: FileNode = {
			name: 'project',
			path: '',
			kind: 'directory',
			children: [
				{ name: 'utils.ts', path: 'utils.ts', kind: 'file', language: 'typescript' },
				{ name: 'app.ts', path: 'app.ts', kind: 'file', language: 'typescript' }
			]
		};
		const result = buildGraph(tree, new Map());
		expect(result.utilityNodeIds.size).toBeGreaterThan(0);
	});
});

describe('toFlowNodes', () => {
	it('converts graph nodes to SvelteFlow format', () => {
		const graphNodes: GraphNode[] = [
			{
				id: 'n1',
				kind: 'directory',
				label: 'src',
				filePath: 'src',
				parentId: null,
				childCount: 2,
				isExpanded: true
			},
			{
				id: 'n2',
				kind: 'file',
				label: 'main.ts',
				filePath: 'src/main.ts',
				parentId: 'n1',
				childCount: 0,
				isExpanded: false,
				language: 'typescript'
			}
		];

		const flowNodes = toFlowNodes(graphNodes);
		expect(flowNodes).toHaveLength(2);

		expect(flowNodes[0].id).toBe('n1');
		expect(flowNodes[0].type).toBe('directory');
		expect(flowNodes[0].data.label).toBe('src');

		expect(flowNodes[1].id).toBe('n2');
		expect(flowNodes[1].type).toBe('file');
		expect(flowNodes[1].data.language).toBe('typescript');
	});

	it('maps symbol kinds to correct node types', () => {
		const graphNodes: GraphNode[] = [
			{
				id: 's1',
				kind: 'function',
				label: 'fn',
				filePath: 'a.ts',
				parentId: null,
				childCount: 0,
				isExpanded: false
			},
			{
				id: 's2',
				kind: 'class',
				label: 'Cls',
				filePath: 'a.ts',
				parentId: null,
				childCount: 0,
				isExpanded: false
			}
		];

		const flowNodes = toFlowNodes(graphNodes);
		expect(flowNodes[0].type).toBe('symbol');
		expect(flowNodes[1].type).toBe('symbol');
	});
});

describe('toFlowEdges', () => {
	it('converts graph edges to SvelteFlow format', () => {
		const graphEdges: GraphEdge[] = [
			{ id: 'e1', source: 'a', target: 'b', type: 'contains' },
			{ id: 'e2', source: 'a', target: 'c', type: 'imports' }
		];

		const flowEdges = toFlowEdges(graphEdges);
		expect(flowEdges).toHaveLength(2);

		expect(flowEdges[0].animated).toBeFalsy();
		expect(flowEdges[1].animated).toBe(true);
		expect(flowEdges[1].type).toBe('smoothstep');
	});

	it('applies import edge styling', () => {
		const edges: GraphEdge[] = [{ id: 'e1', source: 'a', target: 'b', type: 'imports' }];

		const flowEdges = toFlowEdges(edges);
		expect(flowEdges[0].style).toContain('stroke: var(--color-edge-depends-on)');
	});
});
