import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';

const compileQuery = vi.hoisted(() =>
	vi.fn(function () {
		throw new Error('Bad node name');
	})
);

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
	return { Parser, Language, Query: compileQuery };
});

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

describe('parserWorker when a ref query fails to compile', () => {
	it('keeps every file of the grammar with its symbols, compiling and warning once', async () => {
		// Arrange
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const files = [
			['repo/src/a.ts', 'export function a() { b(); }\n'],
			['repo/src/b.ts', 'export class B { run() { a(); } }\n']
		];

		// Act
		const results = [];
		for (const [filePath, content] of files) {
			await onmessage({ data: { type: 'parse', filePath, content, language: 'typescript' } });
			results.push(posted.pop() as { type: string; symbols: ASTSymbol[]; refs: ASTRef[] });
		}

		// Assert
		expect(results.map((r) => [r.type, r.symbols.map((s) => s.name), r.refs])).toEqual([
			['parse-result', ['a'], []],
			['parse-result', ['B'], []]
		]);
		expect(compileQuery).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain('tree-sitter-typescript.wasm');
		warn.mockRestore();
	});
});
