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
const imp = (text: string, line = 1): ASTSymbol => ({
	name: text,
	kind: 'import',
	lineStart: line,
	lineEnd: line
});

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
		expect(root.links).toEqual([{ from: '', to: 'src', relations: 1 }]);
		const [src] = root.children;
		expect(src.links).toEqual([{ from: 'src/app', to: 'src/util', relations: 1 }]);
		// Imports between files of one folder stay inside it, and packages are not files
		expect(src.children.flatMap((g) => g.links)).toEqual([]);
	});

	it('counts a call the code decides between two folders, and not one matched by name', () => {
		// Arrange: Go sees its package without an import, so `Price` joins `model` to `store`
		const astMap = new Map<string, ASTSymbol[]>([
			['go.mod', []],
			['model/price.go', [imp('package model'), fn('Price')]],
			['model/item.go', [imp('package model'), fn('Item', 3)]],
			[
				'store/memory.go',
				[imp('package store'), imp('import "example.com/shop/model"', 2), fn('Put', 5)]
			],
			['store/lookup.go', [imp('package store'), fn('Get', 5)]]
		]);
		const refs = new Map([
			['model/item.go', [{ kind: 'calls' as const, line: 3, written: 'Price' }]],
			['store/memory.go', [{ kind: 'calls' as const, line: 5, written: 'model.Price' }]],
			['store/lookup.go', [{ kind: 'calls' as const, line: 5, written: 'm.Item' }]]
		]);
		const configs = new Map([['go.mod', 'module example.com/shop\n']]);

		// Act
		const root = summarizeHierarchy(buildCodeMap(astMap, null, { refs, configs }));

		// Assert: the import and the call through it; `m.Item` names no method of any type
		expect(root.links).toEqual([{ from: 'store', to: 'model', relations: 2 }]);
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
