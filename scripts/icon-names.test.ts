import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconNames, readSources } from './icon-names.mjs';

const repo = join(__dirname, '..');
const fontsDir = join(repo, 'src/lib/fonts');
const manifest: {
	icons: string[];
	files: { file: string; source: string; sha256: string }[];
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
		for (const { file, sha256 } of manifest.files) {
			const actual = createHash('sha256')
				.update(readFileSync(join(fontsDir, file)))
				.digest('hex');
			expect(actual, `${file}: ${REFETCH}`).toBe(sha256);
		}
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
		['a word that is not a name', `<span class="material-symbols-outlined">Arrow Back</span>`]
	])('rejects %s it cannot see through', (_, source) => {
		expect(() => iconNames([svelte(source)])).toThrow(/src\/A\.svelte:1/);
	});
});
