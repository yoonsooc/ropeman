import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toSemanticFlowEdges } from '$lib/services/semanticGraphBuilder';
import type { SemanticEdge } from '$lib/types/semantic';

const ROOT = join(__dirname, '..', '..', '..');
const GLOBAL_CSS = readFileSync(join(__dirname, 'global.css'), 'utf8');

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const SOURCES = walk(join(ROOT, 'src'))
	.filter((p) => /\.(svelte|css|ts)$/.test(p) && !p.includes('.test.'))
	.map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));
const E2E_TEXT = walk(join(ROOT, 'tests'))
	.filter((p) => p.endsWith('.ts'))
	.map((p) => readFileSync(p, 'utf8'))
	.join('\n');

const STYLES = SOURCES.filter(({ path }) => /\.(svelte|css)$/.test(path)).map(({ path, text }) => ({
	path,
	css: (path.endsWith('.svelte')
		? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
		: text
	).replace(/\/\*[\s\S]*?\*\//g, '')
}));

function declarations(css: string): { selector: string; prop: string; value: string }[] {
	const out: { selector: string; prop: string; value: string }[] = [];
	const stack: string[] = [];
	let start = 0;
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === '{') {
			stack.push(css.slice(start, i).trim().replace(/\s+/g, ' '));
			start = i + 1;
		} else if (ch === ';' || ch === '}') {
			const m = css.slice(start, i).match(/^\s*([\w-]+)\s*:\s*([\s\S]*?)\s*$/);
			if (m && stack.length) out.push({ selector: stack.at(-1)!, prop: m[1], value: m[2] });
			if (ch === '}') stack.pop();
			start = i + 1;
		}
	}
	return out;
}

function themeBlock(selector: string): Map<string, string> {
	const start = GLOBAL_CSS.indexOf(`${selector} {`);
	const body = GLOBAL_CSS.slice(start, GLOBAL_CSS.indexOf('}', start));
	const decls = new Map<string, string>();
	for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls.set(m[1], m[2].trim());
	return decls;
}

const LIGHT = themeBlock(':root');
const DARK = new Map([...LIGHT, ...themeBlock("[data-theme='dark']")]);

type Rgba = [number, number, number, number];

function parseColor(value: string, theme: Map<string, string>): Rgba {
	const v = value.trim();
	const ref = v.match(/^var\((--[\w-]+)\)$/);
	if (ref) return parseColor(theme.get(ref[1]) ?? '', theme);
	const mix = v.match(/^color-mix\(in srgb, (.+) (\d+)%, transparent\)$/);
	if (mix) {
		const [r, g, b, a] = parseColor(mix[1], theme);
		return [r, g, b, (a * Number(mix[2])) / 100];
	}
	const hex = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return [n >> 16, (n >> 8) & 255, n & 255, hex[2] ? parseInt(hex[2], 16) / 255 : 1];
	}
	const rgba = v.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);
	if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
	throw new Error(`cannot parse color "${value}"`);
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
	return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string, theme: Map<string, string>): number {
	const body = parseColor('var(--color-background-body)', theme);
	const back = over(parseColor(`var(${bg})`, theme), body);
	const front = over(parseColor(`var(${fg})`, theme), back);
	const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a);
	return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = [
	'--color-background-body',
	'--color-background-surface',
	'--color-background-muted',
	'--color-background-canvas',
	'--color-background-popover'
];
const PAGE = ['--color-background-body', '--color-background-surface'];
const STATUS = ['error', 'success', 'warning', 'info'];

const PAIRS: [fg: string, bg: string, floor: number][] = [
	...[
		'--color-text-primary',
		'--color-text-secondary',
		'--color-text-tertiary',
		'--color-accent'
	].flatMap((fg) => SURFACES.map((bg): [string, string, number] => [fg, bg, 4.5])),
	...STATUS.flatMap((s) =>
		PAGE.map((bg): [string, string, number] => [`--color-text-${s}`, bg, 4.5])
	),
	...STATUS.map((s): [string, string, number] => [
		`--color-on-${s}-muted`,
		`--color-${s}-muted`,
		4.5
	]),
	['--color-on-accent', '--color-accent', 4.5],
	['--color-on-error', '--color-error', 4.5],
	['--color-on-success', '--color-success', 4.5],
	['--color-on-inverted', '--color-background-inverted', 4.5],
	...SURFACES.map((bg): [string, string, number] => ['--focus-outline-color', bg, 3]),
	...['error', 'success', 'warning'].map((s): [string, string, number] => [
		`--color-icon-${s}`,
		'--color-background-body',
		3
	]),
	...['directory', 'file', 'function', 'class', 'method', 'import'].map(
		(k): [string, string, number] => [`--color-${k}`, '--color-background-body', 3]
	),
	...['demo', 'byok', 'bridge', 'webgpu'].map((t): [string, string, number] => [
		`--track-${t}`,
		'--color-background-body',
		3
	])
];

describe('color tokens', () => {
	it.each<[string, Map<string, string>]>([
		['light', LIGHT],
		['dark', DARK]
	])('every role pair meets its WCAG AA floor in %s mode', (_mode, theme) => {
		const failures = PAIRS.map(([fg, bg, floor]) => ({
			fg,
			bg,
			floor,
			ratio: contrast(fg, bg, theme)
		}))
			.filter(({ ratio, floor }) => ratio < floor)
			.map(({ fg, bg, floor, ratio }) => `${fg} on ${bg}: ${ratio.toFixed(2)} < ${floor}`);

		expect(failures).toEqual([]);
	});

	it('every var() reference resolves to a defined custom property', () => {
		const defined = new Set<string>();
		for (const { text } of SOURCES) {
			for (const m of text.matchAll(/(?<![\w-])(--[a-zA-Z][\w-]*)\s*:/g)) defined.add(m[1]);
			for (const m of text.matchAll(/style:(--[\w-]+)/g)) defined.add(m[1]);
			for (const m of text.matchAll(/'(--[\w-]+)'/g)) defined.add(m[1]);
		}

		const undefinedRefs = SOURCES.flatMap(({ path, text }) =>
			[...text.matchAll(/var\(\s*(--[\w-]+)/g)]
				.map((m) => m[1])
				.filter((name) => !defined.has(name) && !name.startsWith('--xy-'))
				.map((name) => `${path}: ${name}`)
		);

		expect(undefinedRefs).toEqual([]);
	});

	it('every global token is used', () => {
		const used = SOURCES.map(({ text }) => text).join('\n') + E2E_TEXT;
		const unused = [...LIGHT.keys()].filter(
			(name) => !new RegExp(`var\\(\\s*${name}(?![\\w-])`).test(used) && !used.includes(`'${name}'`)
		);

		expect(unused).toEqual([]);
	});

	it('style blocks use tokens instead of literal colors', () => {
		const literal =
			/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|(?<![\w-])(?:white|black)(?![\w-])/i;
		const offenders = STYLES.flatMap(({ path, css }) =>
			css
				.replace(/(?<![\w-])--[\w-]+\s*:[^;{}]*;/g, '')
				.split('\n')
				.filter((line) => literal.test(line))
				.map((line) => `${path}: ${line.trim()}`)
		);

		expect(offenders).toEqual([]);
	});

	it('style blocks take font sizes and radii from the scale tokens', () => {
		// Graph nodes keep px because dagre lays them out in px; icon glyph sizes are not type
		const graph = (path: string, selector: string) =>
			path.startsWith('src/lib/components/nodes/') || /svelte-flow__(node|edge)/.test(selector);
		const glyph = /material-symbols|icon|spinner|chevron/i;
		const kept = new Set([
			'src/lib/components/Breadcrumb.svelte .dropdown-color border-radius',
			'src/lib/components/Dropzone.svelte .hero-text h1 font-size',
			'src/lib/components/LoadingOverlay.svelte .progress-bar border-radius',
			'src/lib/components/LoadingOverlay.svelte .progress-fill border-radius',
			'src/lib/components/SettingsModal.svelte .settings-range border-radius',
			'src/lib/components/ZUICanvas.svelte .hover-edge-dot border-radius',
			'src/lib/components/ZUICanvas.svelte .legend-color border-radius',
			'src/lib/styles/code.css .section-category-bar border-radius',
			'src/routes/docs/[lang]/[...slug]/+page.svelte .docs-content :global(h2) font-size',
			'src/routes/explore/+page.svelte .explore-hero h1 font-size',
			'src/routes/explore/[slug]/+page.svelte .state h2 font-size'
		]);
		const offenders = STYLES.flatMap(({ path, css }) =>
			declarations(css)
				.filter(({ prop }) => prop === 'font-size' || /^border(-\w+-\w+)?-radius$/.test(prop))
				.filter(({ value }) => /\d(px|rem)\b/.test(value))
				.filter(({ selector }) => !graph(path, selector))
				.filter(({ selector, prop }) => !(prop === 'font-size' && glyph.test(selector)))
				.filter(({ selector, prop }) => !kept.has(`${path} ${selector} ${prop}`))
				.map(({ selector, prop, value }) => `${path} ${selector} { ${prop}: ${value} }`)
		);

		expect(offenders).toEqual([]);
	});

	it.each<[string, Map<string, string>]>([
		['light', LIGHT],
		['dark', DARK]
	])('each edge legend swatch matches the stroke of its edge type in %s mode', (_mode, theme) => {
		const types: SemanticEdge['type'][] = ['depends_on', 'calls', 'extends', 'uses'];
		const edges = toSemanticFlowEdges({
			parentId: null,
			nodes: [],
			edges: types.map((type) => ({ id: type, source: 'a', target: 'b', type })),
			breadcrumbLabel: ''
		});

		const mismatches = types.flatMap((type, i) => {
			const swatch = theme.get(`--color-edge-${type.replace('_', '-')}`);
			const stroke = String(edges[i].style).match(/stroke: (#[0-9a-f]+)/i)?.[1];
			return swatch === stroke ? [] : [`${type}: swatch ${swatch}, stroke ${stroke}`];
		});

		expect(mismatches).toEqual([]);
	});
});
