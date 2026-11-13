import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconNames, readSources } from './icon-names.mjs';

const repo = join(__dirname, '..');
const fontsDir = join(repo, 'src/lib/fonts');
type Fetched = { file: string; source: string; sha256: string };
const manifest: {
	userAgent: string;
	icons: string[];
	files: Fetched[];
	licenses: Fetched[];
} = JSON.parse(readFileSync(join(fontsDir, 'fonts.json'), 'utf8'));
const REFETCH = 'run `node scripts/fetch-fonts.mjs` to refetch the fonts';

const svelte = (source: string) => ({ path: 'src/A.svelte', source });

describe('self-hosted icon font', () => {
	it('carries exactly the icon names the source can render', () => {
		const used: string[] = iconNames(readSources(repo));

		const missing = used.filter((name) => !manifest.icons.includes(name));
		const unused = manifest.icons.filter((name) => !used.includes(name));

		expect({ missing, unused }, REFETCH).toEqual({ missing: [], unused: [] });
	});

	it('was fetched for the listed names, and the committed files match the manifest', () => {
		const icon = manifest.files.find((f) => f.file.startsWith('material-symbols'));

		expect(new URL(icon!.source).searchParams.get('icon_names'), REFETCH).toBe(
			manifest.icons.join(',')
		);
		const committed = [
			...manifest.files.map((f) => ({ ...f, path: join(fontsDir, f.file) })),
			...manifest.licenses.map((f) => ({ ...f, path: join(repo, 'static/fonts/LICENSES', f.file) }))
		];
		for (const { path, file, sha256 } of committed) {
			const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
			expect(actual, `${file}: ${REFETCH}`).toBe(sha256);
		}
	});

	it('was fetched reproducibly: one recorded user agent, licenses pinned to a commit', () => {
		expect(manifest.userAgent).toMatch(/Chrome\/\d+/);
		for (const { source } of manifest.licenses)
			expect(source).toMatch(
				/^https:\/\/raw\.githubusercontent\.com\/google\/[\w-]+\/[0-9a-f]{40}\//
			);
	});

	it('fails when the source renders a name the font lacks', () => {
		const files = [
			...readSources(repo),
			svelte('<span class="material-symbols-outlined">rocket_launch</span>')
		];

		const used: string[] = iconNames(files);

		expect(used.filter((name) => !manifest.icons.includes(name))).toEqual(['rocket_launch']);
	});
});

describe('iconNames', () => {
	it('reads ligature text, ternaries and class directives', () => {
		const names = iconNames([
			svelte(`<span class="x material-symbols-outlined"
				>arrow_back</span
			>
			<span class="material-symbols-outlined">{open ? 'expand_less' : 'expand_more'}</span>
			<i class:material-symbols-outlined={true}>close</i>
			<span class="label">not_an_icon</span>`)
		]);

		expect(names).toEqual(['arrow_back', 'close', 'expand_less', 'expand_more']);
	});

	it('resolves a variable declared in the same component, through a lookup map', () => {
		const names = iconNames([
			svelte(`<script lang="ts">
				let { state }: { state: 'a' | 'b' } = $props();
				const icon = $derived({ a: 'block', b: 'help' }[state]);
			</script>
			<span class="material-symbols-outlined">{icon}</span>`)
		]);

		expect(names).toEqual(['block', 'help']);
	});

	it('collects `icon` fields from TypeScript modules once a template reads `.icon`', () => {
		const module = {
			path: 'src/lib/icons.ts',
			source: `const s = '</script>';
				export const get = (open: boolean) => ({ icon: open ? 'folder_open' : 'folder' });
				export const emoji = { icon: '⚡' };`
		};
		const reader = svelte('<span class="material-symbols-outlined">{get(true).icon}</span>');

		expect(iconNames([module])).toEqual([]);
		expect(iconNames([module, reader])).toEqual(['folder', 'folder_open']);
	});

	it.each([
		[
			'a prop',
			`<script>let { name } = $props();</script><span class="material-symbols-outlined">{name}</span>`
		],
		['a call', `<span class="material-symbols-outlined">{pick()}</span>`],
		['an undeclared name', `<span class="material-symbols-outlined">{nowhere}</span>`],
		['a word that is not a name', `<span class="material-symbols-outlined">Arrow Back</span>`],
		['a component', `<Icon class="material-symbols-outlined">home</Icon>`],
		[
			'a dynamic element',
			`<svelte:element this="span" class="material-symbols-outlined">home</svelte:element>`
		]
	])('rejects %s it cannot see through', (_, source) => {
		expect(() => iconNames([svelte(source)])).toThrow(/src\/A\.svelte:1/);
	});

	it.each([
		[
			'a stylesheet',
			'src/a.css',
			`.a {}\n.b::before { font: 20px 'Material Symbols Outlined'; }`,
			2
		],
		[
			'a selector list that includes the class',
			'src/a.css',
			`.material-symbols-outlined, .b { font-family: 'Material Symbols Outlined'; }`,
			1
		],
		[
			'a component style',
			'src/A.svelte',
			`<i>x</i>\n<style>\n\t@media (x) { .b { font-family: 'Material Symbols Outlined'; } }\n</style>`,
			3
		],
		[
			'an inline style',
			'src/A.svelte',
			`<i style="font-family: Material Symbols Outlined">home</i>`,
			1
		],
		['a script string', 'src/a.ts', `el.style.fontFamily = 'Material Symbols Outlined';`, 1]
	])('rejects the icon font family named in %s', (_, path, source, line) => {
		expect(() => iconNames([{ path, source }])).toThrow(
			`${path}:${line} names the icon font family`
		);
	});

	it('allows the icon font family in @font-face and in the icon class rule', () => {
		const css = `@font-face { font-family: 'Material Symbols Outlined'; }
			.material-symbols-outlined { font-family: 'Material Symbols Outlined'; }`;

		expect(iconNames([{ path: 'src/a.css', source: css }])).toEqual([]);
	});
});
