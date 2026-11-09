import { describe, it, expect } from 'vitest';
import { extractMarkdownSymbols } from './markdownOutline';

describe('extractMarkdownSymbols', () => {
	it('reads frontmatter name and description, ignoring other keys', () => {
		// Arrange
		const md = [
			'---',
			'name: catchup',
			'description: "Read the latest history"',
			'license: MIT',
			'---',
			'# Catchup'
		].join('\n');

		// Act
		const symbols = extractMarkdownSymbols(md);

		// Assert
		const fm = symbols.filter((s) => s.kind === 'frontmatter');
		expect(fm.map((s) => s.name)).toEqual([
			'name: catchup',
			'description: Read the latest history'
		]);
		expect(fm[0].lineStart).toBe(2);
	});

	it('joins a folded description block', () => {
		const md = [
			'---',
			'description: >',
			'  Use when the user',
			'  asks for a review.',
			'name: review',
			'---'
		].join('\n');

		const symbols = extractMarkdownSymbols(md);

		expect(symbols.map((s) => s.name)).toEqual([
			'description: Use when the user asks for a review.',
			'name: review'
		]);
	});

	it('nests H1–H6 headings by level and sets section line ranges', () => {
		const md = [
			'# Skill',
			'intro',
			'## Setup',
			'### Install',
			'#### Flags',
			'## Usage',
			'text'
		].join('\n');

		const symbols = extractMarkdownSymbols(md);

		expect(symbols).toHaveLength(1);
		const root = symbols[0];
		expect(root).toMatchObject({ name: 'Skill', kind: 'heading', lineStart: 1, lineEnd: 7 });
		expect(root.children!.map((c) => c.name)).toEqual(['Setup', 'Usage']);
		const setup = root.children![0];
		expect(setup.lineEnd).toBe(5);
		expect(setup.children![0].children![0]).toMatchObject({ name: 'Flags', parentName: 'Install' });
	});

	it('ignores headings and links inside fenced code', () => {
		const md = [
			'# Real',
			'```bash',
			'# not a heading',
			'[x](scripts/inside.sh)',
			'```',
			'~~~',
			'## also not',
			'~~~'
		].join('\n');

		const symbols = extractMarkdownSymbols(md);

		expect(symbols.map((s) => s.name)).toEqual(['Real']);
	});

	it('keeps relative file links as imports and drops URLs, anchors and images', () => {
		const md = [
			'See [refs](references/checklist.md#top), [run](./scripts/run.sh "title")',
			'and [site](https://example.com), [mail](mailto:a@b.c), [here](#usage), ![img](assets/a.png)',
			'again [refs](references/checklist.md)'
		].join('\n');

		const imports = extractMarkdownSymbols(md).filter((s) => s.kind === 'import');

		expect(imports.map((s) => s.name)).toEqual(['references/checklist.md', './scripts/run.sh']);
	});

	it('never puts paragraph text into symbols', () => {
		const md = '# Title\nThe API key is sk-secret and should stay local.';

		const names = extractMarkdownSymbols(md)
			.map((s) => s.name)
			.join(' ');

		expect(names).not.toContain('sk-secret');
	});

	it('stays fast on pathological lines', () => {
		// Regression: the first heading and link patterns were quadratic on long lines,
		// and markdown is outlined on the main thread
		const md = ['# a' + ' '.repeat(40_000) + 'x#', '['.repeat(40_000), '# ok'].join('\n');

		const started = performance.now();
		const symbols = extractMarkdownSymbols(md);

		expect(performance.now() - started).toBeLessThan(100);
		expect(symbols.map((s) => s.name)).toEqual(['ok']);
	});

	it('does not close a fence on a line with an info string or a shorter fence', () => {
		const md = ['````md', '```js', '# inside', '```', '````', '# after'].join('\n');

		expect(extractMarkdownSymbols(md).map((s) => s.name)).toEqual(['after']);
	});

	it('skips headings and links inside HTML comments', () => {
		const md = [
			'<!--',
			'# hidden',
			'[x](secret/path.md)',
			'-->',
			'# shown <!-- [y](z.md) -->'
		].join('\n');

		expect(extractMarkdownSymbols(md).map((s) => s.name)).toEqual(['shown']);
	});

	it('strips closing hashes and ignores empty headings, which still end a section', () => {
		const md = ['## Title ##', '#', '### C#'].join('\n');

		const symbols = extractMarkdownSymbols(md);

		expect(symbols.map((s) => s.name)).toEqual(['Title', 'C#']);
		expect(symbols[0].lineEnd).toBe(1);
	});

	it('treats a file without frontmatter or headings as empty', () => {
		expect(extractMarkdownSymbols('just text')).toEqual([]);
	});
});
