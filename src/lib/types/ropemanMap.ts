/**
 * `ropeman.json` and the Bridge RPC that carries the same values (ADR-24). Both come from
 * outside the app (a file someone sent, a local socket), so `services/ropemanMapSchema.ts`
 * parses them before anything reads a field. This module imports types only, so the bridge
 * and the Node CLI can compile it unchanged.
 */
import type { EdgeEvidence, RelationKind } from './codeMap';
import type { FileCoverage } from './coverage';
import type { AssignmentCounts, SemanticEdge, SemanticNode } from './semantic';

export const MAP_FORMAT = 'ropeman-map';

/**
 * A reader reads every minor of its own major and refuses any other major. A minor adds
 * optional fields only. A new required field, a removed field, or a new value in a closed set
 * (coverage reason, edge type, relation kind, naming) is a new major (ADR-24).
 */
export const MAP_SCHEMA = { major: 1, minor: 2 } as const;
export const MAP_SCHEMA_VERSION = `${MAP_SCHEMA.major}.${MAP_SCHEMA.minor}`;

/** Same as the Bridge's WebSocket `maxPayload`, so a map that opens as a file also fits a message. */
export const MAX_MAP_BYTES = 16 * 1024 * 1024;

/** The semantic store keys the top level by this id, so no node may use it. */
export const RESERVED_NODE_ID = '__root__';

export const EDGE_TYPES = [
	'depends_on',
	'calls',
	'extends',
	'uses'
] as const satisfies readonly SemanticEdge['type'][];

export const RELATION_KINDS = [
	'calls',
	'indirect_call',
	'references',
	'inherits',
	'implements',
	'dynamic_import',
	'imports',
	'imports_from',
	're_exports',
	'contains',
	'method'
] as const satisfies readonly RelationKind[];

/**
 * `grouped`: the deterministic grouping, labelled by folder, which the CLI returns at once.
 * `named`: the LLM's names after the deterministic checks passed (A-12).
 */
export type LevelNaming = 'grouped' | 'named';

/** The viewer derives color, depth, parent and file count, so the file does not carry them. */
export type MapNode = Pick<
	SemanticNode,
	'id' | 'label' | 'description' | 'filePaths' | 'keySymbols'
>;

/** Evidence paths are repo-relative, like every path in the file. */
export type MapEdge = Pick<SemanticEdge, 'source' | 'target' | 'type'> & {
	label: string | null;
	evidence: EdgeEvidence | null;
};

export interface MapLevel {
	/** The node this level expands; null for the top level */
	parentId: string | null;
	naming: LevelNaming;
	nodes: MapNode[];
	edges: MapEdge[];
	/** How the LLM's answer matched the files it was given; null for a grouped level */
	assignment: AssignmentCounts | null;
	/**
	 * 1.2: the files of the node it expands, one node each, labelled by file name, with the
	 * imports between them. Always grouped: no agent or worker names such a level.
	 */
	fileLevel?: true;
}

/** A level whose names are still to come: grouped by folder, and not a file level. */
export const awaitsNames = (level: MapLevel): boolean =>
	level.naming === 'grouped' && !level.fileLevel;

export interface RopemanMap {
	format: typeof MAP_FORMAT;
	/** `MAJOR.MINOR` of the writer */
	schemaVersion: string;
	project: { name: string };
	generator: { name: string; version: string };
	/** ISO 8601 */
	generatedAt: string;
	/** Every file the extractor saw, repo-relative, with where it ended up */
	files: FileCoverage[];
	/** One top level, then one level per expanded node */
	levels: MapLevel[];
}

/** Why an input was refused. `message` is English for logs; a viewer words it from `code`. */
export type MapFailure =
	| {
			code: 'newer-version' | 'unsupported-version';
			message: string;
			at: 'schemaVersion';
			/** The schemaVersion the input declared */
			version: string;
	  }
	| {
			code: 'too-large' | 'not-json' | 'not-a-map' | 'invalid';
			message: string;
			/** The field that failed, as `levels[1].nodes[0].label`; null when the whole input failed */
			at: string | null;
	  };

export type MapRejection = MapFailure['code'];

export type ParseResult<T> = { ok: true; value: T } | ({ ok: false } & MapFailure);

// --- Bridge RPC -------------------------------------------------------------------------------

export interface FileContent {
	/** The path as requested, relative to the root */
	path: string;
	content: string;
	sha256: string;
	size: number;
}

export const FILE_READ_REJECTIONS = [
	'invalid-path',
	'absolute-path',
	'outside-root',
	'symlink-outside-root',
	'env-file',
	'not-found',
	'not-a-file',
	'too-large',
	'binary',
	'changed'
] as const;

export type FileReadRejection = (typeof FILE_READ_REJECTIONS)[number];

/** A request sent with an `id`; the response repeats the id and the type. */
export type RpcRequest =
	| { id: number; type: 'map.get' }
	| { id: number; type: 'node.expand'; nodeId: string }
	| { id: number; type: 'file.read'; path: string };

export type RpcMethod = RpcRequest['type'];

/**
 * `node.expand` answers with the grouped level at once and later pushes `node.named` for the
 * same node. A node the CLI already named answers with the named level, and no push follows.
 */
export interface RpcResults {
	'map.get': RopemanMap;
	'node.expand': MapLevel;
	'file.read': FileContent;
}

/**
 * Error codes are the one open set: a reader shows `error` for a code it does not know, so a
 * newer CLI can add one without a new major.
 */
export const RPC_ERROR_CODES = {
	'map.get': ['not-ready', 'internal'],
	'node.expand': ['unknown-node', 'not-ready', 'busy', 'internal'],
	'file.read': [...FILE_READ_REJECTIONS, 'no-root', 'busy', 'internal']
} as const satisfies Record<RpcMethod, readonly string[]>;

export type RpcErrorCode<M extends RpcMethod = RpcMethod> =
	| (typeof RPC_ERROR_CODES)[M][number]
	| 'bad-request'
	| 'unknown';

export type RpcResponse = {
	[M in RpcMethod]:
		| { id: number; type: M; result: RpcResults[M] }
		| { id: number; type: M; code: RpcErrorCode<M>; error: string };
}[RpcMethod];

/**
 * Why a `node.named` push carries no level. `queued`: serve put the node on the queue for the
 * user's agent, and the named level follows once the agent names it. The rest end the naming.
 */
export const NAMING_CODES = ['queued', 'no-cli', 'naming-failed', 'verification-failed'] as const;

/** Messages the server sends without a request. */
export type RpcPush =
	/** First message on every connection. The viewer refuses a server of another major. */
	| { type: 'hello'; schemaVersion: string; server: { name: string; version: string } }
	| {
			type: 'node.named';
			nodeId: string;
			level: MapLevel;
			/** 1.1: the headless worker that wrote the names, and its runs in this serve session */
			namedBy?: { worker: string; runs: number };
	  }
	| {
			type: 'node.named';
			nodeId: string;
			code: (typeof NAMING_CODES)[number] | 'unknown';
			error: string;
	  }
	/** Repo-relative paths that changed on disk; the viewer asks for `map.get` again. */
	| { type: 'map.changed'; paths: string[] };

export type ServerMessage = RpcResponse | RpcPush;
