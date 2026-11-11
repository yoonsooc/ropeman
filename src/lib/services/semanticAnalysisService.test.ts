import { describe, it, expect, beforeEach } from 'vitest';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import {
	repairJSON,
	closeBrackets,
	escapeControlCharsInStrings,
	parseSemanticLevel
} from './semanticAnalysisService';
import type { SemanticLevel } from '$lib/types/semantic';

// --- closeBrackets ---

describe('closeBrackets', () => {
	it('returns valid JSON unchanged', () => {
		const input = '{"roles":[{"id":"a"}]}';
		const result = closeBrackets(input);
		expect(() => JSON.parse(result)).not.toThrow();
		expect(JSON.parse(result)).toEqual({ roles: [{ id: 'a' }] });
	});

	it('closes missing braces in correct nesting order', () => {
		// roles array → role object → filePaths array → root object
		const input = '{"roles":[{"id":"a","filePaths":["file1.ts","file2.ts"';
		const result = closeBrackets(input);
		expect(() => JSON.parse(result)).not.toThrow();
		const parsed = JSON.parse(result);
		expect(parsed.roles[0].filePaths).toContain('file1.ts');
	});

	it('handles truncated string value inside array', () => {
		// B001 실제 버그: "tensorflow/tensorflow/c/e" 에서 잘림
		const input = '{"roles":[{"id":"core","filePaths":["src/a.ts","src/b';
		const result = closeBrackets(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('closes nested structures: array inside object inside array inside object', () => {
		const input = '{"roles":[{"id":"a","files":["x"]},{"id":"b","files":["y"';
		const result = closeBrackets(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('handles empty input', () => {
		const result = closeBrackets('');
		expect(result).toBe('');
	});

	it('handles input with only opening brace', () => {
		const result = closeBrackets('{');
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('closes unclosed string then brackets', () => {
		const input = '{"key":"unclosed value';
		const result = closeBrackets(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});
});

// --- escapeControlCharsInStrings ---

describe('escapeControlCharsInStrings', () => {
	it('escapes newlines inside JSON strings', () => {
		const input = '{"desc":"line1\nline2"}';
		const result = escapeControlCharsInStrings(input);
		expect(() => JSON.parse(result)).not.toThrow();
		expect(JSON.parse(result).desc).toBe('line1\nline2');
	});

	it('escapes tabs inside JSON strings', () => {
		const input = '{"desc":"col1\tcol2"}';
		const result = escapeControlCharsInStrings(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('does not escape characters outside strings', () => {
		const input = '{\n"key": "value"\n}';
		const result = escapeControlCharsInStrings(input);
		expect(result).toContain('\n');
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('handles already-escaped sequences', () => {
		const input = '{"desc":"already\\nescaped"}';
		const result = escapeControlCharsInStrings(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('handles empty string', () => {
		expect(escapeControlCharsInStrings('')).toBe('');
	});
});

// --- repairJSON ---

describe('repairJSON', () => {
	it('returns valid JSON unchanged', () => {
		const valid =
			'{"roles":[{"id":"a","label":"A","description":"desc","filePaths":[],"keySymbols":[]}]}';
		const result = repairJSON(valid);
		expect(JSON.parse(result)).toEqual(JSON.parse(valid));
	});

	it('removes trailing commas', () => {
		const input = '{"roles":[{"id":"a",},]}';
		const result = repairJSON(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('repairs truncated response with incomplete role object', () => {
		// 실제 버그: Demo Worker maxOutputTokens 부족으로 잘린 응답
		const input =
			'{"roles":[{"id":"core","label":"Core","description":"desc","filePaths":["src/a.ts","src/b.ts","src/c';
		const result = repairJSON(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('uses progressive cut to find longest valid prefix', () => {
		// 2개 role 중 두 번째가 잘림 → 첫 번째는 살려야 함
		const input =
			'{"roles":[{"id":"a","label":"A","description":"d","filePaths":[],"keySymbols":[]},{"id":"b","label":"B","description":"d","filePaths":["src/x';
		const result = repairJSON(input);
		const parsed = JSON.parse(result);
		expect(parsed.roles.length).toBeGreaterThanOrEqual(1);
		expect(parsed.roles[0].id).toBe('a');
	});

	it('handles control characters in AI response', () => {
		const input = '{"roles":[{"id":"a","description":"line1\nline2\ttab"}]}';
		const result = repairJSON(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('handles completely empty input', () => {
		const result = repairJSON('');
		// Should not throw, may return empty or best-effort
		expect(typeof result).toBe('string');
	});
});

// --- parseSemanticLevel ---

describe('parseSemanticLevel', () => {
	const validResponse = JSON.stringify({
		roles: [
			{
				id: 'core',
				label: 'Core Module',
				description: 'The core module',
				filePaths: ['src/core.ts'],
				keySymbols: ['CoreClass']
			},
			{
				id: 'utils',
				label: 'Utilities',
				description: 'Utility functions',
				filePaths: ['src/utils.ts'],
				keySymbols: ['helperFn']
			}
		],
		edges: [{ source: 'core', target: 'utils', label: 'uses', type: 'dependency' }]
	});
	const validInputs = ['src/core.ts', 'src/utils.ts'];

	it('parses valid JSON response into SemanticLevel', () => {
		const level = parseSemanticLevel(validResponse, null, 0, validInputs);
		expect(level.nodes).toHaveLength(2);
		expect(level.edges).toHaveLength(1);
		expect(level.nodes[0].label).toBe('Core Module');
		expect(level.nodes[1].label).toBe('Utilities');
	});

	it('extracts JSON from markdown code block', () => {
		const wrapped = '```json\n' + validResponse + '\n```';
		const level = parseSemanticLevel(wrapped, null, 0, validInputs);
		expect(level.nodes).toHaveLength(2);
	});

	it('sets parentId and depth correctly', () => {
		const level = parseSemanticLevel(validResponse, 'parent-1', 2, validInputs);
		expect(level.parentId).toBe('parent-1');
		expect(level.nodes[0].parentId).toBe('parent-1');
		expect(level.nodes[0].depth).toBe(2);
	});

	it('filters edges with invalid source/target', () => {
		const response = JSON.stringify({
			roles: [{ id: 'a', label: 'A', description: 'd', filePaths: ['a.ts'], keySymbols: [] }],
			edges: [{ source: 'a', target: 'nonexistent', label: 'x', type: 'dependency' }]
		});
		const level = parseSemanticLevel(response, null, 0, ['a.ts']);
		expect(level.nodes).toHaveLength(1);
		expect(level.edges).toHaveLength(0); // filtered out
	});

	it('handles alternative key names (nodes instead of roles)', () => {
		const response = JSON.stringify({
			nodes: [{ id: 'a', label: 'A', description: 'd', filePaths: ['a.ts'], keySymbols: [] }]
		});
		const level = parseSemanticLevel(response, null, 0, ['a.ts']);
		expect(level.nodes).toHaveLength(1);
	});

	it('handles truncated response with fallback extraction', () => {
		// No closing } — should use { fallback
		const truncated =
			'```json\n{"roles":[{"id":"a","label":"A","description":"d","filePaths":["x.ts"],"keySymbols":["fn"';
		const level = parseSemanticLevel(truncated, null, 0, ['x.ts']);
		expect(level.nodes.length).toBeGreaterThanOrEqual(1);
	});

	it('throws on response with no JSON at all', () => {
		expect(() => parseSemanticLevel('This is just plain text with no JSON', null, 0, [])).toThrow();
	});

	it('assigns colors to nodes', () => {
		const level = parseSemanticLevel(validResponse, null, 0, validInputs);
		expect(level.nodes[0].color).toBeTruthy();
		expect(level.nodes[1].color).toBeTruthy();
	});

	it('prefixes node IDs with sem:', () => {
		const level = parseSemanticLevel(validResponse, null, 0, validInputs);
		expect(level.nodes[0].id).toBe('sem:core');
		expect(level.nodes[1].id).toBe('sem:utils');
	});

	it('prefixes edge IDs and source/target with sem:', () => {
		const level = parseSemanticLevel(validResponse, null, 0, validInputs);
		expect(level.edges[0].source).toBe('sem:core');
		expect(level.edges[0].target).toBe('sem:utils');
	});
});

describe('parseSemanticLevel file assignment', () => {
	beforeEach(() => {
		settingsStore.language = 'en';
	});

	function role(id: string, filePaths: unknown[]) {
		return { id, label: id, description: '', filePaths, keySymbols: [] };
	}

	function respond(...roles: ReturnType<typeof role>[]) {
		return JSON.stringify({ roles, edges: [] });
	}

	function ownersByFile(level: SemanticLevel): Map<string, string[]> {
		const owners = new Map<string, string[]>();
		for (const node of level.nodes) {
			for (const file of node.filePaths) owners.set(file, [...(owners.get(file) ?? []), node.id]);
		}
		return owners;
	}

	function expectEachInputOwnedOnce(level: SemanticLevel, inputs: string[]) {
		const owners = ownersByFile(level);
		expect([...owners.keys()].sort()).toEqual([...inputs].sort());
		for (const [file, ids] of owners) expect({ file, ids: ids.length }).toEqual({ file, ids: 1 });
	}

	it('leaves an all-good response unchanged and reports zero counts', () => {
		// Arrange
		const inputs = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
		const response = respond(role('one', ['src/a.ts', 'src/b.ts']), role('two', ['src/c.ts']));

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes.map((n) => [n.id, n.filePaths, n.fileCount])).toEqual([
			['sem:one', ['src/a.ts', 'src/b.ts'], 2],
			['sem:two', ['src/c.ts'], 1]
		]);
		expect(level.assignment).toEqual({ leftOut: 0, duplicated: 0, invented: 0, emptied: 0 });
	});

	it('collects files the model left out in an Unclassified node', () => {
		// Arrange
		const inputs = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
		const response = respond(role('one', ['src/a.ts']));

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		const unclassified = level.nodes[level.nodes.length - 1];
		expect(unclassified).toMatchObject({
			label: 'Unclassified',
			filePaths: ['src/b.ts', 'src/c.ts'],
			fileCount: 2,
			parentId: null,
			depth: 0
		});
		expect(level.assignment).toEqual({ leftOut: 2, duplicated: 0, invented: 0, emptied: 0 });
		expectEachInputOwnedOnce(level, inputs);
	});

	it('labels the Unclassified node in the current language', () => {
		// Arrange
		settingsStore.language = 'ko';

		// Act
		const level = parseSemanticLevel(respond(), null, 0, ['src/a.ts']);

		// Assert
		expect(level.nodes).toHaveLength(1);
		expect(level.nodes[0].label).toBe('미분류');
	});

	it('keeps the first assignment when two roles list the same file', () => {
		// Arrange
		const inputs = ['src/a.ts', 'src/b.ts'];
		const response = respond(
			role('one', ['src/a.ts', 'src/a.ts']),
			role('two', ['src/a.ts', 'src/b.ts'])
		);

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes.map((n) => n.filePaths)).toEqual([['src/a.ts'], ['src/b.ts']]);
		expect(level.nodes[1].fileCount).toBe(1);
		expect(level.assignment).toEqual({ leftOut: 0, duplicated: 2, invented: 0, emptied: 0 });
		expectEachInputOwnedOnce(level, inputs);
	});

	it('drops paths that match no input file', () => {
		// Arrange
		const inputs = ['src/a.ts'];
		const response = respond(role('one', ['src/a.ts', 'src/made-up.ts', 42]));

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes.map((n) => n.filePaths)).toEqual([['src/a.ts']]);
		expect(level.assignment).toEqual({ leftOut: 0, duplicated: 0, invented: 2, emptied: 0 });
	});

	it('maps paths written without the project folder back to the input path', () => {
		// Arrange
		const inputs = ['proj/src/a.ts', 'proj/src/b.ts', 'proj/README.md'];
		const response = respond(role('one', ['src/a.ts', './src/b.ts', 'proj/README.md']));

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes[0].filePaths).toEqual(inputs);
		expect(level.assignment).toEqual({ leftOut: 0, duplicated: 0, invented: 0, emptied: 0 });
	});

	it('does not strip a folder that only some input paths share', () => {
		// Arrange
		const inputs = ['src/a.ts', 'lib/b.ts'];
		const response = respond(role('one', ['a.ts', 'lib/b.ts']));

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes[0].filePaths).toEqual(['lib/b.ts']);
		expect(level.assignment).toEqual({ leftOut: 1, duplicated: 0, invented: 1, emptied: 0 });
	});

	it('puts every file in the Unclassified node when the model returns no roles', () => {
		// Arrange
		const inputs = ['src/a.ts', 'src/b.ts'];

		// Act
		const level = parseSemanticLevel(respond(), null, 0, inputs);

		// Assert
		expect(level.nodes).toHaveLength(1);
		expect(level.nodes[0].filePaths).toEqual(inputs);
		expect(level.assignment).toEqual({ leftOut: 2, duplicated: 0, invented: 0, emptied: 0 });
	});

	it('assigns a drill-down only over the parent subset', () => {
		// Arrange
		const parentFiles = ['proj/src/core/a.ts', 'proj/src/core/b.ts', 'proj/src/core/c.ts'];
		const response = respond(
			role('inner', ['proj/src/core/a.ts', 'proj/src/ui/button.ts']),
			role('outer', ['proj/src/core/a.ts'])
		);

		// Act
		const level = parseSemanticLevel(response, 'sem:core', 1, parentFiles);

		// Assert
		expect(level.nodes.map((n) => n.filePaths)).toEqual([
			['proj/src/core/a.ts'],
			['proj/src/core/b.ts', 'proj/src/core/c.ts']
		]);
		expect(level.nodes.every((n) => n.parentId === 'sem:core' && n.depth === 1)).toBe(true);
		expect(level.assignment).toEqual({ leftOut: 2, duplicated: 1, invented: 1, emptied: 1 });
		expectEachInputOwnedOnce(level, parentFiles);
	});

	it('gives each level its own Unclassified node id so drill-down caches do not collide', () => {
		// Arrange
		const top = parseSemanticLevel(respond(), null, 0, ['src/a.ts']);
		const unclassified = top.nodes[0];

		// Act
		const inside = parseSemanticLevel(respond(), unclassified.id, 1, unclassified.filePaths);

		// Assert
		expect(inside.nodes[0].id).not.toBe(unclassified.id);
		expect(inside.nodes[0].filePaths).toEqual(['src/a.ts']);
	});

	// Regression: a role left with no files stayed on the canvas as "0 files" and threw
	// "No files in this domain" when double-clicked
	it('removes a role whose files all went elsewhere, with its edges', () => {
		// Arrange
		const inputs = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'];
		const response = JSON.stringify({
			roles: [
				role('api', ['src/a.ts']),
				role('ghost', ['src/a.ts', 'src/made-up.ts']),
				role('db', ['src/b.ts']),
				role('ui', ['src/c.ts'])
			],
			edges: [
				{ source: 'api', target: 'db', label: 'reads', type: 'calls' },
				{ source: 'ghost', target: 'db', label: 'x', type: 'uses' },
				{ source: 'ui', target: 'ghost', label: 'y', type: 'uses' },
				{ source: 'ui', target: 'api', label: 'calls', type: 'calls' }
			]
		});

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expect(level.nodes.map((n) => [n.id, n.fileCount])).toEqual([
			['sem:api', 1],
			['sem:db', 1],
			['sem:ui', 1],
			['sem:unclassified:root', 1]
		]);
		expect(level.edges.map((e) => [e.source, e.target])).toEqual([
			['sem:api', 'sem:db'],
			['sem:ui', 'sem:api']
		]);
		expect(level.assignment).toEqual({ leftOut: 1, duplicated: 1, invented: 1, emptied: 1 });
		expectEachInputOwnedOnce(level, inputs);
	});

	// Regression: the model silently dropped files, so they vanished from every level of the diagram
	it('accounts for every file in a realistic fenced response that drops, repeats and invents', () => {
		// Arrange
		const inputs = [
			'paseo/packages/server/src/index.ts',
			'paseo/packages/server/src/routes.ts',
			'paseo/packages/app/src/App.tsx',
			'paseo/packages/app/src/hooks/useAgent.ts',
			'paseo/packages/cli/src/main.ts',
			'paseo/packages/relay/src/relay.ts',
			'paseo/docs/ARCHITECTURE.md'
		];
		const body = JSON.stringify(
			{
				roles: [
					{
						id: 'server',
						label: '서버 런타임',
						description: '에이전트 프로세스를 관리하고 API를 노출한다.',
						filePaths: ['packages/server/src/index.ts', 'packages/server/src/routes.ts'],
						keySymbols: ['startServer', 'registerRoutes']
					},
					{
						id: 'client',
						label: '클라이언트 앱',
						description: '에이전트 상태를 보여주는 UI.',
						filePaths: [
							'paseo/packages/app/src/App.tsx',
							'paseo/packages/app/src/hooks/useAgent.ts',
							'paseo/packages/server/src/routes.ts',
							'paseo/packages/app/src/store.ts'
						],
						keySymbols: ['App', 'useAgent']
					}
				],
				edges: [{ source: 'client', target: 'server', label: 'calls API', type: 'calls' }]
			},
			null,
			2
		);
		const response = `Here is the architecture analysis:\n\n\`\`\`json\n${body}\n\`\`\``;

		// Act
		const level = parseSemanticLevel(response, null, 0, inputs);

		// Assert
		expectEachInputOwnedOnce(level, inputs);
		expect(level.nodes.map((n) => n.fileCount)).toEqual([2, 2, 3]);
		expect(level.nodes[2].filePaths).toEqual([
			'paseo/packages/cli/src/main.ts',
			'paseo/packages/relay/src/relay.ts',
			'paseo/docs/ARCHITECTURE.md'
		]);
		expect(level.assignment).toEqual({ leftOut: 3, duplicated: 1, invented: 1, emptied: 0 });
		expect(level.edges).toHaveLength(1);
	});
});
