import { describe, it, expect } from 'vitest';
import { buildCodeMap, fileFromAst } from './codeMapBuilder';
import { toWireFile } from './skeletonExtractor';
import type { FileRecord, FilePath, SymbolId } from '$lib/types/codeMap';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';

function makeAstMap(): Map<string, ASTSymbol[]> {
	const map = new Map<string, ASTSymbol[]>();
	map.set('main.py', [
		{ name: 'from flask import Flask', kind: 'import', lineStart: 1, lineEnd: 1 },
		{ name: 'create_app', kind: 'function', lineStart: 3, lineEnd: 10 },
		{
			name: 'App',
			kind: 'class',
			lineStart: 12,
			lineEnd: 30,
			children: [
				{ name: 'run', kind: 'method', lineStart: 15, lineEnd: 20 },
				{ name: 'stop', kind: 'method', lineStart: 22, lineEnd: 28 }
			]
		},
		{ name: 'config', kind: 'variable', lineStart: 32, lineEnd: 32 }
	]);
	map.set('utils.ts', [
		{ name: 'import { z } from "zod"', kind: 'import', lineStart: 1, lineEnd: 1 },
		{ name: 'formatDate', kind: 'function', lineStart: 3, lineEnd: 8 },
		{ name: 'IConfig', kind: 'interface', lineStart: 10, lineEnd: 15 },
		{ name: 'ConfigType', kind: 'type', lineStart: 17, lineEnd: 17 }
	]);
	map.set('lib.go', [
		{ name: 'import "fmt"', kind: 'import', lineStart: 3, lineEnd: 3 },
		{ name: 'Handler', kind: 'class', lineStart: 5, lineEnd: 20 }
	]);
	return map;
}

describe('skeleton v2 code map', () => {
	it('keeps the line range and every kind the wire drops', () => {
		const record = fileFromAst('utils.ts', makeAstMap().get('utils.ts')!);

		expect(record.symbols.map((s) => [s.name, s.kind, s.lines])).toEqual([
			['formatDate', 'function', { start: 3, end: 8 }],
			['IConfig', 'interface', { start: 10, end: 15 }],
			['ConfigType', 'type', { start: 17, end: 17 }]
		]);
	});

	it('records each import with its line, waiting for a resolver', () => {
		const record = fileFromAst('lib.go', makeAstMap().get('lib.go')!);

		expect(record.imports).toEqual([
			{ line: 3, text: 'import "fmt"', module: { state: 'pending' }, specifiers: null }
		]);
		expect(record.reexports).toEqual([]);
		expect(record.refs).toEqual([]);
		expect(record.lines).toEqual({ start: 1, end: null });
	});

	it('keeps an export-from statement out of the imports the wire sends', () => {
		const imported: ASTSymbol = {
			name: "import { a } from './a'",
			kind: 'import',
			lineStart: 1,
			lineEnd: 1
		};
		const reexported: ASTSymbol = {
			name: "export * from './b'",
			kind: 'import',
			lineStart: 2,
			lineEnd: 2
		};

		const record = fileFromAst('index.ts', [imported, reexported]);

		expect(record.imports.map((site) => site.text)).toEqual([imported.name]);
		expect(record.reexports).toEqual([
			{ line: 2, text: reexported.name, module: { state: 'pending' }, specifiers: null }
		]);
		expect(toWireFile('index.ts', record)).toEqual(
			toWireFile('index.ts', fileFromAst('index.ts', [imported]))
		);
	});

	it('names symbols by file and nesting, numbering duplicates', () => {
		const record = fileFromAst('svc.ts', [
			{
				name: 'Server',
				kind: 'class',
				lineStart: 1,
				lineEnd: 9,
				children: [
					{ name: 'start', kind: 'method', lineStart: 2, lineEnd: 4 },
					{ name: 'start', kind: 'method', lineStart: 5, lineEnd: 8 }
				]
			},
			{ name: 'Stop', kind: 'method', lineStart: 11, lineEnd: 12, parentName: 'Server' }
		]);

		const ids = (symbols: FileRecord['symbols']): string[] =>
			symbols.flatMap((s) => [s.id, ...ids(s.children)]);
		expect(ids(record.symbols)).toEqual([
			'svc.ts#Server',
			'svc.ts#Server.start',
			'svc.ts#Server.start~2',
			'svc.ts#Server.Stop'
		]);
	});

	it('builds a record for every parsed file, empty ones included, in parser order', () => {
		const astMap = makeAstMap();
		astMap.set('empty.ts', []);

		const map = buildCodeMap(astMap, null);

		expect(map.version).toBe(2);
		expect([...map.files.keys()]).toEqual(['main.py', 'utils.ts', 'lib.go', 'empty.ts']);
	});

	it('sends the same wire file whatever sites and bindings are filled in', () => {
		const record = fileFromAst('main.py', makeAstMap().get('main.py')!);
		const flask = { kind: 'external', module: 'flask', name: 'Flask' } as const;
		const resolved: FileRecord = {
			...record,
			lines: { start: 1, end: 12 },
			imports: record.imports.map((site) => ({
				...site,
				module: {
					state: 'bound',
					candidates: [
						{
							to: { kind: 'external', module: 'flask', name: null },
							provenance: { source: 'resolver', confidence: 'EXTRACTED' }
						}
					]
				},
				specifiers: [
					{
						kind: 'named',
						name: 'Flask',
						local: 'Flask',
						typeOnly: false,
						target: {
							state: 'bound',
							candidates: [
								{ to: flask, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }
							]
						}
					}
				]
			})),
			reexports: [
				{
					line: 2,
					text: "export * from './routes'",
					module: { state: 'unresolved' },
					specifiers: []
				}
			],
			refs: [
				{
					kind: 'calls',
					line: 4,
					from: 'main.py#create_app' as SymbolId,
					written: 'Flask',
					target: {
						state: 'bound',
						candidates: [{ to: flask, provenance: { source: 'resolver', confidence: 'EXTRACTED' } }]
					}
				}
			]
		};

		expect(JSON.stringify(toWireFile('main.py', resolved))).toBe(
			JSON.stringify(toWireFile('main.py', record))
		);
	});

	it('places each call site in the innermost symbol whose lines hold it', () => {
		const symbols: ASTSymbol[] = [
			{
				name: 'Server',
				kind: 'class',
				lineStart: 1,
				lineEnd: 9,
				children: [{ name: 'start', kind: 'method', lineStart: 2, lineEnd: 4 }]
			},
			{ name: 'boot', kind: 'function', lineStart: 11, lineEnd: 11 },
			{ name: 'halt', kind: 'function', lineStart: 11, lineEnd: 12 }
		];
		const refs: ASTRef[] = [
			{ kind: 'calls', line: 3, written: 'this.listen' },
			{ kind: 'calls', line: 6, written: 'config.load' },
			{ kind: 'calls', line: 11, written: 'start' },
			{ kind: 'calls', line: 12, written: 'stop' },
			{ kind: 'dynamic_import', line: 14, written: './late' }
		];

		const record = fileFromAst('svc.ts', symbols, refs);

		expect(record.refs.map((ref) => [ref.line, ref.from, ref.written])).toEqual([
			[3, 'svc.ts#Server.start', 'this.listen'],
			[6, 'svc.ts#Server', 'config.load'],
			// Two symbols on one line: the first one holds the call
			[11, 'svc.ts#boot', 'start'],
			[12, 'svc.ts#halt', 'stop'],
			[14, null, './late']
		]);
		expect(record.refs.every((ref) => ref.target.state === 'pending')).toBe(true);
	});

	it('gives a class base to the class that starts on its owner line, or drops it', () => {
		const symbols: ASTSymbol[] = [
			{ name: 'outer', kind: 'function', lineStart: 1, lineEnd: 5 },
			{
				name: 'Shapes',
				kind: 'class',
				lineStart: 7,
				lineEnd: 12,
				children: [{ name: 'Circle', kind: 'class', lineStart: 8, lineEnd: 10 }]
			}
		];
		const refs: ASTRef[] = [
			{ kind: 'inherits', line: 2, written: 'Base', ownerLine: 2 },
			{ kind: 'inherits', line: 8, written: 'Shape', ownerLine: 8 },
			{ kind: 'implements', line: 9, written: 'Drawable', ownerLine: 8 }
		];

		const record = fileFromAst('shapes.ts', symbols, refs);

		expect(record.refs.map((ref) => [ref.kind, ref.line, ref.from, ref.written])).toEqual([
			['inherits', 8, 'shapes.ts#Shapes.Circle', 'Shape'],
			['implements', 9, 'shapes.ts#Shapes.Circle', 'Drawable']
		]);
	});

	it('fills sites per file from the parser refs given to the map', () => {
		const astMap = makeAstMap();
		const refMap = new Map<string, ASTRef[]>([
			['main.py', [{ kind: 'calls', line: 4, written: 'Flask' }]]
		]);

		const map = buildCodeMap(astMap, null, { refs: refMap });

		expect(map.files.get('main.py' as FilePath)?.refs).toEqual([
			{
				kind: 'calls',
				line: 4,
				from: 'main.py#create_app',
				written: 'Flask',
				target: { state: 'pending' }
			}
		]);
		expect(map.files.get('utils.ts' as FilePath)?.refs).toEqual([]);
	});

	it('names the file on the wire by the path the request uses', () => {
		const record = fileFromAst('project/src/a.ts', [
			{ name: 'run', kind: 'function', lineStart: 1, lineEnd: 2 }
		]);

		const wire = toWireFile('src/a.ts', record);

		expect(record.path).toBe('project/src/a.ts' as FilePath);
		expect(wire?.path).toBe('src/a.ts');
	});

	it('sends nothing for a file of local-only kinds', () => {
		const record = fileFromAst('types.ts', [
			{ name: 'Only', kind: 'interface', lineStart: 1, lineEnd: 3 }
		]);

		expect(toWireFile('types.ts', record)).toBeNull();
		expect(record.symbols).toHaveLength(1);
	});
});
