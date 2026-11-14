/**
 * semanticSvgRenderer — pure-function SVG renderer for SemanticLevel.
 *
 * Used by both htmlExporter (interactive viewer) and pdfExporter (print layout)
 * to lay out semantic nodes via dagre and emit standalone SVG markup. No DOM
 * dependency, no SvelteFlow, no html-to-image — just data → SVG string.
 */
import dagre from '@dagrejs/dagre';
import type { SemanticLevel, SemanticEdge } from '$lib/types/semantic';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 110;
const NODE_PADDING = 16;

export const EDGE_COLORS: Record<SemanticEdge['type'], string> = {
	depends_on: '#94a3b8',
	calls: '#53ddfc',
	extends: '#ac8aff',
	uses: '#7ad4a0'
};

export interface RenderOptions {
	/** Color palette for the rendered SVG. Defaults to the dark "viewer" theme. */
	theme?: 'dark' | 'light';
	/** When true, mark nodes whose id is also a key in `cache` as drillable. */
	cache?: Map<string, SemanticLevel>;
}

export interface RenderedSvg {
	svg: string;
	width: number;
	height: number;
}

interface NodePosition {
	x: number;
	y: number;
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function wrapLabel(label: string, maxCharsPerLine: number): string[] {
	const words = label.split(/\s+/);
	const lines: string[] = [];
	let current = '';
	for (const w of words) {
		const candidate = current ? `${current} ${w}` : w;
		if (candidate.length > maxCharsPerLine && current) {
			lines.push(current);
			current = w;
		} else {
			current = candidate;
		}
		if (lines.length === 2) break;
	}
	if (current && lines.length < 2) lines.push(current);
	if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
		lines[1] = lines[1].slice(0, maxCharsPerLine - 1) + '…';
	}
	return lines;
}

/**
 * The export's own layout: one left-to-right dagre pass with the export's smaller cards. The
 * canvas lays levels out with `levelLayout.layoutLevel`; an exported page scrolls, so it need
 * not fit a screen.
 */
export function layoutExportLevel(level: SemanticLevel): {
	positions: Map<string, NodePosition>;
	width: number;
	height: number;
} {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });
	g.setDefaultEdgeLabel(() => ({}));

	for (const node of level.nodes) {
		g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	}
	for (const edge of level.edges) {
		g.setEdge(edge.source, edge.target);
	}
	dagre.layout(g);

	const positions = new Map<string, NodePosition>();
	let maxX = 0;
	let maxY = 0;
	for (const node of level.nodes) {
		const p = g.node(node.id);
		const x = p.x - NODE_WIDTH / 2;
		const y = p.y - NODE_HEIGHT / 2;
		positions.set(node.id, { x, y });
		maxX = Math.max(maxX, x + NODE_WIDTH);
		maxY = Math.max(maxY, y + NODE_HEIGHT);
	}

	return {
		positions,
		width: Math.max(maxX + 40, 400),
		height: Math.max(maxY + 40, 300)
	};
}

export function renderSemanticLevelSvg(
	level: SemanticLevel,
	opts: RenderOptions = {}
): RenderedSvg {
	const theme = opts.theme ?? 'dark';
	const cache = opts.cache;
	const { positions, width, height } = layoutExportLevel(level);

	const palette =
		theme === 'light'
			? {
					nodeBg: '#ffffff',
					nodeStroke: '#cbd5e1',
					title: '#0f172a',
					desc: '#475569',
					meta: '#64748b'
				}
			: {
					nodeBg: '#0f172a',
					nodeStroke: '#1e293b',
					title: '#f1f5f9',
					desc: '#94a3b8',
					meta: '#64748b'
				};

	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
	);
	parts.push('<defs>');
	for (const [type, color] of Object.entries(EDGE_COLORS)) {
		parts.push(
			`<marker id="arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`
		);
	}
	parts.push('</defs>');

	for (const edge of level.edges) {
		const src = positions.get(edge.source);
		const tgt = positions.get(edge.target);
		if (!src || !tgt) continue;
		const sx = src.x + NODE_WIDTH;
		const sy = src.y + NODE_HEIGHT / 2;
		const tx = tgt.x;
		const ty = tgt.y + NODE_HEIGHT / 2;
		const cx1 = sx + (tx - sx) / 2;
		const cx2 = tx - (tx - sx) / 2;
		const color = EDGE_COLORS[edge.type] ?? '#64748b';
		parts.push(
			`<path d="M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ty}, ${tx} ${ty}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#arrow-${edge.type})" opacity="0.85"/>`
		);
		if (edge.label) {
			// Edge label rendering with three guards to prevent encroachment
			// into adjacent node areas:
			//   1. Skip labels on very short paths (< MIN_PATH_FOR_LABEL px) —
			//      there's no room between source/target nodes anyway.
			//   2. Truncate long labels to MAX_LABEL_CHARS with an ellipsis;
			//      preserve full text in a <title> tooltip.
			//   3. Draw a translucent background rect so the label stays
			//      readable if it happens to overlap a node or another edge.
			const pathDx = tx - sx;
			const pathDy = ty - sy;
			const pathLen = Math.sqrt(pathDx * pathDx + pathDy * pathDy);
			const MIN_PATH_FOR_LABEL = 80;
			if (pathLen >= MIN_PATH_FOR_LABEL) {
				const MAX_LABEL_CHARS = 24;
				const truncated =
					edge.label.length > MAX_LABEL_CHARS
						? edge.label.slice(0, MAX_LABEL_CHARS - 1) + '…'
						: edge.label;
				const mx = (sx + tx) / 2;
				const my = (sy + ty) / 2 - 6;
				// Approximate width: ~6.2px per char at font-size 11 + padding
				const labelWidth = Math.ceil(truncated.length * 6.2) + 10;
				const labelHeight = 14;
				parts.push(
					`<rect x="${mx - labelWidth / 2}" y="${my - labelHeight + 3}" width="${labelWidth}" height="${labelHeight}" rx="3" fill="${palette.nodeBg}" fill-opacity="0.85"/>`
				);
				const textOpen = `<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" fill="${color}" font-family="ui-sans-serif, system-ui, sans-serif">`;
				const titleTag = edge.label === truncated ? '' : `<title>${escapeXml(edge.label)}</title>`;
				parts.push(`${textOpen}${titleTag}${escapeXml(truncated)}</text>`);
			}
		}
	}

	for (const node of level.nodes) {
		const pos = positions.get(node.id);
		if (!pos) continue;
		const hasChild = !!cache?.get(node.id);
		const accent = node.color || (theme === 'light' ? '#475569' : '#1e293b');
		parts.push(
			`<g class="node" data-node-id="${escapeXml(node.id)}" data-has-child="${hasChild ? '1' : '0'}">`
		);
		parts.push(
			`<rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="10" fill="${palette.nodeBg}" stroke="${accent}" stroke-width="2"/>`
		);
		parts.push(
			`<rect x="${pos.x}" y="${pos.y}" width="6" height="${NODE_HEIGHT}" rx="3" fill="${accent}"/>`
		);

		const titleLines = wrapLabel(node.label, 24);
		titleLines.forEach((line, i) => {
			parts.push(
				`<text x="${pos.x + NODE_PADDING}" y="${pos.y + NODE_PADDING + 14 + i * 18}" font-size="14" font-weight="600" fill="${palette.title}" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(line)}</text>`
			);
		});

		const descLines = wrapLabel(node.description || '', 32);
		descLines.forEach((line, i) => {
			parts.push(
				`<text x="${pos.x + NODE_PADDING}" y="${pos.y + 60 + i * 14}" font-size="11" fill="${palette.desc}" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(line)}</text>`
			);
		});

		parts.push(
			`<text x="${pos.x + NODE_PADDING}" y="${pos.y + NODE_HEIGHT - 12}" font-size="10" fill="${palette.meta}" font-family="ui-sans-serif, system-ui, sans-serif">${node.fileCount} file${node.fileCount === 1 ? '' : 's'}${hasChild ? ' · drill down' : ''}</text>`
		);
		parts.push('</g>');
	}

	parts.push('</svg>');

	return { svg: parts.join(''), width, height };
}
