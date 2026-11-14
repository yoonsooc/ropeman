import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { detectLanguage } from '$lib/utils/languageDetector';
import type { ASTSymbol } from '$lib/types/ast';

// The worker loads `/tree-sitter*.wasm` URLs; in Node those resolve to the files in static/.
vi.mock('web-tree-sitter', async (importOriginal) => {
	const real = await importOriginal<typeof import('web-tree-sitter')>();
	const { fileURLToPath } = await import('node:url');
	const fromStatic = (url: string) =>
		fileURLToPath(new URL(`../../../static${url}`, import.meta.url));

	class Parser extends real.Parser {
		static init() {
			return real.Parser.init({ locateFile: () => fromStatic('/tree-sitter.wasm') });
		}
	}
	const Language = { load: (url: string) => real.Language.load(fromStatic(url)) };
	return { Parser, Language, Query: real.Query };
});

type Outline = { name: string; kind: string; children?: string[] };

const posted: unknown[] = [];
let onmessage: (e: { data: unknown }) => Promise<void>;

beforeAll(async () => {
	const workerScope = { postMessage: (msg: unknown) => posted.push(msg), onmessage: null };
	vi.stubGlobal('self', workerScope);
	await import('./parserWorker');
	onmessage = workerScope.onmessage as unknown as typeof onmessage;
	await onmessage({ data: { type: 'init' } });
	expect(posted.pop()).toEqual({ type: 'init-done' });
});

afterAll(() => {
	vi.unstubAllGlobals();
});

async function parseSymbols(filePath: string, content: string): Promise<ASTSymbol[]> {
	const language = detectLanguage(filePath);
	await onmessage({ data: { type: 'parse', filePath, content, language } });
	const result = posted.pop() as { type: string; symbols?: ASTSymbol[]; error?: string };
	expect(result).toMatchObject({ type: 'parse-result', filePath });
	return result.symbols!;
}

async function parse(filePath: string, content: string): Promise<Outline[]> {
	return (await parseSymbols(filePath, content)).map((s) => ({
		name: s.kind === 'import' ? s.name.replace(/\s+/g, ' ') : s.name,
		kind: s.kind,
		...(s.children ? { children: s.children.map((c) => c.name) } : {})
	}));
}

describe('parserWorker', () => {
	it('extracts components, hooks, and imports from a JSX-heavy .tsx file', async () => {
		// Arrange
		const source = `import React, { useState, type ReactNode } from 'react';
import { Card } from './Card';
import type { Theme } from '@/theme';

interface ButtonProps {
	label: string;
	onPress: () => void;
}

export function useCounter(initial: number) {
	const [count, setCount] = useState<number>(initial);
	return { count, increment: () => setCount((c) => c + 1) };
}

const Button = ({ label, onPress }: ButtonProps) => (
	<button className="btn" onClick={onPress}>
		{label}
	</button>
);

export const pick = <T,>(items: T[]): T | undefined => items[0];

export function Layout({ children, theme }: { children: ReactNode; theme: Theme }) {
	const { count, increment } = useCounter(0);
	return (
		<Card title={<strong>Count: {count}</strong>} data-theme={theme}>
			{count > 0 ? <span>{count}</span> : <></>}
			<Button label="+" onPress={increment} />
			{children}
		</Card>
	);
}

export default class Board extends React.Component<{ size: number }> {
	render() {
		return <div style={{ width: this.props.size }}>{this.props.size}</div>;
	}
}
`;

		// Act
		const symbols = await parse('src/components/Layout.tsx', source);

		// Assert
		expect(symbols).toEqual([
			{ name: "import React, { useState, type ReactNode } from 'react';", kind: 'import' },
			{ name: "import { Card } from './Card';", kind: 'import' },
			{ name: "import type { Theme } from '@/theme';", kind: 'import' },
			{ name: 'useCounter', kind: 'function' },
			{ name: 'Button', kind: 'function' },
			{ name: 'pick', kind: 'function' },
			{ name: 'Layout', kind: 'function' },
			{ name: 'Board', kind: 'class', children: ['render'] }
		]);
	});

	it('keeps parsing angle-bracket casts in .ts files with the typescript grammar', async () => {
		// Arrange
		const source = `export const first = (value: unknown) => <number>value;

export function second() {
	return 2;
}
`;

		// Act
		const symbols = await parse('src/lib/casts.ts', source);

		// Assert
		expect(symbols).toEqual([
			{ name: 'first', kind: 'function' },
			{ name: 'second', kind: 'function' }
		]);
	});

	it('reports a parse failure when syntax errors leave no symbols', async () => {
		// Arrange
		const filePath = 'src/broken.py';
		const content = 'def (:\n  )))) class\n garbage {{{{';

		// Act
		await onmessage({ data: { type: 'parse', filePath, content, language: 'python' } });

		// Assert
		expect(posted.pop()).toMatchObject({ type: 'error', filePath });
	});

	it('keeps the symbols of a file that parses with some syntax errors', async () => {
		// Act
		const symbols = await parse('src/half.py', 'def ok():\n    pass\n\ndef broken(:\n');

		// Assert
		expect(symbols.map((s) => s.name)).toContain('ok');
	});

	it('lists each spec of a grouped Go import as its own import at its line', async () => {
		// Arrange
		const source = [
			'package store',
			'',
			'import "errors"',
			'',
			'import (',
			'\t"fmt"',
			'\tapi "example.com/shop/web/api"',
			')',
			'',
			'func New() error { return errors.New(fmt.Sprint(api.X)) }'
		].join('\n');

		// Act
		const symbols = await parseSymbols('store/store.go', source);

		// Assert
		expect(symbols.filter((s) => s.kind === 'import').map((s) => [s.lineStart, s.name])).toEqual([
			[1, 'package store'],
			[3, 'import "errors"'],
			[6, '"fmt"'],
			[7, 'api "example.com/shop/web/api"']
		]);
	});

	it('returns no symbols for a valid file without definitions', async () => {
		// Act
		const symbols = await parse('src/pkg/__init__.py', '# package marker\n');

		// Assert
		expect(symbols).toEqual([]);
	});
});

describe('parserWorker with single-file components', () => {
	const lineOf = (source: string, text: string) =>
		source.split('\n').findIndex((line) => line.includes(text)) + 1;
	const outline = (symbols: ASTSymbol[]) =>
		symbols.map((s) => ({ name: s.name, kind: s.kind, line: s.lineStart }));

	it('reads both script blocks of a generic Svelte 5 component at their file lines', async () => {
		// Arrange
		const source = `<script module lang="ts">
	import type { Snippet } from 'svelte';

	export interface Row {
		id: string;
	}

	export function rowKey(row: Row): string {
		return row.id;
	}
</script>

<script lang="ts" generics="T extends Row">
	import { fade } from 'svelte/transition';
	import Cell from './Cell.svelte';

	let { rows, header }: { rows: T[]; header?: Snippet } = $props();
	let selected = $state<T | null>(null);

	function select(row: T) {
		selected = row;
	}

	const clear = () => (selected = null);
</script>

<table transition:fade>
	{#each rows as row (rowKey(row))}
		<tr class:active={selected === row} onclick={() => select(row)}><Cell {row} /></tr>
	{/each}
</table>

<style>
	.active { font-weight: bold; }
</style>
`;

		// Act
		const symbols = await parseSymbols('src/lib/components/Table.svelte', source);

		// Assert
		expect(outline(symbols)).toEqual([
			{ name: "import type { Snippet } from 'svelte';", kind: 'import', line: 2 },
			{ name: 'rowKey', kind: 'function', line: lineOf(source, 'export function rowKey') },
			{ name: "import { fade } from 'svelte/transition';", kind: 'import', line: 14 },
			{ name: "import Cell from './Cell.svelte';", kind: 'import', line: 15 },
			{ name: 'select', kind: 'function', line: lineOf(source, 'function select') },
			{ name: 'clear', kind: 'function', line: lineOf(source, 'const clear') }
		]);
		expect(symbols.find((s) => s.name === 'select')?.lineEnd).toBe(
			lineOf(source, 'function select') + 2
		);
	});

	it('reads a Svelte 4 component with a context="module" block and a plain JS instance script', async () => {
		// Arrange
		const source = `<script context="module">
	export async function load({ fetch }) {
		return { items: await (await fetch('/api')).json() };
	}
</script>

<script>
	import { onMount } from 'svelte';
	export let items = [];
	$: total = items.length;
	onMount(() => console.log(total));
</script>

<p>{total}</p>
`;

		// Act
		const symbols = await parse('src/routes/List.svelte', source);

		// Assert
		expect(symbols).toEqual([
			{ name: 'load', kind: 'function' },
			{ name: "import { onMount } from 'svelte';", kind: 'import' }
		]);
	});

	it('reads a Vue <script setup lang="ts"> block that follows the template', async () => {
		// Arrange
		const source = `<template>
  <ul>
    <li v-for="item in items" :key="item.id" @click="choose(item)">{{ label(item) }}</li>
  </ul>
</template>

<script lang="ts">
export interface Item {
  id: number;
  name: string;
}
</script>

<script setup lang="ts" generic="T extends Item, M extends Map<string, T>">
import { computed, ref } from 'vue';
import { useStore } from '@/stores/items';

const props = defineProps<{ items: T[] }>();
const emit = defineEmits<{ (e: 'choose', item: T): void }>();
const chosen = ref<T | null>(null);

function choose(item: T) {
  chosen.value = item;
  emit('choose', item);
}

const label = (item: T) => \`\${item.id}: \${item.name}\`;
</script>

<style scoped>
li { cursor: pointer; }
</style>
`;

		// Act
		const symbols = await parseSymbols('src/components/ItemList.vue', source);

		// Assert
		expect(outline(symbols)).toEqual([
			{ name: "import { computed, ref } from 'vue';", kind: 'import', line: 15 },
			{ name: "import { useStore } from '@/stores/items';", kind: 'import', line: 16 },
			{ name: 'choose', kind: 'function', line: lineOf(source, 'function choose') },
			{ name: 'label', kind: 'function', line: lineOf(source, 'const label') }
		]);
	});

	it('reads JSX in a Vue <script lang="tsx"> block with the tsx grammar', async () => {
		// Arrange
		const source = `<script lang="tsx">
import { defineComponent } from 'vue';

export const Badge = (props: { text: string }) => <span class="badge">{props.text}</span>;

export default defineComponent({ render: () => <Badge text="new" /> });
</script>
`;

		// Act
		const symbols = await parse('src/components/Badge.vue', source);

		// Assert
		expect(symbols).toEqual([
			{ name: "import { defineComponent } from 'vue';", kind: 'import' },
			{ name: 'Badge', kind: 'function' }
		]);
	});

	it('returns no symbols for a component without a script', async () => {
		// Act
		const symbols = await parse(
			'src/lib/icons/Logo.svelte',
			'<svg viewBox="0 0 8 8"><path d="M0 0h8v8z" /></svg>\n'
		);

		// Assert
		expect(symbols).toEqual([]);
	});

	it('reports a parse failure when the script of a component has only broken syntax', async () => {
		// Arrange
		const filePath = 'src/lib/components/Broken.svelte';
		const content = '<script lang="ts">\n\tfunction (:\n {{{{ ))))\n</script>\n<p>hi</p>\n';

		// Act
		await onmessage({ data: { type: 'parse', filePath, content, language: 'svelte' } });

		// Assert
		expect(posted.pop()).toMatchObject({ type: 'error', filePath });
	});
});
