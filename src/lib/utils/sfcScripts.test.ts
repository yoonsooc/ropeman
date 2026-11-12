import { describe, it, expect } from 'vitest';
import { componentScriptSource, isComponentLanguage } from './sfcScripts';

const lines = (text: string) => text.split('\n');

describe('componentScriptSource', () => {
	it('keeps the script body on its own lines and blanks the markup and styles', () => {
		// Arrange
		const source = `<script lang="ts">
	import Card from './Card.svelte';
</script>

<Card title="hi" />

<style>
	.card { color: red; }
</style>
`;

		// Act
		const { content } = componentScriptSource('src/App.svelte', source);

		// Assert
		expect(content).toHaveLength(source.length);
		expect(lines(content)).toHaveLength(lines(source).length);
		expect(lines(content)[1]).toBe(`\timport Card from './Card.svelte';`);
		expect(content).not.toMatch(/Card title|color|<\/?script|<style/);
	});

	it('keeps every script block of a Svelte component', () => {
		// Arrange
		const source = `<script context="module" lang="ts">
	export const prerender = true;
</script>

<script module>
	export function shared() {}
</script>

<script lang="ts">
	let count = $state(0);
</script>
`;

		// Act
		const { content } = componentScriptSource('src/Counter.svelte', source);

		// Assert
		expect(content).toContain('export const prerender = true;');
		expect(content).toContain('export function shared() {}');
		expect(content).toContain('let count = $state(0);');
	});

	it('reads a `>` inside a quoted generics attribute as part of the tag', () => {
		// Arrange
		const source = `<script setup lang="ts" generic="T extends Record<string, unknown>, U">
const pick = (items: T[]) => items[0];
</script>`;

		// Act
		const { content } = componentScriptSource('src/List.vue', source);

		// Assert
		expect(content.trim()).toBe('const pick = (items: T[]) => items[0];');
	});

	it.each([
		['<script>', 'src/A.svelte.js', 'javascript'],
		['<script lang="js">', 'src/A.svelte.js', 'javascript'],
		['<script lang="jsx">', 'src/A.svelte.js', 'javascript'],
		['<script lang="ts">', 'src/A.svelte.ts', 'typescript'],
		["<script lang='typescript'>", 'src/A.svelte.ts', 'typescript'],
		['<script type="text/typescript">', 'src/A.svelte.ts', 'typescript'],
		['<script lang="tsx">', 'src/A.svelte.tsx', 'typescript']
	])('chooses the grammar of %s', (openTag, filePath, language) => {
		// Act
		const result = componentScriptSource('src/A.svelte', `${openTag}\nlet a = 1;\n</script>`);

		// Assert
		expect(result).toMatchObject({ filePath, language });
	});

	it('reads a file with a TS block and a JS block as TypeScript', () => {
		// Act
		const result = componentScriptSource(
			'src/A.vue',
			'<script>\nexport default {};\n</script>\n<script setup lang="ts">\nlet a: number = 1;\n</script>'
		);

		// Assert
		expect(result).toMatchObject({ filePath: 'src/A.vue.ts', language: 'typescript' });
		expect(result.content).toContain('export default {};');
	});

	it('leaves out scripts that hold no component code', () => {
		// Arrange
		const source = `<!-- <script>const commented = 1;</script> -->
<script type="application/ld+json">{ "@context": "https://schema.org" }</script>
<script lang="coffee">square = (x) -> x * x</script>
<script src="https://example.com/analytics.js" />
<script lang="ts">
	const kept = 1;
</script>
`;

		// Act
		const { content } = componentScriptSource('src/Page.svelte', source);

		// Assert
		expect(content.trim()).toBe('const kept = 1;');
	});

	it('does not let a script tag written inside a template string swallow later blocks', () => {
		// Regression shape from this repo's docs page: the closing tag is split so it never ends the string
		const source = `<script lang="ts">
	const ldJson = '{}';
</script>

<svelte:head>
	{@html \`<script type="application/ld+json">\${ldJson}<\` + \`/script>\`}
</svelte:head>
`;

		// Act
		const { content } = componentScriptSource('src/+page.svelte', source);

		// Assert
		expect(content.trim()).toBe(`const ldJson = '{}';`);
	});

	it('keeps Windows line endings so line numbers still match', () => {
		// Arrange
		const source =
			'<template>\r\n  <p>hi</p>\r\n</template>\r\n<script setup>\r\nlet a = 1;\r\n</script>\r\n';

		// Act
		const { content } = componentScriptSource('src/A.vue', source);

		// Assert
		expect(content.split('\r\n')[4]).toBe('let a = 1;');
	});

	it('returns blank JavaScript for a component without a script', () => {
		// Act
		const result = componentScriptSource('src/Icon.svelte', '<svg viewBox="0 0 1 1"></svg>\n');

		// Assert
		expect(result.language).toBe('javascript');
		expect(result.content.trim()).toBe('');
	});
});

describe('isComponentLanguage', () => {
	it('is true only for single-file component languages', () => {
		expect(isComponentLanguage('svelte')).toBe(true);
		expect(isComponentLanguage('vue')).toBe(true);
		expect(isComponentLanguage('typescript')).toBe(false);
	});
});
