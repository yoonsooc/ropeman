import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Language, Parser, Query } from 'web-tree-sitter';
import { LOCALS, QUERIES } from './refQueries';

const staticDir = fileURLToPath(new URL('../../../static/', import.meta.url));
const grammarFiles = readdirSync(staticDir).filter((f) => /^tree-sitter-.+\.wasm$/.test(f));
const languages = new Map<string, Language>();

beforeAll(async () => {
	await Parser.init({ locateFile: () => `${staticDir}web-tree-sitter.wasm` });
	for (const file of grammarFiles) languages.set(file, await Language.load(`${staticDir}${file}`));
});

// extractRefs turns a query that no longer compiles into "no refs" with one console warning, so
// a node type a grammar renamed would pass every build. This compiles each against its grammar.
describe('ref and local queries against the grammars in static/', () => {
	it('name only grammars that exist', () => {
		expect(
			[...Object.keys(QUERIES), ...Object.keys(LOCALS)].filter((f) => !grammarFiles.includes(f))
		).toEqual([]);
	});

	it.each(Object.entries(QUERIES))('%s ref query compiles', (file, source) => {
		// Arrange
		const language = languages.get(file)!;

		// Act
		const compile = () => new Query(language, source).delete();

		// Assert
		expect(compile).not.toThrow();
	});

	it.each(Object.entries(LOCALS))(
		'%s locals query compiles and names real scopes',
		(file, rules) => {
			// Arrange
			const language = languages.get(file)!;
			const nodeTypes = [...rules.scopes, ...(rules.after ?? [])];

			// Act
			const compile = () => new Query(language, rules.query).delete();
			const unknown = nodeTypes.filter((type) => !language.idForNodeType(type, true));

			// Assert
			expect(compile).not.toThrow();
			expect(unknown).toEqual([]);
		}
	);
});
