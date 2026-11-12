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
 * Kinds read from configuration files (configParsers.ts, configOutline.ts), named in each
 * format's own terms so the AI reads them without a prompt rule. Images, copied paths, module
 * sources, includes, Make prerequisites, actions, packages and Compose `depends_on` are
 * `import` symbols instead.
 */
export const CONFIG_SYMBOL_KINDS = [
	// Dockerfile: a FROM build stage, its EXPOSE ports, its ENTRYPOINT and CMD. Compose ports too
	'stage',
	'port',
	'command',
	// Terraform: resource, data and module blocks named by address, variable and output blocks.
	// A Kubernetes object is a `resource` named `Kind/name`
	'resource',
	'input',
	'output',
	// A task to run by name: a Makefile rule, a package.json script, a pyproject entry point
	'target',
	// An environment variable name: an env template key, a Compose service's `environment` key.
	// The value is never read into a symbol
	'env',
	// A top-level key of a YAML file or a JSON manifest, a data key of a Kubernetes Secret
	'key',
	// A TOML `[table]` header
	'table',
	// A GitHub Actions job
	'job',
	// A Docker Compose service
	'service'
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
