import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_SCHEMA_VERSION, MAX_MAP_BYTES, type ParseResult } from '$lib/types/ropemanMap';
import {
	parseRopemanMap,
	parseRopemanMapValue,
	parseRpcRequest,
	parseServerMessage
} from './ropemanMapSchema';

const FIXTURE = fileURLToPath(
	new URL('../../../tests/fixtures/ropeman-map/ropeman.json', import.meta.url)
);
const fixtureText = fs.readFileSync(FIXTURE, 'utf8');

/** The fixture as plain JSON, to break one field at a time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const fixture = (): Draft => JSON.parse(fixtureText);

function rejection<T>(result: ParseResult<T>) {
	if (result.ok) throw new Error('expected a rejection');
	return { code: result.code, at: result.at };
}

describe('parseRopemanMap', () => {
	it('reads the fixture map with its levels, files and evidence', () => {
		const result = parseRopemanMap(fixtureText);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.project.name).toBe('sample-shop');
		expect(result.value.files).toHaveLength(6);
		expect(result.value.levels.map((l) => [l.parentId, l.naming])).toEqual([
			[null, 'named'],
			['sem:api', 'grouped']
		]);
		expect(result.value.levels[0].edges[0].evidence?.confidence).toBe('EXTRACTED');
	});

	it('the version it writes is the version it reads', () => {
		const map = fixture();
		map.schemaVersion = MAP_SCHEMA_VERSION;

		expect(parseRopemanMap(JSON.stringify(map)).ok).toBe(true);
	});

	it('reads a newer minor and drops the fields it does not know', () => {
		const map = fixture();
		map.schemaVersion = '1.7';
		map.relations = [{ path: 'src/a.ts' }];
		map.levels[0].nodes[0].owner = 'team-a';

		const result = parseRopemanMap(JSON.stringify(map));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).not.toHaveProperty('relations');
		expect(result.value.levels[0].nodes[0]).not.toHaveProperty('owner');
	});

	it('refuses a newer major before reading its structure', () => {
		const result = parseRopemanMap(
			JSON.stringify({ format: 'ropeman-map', schemaVersion: '2.0', graph: {} })
		);

		expect(result).toMatchObject({ ok: false, code: 'newer-version', version: '2.0' });
	});

	it('refuses an older major', () => {
		const map = fixture();
		map.schemaVersion = '0.9';

		expect(rejection(parseRopemanMap(JSON.stringify(map))).code).toBe('unsupported-version');
	});

	it.each([
		['a number', 1],
		['no minor', '1'],
		['a suffix', '1.0-beta'],
		['missing', undefined]
	])('names schemaVersion when it is %s', (_, value) => {
		const map = fixture();
		map.schemaVersion = value;

		expect(rejection(parseRopemanMap(JSON.stringify(map)))).toEqual({
			code: 'invalid',
			at: 'schemaVersion'
		});
	});

	it('tells JSON that is not a map apart from text that is not JSON', () => {
		expect(rejection(parseRopemanMap('{"nodes": []'))).toEqual({ code: 'not-json', at: null });
		expect(rejection(parseRopemanMap('[1, 2]')).code).toBe('not-a-map');
		expect(rejection(parseRopemanMap('{"directed": true, "nodes": []}'))).toEqual({
			code: 'not-a-map',
			at: 'format'
		});
	});

	it('refuses text over the size cap without parsing it', () => {
		const text = `{"format":"ropeman-map","pad":"${'x'.repeat(MAX_MAP_BYTES)}"}`;

		expect(rejection(parseRopemanMap(text))).toEqual({ code: 'too-large', at: null });
	});

	it('counts UTF-8 bytes, not characters, against the cap', () => {
		// 6M Hangul syllables are 6M UTF-16 units but 18M UTF-8 bytes
		const text = `"${'가'.repeat(6 * 1024 * 1024)}"`;

		expect(text.length).toBeLessThan(MAX_MAP_BYTES);
		expect(rejection(parseRopemanMap(text)).code).toBe('too-large');
	});

	it.each([
		[
			'a node without a label',
			(m: Draft) => delete m.levels[0].nodes[0].label,
			'levels[0].nodes[0].label'
		],
		[
			'a file path that is a number',
			(m: Draft) => (m.levels[0].nodes[0].filePaths = [1]),
			'levels[0].nodes[0].filePaths[0]'
		],
		['an unknown coverage reason', (m: Draft) => (m.files[0].reason = 'maybe'), 'files[0].reason'],
		[
			'an unknown edge type',
			(m: Draft) => (m.levels[0].edges[0].type = 'owns'),
			'levels[0].edges[0].type'
		],
		[
			'an edge to a node of another level',
			(m: Draft) => (m.levels[0].edges[0].target = 'dir:src/api/auth.ts'),
			'levels[0].edges[0].target'
		],
		[
			'EXTRACTED evidence with no relation',
			(m: Draft) => (m.levels[0].edges[0].evidence.refs = []),
			'levels[0].edges[0].evidence.refs'
		],
		[
			'an INFERRED relation as EXTRACTED evidence',
			(m: Draft) => (m.levels[0].edges[0].evidence.refs[0].confidence = 'INFERRED'),
			'levels[0].edges[0].evidence.refs[0].confidence'
		],
		[
			'a relation line of 0',
			(m: Draft) => (m.levels[0].edges[0].evidence.refs[0].line = 0),
			'levels[0].edges[0].evidence.refs[0].line'
		],
		['an unknown naming', (m: Draft) => (m.levels[1].naming = 'guessed'), 'levels[1].naming'],
		[
			'a negative assignment count',
			(m: Draft) => (m.levels[0].assignment.leftOut = -1),
			'levels[0].assignment.leftOut'
		],
		['a date that is not one', (m: Draft) => (m.generatedAt = 'yesterday'), 'generatedAt'],
		['no project name', (m: Draft) => (m.project = {}), 'project.name']
	])('names the field for %s', (_, breakIt, at) => {
		const map = fixture();
		breakIt(map);

		expect(rejection(parseRopemanMap(JSON.stringify(map)))).toEqual({ code: 'invalid', at });
	});

	describe('level tree', () => {
		it('refuses a map with no top level', () => {
			const map = fixture();
			map.levels = [map.levels[1]];

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[0].parentId');
		});

		it('refuses two top levels', () => {
			const map = fixture();
			map.levels[1].parentId = null;

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[1].parentId');
		});

		it('refuses a level that expands a node no level has', () => {
			const map = fixture();
			map.levels[1].parentId = 'sem:missing';

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[1].parentId');
		});

		it('refuses two levels for one node', () => {
			const map = fixture();
			map.levels.push({ ...map.levels[1], nodes: [] });

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[2].parentId');
		});

		it('refuses a cycle of levels cut off from the top', () => {
			const map = fixture();
			const a = { id: 'x:a', label: 'A', description: '', filePaths: [], keySymbols: [] };
			const b = { ...a, id: 'x:b', label: 'B' };
			map.levels.push(
				{ parentId: 'x:b', naming: 'grouped', nodes: [a], edges: [], assignment: null },
				{ parentId: 'x:a', naming: 'grouped', nodes: [b], edges: [], assignment: null }
			);

			expect(rejection(parseRopemanMap(JSON.stringify(map)))).toEqual({
				code: 'invalid',
				at: 'levels[2].parentId'
			});
		});

		it('refuses a node id used in two levels', () => {
			const map = fixture();
			map.levels[1].nodes[0].id = 'sem:storage';

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[1].nodes[0].id');
		});

		it('refuses the id the viewer keys the top level by', () => {
			const map = fixture();
			map.levels[0].nodes[2].id = '__root__';

			expect(rejection(parseRopemanMap(JSON.stringify(map))).at).toBe('levels[0].nodes[2].id');
		});
	});

	it('keeps keys like __proto__ as data and builds plain objects', () => {
		const text = fixtureText.replace(
			'"label": "HTTP API",',
			'"label": "HTTP API", "__proto__": { "polluted": true },'
		);

		const result = parseRopemanMap(text);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const node = result.value.levels[0].nodes[0];
		expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

describe('parseRopemanMapValue', () => {
	// serve builds maps in memory, and they must meet the same checks as a file
	it('reads a value the way parseRopemanMap reads its text', () => {
		expect(parseRopemanMapValue(JSON.parse(fixtureText))).toEqual(parseRopemanMap(fixtureText));
	});

	it('returns a refusal with the field instead of throwing on a malformed value', () => {
		const value = { ...JSON.parse(fixtureText), files: null };

		expect(parseRopemanMapValue(value)).toMatchObject({ ok: false, code: 'invalid', at: 'files' });
	});
});

describe('parseRpcRequest', () => {
	it('reads each request the server answers', () => {
		expect(parseRpcRequest('{"id":1,"type":"map.get"}')).toEqual({
			ok: true,
			value: { id: 1, type: 'map.get' }
		});
		expect(parseRpcRequest('{"id":2,"type":"node.expand","nodeId":"sem:api"}')).toEqual({
			ok: true,
			value: { id: 2, type: 'node.expand', nodeId: 'sem:api' }
		});
		expect(parseRpcRequest('{"id":3,"type":"file.read","path":"src/a.ts"}')).toEqual({
			ok: true,
			value: { id: 3, type: 'file.read', path: 'src/a.ts' }
		});
	});

	it('keeps the shape #72 shipped for file.read', () => {
		// bridgeService and bridge/probe send exactly this
		const result = parseRpcRequest('{"id":7,"type":"file.read","path":"../outside.txt"}');

		expect(result).toEqual({
			ok: true,
			value: { id: 7, type: 'file.read', path: '../outside.txt' }
		});
	});

	it.each([
		['no id', '{"type":"map.get"}', 'id'],
		['a fractional id', '{"id":1.5,"type":"map.get"}', 'id'],
		['an unknown type', '{"id":1,"type":"shell.run"}', 'type'],
		['node.expand without a node', '{"id":1,"type":"node.expand"}', 'nodeId'],
		[
			'file.read with a path that is not a string',
			'{"id":1,"type":"file.read","path":["a"]}',
			'path'
		]
	])('refuses a request with %s', (_, text, at) => {
		expect(rejection(parseRpcRequest(text))).toEqual({ code: 'invalid', at });
	});
});

describe('parseServerMessage', () => {
	const groupedApi = () => fixture().levels[1];
	const namedApi = () => ({ ...groupedApi(), naming: 'named' });

	it('reads the map, an expansion and a file as responses', () => {
		const mapGet = parseServerMessage(
			JSON.stringify({ id: 1, type: 'map.get', result: fixture() })
		);
		const expand = parseServerMessage(
			JSON.stringify({ id: 2, type: 'node.expand', result: groupedApi() })
		);
		const file = parseServerMessage(
			JSON.stringify({
				id: 3,
				type: 'file.read',
				result: { path: 'a.txt', content: 'hi\n', sha256: 'a'.repeat(64), size: 3 }
			})
		);

		expect([mapGet.ok, expand.ok, file.ok]).toEqual([true, true, true]);
	});

	it('reads a file.read refusal with the code the bridge sends', () => {
		const result = parseServerMessage(
			'{"id":4,"type":"file.read","code":"env-file","error":"Refusing a real .env file."}'
		);

		expect(result).toEqual({
			ok: true,
			value: { id: 4, type: 'file.read', code: 'env-file', error: 'Refusing a real .env file.' }
		});
	});

	it('keeps the error text and marks a code it does not know as unknown', () => {
		const result = parseServerMessage(
			'{"id":5,"type":"node.expand","code":"rate-limited","error":"Try again in a minute."}'
		);

		expect(result.ok && result.value).toMatchObject({
			code: 'unknown',
			error: 'Try again in a minute.'
		});
	});

	it('reads node.named only as a named level of the node it names', () => {
		const ok = parseServerMessage(
			JSON.stringify({ type: 'node.named', nodeId: 'sem:api', level: namedApi() })
		);
		const stillGrouped = parseServerMessage(
			JSON.stringify({ type: 'node.named', nodeId: 'sem:api', level: groupedApi() })
		);
		const otherNode = parseServerMessage(
			JSON.stringify({ type: 'node.named', nodeId: 'sem:ui', level: namedApi() })
		);

		expect(ok.ok).toBe(true);
		expect(rejection(stillGrouped).at).toBe('level.naming');
		expect(rejection(otherNode).at).toBe('level.parentId');
	});

	it('reads a naming failure', () => {
		const result = parseServerMessage(
			'{"type":"node.named","nodeId":"sem:api","code":"verification-failed","error":"2 files left out"}'
		);

		expect(result.ok && result.value).toMatchObject({ code: 'verification-failed' });
	});

	it('refuses an expansion without the node it expands', () => {
		const result = parseServerMessage(
			JSON.stringify({ id: 2, type: 'node.expand', result: { ...groupedApi(), parentId: null } })
		);

		expect(rejection(result).at).toBe('result.parentId');
	});

	it('refuses a hello from a server of a newer major', () => {
		const result = parseServerMessage(
			'{"type":"hello","schemaVersion":"2.1","server":{"name":"ropeman","version":"3.0.0"}}'
		);

		expect(rejection(result).code).toBe('newer-version');
	});

	it('refuses file content whose hash is not a sha-256', () => {
		const result = parseServerMessage(
			JSON.stringify({
				id: 3,
				type: 'file.read',
				result: { path: 'a.txt', content: 'hi', sha256: 'abc', size: 2 }
			})
		);

		expect(rejection(result).at).toBe('result.sha256');
	});

	it('reads map.changed as a list of paths', () => {
		expect(parseServerMessage('{"type":"map.changed","paths":["src/a.ts"]}')).toEqual({
			ok: true,
			value: { type: 'map.changed', paths: ['src/a.ts'] }
		});
	});
});

describe('module boundary', () => {
	const LIB = fileURLToPath(new URL('../', import.meta.url));
	const TYPES = path.join(LIB, 'types') + path.sep;

	function resolveImport(from: string, specifier: string): string {
		const base = specifier.startsWith('$lib/')
			? path.join(LIB, specifier.slice('$lib/'.length))
			: specifier.startsWith('.')
				? path.resolve(path.dirname(from), specifier)
				: specifier;
		return [base, `${base}.ts`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f)) ?? base;
	}

	function importGraph(entry: string): Set<string> {
		const seen = new Set<string>();
		const pending = [entry];
		while (pending.length > 0) {
			const file = pending.pop()!;
			if (seen.has(file)) continue;
			seen.add(file);
			if (!fs.existsSync(file)) continue;
			const source = fs.readFileSync(file, 'utf8');
			const statements = source.matchAll(
				/^(?:import|export)\b[^;]*?\bfrom\s*'([^']+)'|^import\s*'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/gms
			);
			for (const match of statements) {
				pending.push(resolveImport(file, match[1] ?? match[2] ?? match[3]));
			}
		}
		return seen;
	}

	// T2-4 runs the parser and the verifier in the bridge and packages/core, which bundle no app runtime.
	const MODULES = ['./ropemanMapSchema.ts', './mapVerifier.ts'];
	const ALLOWED = new Set(MODULES.map((m) => fileURLToPath(new URL(m, import.meta.url))));
	it.each(MODULES)(
		'%s imports nothing outside $lib/types and the two modules, directly or transitively',
		(module) => {
			const entry = fileURLToPath(new URL(module, import.meta.url));

			const outside = [...importGraph(entry)].filter(
				(f) => !ALLOWED.has(f) && !f.startsWith(TYPES)
			);

			expect(outside).toEqual([]);
		}
	);
});
