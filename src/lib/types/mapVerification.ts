/**
 * What `services/mapVerifier.ts` reports about a `ropeman.json` map checked against the code
 * map it claims to describe (A-12). Types only, like `ropemanMap.ts`, so the bridge and the
 * Node CLI compile it unchanged.
 */

/** The three checks of A-12. */
export type VerifierRule = 'assignment' | 'path' | 'evidence';

/** Each code belongs to exactly one rule, so a violation carries only its code. */
export const VIOLATION_RULES = {
	/** Not exactly one level has a null parentId */
	'level-root': 'assignment',
	/** A level expands a node id no level has */
	'level-parent-unknown': 'assignment',
	/** A second level expands the same node */
	'level-parent-twice': 'assignment',
	/** A level whose parent exists but is not reached from the top level: a cycle */
	'level-unreachable': 'assignment',
	/** Two nodes of the map share an id */
	'node-id-duplicate': 'assignment',
	/** An edge end is not a node of the edge's level */
	'edge-end-unknown': 'assignment',
	/** A file of the level's scope that no node lists */
	'file-unassigned': 'assignment',
	/** A file listed a second time in one level */
	'file-duplicated': 'assignment',
	/** A node lists a file outside the level's scope */
	'file-outside-scope': 'assignment',
	/** A node with no files */
	'node-empty': 'assignment',
	/** A grouped level with assignment counts, or a named level without them */
	'assignment-counts': 'assignment',
	/** Not a normalized repo-relative path: empty, absolute, a drive letter, `\`, `.`, `..` or `//` */
	'path-invalid': 'path',
	/** A node file or an evidence end that is not a file of the code map */
	'path-unknown': 'path',
	/** `files` lists a path twice */
	'coverage-duplicate': 'path',
	/** A file of the code map that `files` does not list */
	'coverage-missing': 'path',
	/** A `files` reason that says read when the code map lacks the file, or not read when it has it */
	'coverage-mismatch': 'path',
	/** An edge with no evidence */
	'evidence-missing': 'evidence',
	/** An evidence ref that names no relation of the code map */
	'evidence-unknown': 'evidence',
	/** An evidence ref that does not run from a file of the edge's source to one of its target */
	'evidence-ends': 'evidence',
	/** An evidence ref whose confidence differs from the code relation it names */
	'evidence-confidence': 'evidence'
} as const satisfies Record<string, VerifierRule>;

export type ViolationCode = keyof typeof VIOLATION_RULES;

export interface Violation {
	code: ViolationCode;
	/** The field, in the notation of `MapFailure.at`: `levels[1].nodes[0].filePaths[2]` */
	at: string;
	/** Index into `levels`; null for a check on `files` or on the level list as a whole */
	level: number | null;
	/** The node to mark in a viewer; null when the violation is not on one node */
	nodeId: string | null;
	/** The file the violation is about, as the map wrote it; null when none */
	path: string | null;
	/** English for logs; a viewer words it from `code` */
	message: string;
}

export interface MapVerification {
	/** Empty when the map passed every check */
	violations: Violation[];
	/** What the checks covered, so a clean result over an empty map reads as one */
	checked: { files: number; levels: number; nodes: number; edges: number; refs: number };
}
