/**
 * Parses `ropeman.json` and Bridge RPC messages from untrusted text into the types of
 * `types/ropemanMap.ts`. Every value is copied field by field, so unknown fields (a newer minor)
 * and inherited keys are dropped and nothing from the input reaches the app by reference.
 */
import type { EdgeEvidence, FilePath, RelationRef } from '$lib/types/codeMap';
import { COVERAGE_REASONS, type CoverageReason, type FileCoverage } from '$lib/types/coverage';
import type { AssignmentCounts } from '$lib/types/semantic';
import {
	EDGE_TYPES,
	MAP_FORMAT,
	MAP_SCHEMA,
	MAX_MAP_BYTES,
	NAMING_CODES,
	RELATION_KINDS,
	RESERVED_NODE_ID,
	RPC_ERROR_CODES,
	type FileContent,
	type MapEdge,
	type MapLevel,
	type MapNode,
	type MapFailure,
	type ParseResult,
	type RopemanMap,
	type RpcErrorCode,
	type RpcMethod,
	type RpcRequest,
	type ServerMessage
} from '$lib/types/ropemanMap';

type Json = Record<string, unknown>;

class Rejected extends Error {
	constructor(readonly failure: MapFailure) {
		super(failure.message);
	}
}

function reject(
	code: 'too-large' | 'not-json' | 'not-a-map' | 'invalid',
	message: string,
	at: string | null
): never {
	throw new Rejected({ code, message, at });
}

function invalid(at: string, expected: string): never {
	return reject('invalid', `${at} must be ${expected}.`, at);
}

function obj(value: unknown, at: string): Json {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		invalid(at, 'an object');
	}
	return value as Json;
}

/** Own fields only: `{"constructor": …}` is data, and a missing field never reads the prototype. */
function field(o: Json, key: string): unknown {
	return Object.hasOwn(o, key) ? o[key] : undefined;
}

function str(value: unknown, at: string): string {
	if (typeof value !== 'string') invalid(at, 'a string');
	return value;
}

function nonEmpty(value: unknown, at: string): string {
	const s = str(value, at);
	if (s.length === 0) invalid(at, 'a non-empty string');
	return s;
}

function int(value: unknown, at: string, min: number): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
		invalid(at, `an integer of at least ${min}`);
	}
	return value;
}

function arr(value: unknown, at: string): unknown[] {
	if (!Array.isArray(value)) invalid(at, 'an array');
	return value;
}

function strings(value: unknown, at: string): string[] {
	return arr(value, at).map((s, i) => str(s, `${at}[${i}]`));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], at: string): T {
	if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
		invalid(at, `one of ${allowed.join(', ')}`);
	}
	return value as T;
}

function nullable<T>(value: unknown, read: (v: unknown) => T): T | null {
	return value === null ? null : read(value);
}

const COVERAGE_REASON_LIST = Object.keys(COVERAGE_REASONS) as CoverageReason[];

function fileCoverage(value: unknown, at: string): FileCoverage {
	const o = obj(value, at);
	return {
		path: nonEmpty(field(o, 'path'), `${at}.path`),
		reason: oneOf(field(o, 'reason'), COVERAGE_REASON_LIST, `${at}.reason`)
	};
}

function relationRef<C extends 'EXTRACTED' | 'INFERRED'>(
	value: unknown,
	confidence: C,
	at: string
): RelationRef<C> {
	const o = obj(value, at);
	return {
		path: nonEmpty(field(o, 'path'), `${at}.path`) as FilePath,
		line: int(field(o, 'line'), `${at}.line`, 1),
		relation: oneOf(field(o, 'relation'), RELATION_KINDS, `${at}.relation`),
		toPath: nonEmpty(field(o, 'toPath'), `${at}.toPath`) as FilePath,
		confidence: oneOf(field(o, 'confidence'), [confidence], `${at}.confidence`)
	};
}

function evidence(value: unknown, at: string): EdgeEvidence {
	const o = obj(value, at);
	const confidence = oneOf(field(o, 'confidence'), ['EXTRACTED', 'INFERRED'], `${at}.confidence`);
	const refs = arr(field(o, 'refs'), `${at}.refs`);
	if (confidence === 'INFERRED') {
		return { confidence, refs: refs.map((r, i) => relationRef(r, 'INFERRED', `${at}.refs[${i}]`)) };
	}
	const [first, ...rest] = refs.map((r, i) => relationRef(r, 'EXTRACTED', `${at}.refs[${i}]`));
	if (!first) invalid(`${at}.refs`, 'at least one relation for EXTRACTED evidence');
	return { confidence, refs: [first, ...rest] };
}

function assignment(value: unknown, at: string): AssignmentCounts {
	const o = obj(value, at);
	return {
		leftOut: int(field(o, 'leftOut'), `${at}.leftOut`, 0),
		duplicated: int(field(o, 'duplicated'), `${at}.duplicated`, 0),
		invented: int(field(o, 'invented'), `${at}.invented`, 0),
		emptied: int(field(o, 'emptied'), `${at}.emptied`, 0)
	};
}

function node(value: unknown, at: string): MapNode {
	const o = obj(value, at);
	const id = nonEmpty(field(o, 'id'), `${at}.id`);
	if (id === RESERVED_NODE_ID) invalid(`${at}.id`, `an id other than ${RESERVED_NODE_ID}`);
	return {
		id,
		label: nonEmpty(field(o, 'label'), `${at}.label`),
		description: str(field(o, 'description'), `${at}.description`),
		filePaths: strings(field(o, 'filePaths'), `${at}.filePaths`),
		keySymbols: strings(field(o, 'keySymbols'), `${at}.keySymbols`)
	};
}

function edge(value: unknown, nodeIds: ReadonlySet<string>, at: string): MapEdge {
	const o = obj(value, at);
	const end = (key: 'source' | 'target') => {
		const id = str(field(o, key), `${at}.${key}`);
		if (!nodeIds.has(id)) invalid(`${at}.${key}`, 'the id of a node in the same level');
		return id;
	};
	return {
		source: end('source'),
		target: end('target'),
		type: oneOf(field(o, 'type'), EDGE_TYPES, `${at}.type`),
		label: nullable(field(o, 'label'), (v) => str(v, `${at}.label`)),
		evidence: nullable(field(o, 'evidence'), (v) => evidence(v, `${at}.evidence`))
	};
}

/** One level on its own: node ids unique within it and every edge between two of its nodes. */
function level(value: unknown, at: string): MapLevel {
	const o = obj(value, at);
	const nodes = arr(field(o, 'nodes'), `${at}.nodes`).map((n, i) => node(n, `${at}.nodes[${i}]`));
	const ids = new Set<string>();
	nodes.forEach((n, i) => {
		if (ids.has(n.id)) invalid(`${at}.nodes[${i}].id`, 'an id no other node in the map has');
		ids.add(n.id);
	});
	return {
		parentId: nullable(field(o, 'parentId'), (v) => nonEmpty(v, `${at}.parentId`)),
		naming: oneOf(field(o, 'naming'), ['grouped', 'named'], `${at}.naming`),
		nodes,
		edges: arr(field(o, 'edges'), `${at}.edges`).map((e, i) => edge(e, ids, `${at}.edges[${i}]`)),
		assignment: nullable(field(o, 'assignment'), (v) => assignment(v, `${at}.assignment`))
	};
}

/**
 * The levels form one tree: one top level, node ids unique across the map, and every other
 * level expands a node of a level reachable from the top. That rules out orphans and cycles,
 * so a viewer can walk the drill-down without guarding against either.
 */
function checkTree(levels: MapLevel[]): void {
	const owner = new Map<string, number>();
	levels.forEach((l, li) =>
		l.nodes.forEach((n, ni) => {
			if (owner.has(n.id))
				invalid(`levels[${li}].nodes[${ni}].id`, 'an id no other node in the map has');
			owner.set(n.id, li);
		})
	);
	const byParent = new Map<string | null, number>();
	levels.forEach((l, li) => {
		if (byParent.has(l.parentId)) {
			invalid(
				`levels[${li}].parentId`,
				l.parentId === null ? 'set on every level but one' : 'a node no other level expands'
			);
		}
		if (l.parentId !== null && !owner.has(l.parentId)) {
			invalid(`levels[${li}].parentId`, 'the id of a node in the map');
		}
		byParent.set(l.parentId, li);
	});
	const root = byParent.get(null);
	if (root === undefined) invalid('levels', 'a list with one level whose parentId is null');
	const reached = new Set<number>();
	const queue = [root];
	while (queue.length > 0) {
		const li = queue.shift()!;
		if (reached.has(li)) continue;
		reached.add(li);
		for (const n of levels[li].nodes) {
			const child = byParent.get(n.id);
			if (child !== undefined) queue.push(child);
		}
	}
	const orphan = levels.findIndex((_, li) => !reached.has(li));
	if (orphan !== -1) invalid(`levels[${orphan}].parentId`, 'a node reachable from the top level');
}

/** Returns the version as written, once its major is the one this reader reads. */
function version(value: unknown): string {
	const match = typeof value === 'string' ? /^(\d+)\.(\d+)$/.exec(value) : null;
	if (!match) invalid('schemaVersion', 'a version like "1.0"');
	const [written, major] = [match[0], Number(match[1])];
	if (major === MAP_SCHEMA.major) return written;
	throw new Rejected(
		major > MAP_SCHEMA.major
			? {
					code: 'newer-version',
					message: `Schema ${written} is newer than ${MAP_SCHEMA.major}.x, the one this Ropeman reads.`,
					at: 'schemaVersion',
					version: written
				}
			: {
					code: 'unsupported-version',
					message: `Schema ${written} is older than ${MAP_SCHEMA.major}.x, the one this Ropeman reads.`,
					at: 'schemaVersion',
					version: written
				}
	);
}

function map(value: unknown): RopemanMap {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		reject('not-a-map', 'This JSON is not a Ropeman map.', null);
	}
	const o = value as Json;
	if (field(o, 'format') !== MAP_FORMAT) {
		reject('not-a-map', `This JSON has no "format": "${MAP_FORMAT}".`, 'format');
	}
	// Before the structure: a newer major may have a structure this reader cannot name
	const schemaVersion = version(field(o, 'schemaVersion'));
	const project = obj(field(o, 'project'), 'project');
	const generator = obj(field(o, 'generator'), 'generator');
	const generatedAt = nonEmpty(field(o, 'generatedAt'), 'generatedAt');
	if (Number.isNaN(Date.parse(generatedAt))) invalid('generatedAt', 'an ISO 8601 date');
	const levels = arr(field(o, 'levels'), 'levels').map((l, i) => level(l, `levels[${i}]`));
	checkTree(levels);
	return {
		format: MAP_FORMAT,
		schemaVersion,
		project: { name: nonEmpty(field(project, 'name'), 'project.name') },
		generator: {
			name: nonEmpty(field(generator, 'name'), 'generator.name'),
			version: nonEmpty(field(generator, 'version'), 'generator.version')
		},
		generatedAt,
		files: arr(field(o, 'files'), 'files').map((f, i) => fileCoverage(f, `files[${i}]`)),
		levels
	};
}

function attempt<T>(read: () => T): ParseResult<T> {
	try {
		return { ok: true, value: read() };
	} catch (err) {
		if (err instanceof Rejected) return { ok: false, ...err.failure };
		throw err;
	}
}

/** UTF-8 bytes are at least the UTF-16 length and at most three times it. */
function overLimit(text: string): boolean {
	if (text.length > MAX_MAP_BYTES) return true;
	if (text.length * 3 <= MAX_MAP_BYTES) return false;
	return new TextEncoder().encode(text).byteLength > MAX_MAP_BYTES;
}

function json(text: string): unknown {
	if (overLimit(text)) {
		reject('too-large', `The input is over ${MAX_MAP_BYTES} bytes.`, null);
	}
	try {
		return JSON.parse(text);
	} catch {
		reject('not-json', 'The input is not valid JSON.', null);
	}
}

export function parseRopemanMap(text: string): ParseResult<RopemanMap> {
	return attempt(() => map(json(text)));
}

/** The same checks on a value that never was text, such as a map serve builds in memory. */
export function parseRopemanMapValue(value: unknown): ParseResult<RopemanMap> {
	return attempt(() => map(value));
}

/** For the server: what a socket client asked for. */
export function parseRpcRequest(text: string): ParseResult<RpcRequest> {
	return attempt(() => {
		const o = obj(json(text), 'request');
		const id = int(field(o, 'id'), 'id', 0);
		const type = oneOf(field(o, 'type'), ['map.get', 'node.expand', 'file.read'], 'type');
		switch (type) {
			case 'map.get':
				return { id, type };
			case 'node.expand':
				return { id, type, nodeId: nonEmpty(field(o, 'nodeId'), 'nodeId') };
			case 'file.read':
				return { id, type, path: str(field(o, 'path'), 'path') };
		}
	});
}

function errorCode<M extends RpcMethod>(value: unknown, method: M): RpcErrorCode<M> {
	const code = str(value, 'code');
	const known: readonly string[] = [...RPC_ERROR_CODES[method], 'bad-request'];
	return (known.includes(code) ? code : 'unknown') as RpcErrorCode<M>;
}

function fileContent(value: unknown, at: string): FileContent {
	const o = obj(value, at);
	const sha256 = str(field(o, 'sha256'), `${at}.sha256`);
	if (!/^[0-9a-f]{64}$/.test(sha256)) invalid(`${at}.sha256`, '64 lowercase hex digits');
	return {
		path: str(field(o, 'path'), `${at}.path`),
		content: str(field(o, 'content'), `${at}.content`),
		sha256,
		size: int(field(o, 'size'), `${at}.size`, 0)
	};
}

/** A level sent over RPC expands one node, so unlike a map's top level it has a parent. */
function expansion(value: unknown, at: string): MapLevel {
	const l = level(value, at);
	if (l.parentId === null) invalid(`${at}.parentId`, 'the id of the expanded node');
	return l;
}

/** For the viewer: one message from the server, a response or a push. */
export function parseServerMessage(text: string): ParseResult<ServerMessage> {
	return attempt((): ServerMessage => {
		const o = obj(json(text), 'message');
		const type = oneOf(
			field(o, 'type'),
			['hello', 'node.named', 'map.changed', 'map.get', 'node.expand', 'file.read'],
			'type'
		);
		switch (type) {
			case 'hello': {
				const schemaVersion = version(field(o, 'schemaVersion'));
				const server = obj(field(o, 'server'), 'server');
				return {
					type,
					schemaVersion,
					server: {
						name: nonEmpty(field(server, 'name'), 'server.name'),
						version: nonEmpty(field(server, 'version'), 'server.version')
					}
				};
			}
			case 'node.named': {
				const nodeId = nonEmpty(field(o, 'nodeId'), 'nodeId');
				if (Object.hasOwn(o, 'error')) {
					const code = str(field(o, 'code'), 'code');
					return {
						type,
						nodeId,
						code: (NAMING_CODES as readonly string[]).includes(code)
							? (code as (typeof NAMING_CODES)[number])
							: 'unknown',
						error: str(field(o, 'error'), 'error')
					};
				}
				const named = expansion(field(o, 'level'), 'level');
				if (named.parentId !== nodeId) invalid('level.parentId', `the node ${nodeId}`);
				if (named.naming !== 'named') invalid('level.naming', 'named');
				if (!Object.hasOwn(o, 'namedBy')) return { type, nodeId, level: named };
				const by = obj(field(o, 'namedBy'), 'namedBy');
				return {
					type,
					nodeId,
					level: named,
					namedBy: {
						worker: nonEmpty(field(by, 'worker'), 'namedBy.worker'),
						runs: int(field(by, 'runs'), 'namedBy.runs', 0)
					}
				};
			}
			case 'map.changed':
				return { type, paths: strings(field(o, 'paths'), 'paths') };
			default: {
				const id = int(field(o, 'id'), 'id', 0);
				if (Object.hasOwn(o, 'error')) {
					const error = str(field(o, 'error'), 'error');
					switch (type) {
						case 'map.get':
							return { id, type, code: errorCode(field(o, 'code'), type), error };
						case 'node.expand':
							return { id, type, code: errorCode(field(o, 'code'), type), error };
						case 'file.read':
							return { id, type, code: errorCode(field(o, 'code'), type), error };
					}
				}
				const result = field(o, 'result');
				switch (type) {
					case 'map.get':
						return { id, type, result: map(result) };
					case 'node.expand':
						return { id, type, result: expansion(result, 'result') };
					case 'file.read':
						return { id, type, result: fileContent(result, 'result') };
				}
			}
		}
	});
}
