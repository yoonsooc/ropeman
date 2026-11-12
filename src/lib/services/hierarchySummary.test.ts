import { describe, it, expect } from 'vitest';
import type { ASTSymbol } from '$lib/types/ast';
import { buildCodeMap } from './codeMapBuilder';
import { summarizeHierarchy } from './hierarchySummary';

const fn = (name: string, line = 3): ASTSymbol => ({
	name,
	kind: 'function',
	lineStart: line,
	lineEnd: line
});
const imp = (text: string): ASTSymbol => ({ name: text, kind: 'import', lineStart: 1, lineEnd: 1 });

function summary(files: Record<string, ASTSymbol[]>) {
	return summarizeHierarchy(buildCodeMap(new Map(Object.entries(files)), null));
}

describe('summarizeHierarchy', () => {
	it('counts files and nested symbols at every folder up to the root', () => {
		// Arrange
		const cls: ASTSymbol = {
			name: 'Shop',
			kind: 'class',
			lineStart: 1,
			lineEnd: 9,
			children: [{ name: 'buy', kind: 'method', lineStart: 2, lineEnd: 3 }]
		};

		// Act
		const root = summary({
			'README.md': [],
			'src/app/shop.ts': [cls],
			'src/app/cart.ts': [fn('add')],
			'src/util/fmt.ts': [fn('fmt')]
		});

		// Assert
		expect(root).toMatchObject({ path: '', files: 4, symbols: 4, ownFiles: 1 });
		const [src] = root.children;
		expect(src).toMatchObject({ path: 'src', files: 3, symbols: 4, ownFiles: 0 });
		expect(src.children.map((g) => [g.path, g.files, g.symbols])).toEqual([
			['src/app', 2, 3],
			['src/util', 1, 1]
		]);
	});

	it('counts each resolved import once, at the deepest folder holding both ends', () => {
		// Act
		const root = summary({
			'main.ts': [imp("import { add } from './src/app/cart'")],
			'src/app/cart.ts': [imp("import { fmt } from '../util/fmt'"), fn('add')],
			'src/app/shop.ts': [imp("import { add } from './cart'"), imp("import x from 'lodash'")],
			'src/util/fmt.ts': [fn('fmt')],
			'src/util/num.ts': [imp("import { fmt } from '../util/fmt'")]
		});

		// Assert
		expect(root.links).toEqual([{ from: '', to: 'src', imports: 1 }]);
		const [src] = root.children;
		expect(src.links).toEqual([{ from: 'src/app', to: 'src/util', imports: 1 }]);
		// Imports between files of one folder stay inside it, and packages are not files
		expect(src.children.flatMap((g) => g.links)).toEqual([]);
	});

	it('lists folders and links in path order whatever order the files came in', () => {
		// Act
		const forward = summary({ 'a/x.ts': [imp("import './../b/y'")], 'b/y.ts': [] });
		const backward = summary({ 'b/y.ts': [], 'a/x.ts': [imp("import './../b/y'")] });

		// Assert
		expect(backward).toEqual(forward);
		expect(forward.children.map((g) => g.path)).toEqual(['a', 'b']);
	});
});
