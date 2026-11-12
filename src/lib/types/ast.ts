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
	| 'heading'
	| ConfigSymbolKind;

/**
 * Kinds read from configuration files (configParsers.ts), named in each format's own terms so
 * the AI reads them without a prompt rule. Images, copied paths, module sources, includes and
 * Make prerequisites are `import` symbols instead.
 */
export const CONFIG_SYMBOL_KINDS = [
	// Dockerfile: a FROM build stage, its EXPOSE ports, its ENTRYPOINT and CMD
	'stage',
	'port',
	'command',
	// Terraform: resource, data and module blocks named by address, variable and output blocks
	'resource',
	'input',
	'output',
	// Makefile rule
	'target',
	// A key of an env template (.env.example); the value is never read into a symbol
	'env'
] as const;

export type ConfigSymbolKind = (typeof CONFIG_SYMBOL_KINDS)[number];

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
