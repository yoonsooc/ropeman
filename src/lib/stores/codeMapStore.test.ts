import { describe, it, expect, beforeEach } from 'vitest';
import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { FilePath } from '$lib/types/codeMap';
import { codeMapStore, type CodeMapInput } from './codeMapStore.svelte';
import { projectStore } from './projectStore.svelte';

const importOf = (text: string): ASTSymbol => ({
	name: text,
	kind: 'import',
	lineStart: 1,
	lineEnd: 1
});
const fn = (name: string): ASTSymbol => ({ name, kind: 'function', lineStart: 2, lineEnd: 4 });

function parsed(): CodeMapInput {
	return {
		astMap: new Map([
			['app/src/main.ts', [importOf("import { save } from '@/store'"), fn('run')]],
			['app/src/store.ts', [fn('save')]]
		]),
		root: 'app',
		refs: new Map<string, ASTRef[]>([
			['app/src/main.ts', [{ kind: 'calls', line: 3, written: 'save' }]]
		]),
		configs: new Map([
			['app/tsconfig.json', '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }']
		])
	};
}

/** Set the parse on the project, as every loader does, then build. */
function finishParse(input: CodeMapInput) {
	projectStore.astMap = input.astMap;
	codeMapStore.build(input);
}

const main = 'app/src/main.ts' as FilePath;

describe('codeMapStore', () => {
	beforeEach(() => {
		projectStore.reset();
	});

	it('has no map before a parse finishes', () => {
		expect(codeMapStore.map).toBeNull();
	});

	it('binds imports through the configs and keeps the parser refs', () => {
		finishParse(parsed());

		const record = codeMapStore.map!.files.get(main)!;
		expect(record.imports[0].module).toEqual({
			state: 'bound',
			candidates: [
				{
					to: { kind: 'file', path: 'app/src/store.ts' },
					provenance: { source: 'resolver', confidence: 'EXTRACTED' }
				}
			]
		});
		expect(record.refs).toEqual([expect.objectContaining({ kind: 'calls', line: 3 })]);
	});

	it('drops the map when the next project resets the stores', () => {
		finishParse(parsed());

		projectStore.reset();

		expect(codeMapStore.map).toBeNull();
	});

	it('drops the map when a re-parse replaces the astMap, until that parse builds its own', () => {
		finishParse(parsed());
		const first = codeMapStore.map;
		const again = parsed();

		projectStore.astMap = again.astMap;
		const between = codeMapStore.map;
		codeMapStore.build(again);

		expect(between).toBeNull();
		expect(codeMapStore.map).not.toBe(first);
		expect(codeMapStore.map!.files.has(main)).toBe(true);
	});
});
