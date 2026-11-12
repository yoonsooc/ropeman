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
