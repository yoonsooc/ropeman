import { describe, it, expect, vi } from 'vitest';
import { toSemanticFlowNodes, toSemanticFlowEdges, neighborNodeIds } from './semanticGraphBuilder';
import { layoutLevel } from './levelLayout';

vi.mock('./levelLayout', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./levelLayout')>();
	return { ...actual, layoutLevel: vi.fn(actual.layoutLevel) };
});
import type { SemanticLevel, SemanticNode, SemanticEdge } from '$lib/types/semantic';

function makeLevel(): SemanticLevel {
	const nodes: SemanticNode[] = [
		{
			id: 'sem:auth',
			label: 'Authentication',
			description: 'Handles user login and session',
			color: '#3b82f6',
			filePaths: ['src/auth.ts', 'src/session.ts'],
			keySymbols: ['login', 'logout', 'Session'],
			parentId: null,
			depth: 0,
			fileCount: 2
		},
		{
			id: 'sem:api',
			label: 'API Layer',
			description: 'REST endpoints and middleware',
			color: '#22c55e',
			filePaths: ['src/routes.ts'],
			keySymbols: ['Router', 'handleRequest'],
			parentId: null,
			depth: 0,
			fileCount: 1
		}
	];

	const edges: SemanticEdge[] = [
		{
			id: 'edge:api->auth',
			source: 'sem:api',
			target: 'sem:auth',
			label: 'authenticates',
			type: 'depends_on'
		}
	];

	return {
		parentId: null,
		nodes,
		edges,
		breadcrumbLabel: 'Overview'
	};
}

describe('toSemanticFlowNodes', () => {
	it('creates SvelteFlow nodes from semantic level', () => {
		const level = makeLevel();
		const flowNodes = toSemanticFlowNodes(level);

		expect(flowNodes).toHaveLength(2);
		expect(flowNodes[0].type).toBe('semanticNode');
		expect(flowNodes[1].type).toBe('semanticNode');
	});

	it('sets correct node data', () => {
		const level = makeLevel();
		const flowNodes = toSemanticFlowNodes(level);

		const authNode = flowNodes.find((n) => n.id === 'sem:auth')!;
		expect(authNode.data.label).toBe('Authentication');
		expect(authNode.data.description).toBe('Handles user login and session');
		expect(authNode.data.color).toBe('#3b82f6');
		expect(authNode.data.filePaths).toEqual(['src/auth.ts', 'src/session.ts']);
		expect(authNode.data.keySymbols).toEqual(['login', 'logout', 'Session']);
		expect(authNode.data.fileCount).toBe(2);
	});

	it('sets width and height on nodes', () => {
		const level = makeLevel();
		const flowNodes = toSemanticFlowNodes(level);

		for (const node of flowNodes) {
			expect(node.width).toBe(256);
			expect(node.height).toBe(176);
		}
	});

	it('positions every node at its own place', () => {
		const level = makeLevel();
		const flowNodes = toSemanticFlowNodes(level);

		// Nodes should have positions
		for (const node of flowNodes) {
			expect(node.position).toBeDefined();
			expect(typeof node.position.x).toBe('number');
			expect(typeof node.position.y).toBe('number');
		}

		// With LR layout and 2 connected nodes, they should have different x or y positions
		const positions = flowNodes.map((n) => `${n.position.x},${n.position.y}`);
		expect(new Set(positions).size).toBe(2); // All unique positions
	});

	it('handles empty level', () => {
		const level: SemanticLevel = {
			parentId: null,
			nodes: [],
			edges: [],
			breadcrumbLabel: 'Empty'
		};
		const flowNodes = toSemanticFlowNodes(level);
		expect(flowNodes).toHaveLength(0);
	});
});

describe('toSemanticFlowEdges', () => {
	it('dashes an INFERRED relation and leaves an EXTRACTED one solid', () => {
		// Arrange
		const level = makeLevel();
		const base = level.edges[0];
		level.edges = [
			{ ...base, id: 'claim', evidence: { confidence: 'INFERRED', refs: [] } },
			{ ...base, id: 'plain' }
		];

		// Act
		const [claim, plain] = toSemanticFlowEdges(level);

		// Assert
		expect(claim.style).toContain('stroke-dasharray');
		expect(claim.data).toMatchObject({ inferred: true });
		expect(plain.style).not.toContain('stroke-dasharray');
		expect(plain.data).toMatchObject({ inferred: false });
	});

	it('creates SvelteFlow edges from semantic level', () => {
		const level = makeLevel();
		const flowEdges = toSemanticFlowEdges(level);

		expect(flowEdges).toHaveLength(1);
		expect(flowEdges[0].source).toBe('sem:api');
		expect(flowEdges[0].target).toBe('sem:auth');
	});

	it('applies correct edge styling by type', () => {
		const level: SemanticLevel = {
			parentId: null,
			nodes: [],
			edges: [
				{ id: 'e1', source: 'a', target: 'b', type: 'depends_on' },
				{ id: 'e2', source: 'a', target: 'c', type: 'calls' },
				{ id: 'e3', source: 'a', target: 'd', type: 'extends' },
				{ id: 'e4', source: 'a', target: 'e', type: 'uses' }
			],
			breadcrumbLabel: 'test'
		};

		const flowEdges = toSemanticFlowEdges(level);
		expect(flowEdges.map((edge) => edge.style)).toEqual([
			expect.stringContaining('stroke: var(--color-edge-depends-on)'),
			expect.stringContaining('stroke: var(--color-edge-calls)'),
			expect.stringContaining('stroke: var(--color-edge-extends)'),
			expect.stringContaining('stroke: var(--color-edge-uses)')
		]);
	});

	it('draws plain step edges when no layout is given', () => {
		const level = makeLevel();
		const flowEdges = toSemanticFlowEdges(level);

		for (const edge of flowEdges) {
			expect(edge.type).toBe('smoothstep');
			expect(edge.animated).toBe(false);
		}
	});

	it('includes label when present', () => {
		const level = makeLevel();
		const flowEdges = toSemanticFlowEdges(level);

		expect(flowEdges[0].label).toBe('authenticates');
	});

	it('omits label when not present', () => {
		const level: SemanticLevel = {
			parentId: null,
			nodes: [],
			edges: [{ id: 'e1', source: 'a', target: 'b', type: 'uses' }],
			breadcrumbLabel: 'test'
		};

		const flowEdges = toSemanticFlowEdges(level);
		expect(flowEdges[0].label).toBeUndefined();
	});

	it('handles empty edges', () => {
		const level: SemanticLevel = {
			parentId: null,
			nodes: [],
			edges: [],
			breadcrumbLabel: 'Empty'
		};
		const flowEdges = toSemanticFlowEdges(level);
		expect(flowEdges).toHaveLength(0);
	});
});

describe('neighborNodeIds', () => {
	it('returns nodes joined by an edge in either direction', () => {
		// Arrange
		const level = makeLevel();
		// Act
		const fromTarget = neighborNodeIds(level, 'sem:auth');
		const fromSource = neighborNodeIds(level, 'sem:api');
		// Assert
		expect([...fromTarget]).toEqual(['sem:api']);
		expect([...fromSource]).toEqual(['sem:auth']);
	});

	it('returns an empty set for a node with no edges', () => {
		const level = makeLevel();
		level.edges = [];
		expect(neighborNodeIds(level, 'sem:auth').size).toBe(0);
	});

	it('never includes the node itself, even with a self-loop', () => {
		const level = makeLevel();
		level.edges.push({ id: 'self', source: 'sem:auth', target: 'sem:auth', type: 'calls' });
		expect(neighborNodeIds(level, 'sem:auth').has('sem:auth')).toBe(false);
	});
});

describe('toSemanticFlowNodes direction', () => {
	it('runs edges left to right on a wide screen and top to bottom on a tall one', () => {
		// Arrange: sem:api -> sem:auth
		const level = makeLevel();
		// Act
		const lr = toSemanticFlowNodes(level);
		const tb = toSemanticFlowNodes(level, 0.55);
		const at = (nodes: ReturnType<typeof toSemanticFlowNodes>, id: string) =>
			nodes.find((n) => n.id === id)!.position;
		// Assert
		expect(at(lr, 'sem:auth').x).toBeGreaterThan(at(lr, 'sem:api').x);
		expect(at(tb, 'sem:auth').y).toBeGreaterThan(at(tb, 'sem:api').y);
		expect(lr[0].data.direction).toBe('LR');
		expect(tb[0].data.direction).toBe('TB');
	});
});

describe('level layout reuse', () => {
	// The cache outlives a test, so each test lays out nodes no other test has seen
	function freshLevel(tag: string): SemanticLevel {
		const level = makeLevel();
		const rename = (id: string) => `${id}:${tag}`;
		return {
			...level,
			nodes: level.nodes.map((n) => ({ ...n, id: rename(n.id) })),
			edges: level.edges.map((e) => ({ ...e, source: rename(e.source), target: rename(e.target) }))
		};
	}

	it('lays a level out once for repeated renders of the same level and aspect', () => {
		// Arrange: a selection or a drag renders the same level again
		const level = freshLevel('reuse');
		vi.mocked(layoutLevel).mockClear();
		// Act
		const first = toSemanticFlowNodes(level, 1.75);
		const again = toSemanticFlowNodes(level, 1.75);
		toSemanticFlowEdges(level, 1.75);
		// Assert
		expect(vi.mocked(layoutLevel)).toHaveBeenCalledTimes(1);
		expect(again.map((n) => n.position)).toEqual(first.map((n) => n.position));
	});

	it('lays the level out again when its edges or the aspect change', () => {
		// Arrange
		const level = freshLevel('change');
		vi.mocked(layoutLevel).mockClear();
		toSemanticFlowNodes(level, 1.75);
		// Act
		toSemanticFlowNodes(level, 0.55);
		toSemanticFlowNodes({ ...level, edges: [] }, 1.75);
		// Assert
		expect(vi.mocked(layoutLevel)).toHaveBeenCalledTimes(3);
	});
});

describe('routed edges', () => {
	it('gives each edge the route the layout found for the same aspect', () => {
		// Act
		const [edge] = toSemanticFlowEdges(makeLevel(), 1.75);
		// Assert
		expect(edge.type).toBe('routed');
		expect(edge.data?.route).toEqual({ direction: 'LR', turns: [expect.any(Number)] });
	});

	it('leaves a self-loop a plain step edge, since no route joins a card to itself', () => {
		// Arrange
		const level = makeLevel();
		level.edges.push({ id: 'self', source: 'sem:auth', target: 'sem:auth', type: 'calls' });
		// Act
		const self = toSemanticFlowEdges(level, 1.75).find((e) => e.id === 'self')!;
		// Assert
		expect(self.type).toBe('smoothstep');
		expect(self.data?.route).toBeUndefined();
	});
});
