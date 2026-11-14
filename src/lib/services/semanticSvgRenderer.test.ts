import { describe, it, expect } from 'vitest';
import {
	renderSemanticLevelSvg,
	layoutExportLevel,
	NODE_WIDTH,
	NODE_HEIGHT,
	EDGE_COLORS
} from './semanticSvgRenderer';
import type { SemanticLevel } from '$lib/types/semantic';

function makeLevel(): SemanticLevel {
	return {
		parentId: null,
		breadcrumbLabel: 'Project',
		nodes: [
			{
				id: 'sem:auth',
				label: 'Authentication',
				description: 'Login and session management.',
				color: '#7ad4a0',
				filePaths: ['src/auth/login.ts'],
				keySymbols: ['login'],
				parentId: null,
				depth: 0,
				fileCount: 1
			},
			{
				id: 'sem:api',
				label: 'API Layer',
				description: 'REST endpoints.',
				color: '#53ddfc',
				filePaths: ['src/api/users.ts'],
				keySymbols: ['UsersController'],
				parentId: null,
				depth: 0,
				fileCount: 1
			}
		],
		edges: [
			{ id: 'e1', source: 'sem:api', target: 'sem:auth', type: 'depends_on' },
			{ id: 'e2', source: 'sem:auth', target: 'sem:api', type: 'calls', label: 'token check' }
		]
	};
}

describe('layoutExportLevel', () => {
	it('returns positions for every node', () => {
		const { positions } = layoutExportLevel(makeLevel());
		expect(positions.has('sem:auth')).toBe(true);
		expect(positions.has('sem:api')).toBe(true);
	});

	it('returns a positive bounding box', () => {
		const { width, height } = layoutExportLevel(makeLevel());
		expect(width).toBeGreaterThan(0);
		expect(height).toBeGreaterThan(0);
	});

	it('enforces a minimum bbox of at least 400x300 even for tiny graphs', () => {
		const tiny: SemanticLevel = {
			parentId: null,
			breadcrumbLabel: 'Tiny',
			nodes: [
				{
					id: 'a',
					label: 'A',
					description: '',
					color: '#fff',
					filePaths: [],
					keySymbols: [],
					parentId: null,
					depth: 0,
					fileCount: 0
				}
			],
			edges: []
		};
		const { width, height } = layoutExportLevel(tiny);
		expect(width).toBeGreaterThanOrEqual(400);
		expect(height).toBeGreaterThanOrEqual(300);
	});

	it('handles empty graphs without crashing', () => {
		const empty: SemanticLevel = {
			parentId: null,
			breadcrumbLabel: 'Empty',
			nodes: [],
			edges: []
		};
		const { positions, width, height } = layoutExportLevel(empty);
		expect(positions.size).toBe(0);
		expect(width).toBeGreaterThanOrEqual(400);
		expect(height).toBeGreaterThanOrEqual(300);
	});
});

describe('renderSemanticLevelSvg', () => {
	it('emits valid SVG element with viewBox', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		expect(svg).toContain('viewBox="0 0 ');
		expect(svg).toMatch(/<\/svg>$/);
	});

	it('renders one <g class="node"> per semantic node', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		const matches = svg.match(/<g class="node"/g) ?? [];
		expect(matches).toHaveLength(2);
	});

	it('renders one curve path per edge plus one optional label text', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		// Edge curves are emitted as `<path d="M ... C ..."` (cubic bezier),
		// distinct from arrow marker paths which are `<path d="M 0 0 L ..."`.
		const curves = svg.match(/<path d="M [^"]*C /g) ?? [];
		expect(curves).toHaveLength(2);
		// Custom edge label appears as a <text> element
		expect(svg).toContain('token check');
	});

	it('uses correct edge color for each type', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		expect(svg).toContain(EDGE_COLORS.depends_on);
		expect(svg).toContain(EDGE_COLORS.calls);
	});

	it('marks nodes with cached child as data-has-child="1"', () => {
		const cache = new Map<string, SemanticLevel>([
			[
				'sem:auth',
				{
					parentId: 'sem:auth',
					breadcrumbLabel: 'Authentication',
					nodes: [],
					edges: []
				}
			]
		]);
		const { svg } = renderSemanticLevelSvg(makeLevel(), { cache });
		expect(svg).toMatch(/data-node-id="sem:auth"[^>]*data-has-child="1"/);
		expect(svg).toMatch(/data-node-id="sem:api"[^>]*data-has-child="0"/);
	});

	it('uses light theme palette when theme=light', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel(), { theme: 'light' });
		// Light theme node bg
		expect(svg).toContain('fill="#ffffff"');
	});

	it('uses dark theme palette by default', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		// Dark theme node bg
		expect(svg).toContain('fill="#0f172a"');
	});

	it('escapes XML special characters in labels', () => {
		const lvl = makeLevel();
		lvl.nodes[0].label = 'Auth & Sessions <unsafe>';
		const { svg } = renderSemanticLevelSvg(lvl);
		expect(svg).toContain('Auth &amp; Sessions &lt;unsafe&gt;');
		expect(svg).not.toContain('<unsafe>');
	});

	it('includes file count text in each node', () => {
		const { svg } = renderSemanticLevelSvg(makeLevel());
		expect(svg).toContain('1 file');
	});

	it('annotates "drill down" hint when child level present', () => {
		const cache = new Map<string, SemanticLevel>([
			[
				'sem:auth',
				{
					parentId: 'sem:auth',
					breadcrumbLabel: 'Authentication',
					nodes: [],
					edges: []
				}
			]
		]);
		const { svg } = renderSemanticLevelSvg(makeLevel(), { cache });
		expect(svg).toContain('drill down');
	});

	it('returns width/height matching the layout bbox', () => {
		const result = renderSemanticLevelSvg(makeLevel());
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
		// SVG attribute matches returned dimensions
		expect(result.svg).toContain(`width="${result.width}"`);
		expect(result.svg).toContain(`height="${result.height}"`);
	});

	it('node geometry constants match dagre layout assumptions', () => {
		expect(NODE_WIDTH).toBeGreaterThan(0);
		expect(NODE_HEIGHT).toBeGreaterThan(0);
	});

	it('handles edges referencing missing source/target without crashing', () => {
		const lvl: SemanticLevel = {
			parentId: null,
			breadcrumbLabel: 'Broken',
			nodes: [
				{
					id: 'a',
					label: 'A',
					description: '',
					color: '#fff',
					filePaths: [],
					keySymbols: [],
					parentId: null,
					depth: 0,
					fileCount: 0
				}
			],
			edges: [{ id: 'e1', source: 'a', target: 'missing', type: 'uses' }]
		};
		// Should not throw — orphan edges silently dropped
		expect(() => renderSemanticLevelSvg(lvl)).not.toThrow();
	});

	describe('edge label rendering guards', () => {
		it('draws a translucent background rect behind the label for readability', () => {
			const { svg } = renderSemanticLevelSvg(makeLevel());
			// "token check" label exists on the sem:auth→sem:api edge
			expect(svg).toContain('fill-opacity="0.85"');
			expect(svg).toContain('token check');
		});

		it('truncates long edge labels to ~24 chars with an ellipsis', () => {
			const lvl = makeLevel();
			const longLabel = 'this is an overly verbose edge label that nobody wants to read';
			lvl.edges[1].label = longLabel;
			const { svg } = renderSemanticLevelSvg(lvl);
			// Ellipsis character must appear in rendered output
			expect(svg).toContain('…');
			// Extract just the display text (between </title> and </text>),
			// the full label legitimately lives inside <title> for the tooltip.
			const displayMatch = svg.match(/<\/title>([^<]+)<\/text>/);
			expect(displayMatch).not.toBeNull();
			const displayed = displayMatch![1];
			expect(displayed).not.toBe(longLabel);
			expect(displayed.endsWith('…')).toBe(true);
			expect(displayed.length).toBeLessThanOrEqual(24);
		});

		it('preserves the full label in a <title> tooltip when truncated', () => {
			const lvl = makeLevel();
			const longLabel = 'exactly twenty-five chars!!';
			lvl.edges[1].label = longLabel;
			const { svg } = renderSemanticLevelSvg(lvl);
			expect(svg).toContain(`<title>${longLabel}</title>`);
		});

		it('omits <title> for labels under the truncation threshold', () => {
			const lvl = makeLevel();
			lvl.edges[1].label = 'short';
			const { svg } = renderSemanticLevelSvg(lvl);
			// Short label should not wrap itself in <title>
			expect(svg).not.toContain('<title>short</title>');
			expect(svg).toContain('>short</text>');
		});

		// Note: the renderer also skips labels when the edge path length is
		// below MIN_PATH_FOR_LABEL (80px). Under dagre's LR layout with
		// NODE_WIDTH=220 this guard is effectively defensive — even a
		// self-loop produces a path ~220px long. We keep the guard but
		// don't unit-test a near-zero-length path because the layout engine
		// never produces one in practice.
	});
});
