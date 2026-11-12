export type BadgeKind =
	| 'static'
	| 'async'
	| 'generator'
	| 'route'
	| 'export_default'
	| 'decorator'
	| 'abstract';

export type SymbolKind =
	| 'function'
	| 'class'
	| 'method'
	| 'import'
	| 'variable'
	| 'interface'
	| 'type'
	// Markdown outline (markdownOutline.ts)
	| 'frontmatter'
	| 'heading';

export interface ASTSymbol {
	name: string;
	kind: SymbolKind;
	lineStart: number;
	lineEnd: number;
	code?: string;
	children?: ASTSymbol[];
	parentName?: string;
	badges?: BadgeKind[];
}

/** Why the parser read no symbols from a file it was given. */
export type ParseSkipReason = 'file-size' | 'total-size' | 'parse-failed' | 'unreadable';

export interface ParseSkip {
	path: string;
	reason: ParseSkipReason;
}

/**
 * A relation written in a file, as the parser read it: the line the call or base starts on, as
 * graphify records it, and the name as written with arguments emptied (`z.object().strict`).
 * The code map turns each into a `RefSite`.
 * `ownerLine` is the first line of the class whose heading names the base.
 */
export type ASTRef =
	| { kind: 'calls' | 'dynamic_import'; line: number; written: string }
	| { kind: 'inherits' | 'implements'; line: number; written: string; ownerLine: number };
