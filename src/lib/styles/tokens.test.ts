import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
	it.each([
		['light', LIGHT],
		['dark', DARK]
	] as const)('every role pair meets its WCAG AA floor in %s mode', (_mode, theme) => {
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
		const offenders = SOURCES.filter(({ path }) => /\.(svelte|css)$/.test(path)).flatMap(
			({ path, text }) => {
				const css = path.endsWith('.svelte')
					? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
					: text;
				return css
					.replace(/\/\*[\s\S]*?\*\//g, '')
					.split('\n')
					.filter((line) => literal.test(line) && !/^\s*--[\w-]+\s*:/.test(line))
					.map((line) => `${path}: ${line.trim()}`);
			}
		);

		expect(offenders).toEqual([]);
	});
});
