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
	return { Parser, Language };
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

async function parse(filePath: string, content: string): Promise<Outline[]> {
	const language = detectLanguage(filePath);
	await onmessage({ data: { type: 'parse', filePath, content, language } });
	const result = posted.pop() as { type: string; symbols?: ASTSymbol[]; error?: string };
	expect(result).toMatchObject({ type: 'parse-result', filePath });
	return result.symbols!.map((s) => ({
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
});
