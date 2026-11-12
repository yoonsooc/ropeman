/**
 * Skeleton v2: the code map kept in the browser. It holds every fact the deterministic
 * extraction knows (lines, all symbol kinds, import and call sites with their targets).
 * The AI receives only the v1 projection in `skeleton.ts`, so nothing here changes the
 * request bytes or the cache key (ADR-21).
 */
import type { BadgeKind, SymbolKind } from './ast';

/** An astMap key, as the loader named the file (the project prefix stays when it has one). */
export type FilePath = string & { readonly __brand: 'FilePath' };

/** `${FilePath}#${ancestors and name joined by '.'}`, with `~n` on the n-th duplicate in a file. */
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

/**
 * Where an import points. `pending` means no resolver has looked yet; `unresolved` means one
 * looked and found nothing, which is what "could not connect" reports.
 */
export type ImportTarget =
	| { state: 'pending' }
	| { state: 'file'; path: FilePath; provenance: CodeProvenance }
	| { state: 'external'; module: string; provenance: CodeProvenance }
	| { state: 'unresolved' };

export type CallTarget =
	| { state: 'pending' }
	| { state: 'symbol'; id: SymbolId; provenance: CodeProvenance }
	| { state: 'external'; module: string; provenance: CodeProvenance }
	| { state: 'unresolved' };

export interface ImportSite {
	/** Start line of the statement, the evidence shown for the relation */
	line: number;
	/** The statement as the parser read it. The wire and the resolver both start from this. */
	text: string;
	target: ImportTarget;
}

export interface CallSite {
	line: number;
	/** The innermost enclosing symbol; null for top-level code */
	caller: SymbolId | null;
	/** As written: 'foo', 'this.save', 'z.object' */
	callee: string;
	target: CallTarget;
}

export interface SymbolRecord {
	id: SymbolId;
	name: string;
	/** Every kind the parser reads, variable, interface and type included */
	kind: SymbolKind;
	lines: LineRange;
	badges: BadgeKind[];
	children: SymbolRecord[];
}

/** One file and the relations written in it, so each record has one writer per stage. */
export interface FileRecord {
	path: FilePath;
	language: string | null;
	symbols: SymbolRecord[];
	imports: ImportSite[];
	calls: CallSite[];
}

export interface CodeMap {
	version: 2;
	/** In astMap order, including files with nothing to send */
	files: ReadonlyMap<FilePath, FileRecord>;
}
