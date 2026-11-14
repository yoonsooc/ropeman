/**
 * Skeleton v2: the code map kept in the browser. A relation is stored as a site, the thing
 * written in a file at a line, inside that file's record. What a site points at is a binding
 * with one or more candidates, each with its provenance. The AI receives only the v1
 * projection in `skeleton.ts`, so nothing here changes the request bytes (ADR-21).
 */
import type { BadgeKind, SymbolKind } from './ast';

/**
 * An astMap key: `${CodeMap.root}/${repo-relative path}`, as both loaders name files. A
 * repo-relative path (a resolved tsconfig `paths` entry, graph.json `source_file`) becomes a
 * FilePath only by prefixing the root, so T1-6 and T1-10 produce the keys the loader produced.
 */
export type FilePath = string & { readonly __brand: 'FilePath' };

/**
 * `${FilePath}#${ancestors and name joined by '.'}`, with `~n` on the n-th duplicate in a file.
 * `~n` depends on declaration order, so an id is valid only within the map that made it.
 * Nothing persisted (caches, exported files, RelationRef) may key on a SymbolId.
 */
export type SymbolId = string & { readonly __brand: 'SymbolId' };

/** 1-based and inclusive. `end` is null when the source gives only a start line (graphify `L9`). */
export interface LineRange {
	start: number;
	end: number | null;
}

export type Confidence = 'EXTRACTED' | 'INFERRED';

/**
 * The confidences each producer may claim. The parser reads what is written, so it only
 * extracts. A resolver infers when it picks a target by name (graphify's 2,108 INFERRED ast
 * edges on PASEO). The LLM only infers: its relations count as evidenced only through code
 * facts checked afterwards (A-12).
 */
export const PROVENANCE_RULES = {
	ast: ['EXTRACTED'],
	resolver: ['EXTRACTED', 'INFERRED'],
	graphify: ['EXTRACTED', 'INFERRED'],
	llm: ['INFERRED']
} as const satisfies Record<string, readonly Confidence[]>;

export type RelationSource = keyof typeof PROVENANCE_RULES;

/** Who produced a relation and how sure it is. Pairs outside PROVENANCE_RULES do not compile. */
export type Provenance = {
	[S in RelationSource]: { source: S; confidence: (typeof PROVENANCE_RULES)[S][number] };
}[RelationSource];

/** The code map holds code facts only; LLM claims live on the semantic levels above it. */
export type CodeProvenance = Exclude<Provenance, { source: 'llm' }>;

type InferredProvenance = CodeProvenance & { confidence: 'INFERRED' };

export type FileEnd = { kind: 'file'; path: FilePath };
export type SymbolEnd = { kind: 'symbol'; id: SymbolId };
/** Outside the map (graphify `external: true`). `name` is the member, null for the module itself. */
export type ExternalEnd = { kind: 'external'; module: string; name: string | null };
export type Endpoint = FileEnd | SymbolEnd | ExternalEnd;

export interface Candidate<E extends Endpoint> {
	to: E;
	provenance: CodeProvenance;
}

type Guess<E extends Endpoint> = { to: E; provenance: InferredProvenance };

type Bound<C> = { state: 'bound'; candidates: C };

/**
 * What a site points at. `pending`: no resolver has looked. `unresolved`: one looked and found
 * nothing, which is what "could not connect" reports. `bound`: one candidate, or several when
 * the code does not decide (a name matched in two files, overloads, dynamic dispatch). A site
 * the code decides has one target, so several candidates are all INFERRED by type.
 */
export type Binding<E extends Endpoint> =
	| { state: 'pending' }
	| { state: 'unresolved' }
	| Bound<readonly [Candidate<E>] | readonly [Guess<E>, Guess<E>, ...Guess<E>[]]>;

/** A binding no code can decide, such as a function passed as a value: every candidate infers. */
export type GuessBinding<E extends Endpoint> =
	| { state: 'pending' }
	| { state: 'unresolved' }
	| Bound<readonly [Guess<E>, ...Guess<E>[]]>;

/** One imported name (graphify `imports`, or `re_exports` to a symbol). */
export type Specifier = {
	/** The name bound in this file: `b` in `import { a as b }` */
	local: string;
	/** `import type { A }` or `import { type A }` */
	typeOnly: boolean;
} & (
	| { kind: 'named'; name: string; target: Binding<SymbolEnd | ExternalEnd> }
	| { kind: 'default'; target: Binding<SymbolEnd | ExternalEnd> }
	| { kind: 'namespace'; target: Binding<FileEnd | ExternalEnd> }
);

/**
 * An import or re-export statement. `module` is the file or package it names (graphify
 * `imports_from`, or `re_exports` for `export *`). Each specifier is a symbol-level relation.
 * Which list of the record a site is in says whether it imports or re-exports.
 */
export interface ModuleSite {
	/** Start line of the statement, the evidence shown for the relation */
	line: number;
	/** The statement as the parser read it. The wire reads this and nothing else. */
	text: string;
	module: Binding<FileEnd | ExternalEnd>;
	/** null until the statement is split; [] for `import 'x'` or Python `import os` */
	specifiers: Specifier[] | null;
}

interface RefBase {
	line: number;
	/** The innermost enclosing symbol; null for top-level code */
	from: SymbolId | null;
	/** As written: 'foo', 'this.save', 'z.object'. null when the source did not record it (graph.json). */
	written: string | null;
	/**
	 * The callee's first name is a parameter or a local of an enclosing function (`next` in
	 * `function f(next) { next() }`), so the file's imports and declarations do not say what it is
	 */
	local?: true;
}

/** Every relation other than imports, named and shaped as graphify's ast edges so T1-10 maps one to one. */
export type RefSite = RefBase &
	(
		| { kind: 'calls'; target: Binding<SymbolEnd | ExternalEnd> }
		| {
				kind: 'indirect_call';
				context: 'argument' | 'collection';
				target: GuessBinding<SymbolEnd | ExternalEnd>;
		  }
		| {
				kind: 'references';
				context: 'parameter_type' | 'field' | 'generic_arg' | 'return_type';
				target: Binding<SymbolEnd | ExternalEnd>;
		  }
		| { kind: 'inherits' | 'implements'; from: SymbolId; target: Binding<SymbolEnd | ExternalEnd> }
		| { kind: 'dynamic_import'; target: Binding<FileEnd | ExternalEnd> }
	);

export interface SymbolRecord {
	id: SymbolId;
	name: string;
	/** Every kind the parser reads, variable, interface and type included */
	kind: SymbolKind;
	lines: LineRange;
	badges: BadgeKind[];
	children: SymbolRecord[];
}

/**
 * One file and the relations written in it. The parser writes the sites; a resolver rewrites
 * only their bindings; the graph.json adapter writes whole records. `contains` and `method`
 * are the symbol tree, not sites.
 */
export interface FileRecord {
	path: FilePath;
	language: string | null;
	/** The whole file, so a file with no symbols still has evidence to point at (graphify `L1`) */
	lines: LineRange;
	symbols: SymbolRecord[];
	/** Exactly the parser's `import` symbols, in order: the list the v1 wire sends */
	imports: ModuleSite[];
	/** `export … from`, kept apart from `imports` so the wire cannot read them */
	reexports: ModuleSite[];
	refs: RefSite[];
}

export interface CodeMap {
	version: 2;
	/** The folder or repository name every FilePath starts with; null when keys are repo-relative */
	root: string | null;
	/** In astMap order, including files with nothing to send */
	files: ReadonlyMap<FilePath, FileRecord>;
}

/**
 * The relation names a code map can show, which are graphify's ast edge names. `contains` and
 * `method` come from the symbol tree; the rest from sites.
 */
export type RelationKind =
	| RefSite['kind']
	| 'imports'
	| 'imports_from'
	| 're_exports'
	| 'contains'
	| 'method';

/**
 * A code relation as persisted evidence. It names files and a line, never a SymbolId, so it
 * survives a re-parse and a JSON round trip. A reader checks it against the current map.
 */
export interface RelationRef<C extends Confidence = Confidence> {
	path: FilePath;
	line: number;
	relation: RelationKind;
	toPath: FilePath;
	confidence: C;
}

/**
 * Why an LLM edge between two roles is or is not backed by code (T1-8). EXTRACTED cites at
 * least one extracted relation and is drawn solid. INFERRED is drawn dashed; its refs are
 * name-matched relations that only suggest the edge, or none.
 */
export type EdgeEvidence =
	| {
			confidence: 'EXTRACTED';
			refs: readonly [RelationRef<'EXTRACTED'>, ...RelationRef<'EXTRACTED'>[]];
	  }
	| { confidence: 'INFERRED'; refs: readonly RelationRef<'INFERRED'>[] };
