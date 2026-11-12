import type { SymbolKind } from '$lib/types/ast';
import type {
	Binding,
	CodeMap,
	Confidence,
	Endpoint,
	ExternalEnd,
	FileEnd,
	FilePath,
	FileRecord,
	GuessBinding,
	ModuleSite,
	RefSite,
	Specifier,
	SymbolEnd,
	SymbolId,
	SymbolRecord
} from '$lib/types/codeMap';
import { inferLanguage } from './skeletonExtractor';

/** The `graph.schema_version` this adapter reads. Graphify 0.9.104 writes 1. */
export const GRAPHIFY_SCHEMA_VERSION = 1;

/** Why part of a graph.json is left out of the code map, or kept with less than it claimed. */
export const ISSUE_REASONS = {
	'semantic-layer':
		'Built by an LLM (`_origin: semantic`). The code map holds code facts only (A-10).',
	'not-code': 'A node that is neither code nor a package, such as a rationale.',
	'no-file-node': 'A symbol whose source_file has no file node.',
	'no-location': 'No `L<n>` line, so there is no site to put it at.',
	'no-parent':
		'A symbol with no contains or method edge, because graphify kept another relation for that node pair. Placed at the top of its file.',
	'not-a-code-relation': 'A relation the code map has no slot for: uses, declares, cites, extends.',
	'manifest-dependency':
		'A package.json dependency entry. It declares a package and imports nothing.',
	'nested-import':
		'An import inside a function, outside JS/TS. Parsed files keep no site for it either.',
	'external-target':
		'A target graphify could not resolve (`external: true`). A site keeps it as `unresolved`; a specifier is dropped.',
	'missing-module-edge':
		'Specifiers with no module edge at their line. The module stays `unresolved`.',
	'endpoint-mismatch':
		'An endpoint or context the relation cannot take, such as `inherits` from top-level code.',
	'dropped-endpoint': 'A relation whose source or target node was left out.',
	'folded-call':
		'A contains or method edge carrying a call context: graphify kept one edge per node pair and the call it dropped has no line.',
	'reverse-import':
		'The other half of a two-file import cycle, which graphify drops and marks `reverse_import`. Its line is unknown.',
	downgraded:
		'EXTRACTED made INFERRED: one of several candidates for a site, an `indirect_call`, or AMBIGUOUS.',
	malformed: 'An entry missing a field the format requires.'
} as const;

export type IssueReason = keyof typeof ISSUE_REASONS;

export interface GraphifyIssue {
	reason: IssueReason;
	/** A node id, or `relation source -> target` */
	subject: string;
	/** Repo-relative, as graph.json writes it */
	file: string | null;
	line: number | null;
}

export interface GraphifyImport {
	map: CodeMap;
	issues: GraphifyIssue[];
}

export class GraphifyFormatError extends Error {}

/**
 * A Graphify graph.json as a code map, so Graphify's extraction is scored like Ropeman's
 * (T1-12). Only the ast layer becomes code facts; `community` and `community_name` are not
 * read. Everything left out or weakened is reported with its reason. `rootDir`, less a trailing
 * `/`, is what FilePaths start with, as `CodeMap.root`. Throws GraphifyFormatError on an
 * unknown `schema_version`.
 */
export function readGraphifyGraph(json: unknown, rootDir: string | null): GraphifyImport {
	const root = rootDir === null ? null : rootDir.replace(/\/+$/, '');
	const { nodes, links } = parseGraph(json);
	const issues: GraphifyIssue[] = [];
	const report: Report = (reason, subject, file, line) =>
		issues.push({ reason, subject, file, line });

	const graph = classifyNodes(nodes, links, root, report);
	const builders = new Map<string, FileBuilder>();
	for (const file of graph.files.values()) {
		const symbols = buildSymbolTree(file, graph, report);
		builders.set(file.sourceFile, {
			path: file.path,
			symbols,
			imports: new Map(),
			reexports: new Map(),
			refs: new Map()
		});
	}
	for (const link of links) collectRelation(link, graph, builders, report);

	const files = new Map<FilePath, FileRecord>();
	for (const builder of builders.values()) {
		const record = finishRecord(builder, report);
		files.set(record.path, record);
	}
	return { map: { version: 2, root, files }, issues };
}

type Report = (
	reason: IssueReason,
	subject: string,
	file: string | null,
	line: number | null
) => void;

interface RawNode {
	id: string;
	label: string;
	source_file: string;
	source_location?: string;
	_origin?: string;
	external?: boolean;
	file_type?: string;
	_callable_class?: boolean;
}

interface RawEvidence {
	confidence?: string;
	source_file?: string;
	source_location?: string;
}

interface RawLink extends RawEvidence {
	source: string;
	target: string;
	relation: string;
	source_file: string;
	_origin?: string;
	context?: string;
	type_only?: boolean;
	deferred?: boolean;
	reverse_import?: boolean;
	also_seen?: RawEvidence[];
}

function parseGraph(json: unknown): { nodes: unknown[]; links: unknown[] } {
	if (!isRecord(json)) throw new GraphifyFormatError('graph.json is not an object');
	const version = isRecord(json.graph) ? json.graph.schema_version : undefined;
	if (version !== GRAPHIFY_SCHEMA_VERSION) {
		throw new GraphifyFormatError(
			`graph.json schema_version ${String(version)} is not supported (expected ${GRAPHIFY_SCHEMA_VERSION})`
		);
	}
	const links = json.links ?? json.edges;
	if (!Array.isArray(json.nodes) || !Array.isArray(links)) {
		throw new GraphifyFormatError('graph.json has no nodes or links array');
	}
	return { nodes: json.nodes.map(withPosixPath), links: links.map(withPosixPath) };
}

/** FilePaths use `/`, so a `src\a.ts` written on Windows names the same file as `src/a.ts`. */
function withPosixPath(item: unknown): unknown {
	if (!isRecord(item)) return item;
	const posix =
		typeof item.source_file === 'string'
			? { ...item, source_file: item.source_file.replaceAll('\\', '/') }
			: item;
	return Array.isArray(posix.also_seen)
		? { ...posix, also_seen: posix.also_seen.map(withPosixPath) }
		: posix;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isRawNode = (value: unknown): value is RawNode =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	typeof value.label === 'string' &&
	typeof value.source_file === 'string';

const isRawLink = (value: unknown): value is RawLink =>
	isRecord(value) &&
	typeof value.source === 'string' &&
	typeof value.target === 'string' &&
	typeof value.relation === 'string' &&
	typeof value.source_file === 'string';

/** `L9` is line 9. Graphify writes only a start line. */
function parseLine(location: string | undefined): number | null {
	const match = /^L(\d+)/.exec(location ?? '');
	return match ? Number(match[1]) : null;
}

interface FileNode {
	id: string;
	sourceFile: string;
	path: FilePath;
}

interface SymbolNode {
	id: string;
	sourceFile: string;
	name: string;
	kind: SymbolKind;
	line: number;
}

/** What a graph.json node stands for in the code map. */
type NodeRole =
	| { role: 'file'; file: FileNode }
	| { role: 'symbol'; symbol: SymbolNode }
	/** An ast `concept` node: a dependency a manifest lists (`pino` at package.json L140) */
	| { role: 'package'; module: string; sourceFile: string }
	/** `external: true`: graphify's slug for a target it could not resolve, not a module name */
	| { role: 'external'; label: string }
	| { role: 'dropped' };

interface Graph {
	roles: Map<string, NodeRole>;
	files: Map<string, FileNode>;
	/** source_file -> the symbols it declares */
	symbols: Map<string, SymbolNode[]>;
	/** child -> parent node id, from contains and method */
	parents: Map<string, string>;
	/** graph.json node id -> SymbolId, filled by buildSymbolTree */
	symbolIds: Map<string, SymbolId>;
}

function classifyNodes(
	nodes: readonly unknown[],
	links: readonly unknown[],
	root: string | null,
	report: Report
): Graph {
	const roles = new Map<string, NodeRole>();
	const files = new Map<string, FileNode>();
	const drop = (raw: RawNode, reason: IssueReason) => {
		roles.set(raw.id, { role: 'dropped' });
		report(reason, raw.id, raw.source_file || null, parseLine(raw.source_location));
	};
	const symbols: RawNode[] = [];
	for (const raw of nodes) {
		if (!isRawNode(raw)) {
			report('malformed', JSON.stringify(raw).slice(0, 120), null, null);
		} else if (raw.external === true) {
			roles.set(raw.id, { role: 'external', label: raw.label });
		} else if (raw._origin !== 'ast') {
			drop(raw, 'semantic-layer');
		} else if (raw.file_type === 'concept') {
			roles.set(raw.id, { role: 'package', module: raw.label, sourceFile: raw.source_file });
		} else if (raw.file_type !== 'code') {
			drop(raw, 'not-code');
		} else if (isFileNode(raw) && !files.has(raw.source_file)) {
			const path = (root === null ? raw.source_file : `${root}/${raw.source_file}`) as FilePath;
			const file = { id: raw.id, sourceFile: raw.source_file, path };
			files.set(raw.source_file, file);
			roles.set(raw.id, { role: 'file', file });
		} else {
			symbols.push(raw);
		}
	}
	const byFile = new Map<string, SymbolNode[]>();
	for (const raw of symbols) {
		const line = parseLine(raw.source_location);
		if (!files.has(raw.source_file)) drop(raw, 'no-file-node');
		else if (line === null) drop(raw, 'no-location');
		else {
			const symbol = toSymbolNode(raw, line);
			roles.set(raw.id, { role: 'symbol', symbol });
			const own = byFile.get(raw.source_file);
			if (own) own.push(symbol);
			else byFile.set(raw.source_file, [symbol]);
		}
	}

	const parents = new Map<string, string>();
	for (const link of links) {
		if (isRawLink(link) && link._origin === 'ast' && isTreeRelation(link.relation)) {
			parents.set(link.target, link.source);
		}
	}
	return { roles, files, symbols: byFile, parents, symbolIds: new Map() };
}

const isTreeRelation = (relation: string) => relation === 'contains' || relation === 'method';

/**
 * A file node starts at `L1` and is labelled with the end of its path: `forge-registry.ts`,
 * or `v2/session.ts` when another file shares the base name.
 */
const isFileNode = (raw: RawNode) =>
	raw.source_location === 'L1' &&
	(raw.source_file === raw.label || raw.source_file.endsWith(`/${raw.label}`));

/** Labels read `createStore()`, `.save()`, `Store`, `cart`. The kind is read from that alone. */
function toSymbolNode(raw: RawNode, line: number): SymbolNode {
	const callable = raw.label.endsWith('()');
	const kind: SymbolKind = raw._callable_class
		? 'class'
		: !callable
			? 'variable'
			: raw.label.startsWith('.')
				? 'method'
				: 'function';
	const name = raw.label.replace(/^\./, '').replace(/\(\)$/, '');
	return { id: raw.id, sourceFile: raw.source_file, name, kind, line };
}

/**
 * The file's symbols nested as the parser nests them, siblings in line order, so `~n` counts
 * duplicates in declaration order as `fileFromAst` does. A symbol whose parent is missing,
 * in another file, or never reached from the file node starts at the top level.
 */
function buildSymbolTree(file: FileNode, graph: Graph, report: Report): SymbolRecord[] {
	const own = inLineOrder(graph.symbols.get(file.sourceFile) ?? []);
	const children = new Map<string, SymbolNode[]>();
	for (const symbol of own) {
		const parent = graph.parents.get(symbol.id);
		const role = parent === undefined ? undefined : graph.roles.get(parent);
		const inFile =
			(role?.role === 'file' && role.file === file) ||
			(role?.role === 'symbol' && role.symbol.sourceFile === file.sourceFile);
		if (!inFile) report('no-parent', symbol.id, file.sourceFile, symbol.line);
		const key = inFile && parent !== undefined ? parent : file.id;
		const siblings = children.get(key);
		if (siblings) siblings.push(symbol);
		else children.set(key, [symbol]);
	}

	const ids = new Map<string, number>();
	const visited = new Set<string>();
	const toRecord = (symbol: SymbolNode, parent: string | null): SymbolRecord => {
		visited.add(symbol.id);
		const qualified = parent ? `${parent}.${symbol.name}` : symbol.name;
		const seen = (ids.get(qualified) ?? 0) + 1;
		ids.set(qualified, seen);
		const id = `${file.path}#${qualified}${seen > 1 ? `~${seen}` : ''}` as SymbolId;
		graph.symbolIds.set(symbol.id, id);
		const kids = (children.get(symbol.id) ?? []).filter((child) => !visited.has(child.id));
		return {
			id,
			name: symbol.name,
			kind: symbol.kind,
			lines: { start: symbol.line, end: null },
			badges: [],
			children: kids.map((child) => toRecord(child, qualified))
		};
	};
	const records = (children.get(file.id) ?? []).map((symbol) => toRecord(symbol, null));
	// Parents that contain each other in a cycle are never reached from the file node.
	for (const symbol of own) {
		if (visited.has(symbol.id)) continue;
		report('no-parent', symbol.id, file.sourceFile, symbol.line);
		records.push(toRecord(symbol, null));
	}
	return records;
}

const inLineOrder = (symbols: readonly SymbolNode[]) =>
	[...symbols].sort((a, b) => a.line - b.line || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** A relation's target as the code map can name it */
type Resolved =
	| { kind: 'end'; end: Endpoint; name: string }
	| { kind: 'unresolved'; label: string };

/** One relation at one line */
interface Hit {
	target: Resolved;
	confidence: Confidence;
	ambiguous: boolean;
	typeOnly: boolean;
	subject: string;
	file: string;
	line: number;
}

interface ImportSite {
	line: number;
	modules: Hit[];
	specifiers: Hit[];
}

type RefKind = RefSite['kind'];
type RefContext = Extract<RefSite, { context: unknown }>['context'];

interface RefGroup {
	kind: RefKind;
	line: number;
	from: SymbolId | null;
	context: RefContext | null;
	hits: Hit[];
}

interface FileBuilder {
	path: FilePath;
	symbols: SymbolRecord[];
	imports: Map<number, ImportSite>;
	reexports: Map<number, ImportSite>;
	refs: Map<string, RefGroup>;
}

type CodeRelation = 'imports_from' | 'imports' | 're_exports' | RefKind;

/** The target kinds each relation takes, as ModuleSite, Specifier and RefSite type them. */
const TARGET_KINDS: Record<CodeRelation, readonly Endpoint['kind'][]> = {
	imports_from: ['file', 'external'],
	imports: ['symbol', 'file', 'external'],
	re_exports: ['symbol', 'file', 'external'],
	calls: ['symbol', 'external'],
	indirect_call: ['symbol', 'external'],
	references: ['symbol', 'external'],
	inherits: ['symbol', 'external'],
	implements: ['symbol', 'external'],
	dynamic_import: ['file', 'external']
};

const CONTEXTS: Partial<Record<RefKind, readonly RefContext[]>> = {
	indirect_call: ['argument', 'collection'],
	references: ['parameter_type', 'field', 'generic_arg', 'return_type']
};

/** Languages with `import()`: an import graphify marks `deferred` there is a dynamic import. */
const DYNAMIC_IMPORT_LANGUAGES = new Set([
	'javascript',
	'typescript',
	'jsx',
	'tsx',
	'svelte',
	'vue'
]);

const isCodeRelation = (relation: string): relation is CodeRelation => relation in TARGET_KINDS;

function collectRelation(
	link: unknown,
	graph: Graph,
	builders: Map<string, FileBuilder>,
	report: Report
): void {
	if (!isRawLink(link)) {
		report('malformed', JSON.stringify(link).slice(0, 120), null, null);
		return;
	}
	const subject = `${link.relation} ${link.source} -> ${link.target}`;
	if (link._origin === 'ast' && isTreeRelation(link.relation)) {
		if (link.context === 'call') {
			report('folded-call', subject, link.source_file, parseLine(link.source_location));
		}
		return;
	}
	if (link._origin === 'ast' && link.reverse_import === true) {
		const lostFile = graph.roles.get(link.target);
		report(
			'reverse-import',
			`${link.relation} ${link.target} -> ${link.source}`,
			lostFile?.role === 'file' ? lostFile.file.sourceFile : null,
			null
		);
	}
	const lines = occurrences(link);
	const reject = (reason: IssueReason) => {
		for (const line of lines.length ? lines.map((o) => o.line) : [null]) {
			report(reason, subject, link.source_file, line);
		}
	};
	if (link._origin !== 'ast') return reject('semantic-layer');

	const source = graph.roles.get(link.source);
	const targetRole = graph.roles.get(link.target);
	if (!source || !targetRole) return reject('malformed');
	if (
		link.relation === 'imports' &&
		targetRole.role === 'package' &&
		targetRole.sourceFile === link.source_file
	) {
		return reject('manifest-dependency');
	}
	const deferredImport = link.relation === 'imports_from' && link.deferred === true;
	if (deferredImport && !DYNAMIC_IMPORT_LANGUAGES.has(inferLanguage(link.source_file) ?? '')) {
		return reject('nested-import');
	}
	const relation = deferredImport ? 'dynamic_import' : link.relation;
	if (!isCodeRelation(relation)) return reject('not-a-code-relation');

	const builder = builders.get(link.source_file);
	const from =
		source.role === 'file'
			? null
			: source.role === 'symbol'
				? graph.symbolIds.get(source.symbol.id)
				: undefined;
	const target = resolve(targetRole, graph);
	if (!builder || from === undefined || !target) return reject('dropped-endpoint');
	if (lines.length === 0) return reject('no-location');
	const known = lines.filter((o): o is Occurrence => o.confidence !== null);
	if (known.length < lines.length) return reject('malformed');

	const contexts = CONTEXTS[relation as RefKind];
	const context = contexts?.find((c) => c === link.context) ?? null;
	const fits =
		(target.kind === 'unresolved' || TARGET_KINDS[relation].includes(target.end.kind)) &&
		(!contexts || context !== null) &&
		!((relation === 'inherits' || relation === 'implements') && from === null);
	if (!fits) return reject('endpoint-mismatch');

	for (const { line, confidence, ambiguous } of known) {
		const hit: Hit = {
			target,
			confidence,
			ambiguous,
			typeOnly: link.type_only === true,
			subject,
			file: link.source_file,
			line
		};
		if (relation === 'imports_from' || relation === 'imports' || relation === 're_exports') {
			const sites = relation === 're_exports' ? builder.reexports : builder.imports;
			const site = sites.get(line) ?? { line, modules: [], specifiers: [] };
			sites.set(line, site);
			const names = target.kind === 'end' ? target.end.kind === 'symbol' : relation === 'imports';
			(relation !== 'imports_from' && names ? site.specifiers : site.modules).push(hit);
		} else {
			const key = `${relation} ${line} ${from ?? ''} ${context ?? ''}`;
			const group = builder.refs.get(key) ?? { kind: relation, line, from, context, hits: [] };
			builder.refs.set(key, group);
			group.hits.push(hit);
		}
	}
}

interface Occurrence {
	line: number;
	confidence: Confidence;
	/** Graphify's AMBIGUOUS, read as INFERRED */
	ambiguous: boolean;
}

/** null confidence: a value graph.json should not hold */
type Seen = Omit<Occurrence, 'confidence'> & { confidence: Confidence | null };

/** The relation and each place graphify folded into it (`also_seen`), one per line. */
function occurrences(link: RawLink): Seen[] {
	const byLine = new Map<number, Seen>();
	const folded = Array.isArray(link.also_seen)
		? (link.also_seen.filter(isRecord) as RawEvidence[])
		: [];
	for (const evidence of [link, ...folded]) {
		if (evidence.source_file !== undefined && evidence.source_file !== link.source_file) continue;
		const line = parseLine(evidence.source_location);
		if (line === null || byLine.has(line)) continue;
		const confidence =
			evidence.confidence === 'EXTRACTED'
				? 'EXTRACTED'
				: evidence.confidence === 'INFERRED' || evidence.confidence === 'AMBIGUOUS'
					? 'INFERRED'
					: null;
		byLine.set(line, { line, confidence, ambiguous: evidence.confidence === 'AMBIGUOUS' });
	}
	return [...byLine.values()];
}

function resolve(role: NodeRole, graph: Graph): Resolved | null {
	switch (role.role) {
		case 'file':
			return { kind: 'end', end: { kind: 'file', path: role.file.path }, name: role.file.path };
		case 'symbol': {
			const id = graph.symbolIds.get(role.symbol.id);
			return id ? { kind: 'end', end: { kind: 'symbol', id }, name: role.symbol.name } : null;
		}
		case 'package':
			return {
				kind: 'end',
				end: { kind: 'external', module: role.module, name: null },
				name: role.module
			};
		case 'external':
			return { kind: 'unresolved', label: role.label };
		case 'dropped':
			return null;
	}
}

function finishRecord(builder: FileBuilder, report: Report): FileRecord {
	const sorted = <T extends { line: number }>(items: Iterable<T>) =>
		[...items].sort((a, b) => a.line - b.line);
	return {
		path: builder.path,
		language: inferLanguage(builder.path),
		lines: { start: 1, end: null },
		symbols: builder.symbols,
		imports: sorted(builder.imports.values()).flatMap((site) => toModuleSites(site, report)),
		reexports: sorted(builder.reexports.values()).flatMap((site) => toModuleSites(site, report)),
		refs: sorted(builder.refs.values()).flatMap((group) => toRefSites(group, report))
	};
}

/**
 * One site per module the line names (Python `import a, b` names two), with the line's
 * specifiers on the first. graph.json does not keep the statement, so `text` is empty.
 */
function toModuleSites(site: ImportSite, report: Report): ModuleSite[] {
	const specifiers: Specifier[] = [];
	for (const group of byName(site.specifiers, report)) {
		const [first] = group;
		if (first.target.kind !== 'end') continue;
		specifiers.push({
			kind: 'named',
			name: first.target.name,
			local: first.target.name,
			typeOnly: group.every((hit) => hit.typeOnly),
			target: bind(group, isSymbol, report)
		});
	}
	const modules = byName(site.modules, report);
	if (modules.length === 0) {
		report('missing-module-edge', site.specifiers[0].subject, site.specifiers[0].file, site.line);
	}
	const bindings: Binding<FileEnd | ExternalEnd>[] = modules.length
		? modules.map((group) => bind(group, isModule, report))
		: [{ state: 'unresolved' }];
	return bindings.map((module, i) => ({
		line: site.line,
		text: '',
		module,
		specifiers: i === 0 && specifiers.length ? specifiers : null
	}));
}

function toRefSites(group: RefGroup, report: Report): RefSite[] {
	const { line, from } = group;
	return byName(group.hits, report).map((hits): RefSite => {
		const base = { line, from, written: null };
		switch (group.kind) {
			case 'dynamic_import':
				return { ...base, kind: 'dynamic_import', target: bind(hits, isModule, report) };
			case 'indirect_call':
				return {
					...base,
					kind: 'indirect_call',
					context: group.context as 'argument' | 'collection',
					target: guessAll(hits, report)
				};
			case 'references':
				return {
					...base,
					kind: 'references',
					context: group.context as Extract<RefSite, { kind: 'references' }>['context'],
					target: bind(hits, isMember, report)
				};
			case 'inherits':
			case 'implements':
				return { ...base, kind: group.kind, from: from!, target: bind(hits, isMember, report) };
			case 'calls':
				return { ...base, kind: 'calls', target: bind(hits, isMember, report) };
		}
	});
}

/**
 * Hits split by target name, same targets merged. Two names on one line are two calls or
 * two imports: Graphify emits one edge per raw call and drops a repeated (caller, target)
 * pair, and every one of the 232 PASEO lines where a function calls two EXTRACTED targets
 * names both callees (tests/fixtures/graphify/README.md). Targets that share a name are
 * candidates for one site.
 */
function byName(hits: readonly Hit[], report: Report): Hit[][] {
	const groups = new Map<string, Hit[]>();
	for (const hit of hits) {
		if (hit.target.kind === 'unresolved') {
			report('external-target', `${hit.subject} (${hit.target.label})`, hit.file, hit.line);
		}
		const key = hit.target.kind === 'end' ? `end ${hit.target.name}` : `ext ${hit.target.label}`;
		const group = groups.get(key) ?? [];
		groups.set(key, group);
		if (!group.some((other) => sameTarget(other.target, hit.target))) group.push(hit);
	}
	return [...groups.values()];
}

const sameTarget = (a: Resolved, b: Resolved) =>
	a.kind === 'end' && b.kind === 'end'
		? sameEnd(a.end, b.end)
		: a.kind === 'unresolved' && b.kind === 'unresolved' && a.label === b.label;

const sameEnd = (a: Endpoint, b: Endpoint) =>
	a.kind === 'file'
		? b.kind === 'file' && a.path === b.path
		: a.kind === 'symbol'
			? b.kind === 'symbol' && a.id === b.id
			: b.kind === 'external' && a.module === b.module && a.name === b.name;

const isSymbol = (end: Endpoint): end is SymbolEnd => end.kind === 'symbol';
const isModule = (end: Endpoint): end is FileEnd | ExternalEnd => end.kind !== 'symbol';
const isMember = (end: Endpoint): end is SymbolEnd | ExternalEnd => end.kind !== 'file';

/** The endpoints of one name group; `collectRelation` checked their kinds against TARGET_KINDS. */
function endsOf<E extends Endpoint>(hits: readonly Hit[], fits: (end: Endpoint) => end is E) {
	return hits.flatMap((hit) =>
		hit.target.kind === 'end' && fits(hit.target.end) ? [{ to: hit.target.end, hit }] : []
	);
}

const inferred = { source: 'graphify', confidence: 'INFERRED' } as const;

/** One candidate keeps its confidence. Several are all INFERRED, as `Binding` requires. */
function bind<E extends Endpoint>(
	hits: readonly Hit[],
	fits: (end: Endpoint) => end is E,
	report: Report
): Binding<E> {
	const [first, second, ...rest] = endsOf(hits, fits);
	if (!first) return { state: 'unresolved' };
	noteDowngrades(hits, second !== undefined, report);
	if (!second) {
		return {
			state: 'bound',
			candidates: [
				{ to: first.to, provenance: { source: 'graphify', confidence: first.hit.confidence } }
			]
		};
	}
	const guess = ({ to }: { to: E }) => ({ to, provenance: inferred });
	return { state: 'bound', candidates: [guess(first), guess(second), ...rest.map(guess)] };
}

/** A function passed as a value is never decided by the code, so every candidate infers. */
function guessAll(hits: readonly Hit[], report: Report): GuessBinding<SymbolEnd | ExternalEnd> {
	const [first, ...rest] = endsOf(hits, isMember);
	if (!first) return { state: 'unresolved' };
	noteDowngrades(hits, true, report);
	const guess = ({ to }: { to: SymbolEnd | ExternalEnd }) => ({ to, provenance: inferred });
	return { state: 'bound', candidates: [guess(first), ...rest.map(guess)] };
}

function noteDowngrades(hits: readonly Hit[], allInferred: boolean, report: Report): void {
	for (const hit of hits) {
		if (hit.ambiguous || (allInferred && hit.confidence === 'EXTRACTED')) {
			report('downgraded', hit.subject, hit.file, hit.line);
		}
	}
}
