/**
 * Binds the import sites of a code map to the files, symbols and packages they load (T1-6).
 * Pure: config files come in as text keyed like astMap paths, and only bindings and
 * specifiers change, so the wire, which reads `text`, sends the same bytes (ADR-21).
 */
import type {
	Binding,
	CodeMap,
	CodeProvenance,
	ExternalEnd,
	FileEnd,
	FilePath,
	FileRecord,
	ModuleSite,
	Specifier,
	SymbolEnd
} from '$lib/types/codeMap';

/** Which rule owns a specifier. It is decided before any lookup, so a miss still names its rule. */
export type ImportRule =
	| 'relative'
	| 'tsconfig-paths'
	| 'sveltekit-alias'
	| 'base-url'
	| 'workspace'
	| 'python-relative'
	| 'python-package';

/**
 * Why a site that names something local found no file. `no-file`: the rule produced a path the
 * map lacks (a missing, cut or unparsed file, such as `.css`). `no-entry`: a workspace package
 * whose `exports`, `main` or `types` reach no file in the map. `outside-root`: a relative path
 * that climbs out of the project. `unparsed`: the statement text names no module.
 */
export type UnresolvedReason = 'no-file' | 'no-entry' | 'outside-root' | 'unparsed';

export type ModuleResolution =
	/** More than one path only for a Python package found under several source roots */
	| { status: 'file'; rule: ImportRule; paths: readonly [FilePath, ...FilePath[]] }
	| { status: 'external'; module: string }
	| { status: 'unresolved'; rule: ImportRule | null; reason: UnresolvedReason };

/** What the resolver decided for one import site, with the specifier as written. */
export interface ImportOutcome {
	path: FilePath;
	line: number;
	/** The module specifier as written: './a', '$lib/x', '..utils', or null when unparsed */
	written: string | null;
	resolution: ModuleResolution;
}

interface PathAlias {
	/** A tsconfig `paths` key: exact, or with one `*` */
	pattern: string;
	/** Key-space paths, `*` kept for substitution */
	targets: string[];
}

interface AliasScope {
	aliases: PathAlias[];
	baseUrl: string | null;
}

interface WorkspacePackage {
	dir: string;
	manifest: PackageManifest;
	/** tsconfig `outDir` → `rootDir`, so a `dist/` entry maps back to its source */
	outDirs: { outDir: string; rootDir: string }[];
}

interface PackageManifest {
	name?: unknown;
	exports?: unknown;
	main?: unknown;
	types?: unknown;
	typings?: unknown;
	module?: unknown;
	source?: unknown;
	svelte?: unknown;
	workspaces?: unknown;
}

interface CompilerOptions {
	paths?: Record<string, string[]>;
	baseUrl?: string;
	outDir?: string;
	rootDir?: string;
}

/** Everything the config files say about resolution, keyed by the directory each applies to. */
export interface ResolverConfig {
	tsScopes: ReadonlyMap<string, AliasScope>;
	kitScopes: ReadonlyMap<string, PathAlias[]>;
	packages: ReadonlyMap<string, WorkspacePackage>;
}

const PROVENANCE: CodeProvenance = { source: 'resolver', confidence: 'EXTRACTED' };
const GUESS = { source: 'resolver', confidence: 'INFERRED' } as const;

const SCRIPT_EXTS = [
	'.ts',
	'.tsx',
	'.d.ts',
	'.js',
	'.jsx',
	'.mts',
	'.cts',
	'.mjs',
	'.cjs',
	'.svelte',
	'.vue'
];
/** A written `.js` names the `.ts` it compiles from (NodeNext, bundler resolution). */
const COMPILED_EXTS: [string, string[]][] = [
	['.d.ts', ['.ts', '.tsx']],
	['.d.mts', ['.mts']],
	['.d.cts', ['.cts']],
	['.js', ['.ts', '.tsx', '.d.ts']],
	['.jsx', ['.tsx']],
	['.mjs', ['.mts', '.d.mts']],
	['.cjs', ['.cts', '.d.cts']]
];
/** Build output folders a package entry may point into when no tsconfig maps them */
const BUILD_DIRS = new Set(['dist', 'build', 'lib', 'out', 'esm', 'cjs']);
const CONDITIONS = [
	'source',
	'svelte',
	'types',
	'import',
	'module',
	'browser',
	'default',
	'require'
];

type Family = 'script' | 'python';

function familyOf(path: string): Family | null {
	const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
	if (ext === '.py') return 'python';
	return SCRIPT_EXTS.includes(ext) ? 'script' : null;
}

/** The files a caller reads for `readResolverConfig`: tsconfig/jsconfig, package.json, pnpm and svelte config. */
export function isResolverConfig(path: string): boolean {
	const name = basename(path);
	return (
		name === 'package.json' ||
		name === 'pnpm-workspace.yaml' ||
		/^[jt]sconfig(\..+)?\.json$/.test(name) ||
		/^svelte\.config\.(js|mjs|cjs|ts)$/.test(name)
	);
}

/**
 * Parse config files into resolution rules. A file that does not parse is skipped, so one
 * broken tsconfig costs its own aliases and nothing else.
 */
export function readResolverConfig(texts: ReadonlyMap<string, string>): ResolverConfig {
	const json = new Map<string, Record<string, unknown>>();
	for (const [path, text] of texts) {
		if (!path.endsWith('.json')) continue;
		const value = parseJsonc(text);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			json.set(path, value as Record<string, unknown>);
		}
	}
	const packages = readWorkspacePackages(texts, json);
	return {
		tsScopes: readTsScopes(json, packages),
		kitScopes: readKitScopes(texts),
		packages
	};
}

/**
 * Bind every import and re-export site the resolver understands; other languages keep
 * `pending`. Modules are resolved first, so a name can follow re-exports through barrels.
 */
export function resolveImports(
	map: CodeMap,
	config: ResolverConfig
): { map: CodeMap; outcomes: ImportOutcome[] } {
	const ctx = createContext(map, config);
	const outcomes: ImportOutcome[] = [];
	for (const [path, record] of map.files) {
		const family = familyOf(path);
		if (!family) continue;
		const read = (site: ModuleSite): ReadSite => {
			const statement =
				family === 'python' ? readPythonImport(site.text) : readScriptImport(site.text);
			const resolution = statement
				? resolveModule(statement.module, path, family, ctx)
				: ({ status: 'unresolved', rule: null, reason: 'unparsed' } as const);
			outcomes.push({ path, line: site.line, written: statement?.module ?? null, resolution });
			return { site, statement, resolution };
		};
		ctx.sites.set(path, {
			imports: record.imports.map(read),
			reexports: record.reexports.map(read)
		});
	}

	const files = new Map<FilePath, FileRecord>();
	for (const [path, record] of map.files) {
		const sites = ctx.sites.get(path);
		files.set(
			path,
			sites
				? {
						...record,
						imports: sites.imports.map((read) => bindSite(read, ctx)),
						reexports: sites.reexports.map((read) => bindSite(read, ctx))
					}
				: record
		);
	}
	return { map: { ...map, files }, outcomes };
}

interface ReadSite {
	site: ModuleSite;
	statement: Statement | null;
	resolution: ModuleResolution;
}

interface Context {
	config: ResolverConfig;
	files: ReadonlySet<string>;
	records: ReadonlyMap<FilePath, FileRecord>;
	/** Every key starts with this; '' when keys are repo-relative */
	prefix: string;
	pythonRoots: string[];
	/** `$lib` as SvelteKit defaults it, for a project with no svelte.config */
	defaultKit: PathAlias[] | null;
	/** Each file's sites with their modules resolved, filled before any name is bound */
	sites: Map<FilePath, { imports: ReadSite[]; reexports: ReadSite[] }>;
}

function createContext(map: CodeMap, config: ResolverConfig): Context {
	const files = new Set<string>(map.files.keys());
	const prefix = map.root ? `${map.root}/` : '';
	const defaultKit =
		config.kitScopes.size === 0
			? kitAliases(prefix.replace(/\/$/, ''), new Map([['$lib', 'src/lib']]))
			: null;
	return {
		config,
		files,
		records: map.files,
		prefix,
		pythonRoots: pythonRoots(files, prefix),
		defaultKit,
		sites: new Map()
	};
}

type WrittenName = { name: string; local: string; typeOnly: boolean };

/** One import statement as written: the module it names and the names it binds. */
interface Statement {
	module: string;
	/** `D` in `import D from 'm'` */
	defaultLocal?: { local: string; typeOnly: boolean };
	/** `ns` in `import * as ns from 'm'` or `import ns = require('m')` */
	namespaceLocal?: { local: string; typeOnly: boolean };
	named: WrittenName[];
	/** false for Python `import x` and `from x import *`, which bind no listed names */
	split: boolean;
	/** `export * from 'm'`: every name `m` exports */
	star?: boolean;
}

function readScriptImport(text: string): Statement | null {
	const source = stripComments(text).trim();
	const sideEffect = source.match(/^import\s*(['"])([^'"]+)\1/);
	if (sideEffect) return { module: sideEffect[2], named: [], split: true };
	const required = source.match(
		/^import\s+(type\s+)?([\w$]+)\s*=\s*require\s*\(\s*(['"])([^'"]+)\3\s*\)/
	);
	if (required) {
		return {
			module: required[4],
			namespaceLocal: { local: required[2], typeOnly: Boolean(required[1]) },
			named: [],
			split: true
		};
	}
	const from = source.match(/^(?:import|export)\s+([\s\S]*?)\s*\bfrom\s*(['"])([^'"]+)\2/);
	if (!from) return null;
	if (/^\*$/.test(from[1].replace(/^type\s+/, '').trim())) {
		return { module: from[3], named: [], split: true, star: true };
	}

	let clause = from[1].trim();
	const allTypes = /^type\s+(?=[\w${*])/.test(clause);
	if (allTypes) clause = clause.replace(/^type\s+/, '');

	const statement: Statement = { module: from[3], named: [], split: true };
	const braces = clause.match(/\{([\s\S]*)\}/);
	if (braces) {
		for (const part of braces[1].split(',')) {
			const item = part.trim();
			if (!item) continue;
			const typed = /^type\s+/.test(item) && !/^type\s+as\b/.test(item);
			const body = typed ? item.replace(/^type\s+/, '') : item;
			const m = body.match(/^(['"]?)(.+?)\1(?:\s+as\s+([\w$]+))?$/);
			if (!m) continue;
			statement.named.push({ name: m[2], local: m[3] ?? m[2], typeOnly: allTypes || typed });
		}
	}
	const rest = clause.replace(/\{[\s\S]*\}/, '');
	for (const part of rest.split(',')) {
		const item = part.trim();
		if (!item) continue;
		const ns = item.match(/^\*\s*as\s+([\w$]+)$/);
		if (ns) statement.namespaceLocal = { local: ns[1], typeOnly: allTypes };
		else if (/^[\w$]+$/.test(item)) statement.defaultLocal = { local: item, typeOnly: allTypes };
	}
	return statement;
}

function readPythonImport(text: string): Statement | null {
	const source = text.replace(/#.*$/gm, '').replace(/\\\n/g, ' ').trim();
	const from = source.match(/^from\s+(\.*[\w.]*)\s+import\s+([\s\S]+)$/);
	if (from) {
		const names = from[2].replace(/[()]/g, '').trim();
		if (names === '*') return { module: from[1], named: [], split: false };
		const named: WrittenName[] = [];
		for (const part of names.split(',')) {
			const m = part.trim().match(/^([\w]+)(?:\s+as\s+([\w]+))?$/);
			if (m) named.push({ name: m[1], local: m[2] ?? m[1], typeOnly: false });
		}
		return { module: from[1], named, split: true };
	}
	// `import a.b as c, d` names several modules; the site keeps the first (ModuleSite has one)
	const plain = source.match(/^import\s+([\w.]+)/);
	return plain ? { module: plain[1], named: [], split: false } : null;
}

/** Remove comments outside string literals. Used for import clauses and JSONC. */
function stripComments(text: string): string {
	let out = '';
	let quote: string | null = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			out += ch;
			if (ch === '\\') out += text[++i] ?? '';
			else if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'" || ch === '`') {
			quote = ch;
			out += ch;
		} else if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			out += '\n';
		} else if (ch === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 1;
			out += ' ';
		} else {
			out += ch;
		}
	}
	return out;
}

function resolveModule(
	written: string,
	from: FilePath,
	family: Family,
	ctx: Context
): ModuleResolution {
	return family === 'python'
		? resolvePythonModule(written, from, ctx)
		: resolveScriptModule(written, from, ctx);
}

const fileHit = (rule: ImportRule, path: string): ModuleResolution => ({
	status: 'file',
	rule,
	paths: [path as FilePath]
});

const miss = (rule: ImportRule, reason: UnresolvedReason): ModuleResolution => ({
	status: 'unresolved',
	rule,
	reason
});

function resolveScriptModule(specifier: string, from: FilePath, ctx: Context): ModuleResolution {
	// A bundler query (`./app.css?inline`, `./CHANGELOG.md?raw`) loads the file before it
	const written = specifier.replace(/\?.*$/, '');
	if (
		written.startsWith('./') ||
		written.startsWith('../') ||
		written === '.' ||
		written === '..'
	) {
		const joined = joinPath(dirname(from), written);
		if (joined === null || !joined.startsWith(ctx.prefix)) return miss('relative', 'outside-root');
		const hit = findScript(joined, ctx.files);
		return hit ? fileHit('relative', hit) : miss('relative', 'no-file');
	}
	if (written.startsWith('/')) return { status: 'external', module: written };

	let aliased: ImportRule | null = null;
	const kit = nearestScope(ctx.config.kitScopes, from) ?? ctx.defaultKit;
	if (kit) {
		const hit = matchAliases(kit, written, ctx.files);
		if (hit) return fileHit('sveltekit-alias', hit);
		if (hit === null) aliased = 'sveltekit-alias';
	}
	const ts = nearestScope(ctx.config.tsScopes, from);
	if (ts) {
		const hit = matchAliases(ts.aliases, written, ctx.files);
		if (hit) return fileHit('tsconfig-paths', hit);
		if (hit === null) aliased ??= 'tsconfig-paths';
		if (ts.baseUrl !== null) {
			const viaBase = findScript(`${ts.baseUrl}/${written}`, ctx.files);
			if (viaBase) return fileHit('base-url', viaBase);
		}
	}

	const { name, subpath } = splitPackage(written);
	const pkg = ctx.config.packages.get(name);
	if (pkg) {
		const hit = resolvePackageEntry(pkg, subpath, ctx.files);
		return hit ? fileHit('workspace', hit) : miss('workspace', 'no-entry');
	}
	if (aliased) return miss(aliased, 'no-file');
	return { status: 'external', module: name };
}

/** A file path, null when a pattern matched but no target exists, undefined when none matched. */
function matchAliases(
	aliases: readonly PathAlias[],
	written: string,
	files: ReadonlySet<string>
): string | null | undefined {
	let best: { alias: PathAlias; star: string; rank: number } | null = null;
	for (const alias of aliases) {
		const star = matchPattern(alias.pattern, written);
		if (star === null) continue;
		const rank = alias.pattern.indexOf('*') === -1 ? Infinity : alias.pattern.indexOf('*');
		if (!best || rank > best.rank) best = { alias, star, rank };
	}
	if (!best) return undefined;
	for (const target of best.alias.targets) {
		const hit = findScript(target.replace('*', best.star), files);
		if (hit) return hit;
	}
	// A catch-all `*` claims every bare name, so its miss falls through to packages
	return best.alias.pattern === '*' ? undefined : null;
}

function matchPattern(pattern: string, written: string): string | null {
	const star = pattern.indexOf('*');
	if (star === -1) return pattern === written ? '' : null;
	const head = pattern.slice(0, star);
	const tail = pattern.slice(star + 1);
	if (written.length < head.length + tail.length) return null;
	if (!written.startsWith(head) || !written.endsWith(tail)) return null;
	return written.slice(head.length, written.length - tail.length);
}

/** The file a script specifier loads: as written, compiled extension swapped, extension added, or `/index`. */
function findScript(base: string, files: ReadonlySet<string>): string | null {
	const normalized = joinPath('', base);
	if (normalized === null) return null;
	if (files.has(normalized)) return normalized;
	for (const [compiled, sources] of COMPILED_EXTS) {
		if (!normalized.endsWith(compiled)) continue;
		const stem = normalized.slice(0, -compiled.length);
		for (const ext of sources) if (files.has(stem + ext)) return stem + ext;
		break;
	}
	for (const ext of SCRIPT_EXTS) if (files.has(normalized + ext)) return normalized + ext;
	for (const ext of SCRIPT_EXTS) {
		if (files.has(`${normalized}/index${ext}`)) return `${normalized}/index${ext}`;
	}
	return null;
}

function splitPackage(written: string): { name: string; subpath: string } {
	const parts = written.split('/');
	const size = written.startsWith('@') && parts.length > 1 ? 2 : 1;
	const rest = parts.slice(size).join('/');
	return { name: parts.slice(0, size).join('/'), subpath: rest ? `./${rest}` : '.' };
}

function resolvePackageEntry(
	pkg: WorkspacePackage,
	subpath: string,
	files: ReadonlySet<string>
): string | null {
	const { manifest } = pkg;
	let targets: string[];
	if (manifest.exports !== undefined && manifest.exports !== null) {
		targets = exportTargets(manifest.exports, subpath);
	} else if (subpath === '.') {
		targets = [manifest.source, manifest.svelte, manifest.types, manifest.typings]
			.concat([manifest.module, manifest.main, './index'])
			.filter((t): t is string => typeof t === 'string');
	} else {
		targets = [subpath];
	}
	for (const target of targets) {
		const hit = findPackageFile(pkg, target, files);
		if (hit) return hit;
	}
	return null;
}

/** Targets for a subpath in `exports`, preferred conditions first, `*` substituted. */
function exportTargets(exports: unknown, subpath: string): string[] {
	const map =
		typeof exports === 'string' ||
		Array.isArray(exports) ||
		(typeof exports === 'object' &&
			exports !== null &&
			!Object.keys(exports).some((key) => key.startsWith('.')))
			? { '.': exports }
			: (exports as Record<string, unknown>);
	if (subpath in map) return conditionTargets(map[subpath], '');
	let best: { key: string; star: string } | null = null;
	for (const key of Object.keys(map)) {
		const star = key.includes('*') ? matchPattern(key, subpath) : null;
		if (star !== null && (!best || key.indexOf('*') > best.key.indexOf('*'))) {
			best = { key, star };
		}
	}
	return best ? conditionTargets(map[best.key], best.star) : [];
}

function conditionTargets(value: unknown, star: string): string[] {
	if (typeof value === 'string') return [value.replaceAll('*', star)];
	if (Array.isArray(value)) return value.flatMap((v) => conditionTargets(v, star));
	if (!value || typeof value !== 'object') return [];
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	const ordered = [
		...CONDITIONS.filter((c) => keys.includes(c)),
		...keys.filter((k) => !CONDITIONS.includes(k))
	];
	return ordered.flatMap((key) => conditionTargets(record[key], star));
}

/** A package entry, mapped from its build folder back to source when only the source is in the map. */
function findPackageFile(
	pkg: WorkspacePackage,
	target: string,
	files: ReadonlySet<string>
): string | null {
	const joined = joinPath(pkg.dir, target);
	if (joined === null) return null;
	const direct = findScript(joined, files);
	if (direct) return direct;
	for (const { outDir, rootDir } of pkg.outDirs) {
		if (joined.startsWith(`${outDir}/`)) {
			const hit = findScript(rootDir + joined.slice(outDir.length), files);
			if (hit) return hit;
		}
	}
	const inner = joined.slice(pkg.dir ? pkg.dir.length + 1 : 0);
	const [first, ...rest] = inner.split('/');
	if (BUILD_DIRS.has(first) && rest.length > 0) {
		return findScript(joinPath(pkg.dir, `src/${rest.join('/')}`) ?? '', files);
	}
	return null;
}

function resolvePythonModule(written: string, from: FilePath, ctx: Context): ModuleResolution {
	const dots = written.match(/^\.*/)![0].length;
	const modulePath = written.slice(dots).split('.').filter(Boolean).join('/');
	if (dots > 0) {
		let dir: string | null = dirname(from);
		for (let i = 1; i < dots && dir !== null; i++) dir = parentDir(dir, ctx.prefix);
		if (dir === null) return miss('python-relative', 'outside-root');
		const hit = modulePath ? findPython(`${dir}/${modulePath}`, ctx.files) : `${dir}/__init__.py`;
		return hit && ctx.files.has(hit)
			? fileHit('python-relative', hit)
			: miss('python-relative', 'no-file');
	}
	const hits = new Set<string>();
	for (const root of [dirname(from), ...ctx.pythonRoots]) {
		const hit = findPython(root ? `${root}/${modulePath}` : modulePath, ctx.files);
		if (hit) hits.add(hit);
	}
	const [first, ...others] = [...hits] as FilePath[];
	if (first) return { status: 'file', rule: 'python-package', paths: [first, ...others] };
	return { status: 'external', module: modulePath.split('/')[0] };
}

function findPython(base: string, files: ReadonlySet<string>): string | null {
	if (files.has(`${base}.py`)) return `${base}.py`;
	if (files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
	return null;
}

/** Folders a top-level package sits in, plus the project folder and `src/`. */
function pythonRoots(files: ReadonlySet<string>, prefix: string): string[] {
	const roots = new Set<string>([prefix.replace(/\/$/, ''), `${prefix}src`]);
	for (const file of files) {
		if (!file.endsWith('/__init__.py')) continue;
		const pkg = dirname(file);
		const parent = dirname(pkg);
		if (!files.has(`${parent}/__init__.py`)) roots.add(parent);
	}
	return [...roots];
}

function bindSite({ site, statement, resolution }: ReadSite, ctx: Context): ModuleSite {
	const module = moduleBinding(resolution);
	if (!statement) return { ...site, module };
	if (!statement.split) return { ...site, module, specifiers: [] };

	const specifiers: Specifier[] = [];
	if (statement.defaultLocal) {
		specifiers.push({
			...statement.defaultLocal,
			kind: 'default',
			target: symbolBinding(resolution, 'default', ctx)
		});
	}
	if (statement.namespaceLocal) {
		specifiers.push({ ...statement.namespaceLocal, kind: 'namespace', target: module });
	}
	for (const item of statement.named) {
		const submodule = pythonSubmodule(resolution, item.name, ctx);
		if (submodule) {
			specifiers.push({
				local: item.local,
				typeOnly: item.typeOnly,
				kind: 'namespace',
				target: submodule
			});
			continue;
		}
		specifiers.push({
			local: item.local,
			typeOnly: item.typeOnly,
			kind: 'named',
			name: item.name,
			target: symbolBinding(resolution, item.name, ctx)
		});
	}
	return { ...site, module, specifiers };
}

function moduleBinding(resolution: ModuleResolution): Binding<FileEnd | ExternalEnd> {
	if (resolution.status === 'unresolved') return { state: 'unresolved' };
	if (resolution.status === 'external') {
		return bound({ kind: 'external', module: resolution.module, name: null });
	}
	const [first, second, ...rest] = resolution.paths.map((path) => ({
		to: { kind: 'file', path } as FileEnd,
		provenance: GUESS
	}));
	if (!second) return bound(first.to);
	return { state: 'bound', candidates: [first, second, ...rest] };
}

function bound<E extends FileEnd | SymbolEnd | ExternalEnd>(to: E): Binding<E> {
	return { state: 'bound', candidates: [{ to, provenance: PROVENANCE }] };
}

/**
 * A name in the module it is imported from: the package member, or the declaration it ends at
 * after following the file's own imports and re-exports (a barrel `index.ts`, an `__init__.py`).
 * A name no file declares (an interface the parser does not record) stays unresolved.
 */
function symbolBinding(
	resolution: ModuleResolution,
	name: string,
	ctx: Context,
	seen = new Set<FilePath>()
): Binding<SymbolEnd | ExternalEnd> {
	if (resolution.status === 'unresolved') return { state: 'unresolved' };
	if (resolution.status === 'external') {
		return bound({ kind: 'external', module: resolution.module, name });
	}
	if (resolution.paths.length > 1) return { state: 'unresolved' };
	return exportedName(resolution.paths[0], name, ctx, seen);
}

function exportedName(
	path: FilePath,
	name: string,
	ctx: Context,
	seen: Set<FilePath>
): Binding<SymbolEnd | ExternalEnd> {
	if (seen.has(path)) return { state: 'unresolved' };
	seen.add(path);
	const symbol = ctx.records
		.get(path)
		?.symbols.find((sym) =>
			name === 'default' ? sym.badges.includes('export_default') : sym.name === name
		);
	if (symbol) return bound({ kind: 'symbol', id: symbol.id });

	const sites = ctx.sites.get(path);
	if (!sites) return { state: 'unresolved' };
	const all = [...sites.reexports, ...sites.imports];
	for (const { statement, resolution } of all) {
		const item = statement?.named.find((n) => n.local === name);
		if (item) return symbolBinding(resolution, item.name, ctx, seen);
	}
	for (const { statement, resolution } of sites.reexports) {
		if (!statement?.star) continue;
		const target = symbolBinding(resolution, name, ctx, seen);
		if (target.state === 'bound') return target;
	}
	return { state: 'unresolved' };
}

/** `from pkg import mod` binds a module when `pkg/mod.py` exists, which outranks a symbol. */
function pythonSubmodule(
	resolution: ModuleResolution,
	name: string,
	ctx: Context
): Binding<FileEnd | ExternalEnd> | null {
	if (resolution.status !== 'file' || resolution.paths.length > 1) return null;
	const [path] = resolution.paths;
	if (!path.endsWith('/__init__.py')) return null;
	const hit = findPython(`${dirname(path)}/${name}`, ctx.files);
	return hit ? bound({ kind: 'file', path: hit as FilePath }) : null;
}

/** JSON with comments and trailing commas, as tsconfig allows. null when it does not parse. */
function parseJsonc(text: string): unknown {
	const noComments = stripComments(text);
	let out = '';
	let quote = false;
	for (let i = 0; i < noComments.length; i++) {
		const ch = noComments[i];
		if (quote) {
			out += ch;
			if (ch === '\\') out += noComments[++i] ?? '';
			else if (ch === '"') quote = false;
			continue;
		}
		if (ch === '"') quote = true;
		if (ch === ',' && /^\s*[}\]]/.test(noComments.slice(i + 1))) continue;
		out += ch;
	}
	try {
		return out.trim() ? JSON.parse(out) : null;
	} catch {
		return null;
	}
}

function readWorkspacePackages(
	texts: ReadonlyMap<string, string>,
	json: ReadonlyMap<string, Record<string, unknown>>
): Map<string, WorkspacePackage> {
	const globs: RegExp[] = [];
	const negated: RegExp[] = [];
	const addGlob = (dir: string, glob: string) => {
		const negative = glob.startsWith('!');
		const path = joinPath(dir, negative ? glob.slice(1) : glob);
		if (path === null) return;
		(negative ? negated : globs).push(globToRegExp(path.replace(/\/$/, '')));
	};
	for (const [path, manifest] of json) {
		if (basename(path) !== 'package.json') continue;
		const { workspaces } = manifest as PackageManifest;
		const list = Array.isArray(workspaces)
			? workspaces
			: (workspaces as { packages?: unknown } | undefined)?.packages;
		if (Array.isArray(list)) {
			for (const glob of list) if (typeof glob === 'string') addGlob(dirname(path), glob);
		}
	}
	for (const [path, text] of texts) {
		if (basename(path) !== 'pnpm-workspace.yaml') continue;
		for (const glob of readPnpmPackages(text)) addGlob(dirname(path), glob);
	}

	const packages = new Map<string, WorkspacePackage>();
	for (const [path, manifest] of json) {
		if (basename(path) !== 'package.json') continue;
		const dir = dirname(path);
		const name = (manifest as PackageManifest).name;
		if (typeof name !== 'string') continue;
		if (!globs.some((g) => g.test(dir)) || negated.some((g) => g.test(dir))) continue;
		packages.set(name, { dir, manifest, outDirs: readOutDirs(dir, json) });
	}
	return packages;
}

/** The `packages:` list of a pnpm-workspace.yaml, the only key the resolver reads. */
function readPnpmPackages(text: string): string[] {
	const globs: string[] = [];
	let inPackages = false;
	for (const raw of text.split('\n')) {
		const line = raw.replace(/#.*$/, '');
		if (/^packages\s*:/.test(line)) inPackages = true;
		else if (/^\S/.test(line)) inPackages = false;
		else if (inPackages) {
			const item = line.match(/^\s*-\s*(['"]?)(.+?)\1\s*$/);
			if (item) globs.push(item[2]);
		}
	}
	return globs;
}

function readOutDirs(
	dir: string,
	json: ReadonlyMap<string, Record<string, unknown>>
): WorkspacePackage['outDirs'] {
	const outDirs: WorkspacePackage['outDirs'] = [];
	for (const [path, config] of json) {
		if (dirname(path) !== dir || !/^tsconfig(\..+)?\.json$/.test(basename(path))) continue;
		const options = config.compilerOptions as CompilerOptions | undefined;
		if (typeof options?.outDir !== 'string' || typeof options.rootDir !== 'string') continue;
		const outDir = joinPath(dir, options.outDir);
		const rootDir = joinPath(dir, options.rootDir);
		if (outDir !== null && rootDir !== null) outDirs.push({ outDir, rootDir });
	}
	return outDirs;
}

/**
 * One alias scope per folder: its tsconfig.json or jsconfig.json, or, when it has neither (a
 * package built only with `tsconfig.server.json`), every `tsconfig.*.json` in it merged.
 */
function readTsScopes(
	json: ReadonlyMap<string, Record<string, unknown>>,
	packages: ReadonlyMap<string, WorkspacePackage>
): Map<string, AliasScope> {
	const byDir = new Map<string, string[]>();
	for (const path of json.keys()) {
		if (!/^[jt]sconfig(\..+)?\.json$/.test(basename(path))) continue;
		const list = byDir.get(dirname(path)) ?? [];
		list.push(path);
		byDir.set(dirname(path), list);
	}
	const scopes = new Map<string, AliasScope>();
	for (const [dir, paths] of byDir) {
		const primary =
			paths.find((p) => basename(p) === 'tsconfig.json') ??
			paths.find((p) => basename(p) === 'jsconfig.json');
		const chosen = primary ? [primary] : [...paths].sort();
		const scope: AliasScope = { aliases: [], baseUrl: null };
		for (const path of chosen) {
			const options = effectiveOptions(path, json, packages, new Set());
			scope.baseUrl ??= options.baseUrl;
			for (const alias of options.aliases) {
				if (!scope.aliases.some((a) => a.pattern === alias.pattern)) scope.aliases.push(alias);
			}
		}
		scopes.set(dir, scope);
	}
	return scopes;
}

interface TsOptions {
	aliases: PathAlias[];
	baseUrl: string | null;
	/** The folder of the config that wrote `paths`, which its targets resolve against without `baseUrl` */
	pathsDir: string | null;
	rawPaths: Record<string, string[]> | null;
}

const NO_OPTIONS: TsOptions = { aliases: [], baseUrl: null, pathsDir: null, rawPaths: null };

/**
 * `paths` and `baseUrl` after `extends`. A child's `paths` replaces its parent's, and targets
 * resolve against `baseUrl` when set, else against the config that wrote them, as tsc does.
 */
function effectiveOptions(
	path: string,
	json: ReadonlyMap<string, Record<string, unknown>>,
	packages: ReadonlyMap<string, WorkspacePackage>,
	seen: Set<string>
): TsOptions {
	const config = json.get(path);
	if (!config || seen.has(path)) return NO_OPTIONS;
	seen.add(path);

	let inherited = NO_OPTIONS;
	const parents = Array.isArray(config.extends) ? config.extends : [config.extends];
	for (const parent of parents) {
		if (typeof parent !== 'string') continue;
		const parentPath = extendsPath(dirname(path), parent, json, packages);
		if (!parentPath) continue;
		const options = effectiveOptions(parentPath, json, packages, seen);
		inherited = {
			aliases: [],
			baseUrl: options.baseUrl ?? inherited.baseUrl,
			pathsDir: options.rawPaths ? options.pathsDir : inherited.pathsDir,
			rawPaths: options.rawPaths ?? inherited.rawPaths
		};
	}

	const options = (config.compilerOptions ?? {}) as CompilerOptions;
	const dir = dirname(path);
	const baseUrl =
		typeof options.baseUrl === 'string' ? joinPath(dir, options.baseUrl) : inherited.baseUrl;
	const ownPaths = options.paths && typeof options.paths === 'object' ? options.paths : null;
	const rawPaths = ownPaths ?? inherited.rawPaths;
	const pathsDir = ownPaths ? dir : inherited.pathsDir;
	const targetDir = baseUrl ?? pathsDir;
	const aliases: PathAlias[] = [];
	if (rawPaths && targetDir !== null) {
		for (const [pattern, targets] of Object.entries(rawPaths)) {
			if (!Array.isArray(targets)) continue;
			const resolved = targets
				.filter((t): t is string => typeof t === 'string')
				.map((t) => joinPath(targetDir, t))
				.filter((t): t is string => t !== null);
			aliases.push({ pattern, targets: resolved });
		}
	}
	return { aliases, baseUrl, pathsDir, rawPaths };
}

function extendsPath(
	dir: string,
	parent: string,
	json: ReadonlyMap<string, unknown>,
	packages: ReadonlyMap<string, WorkspacePackage>
): string | null {
	const withJson = (p: string) => (json.has(p) ? p : json.has(`${p}.json`) ? `${p}.json` : null);
	if (parent.startsWith('.')) {
		const joined = joinPath(dir, parent);
		return joined === null ? null : withJson(joined);
	}
	const { name, subpath } = splitPackage(parent);
	const pkg = packages.get(name);
	if (!pkg) return null;
	return withJson(joinPath(pkg.dir, subpath === '.' ? 'tsconfig.json' : subpath) ?? '');
}

/** `$lib` and `kit.alias` for each SvelteKit app, read from svelte.config with patterns, since the file is code. */
function readKitScopes(texts: ReadonlyMap<string, string>): Map<string, PathAlias[]> {
	const scopes = new Map<string, PathAlias[]>();
	for (const [path, text] of texts) {
		if (!/^svelte\.config\.(js|mjs|cjs|ts)$/.test(basename(path))) continue;
		const source = stripComments(text);
		const dir = dirname(path);
		const entries = new Map<string, string>();
		const lib = source.match(/files\s*:\s*\{[^}]*?\blib\s*:\s*(['"`])([^'"`]+)\1/)?.[2];
		entries.set('$lib', lib ?? 'src/lib');
		const alias = source.match(/\balias\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
		for (const m of alias.matchAll(/(['"`]?)([$\w@~/.*-]+)\1\s*:\s*(['"`])([^'"`]+)\3/g)) {
			entries.set(m[2], m[4]);
		}
		scopes.set(dir, kitAliases(dir, entries));
	}
	return scopes;
}

/** A kit alias without `/*` names both the file or folder and everything under it. */
function kitAliases(dir: string, entries: ReadonlyMap<string, string>): PathAlias[] {
	const aliases: PathAlias[] = [];
	for (const [key, value] of entries) {
		const target = joinPath(dir, value);
		if (target === null) continue;
		if (key.endsWith('/*')) {
			aliases.push({ pattern: key, targets: [target] });
		} else {
			aliases.push({ pattern: key, targets: [target] });
			aliases.push({ pattern: `${key}/*`, targets: [`${target}/*`] });
		}
	}
	return aliases;
}

function nearestScope<T>(scopes: ReadonlyMap<string, T>, from: string): T | null {
	let dir: string | null = dirname(from);
	while (dir !== null) {
		const scope = scopes.get(dir);
		if (scope) return scope;
		dir = dir === '' ? null : dirname(dir);
	}
	return null;
}

function globToRegExp(glob: string): RegExp {
	const body = glob
		.split('/')
		.map((part) =>
			part === '**' ? '.*' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
		)
		.join('/');
	return new RegExp(`^${body}$`);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function dirname(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? '' : path.slice(0, slash);
}

/** The folder above `dir`, or null at the project folder. */
function parentDir(dir: string, prefix: string): string | null {
	if (`${dir}/` === prefix || dir === '') return null;
	return dirname(dir);
}

/** Join and normalize `.` and `..`. null when `..` climbs above the first segment. */
function joinPath(dir: string, relative: string): string | null {
	const parts: string[] = [];
	for (const part of `${dir}/${relative}`.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (parts.length === 0) return null;
			parts.pop();
		} else {
			parts.push(part);
		}
	}
	return parts.join('/');
}
