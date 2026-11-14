import { describe, it, expect } from 'vitest';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { CodeMap, FilePath } from '$lib/types/codeMap';
import { fileFromAst } from './codeMapBuilder';
import { readResolverConfig, resolveImports } from './importResolver';
import { readWritten, resolveRefs } from './refResolver';

type Source = { imports?: string[]; symbols?: ASTSymbol[]; refs?: ASTRef[] };

/** `files` as the parser would hand them over: imports on lines 1..n, then the symbols. */
function resolve(files: Record<string, Source>, configs: Record<string, string> = {}) {
	const map: CodeMap = {
		version: 2,
		root: null,
		files: new Map(
			Object.entries(files).map(([path, { imports = [], symbols = [], refs = [] }]) => {
				const ast: ASTSymbol[] = [
					...imports.map((name, i) => ({
						name,
						kind: 'import' as const,
						lineStart: i + 1,
						lineEnd: i + 1
					})),
					...symbols
				];
				const record = fileFromAst(path, ast, refs);
				return [record.path, record];
			})
		)
	};
	const config = readResolverConfig(new Map(Object.entries(configs)));
	return resolveRefs(resolveImports(map, config).map, config);
}

type Result = ReturnType<typeof resolve>;

/** What the site at `line` written as `written` points at: `EXTRACTED a.py#f`, `ext:json#dumps`. */
function target(result: Result, path: string, line: number, written: string): string {
	const ref = result.map.files
		.get(path as FilePath)!
		.refs.find((r) => r.line === line && r.written === written);
	if (!ref) throw new Error(`no site ${written} at ${path}:${line}`);
	if (ref.target.state !== 'bound') return ref.target.state;
	const [{ to, provenance }] = ref.target.candidates;
	if (to.kind === 'external') return `ext:${to.module}#${to.name}`;
	return `${provenance.confidence} ${to.kind === 'symbol' ? to.id : to.path}`;
}

function reason(result: Result, path: string, line: number): string | undefined {
	const outcome = result.outcomes.find((o) => o.path === path && o.line === line);
	return outcome?.resolution.status === 'unresolved' ? outcome.resolution.reason : undefined;
}

const fn = (name: string, start: number, end = start, extra: Partial<ASTSymbol> = {}) =>
	({ name, kind: 'function', lineStart: start, lineEnd: end, ...extra }) as ASTSymbol;
const method = (name: string, start: number, end = start, parentName?: string) =>
	({ name, kind: 'method', lineStart: start, lineEnd: end, parentName }) as ASTSymbol;
const cls = (name: string, start: number, end: number, children: ASTSymbol[] = []) =>
	({ name, kind: 'class', lineStart: start, lineEnd: end, children }) as ASTSymbol;
const call = (line: number, written: string): ASTRef => ({ kind: 'calls', line, written });
const base = (line: number, written: string, kind: 'inherits' | 'implements' = 'inherits') =>
	({ kind, line, written, ownerLine: line }) as ASTRef;

describe('resolveRefs: Python', () => {
	it('binds an imported name, a module member and a same-file function, and leaves builtins', () => {
		// Arrange
		const files = {
			'shop/pricing.py': { symbols: [fn('total', 10, 12)] },
			'shop/cli.py': {
				imports: ['from .pricing import total', 'import json'],
				symbols: [fn('main', 10, 14), fn('helper', 20, 21)],
				refs: [call(11, 'total'), call(12, 'json.dumps'), call(13, 'helper'), call(14, 'print')]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'shop/cli.py', 11, 'total')).toBe('EXTRACTED shop/pricing.py#total');
		expect(target(result, 'shop/cli.py', 12, 'json.dumps')).toBe('ext:json#dumps');
		expect(target(result, 'shop/cli.py', 13, 'helper')).toBe('EXTRACTED shop/cli.py#helper');
		expect(target(result, 'shop/cli.py', 14, 'print')).toBe('unresolved');
		expect(reason(result, 'shop/cli.py', 14)).toBe('not-in-scope');
	});

	it('finds `self.m` in the class and then its bases, and `super().m` in the bases', () => {
		// Arrange
		const files = {
			'shop/base.py': { symbols: [cls('Repo', 10, 20, [method('save', 11, 12, 'Repo')])] },
			'shop/orders.py': {
				imports: ['from .base import Repo'],
				symbols: [
					cls('OrderRepo', 10, 20, [method('flush', 11, 12, 'OrderRepo'), method('put', 13, 16)])
				],
				refs: [
					base(10, 'Repo'),
					call(14, 'self.flush'),
					call(15, 'self.save'),
					call(16, 'super().save')
				]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'shop/orders.py', 10, 'Repo')).toBe('EXTRACTED shop/base.py#Repo');
		expect(target(result, 'shop/orders.py', 14, 'self.flush')).toBe(
			'EXTRACTED shop/orders.py#OrderRepo.flush'
		);
		expect(target(result, 'shop/orders.py', 15, 'self.save')).toBe(
			'EXTRACTED shop/base.py#Repo.save'
		);
		expect(target(result, 'shop/orders.py', 16, 'super().save')).toBe(
			'EXTRACTED shop/base.py#Repo.save'
		);
	});

	it('infers a member by its only definition and refuses one of several, a library name or a dunder', () => {
		// Arrange
		const files = {
			'a.py': {
				symbols: [
					cls('Order', 10, 20, [method('place', 11), method('get', 12), method('__enter__', 13)])
				]
			},
			'b.py': { symbols: [cls('Cart', 10, 20, [method('clear_all', 11)])] },
			'c.py': { symbols: [cls('Bag', 10, 20, [method('clear_all', 11)])] },
			'main.py': {
				symbols: [fn('run', 10, 20)],
				refs: [
					call(11, 'order.place'),
					call(12, 'cart.clear_all'),
					call(13, 'scope.get'),
					call(14, 'cm.__enter__')
				]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'main.py', 11, 'order.place')).toBe('INFERRED a.py#Order.place');
		expect(target(result, 'main.py', 12, 'cart.clear_all')).toBe('unresolved');
		expect(reason(result, 'main.py', 12)).toBe('ambiguous');
		expect(target(result, 'main.py', 13, 'scope.get')).toBe('unresolved');
		expect(target(result, 'main.py', 14, 'cm.__enter__')).toBe('unresolved');
	});

	it('does not infer a call on another value to the method it is written in (`self.router.add`)', () => {
		// Arrange: a regression from FastAPI, where `FastAPI.add_route` delegates to its router's
		const files = {
			'app.py': {
				symbols: [cls('App', 10, 20, [method('add_route', 11, 13, 'App')])],
				refs: [call(12, 'self.router.add_route')]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'app.py', 12, 'self.router.add_route')).toBe('unresolved');
	});
});

describe('resolveRefs: TypeScript', () => {
	it('binds `this.m`, a namespace member and a dynamic import, and skips platform globals', () => {
		// Arrange
		const files = {
			'src/math.ts': { symbols: [fn('clamp', 10, 11)] },
			'src/log.ts': { symbols: [cls('Logger', 10, 20, [method('warn', 11)])] },
			'src/app.ts': {
				imports: ["import * as math from './math';"],
				symbols: [cls('App', 10, 20, [method('run', 11, 15), method('stop', 16)])],
				refs: [
					call(12, 'this.stop'),
					call(13, 'math.clamp'),
					call(14, 'console.warn'),
					{ kind: 'dynamic_import', line: 15, written: './log' } as ASTRef
				]
			}
		};

		// Act
		const result = resolve(files);
		const app = result.map.files.get('src/app.ts' as FilePath)!;

		// Assert
		expect(target(result, 'src/app.ts', 12, 'this.stop')).toBe('EXTRACTED src/app.ts#App.stop');
		expect(target(result, 'src/app.ts', 13, 'math.clamp')).toBe('EXTRACTED src/math.ts#clamp');
		expect(target(result, 'src/app.ts', 14, 'console.warn')).toBe('unresolved');
		expect(app.refs.find((r) => r.kind === 'dynamic_import')?.target).toEqual({
			state: 'bound',
			candidates: [
				{
					to: { kind: 'file', path: 'src/log.ts' },
					provenance: { source: 'resolver', confidence: 'EXTRACTED' }
				}
			]
		});
	});

	it('leaves `this.values.set` unbound though one class declares `set` (the fixture trap)', () => {
		// Arrange
		const files = {
			'store.ts': {
				symbols: [cls('Store', 10, 20, [method('set', 11, 13), method('get', 14)])],
				refs: [call(12, 'this.values.set')]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'store.ts', 12, 'this.values.set')).toBe('unresolved');
	});
});

describe('resolveRefs: Go', () => {
	const goMod = { 'go.mod': 'module example.com/shop\n' };

	it('sees the package across files, by import path and through a dot import', () => {
		// Arrange
		const files = {
			'model/price.go': { imports: ['package model'], symbols: [fn('PriceOf', 10, 12)] },
			'model/item.go': {
				imports: ['package model'],
				symbols: [fn('Total', 10, 12)],
				refs: [call(11, 'PriceOf')]
			},
			'main.go': {
				imports: [
					'package main',
					'import "example.com/shop/model"',
					'import m "example.com/shop/model"'
				],
				symbols: [fn('main', 10, 13)],
				refs: [call(11, 'model.PriceOf'), call(12, 'm.Total'), call(13, 'fmt.Println')]
			},
			'web/api.go': {
				imports: ['package web', 'import . "example.com/shop/model"'],
				symbols: [fn('Serve', 10, 12)],
				refs: [call(11, 'PriceOf')]
			}
		};

		// Act
		const result = resolve(files, goMod);

		// Assert
		expect(target(result, 'model/item.go', 11, 'PriceOf')).toBe('EXTRACTED model/price.go#PriceOf');
		expect(target(result, 'main.go', 11, 'model.PriceOf')).toBe('EXTRACTED model/price.go#PriceOf');
		expect(target(result, 'main.go', 12, 'm.Total')).toBe('EXTRACTED model/item.go#Total');
		expect(target(result, 'main.go', 13, 'fmt.Println')).toBe('unresolved');
		expect(target(result, 'web/api.go', 11, 'PriceOf')).toBe('EXTRACTED model/price.go#PriceOf');
	});

	it('keeps test files to themselves and an external test package out of the package', () => {
		// Arrange
		const files = {
			'store/helpers_test.go': { imports: ['package store'], symbols: [fn('fixture', 10, 11)] },
			'store/store.go': {
				imports: ['package store'],
				symbols: [fn('Open', 10, 12)],
				refs: [call(11, 'fixture')]
			},
			'store/store_test.go': {
				imports: ['package store'],
				symbols: [fn('TestOpen', 10, 12)],
				refs: [call(11, 'fixture'), call(12, 'Open')]
			},
			'store/ext_test.go': {
				imports: ['package store_test'],
				symbols: [fn('TestExt', 10, 12)],
				refs: [call(11, 'Open')]
			}
		};

		// Act
		const result = resolve(files, goMod);

		// Assert
		expect(target(result, 'store/store.go', 11, 'fixture')).toBe('unresolved');
		expect(target(result, 'store/store_test.go', 11, 'fixture')).toBe(
			'EXTRACTED store/helpers_test.go#fixture'
		);
		expect(target(result, 'store/store_test.go', 12, 'Open')).toBe('EXTRACTED store/store.go#Open');
		expect(target(result, 'store/ext_test.go', 11, 'Open')).toBe('unresolved');
	});

	it('infers a method on a receiver by its only definition, and binds a library name to nothing', () => {
		// Arrange
		const files = {
			'store/memory.go': {
				imports: ['package store'],
				symbols: [method('all', 10, 12, 'Memory'), method('Total', 13, 16, 'Memory')],
				refs: [call(14, 'm.all'), call(15, 'm.mu.Lock')]
			}
		};

		// Act
		const result = resolve(files, goMod);

		// Assert
		expect(target(result, 'store/memory.go', 14, 'm.all')).toBe(
			'INFERRED store/memory.go#Memory.all'
		);
		expect(target(result, 'store/memory.go', 15, 'm.mu.Lock')).toBe('unresolved');
	});
});

describe('resolveRefs: Rust', () => {
	const cargo = { 'Cargo.toml': '[package]\nname = "shop"\nedition = "2021"\n' };

	it('walks `crate::` paths, `Self::` and a type a `use` names', () => {
		// Arrange
		const files = {
			'src/lib.rs': { symbols: [fn('util', 1), fn('model', 2)] },
			'src/util.rs': { symbols: [fn('slug', 10, 12)] },
			'src/model.rs': {
				symbols: [
					cls('Item', 10, 12),
					cls('Item', 13, 20, [method('new', 14, 16, 'Item'), method('with_id', 17, 18, 'Item')])
				],
				refs: [call(15, 'Self::with_id'), call(16, 'crate::util::slug')]
			},
			'src/main.rs': {
				imports: ['use crate::model::Item;'],
				symbols: [fn('main', 10, 12)],
				refs: [call(11, 'Item::new'), call(12, 'Box::new')]
			}
		};

		// Act
		const result = resolve(files, cargo);

		// Assert
		expect(target(result, 'src/model.rs', 15, 'Self::with_id')).toBe(
			'EXTRACTED src/model.rs#Item.with_id'
		);
		expect(target(result, 'src/model.rs', 16, 'crate::util::slug')).toBe(
			'EXTRACTED src/util.rs#slug'
		);
		expect(target(result, 'src/main.rs', 11, 'Item::new')).toBe('EXTRACTED src/model.rs#Item.new');
		expect(target(result, 'src/main.rs', 12, 'Box::new')).toBe('unresolved');
	});

	it('binds `impl Trait for Type` to the trait and never infers a trait method by name', () => {
		// Arrange
		const files = {
			'src/lib.rs': {
				symbols: [
					{
						name: 'Store',
						kind: 'interface',
						lineStart: 10,
						lineEnd: 12,
						children: [method('put', 11)]
					} as ASTSymbol,
					cls('Memory', 13, 13),
					cls('Store for Memory', 14, 16, [method('put', 15, 15, 'Memory')]),
					cls('Clone for Memory', 17, 19, [method('clone', 18, 18, 'Memory')]),
					fn('run', 20, 23)
				],
				refs: [base(14, 'Store', 'implements'), call(21, 'm.clone'), call(22, 'store.put')]
			}
		};

		// Act
		const result = resolve(files, cargo);

		// Assert
		expect(target(result, 'src/lib.rs', 14, 'Store')).toBe('EXTRACTED src/lib.rs#Store');
		expect(target(result, 'src/lib.rs', 21, 'm.clone')).toBe('unresolved');
		expect(target(result, 'src/lib.rs', 22, 'store.put')).toBe('INFERRED src/lib.rs#Store.put');
	});

	it('reads a method call on a lowercase receiver as a method, not as a crate path', () => {
		// Arrange: tokio's `inner.complete_inflight()` once became `ext:inner`
		const files = {
			'src/lib.rs': {
				symbols: [cls('Inner', 10, 12, [method('complete', 11, 11, 'Inner')]), fn('run', 13, 14)],
				refs: [call(14, 'inner.complete')]
			}
		};

		// Act
		const result = resolve(files, cargo);

		// Assert
		expect(target(result, 'src/lib.rs', 14, 'inner.complete')).toBe(
			'INFERRED src/lib.rs#Inner.complete'
		);
	});
});

describe('resolveRefs: languages without imports the resolver reads', () => {
	it('binds Java by package clause, import folder and the enclosing class with its bases', () => {
		// Arrange
		const files = {
			'src/com/shop/model/Entity.java': {
				imports: ['package com.shop.model;'],
				symbols: [cls('Entity', 10, 14, [method('base', 11, 13)])]
			},
			'src/com/shop/model/Item.java': {
				imports: ['package com.shop.model;'],
				symbols: [cls('Item', 10, 20, [method('cents', 11, 13), method('round', 14, 15)])],
				refs: [base(10, 'Entity'), call(12, 'round'), call(12, 'base')]
			},
			'src/com/shop/Checkout.java': {
				imports: ['package com.shop;', 'import com.shop.model.Item;'],
				symbols: [cls('Checkout', 10, 20, [method('total', 11, 13)])],
				refs: [call(12, 'Item')]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'src/com/shop/model/Item.java', 10, 'Entity')).toBe(
			'EXTRACTED src/com/shop/model/Entity.java#Entity'
		);
		expect(target(result, 'src/com/shop/model/Item.java', 12, 'round')).toBe(
			'EXTRACTED src/com/shop/model/Item.java#Item.round'
		);
		expect(target(result, 'src/com/shop/model/Item.java', 12, 'base')).toBe(
			'EXTRACTED src/com/shop/model/Entity.java#Entity.base'
		);
		expect(target(result, 'src/com/shop/Checkout.java', 12, 'Item')).toBe(
			'EXTRACTED src/com/shop/model/Item.java#Item'
		);
	});

	it('infers a name with one definition in the language, and never one of another language', () => {
		// Arrange
		const files = {
			'lib/tax.rb': { symbols: [cls('Tax', 10, 12)] },
			'lib/fees.rb': { symbols: [cls('Fee', 10, 12)] },
			'other/fees.rb': { symbols: [cls('Fee', 10, 12)] },
			'cmd/run.go': { imports: ['package cmd'], symbols: [fn('helper', 10, 11)] },
			'lib/cart.rb': {
				symbols: [cls('Cart', 10, 20, [method('total', 11, 14)])],
				refs: [call(12, 'Tax.new'), call(13, 'Fee.new'), call(14, 'helper')]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'lib/cart.rb', 12, 'Tax.new')).toBe('INFERRED lib/tax.rb#Tax');
		expect(target(result, 'lib/cart.rb', 13, 'Fee.new')).toBe('unresolved');
		expect(target(result, 'lib/cart.rb', 14, 'helper')).toBe('unresolved');
		expect(reason(result, 'lib/cart.rb', 14)).toBe('no-definition');
	});
});

describe('readWritten', () => {
	it.each([
		['a.b.c', { segments: ['a', 'b', 'c'], open: false, sep: '.' }],
		['Foo::<T>::new', { segments: ['Foo', 'new'], open: false, sep: '::' }],
		['$this->save', { segments: ['$this', 'save'], open: false, sep: '.' }],
		['\\App\\helper', { segments: ['App', 'helper'], open: false, sep: '::' }],
		['z.object().strict', { segments: ['strict'], open: true, sep: '.' }],
		['self.0.ready', { segments: ['ready'], open: true, sep: '.' }],
		['handlers[]', null]
	])('reads %s', (text, expected) => {
		// Act
		const written = readWritten(text, false);

		// Assert
		expect(written).toEqual(expected);
	});
});
