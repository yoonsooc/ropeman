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
	| 'package-imports'
	| 'python-relative'
	| 'python-package';

/**
 * Why a site that names something local found no file. `no-file`: the rule produced a path the
 * map lacks (a missing, cut or unparsed file, such as `.css`). `no-entry`: a workspace package
 * whose `exports`, `main` or `types`, or a package.json `imports` key, reach no file in the map.
 * `outside-root`: a relative path that climbs out of the project. `unparsed`: the statement
 * text names no module.
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

/** One tsconfig as it applies to a file: its aliases, and the files `files`, `include` and `exclude` give it. */
interface TsProject {
	aliases: PathAlias[];
	baseUrl: string | null;
	files: ReadonlySet<string>;
	include: RegExp[];
	exclude: RegExp[];
}

/** A folder with a package.json, workspace member or not. */
interface Package {
	dir: string;
	manifest: PackageManifest;
	/** tsconfig `outDir` → `rootDir`, so a `dist/` entry maps back to its source */
	outDirs: { outDir: string; rootDir: string }[];
}

interface PackageManifest {
	name?: unknown;
	exports?: unknown;
	imports?: unknown;
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
	/** The tsconfigs a folder's files may belong to, in the order they are tried */
	tsScopes: ReadonlyMap<string, readonly TsProject[]>;
	kitScopes: ReadonlyMap<string, PathAlias[]>;
	/** Workspace members by package name */
	packages: ReadonlyMap<string, Package>;
	/** Every package.json by folder, for `#imports` */
	packageScopes: ReadonlyMap<string, Package>;
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
/** `exports` and `imports` conditions the resolver follows, in the order the package wrote them */
const CONDITIONS = new Set(['types', 'import', 'require', 'default', 'svelte', 'browser']);

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
	const json = parseConfigs(texts);
	const { packages, packageScopes } = readPackages(texts, json);
	return {
		tsScopes: readTsScopes(json, packages),
		kitScopes: readKitScopes(texts),
		packages,
		packageScopes
	};
}

/**
 * Configs that the read ones name in `extends` or `references` and that `isResolverConfig` does
 * not pick by name (`"extends": "./base.json"`, a reference to `configs/app.json`). These are
 * candidate paths not yet in `texts`, and some may not exist. A caller reads the ones that do
 * and asks again until nothing new comes back.
 */
export function namedConfigs(texts: ReadonlyMap<string, string>): string[] {
	const json = parseConfigs(texts);
	const { packages } = readPackages(texts, json);
	const named = new Set<string>();
	for (const [path, config] of json) {
		const parents = Array.isArray(config.extends) ? config.extends : [config.extends];
		for (const parent of parents) {
			if (typeof parent !== 'string') continue;
			for (const candidate of extendsCandidates(dirname(path), parent, packages))
				named.add(candidate);
		}
		for (const target of referenceTargets(path, json)) named.add(target);
	}
	return [...named].filter((path) => !texts.has(path));
}

function parseConfigs(texts: ReadonlyMap<string, string>): Map<string, Record<string, unknown>> {
	const json = new Map<string, Record<string, unknown>>();
	for (const [path, text] of texts) {
		if (!path.endsWith('.json')) continue;
		const value = parseJsonc(text);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			json.set(path, value as Record<string, unknown>);
		}
	}
	return json;
}

const UNPARSED: ModuleResolution = { status: 'unresolved', rule: null, reason: 'unparsed' };

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
			const { resolution, pythonPackage } = !statement
				? { resolution: UNPARSED, pythonPackage: null }
				: family === 'python'
					? resolvePythonModule(statement, path, ctx)
					: { resolution: resolveScriptModule(statement.module, path, ctx), pythonPackage: null };
			outcomes.push({ path, line: site.line, written: statement?.module ?? null, resolution });
			return { site, statement, resolution, pythonPackage };
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
	/** The package a Python `from` names, whose submodules its listed names may load */
	pythonPackage: PythonPackage | null;
}

/**
 * A Python package's folders: one, or one per source root for a namespace package found under
 * several. A namespace package (no `__init__.py`) has no module of its own, so a listed name
 * that is not a submodule binds nothing.
 */
interface PythonPackage {
	dirs: string[];
	namespace: boolean;
}

interface Context {
	config: ResolverConfig;
	files: ReadonlySet<string>;
	records: ReadonlyMap<FilePath, FileRecord>;
	/** Every key starts with this; '' when keys are repo-relative */
	prefix: string;
	pythonRoots: string[];
	/** Every folder that holds a `.py` file, at any depth, so a namespace package is found */
	pythonDirs: ReadonlySet<string>;
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
		pythonDirs: pythonDirs(files),
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
	const ts = tsProjectFor(nearestScope(ctx.config.tsScopes, from), from);
	if (ts) {
		const hit = matchAliases(ts.aliases, written, ctx.files);
		if (hit) return fileHit('tsconfig-paths', hit);
		if (hit === null) aliased ??= 'tsconfig-paths';
		if (ts.baseUrl !== null) {
			const viaBase = findScript(`${ts.baseUrl}/${written}`, ctx.files);
			if (viaBase) return fileHit('base-url', viaBase);
		}
	}
	if (written.startsWith('#')) return resolvePackageImport(written, from, ctx);

	const workspace = resolveWorkspace(written, ctx);
	if (workspace) return workspace;
	if (aliased) return miss(aliased, 'no-file');
	return { status: 'external', module: splitPackage(written).name };
}

/**
 * The project tsc would put a file in: the first one whose `files`/`include`/`exclude` take it,
 * else the first that sets `paths` or `baseUrl`, so a file no config lists keeps the aliases.
 */
function tsProjectFor(projects: readonly TsProject[] | null, from: string): TsProject | null {
	if (!projects) return null;
	return (
		projects.find(
			(p) =>
				p.files.has(from) ||
				(p.include.some((glob) => glob.test(from)) && !p.exclude.some((glob) => glob.test(from)))
		) ??
		projects.find((p) => p.aliases.length > 0 || p.baseUrl !== null) ??
		projects[0] ??
		null
	);
}

/** A bare name that is a workspace member, null when it names no member. */
function resolveWorkspace(written: string, ctx: Context): ModuleResolution | null {
	const { name, subpath } = splitPackage(written);
	const pkg = ctx.config.packages.get(name);
	if (!pkg) return null;
	const hit = resolvePackageEntry(pkg, subpath, ctx.files);
	return hit ? fileHit('workspace', hit) : miss('workspace', 'no-entry');
}

/** `#x` through the `imports` field of the nearest package.json, as Node reads it. */
function resolvePackageImport(written: string, from: FilePath, ctx: Context): ModuleResolution {
	const scope = nearestScope(ctx.config.packageScopes, from);
	const { imports } = scope?.manifest ?? {};
	if (!scope || !imports || typeof imports !== 'object' || Array.isArray(imports)) {
		return miss('package-imports', 'no-entry');
	}
	for (const target of subpathTargets(imports as Record<string, unknown>, written)) {
		if (target.startsWith('./')) {
			const hit = findPackageFile(scope, target, ctx.files);
			if (hit) return fileHit('package-imports', hit);
		} else if (!/^[#./]/.test(target)) {
			return (
				resolveWorkspace(target, ctx) ?? { status: 'external', module: splitPackage(target).name }
			);
		}
	}
	return miss('package-imports', 'no-entry');
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
	const { alias, star } = best;
	for (const target of alias.targets) {
		// A function replacement, so a `$&` or `$$` in the import is not a substitution pattern
		const hit = findScript(
			target.replace('*', () => star),
			files
		);
		if (hit) return hit;
	}
	// A catch-all `*` claims every bare name, so its miss falls through to packages
	return alias.pattern === '*' ? undefined : null;
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

/**
 * The file a script specifier loads: the source a compiled extension names, as written,
 * extension added, or `/index`. A source beats the written file, as in tsc, so `./a.js`
 * loads `a.ts` when both exist.
 */
function findScript(base: string, files: ReadonlySet<string>): string | null {
	const normalized = joinPath('', base);
	if (normalized === null) return null;
	for (const [compiled, sources] of COMPILED_EXTS) {
		if (!normalized.endsWith(compiled)) continue;
		const stem = normalized.slice(0, -compiled.length);
		for (const ext of sources) if (files.has(stem + ext)) return stem + ext;
		break;
	}
	if (files.has(normalized)) return normalized;
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
	pkg: Package,
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

/** Targets for a subpath in `exports`, which may be sugar for `{ ".": … }`. */
function exportTargets(exports: unknown, subpath: string): string[] {
	const map =
		typeof exports === 'string' ||
		Array.isArray(exports) ||
		(typeof exports === 'object' &&
			exports !== null &&
			!Object.keys(exports).some((key) => key.startsWith('.')))
			? { '.': exports }
			: (exports as Record<string, unknown>);
	return subpathTargets(map, subpath);
}

/** Targets for a key of an `exports` or `imports` map, exact key first, then the longest `*` pattern. */
function subpathTargets(map: Record<string, unknown>, subpath: string): string[] {
	if (Object.hasOwn(map, subpath)) return conditionTargets(map[subpath], '');
	let best: { key: string; star: string } | null = null;
	for (const key of Object.keys(map)) {
		const star = key.includes('*') ? matchPattern(key, subpath) : null;
		if (star !== null && (!best || key.indexOf('*') > best.key.indexOf('*'))) {
			best = { key, star };
		}
	}
	return best ? conditionTargets(map[best.key], best.star) : [];
}

/**
 * Every target a condition tree can pick, in the order its keys are written, as Node walks
 * them. All followed conditions are kept, since the file the map holds may sit behind any.
 */
function conditionTargets(value: unknown, star: string): string[] {
	if (typeof value === 'string') return [value.replaceAll('*', () => star)];
	if (Array.isArray(value)) return value.flatMap((v) => conditionTargets(v, star));
	if (!value || typeof value !== 'object') return [];
	return Object.entries(value)
		.filter(([key]) => CONDITIONS.has(key))
		.flatMap(([, target]) => conditionTargets(target, star));
}

/** A package entry, mapped from its build folder back to source when only the source is in the map. */
function findPackageFile(pkg: Package, target: string, files: ReadonlySet<string>): string | null {
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

interface PythonModule {
	resolution: ModuleResolution;
	pythonPackage: PythonPackage | null;
}

/**
 * A relative import from the importing file's package; an absolute one from the source roots,
 * since Python 3 has no implicit relative import. A file in a folder with no `__init__.py` (a
 * script or test folder) also sees its siblings, the way `python scripts/a.py` puts `scripts/`
 * on `sys.path`. The folder is tried after the roots, so a sibling never shadows a project
 * module, though Python would load the sibling first when the file runs as a script. A regular
 * module on any path beats a namespace package, as Python's path finder keeps scanning for one.
 * A namespace package (a folder with no `__init__.py`) has no file, so the site's module is the
 * first listed name that is one of its submodules, as Python `import a, b` keeps the first module.
 */
function resolvePythonModule(statement: Statement, from: FilePath, ctx: Context): PythonModule {
	const written = statement.module;
	const dots = written.match(/^\.*/)![0].length;
	const modulePath = written.slice(dots).split('.').filter(Boolean).join('/');
	let rule: ImportRule;
	let bases: string[];
	let scriptBase: string | null = null;
	if (dots > 0) {
		rule = 'python-relative';
		let dir: string | null = dirname(from);
		for (let i = 1; i < dots && dir !== null; i++) dir = parentDir(dir, ctx.prefix);
		if (dir === null) return { resolution: miss(rule, 'outside-root'), pythonPackage: null };
		if (!modulePath) {
			const init = `${dir}/__init__.py`;
			if (ctx.files.has(init)) return pythonFile(rule, [init]);
			return namespaceModule(rule, [dir], statement, ctx);
		}
		bases = [`${dir}/${modulePath}`];
	} else {
		rule = 'python-package';
		bases = ctx.pythonRoots.map((root) => (root ? `${root}/${modulePath}` : modulePath));
		const dir = dirname(from);
		if (!ctx.files.has(`${dir}/__init__.py`))
			scriptBase = dir ? `${dir}/${modulePath}` : modulePath;
	}
	const hits = [...new Set(bases.map((base) => findPython(base, ctx.files)))].filter(
		(hit): hit is string => hit !== null
	);
	if (hits.length > 0) return pythonFile(rule, hits);
	const sibling = scriptBase === null ? null : findPython(scriptBase, ctx.files);
	if (sibling) return pythonFile(rule, [sibling]);
	if (scriptBase !== null && !bases.includes(scriptBase)) bases.push(scriptBase);
	const namespaces = bases.filter((base) => ctx.pythonDirs.has(base));
	if (namespaces.length > 0) return namespaceModule(rule, namespaces, statement, ctx);
	return {
		resolution:
			rule === 'python-relative'
				? miss(rule, 'no-file')
				: { status: 'external', module: modulePath.split('/')[0] },
		pythonPackage: null
	};
}

function pythonFile(rule: ImportRule, [first, ...others]: string[]): PythonModule {
	const resolution: ModuleResolution = {
		status: 'file',
		rule,
		paths: [first as FilePath, ...(others as FilePath[])]
	};
	const pythonPackage =
		others.length === 0 && first.endsWith('/__init__.py')
			? { dirs: [dirname(first)], namespace: false }
			: null;
	return { resolution, pythonPackage };
}

function namespaceModule(
	rule: ImportRule,
	dirs: string[],
	statement: Statement,
	ctx: Context
): PythonModule {
	const pythonPackage = { dirs, namespace: true };
	for (const { name } of statement.named) {
		const hit = findSubmodule(pythonPackage, name, ctx.files);
		if (hit) return { resolution: fileHit(rule, hit), pythonPackage };
	}
	return { resolution: miss(rule, 'no-file'), pythonPackage };
}

function findSubmodule(
	pkg: PythonPackage,
	name: string,
	files: ReadonlySet<string>
): string | null {
	for (const dir of pkg.dirs) {
		const hit = findPython(`${dir}/${name}`, files);
		if (hit) return hit;
	}
	return null;
}

function findPython(base: string, files: ReadonlySet<string>): string | null {
	if (files.has(`${base}.py`)) return `${base}.py`;
	if (files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
	return null;
}

function pythonDirs(files: ReadonlySet<string>): Set<string> {
	const dirs = new Set<string>();
	for (const file of files) {
		if (!file.endsWith('.py')) continue;
		for (let dir = dirname(file); dir && !dirs.has(dir); dir = dirname(dir)) dirs.add(dir);
	}
	return dirs;
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

function bindSite(
	{ site, statement, resolution, pythonPackage }: ReadSite,
	ctx: Context
): ModuleSite {
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
		// `from pkg import mod` binds a module when `pkg/mod.py` exists, which outranks a symbol
		const submodule = pythonPackage && findSubmodule(pythonPackage, item.name, ctx.files);
		if (submodule) {
			specifiers.push({
				local: item.local,
				typeOnly: item.typeOnly,
				kind: 'namespace',
				target: bound({ kind: 'file', path: submodule as FilePath })
			});
			continue;
		}
		specifiers.push({
			local: item.local,
			typeOnly: item.typeOnly,
			kind: 'named',
			name: item.name,
			target: pythonPackage?.namespace
				? { state: 'unresolved' }
				: symbolBinding(resolution, item.name, ctx)
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

/** JSON with comments, trailing commas and a byte order mark, as tsconfig allows. null when it does not parse. */
function parseJsonc(text: string): unknown {
	const noComments = stripComments(text.replace(/^\uFEFF/, ''));
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

function readPackages(
	texts: ReadonlyMap<string, string>,
	json: ReadonlyMap<string, Record<string, unknown>>
): { packages: Map<string, Package>; packageScopes: Map<string, Package> } {
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

	const packages = new Map<string, Package>();
	const packageScopes = new Map<string, Package>();
	for (const [path, manifest] of json) {
		if (basename(path) !== 'package.json') continue;
		const dir = dirname(path);
		const pkg: Package = { dir, manifest, outDirs: readOutDirs(dir, json) };
		packageScopes.set(dir, pkg);
		const name = (manifest as PackageManifest).name;
		if (typeof name !== 'string') continue;
		if (!globs.some((g) => g.test(dir)) || negated.some((g) => g.test(dir))) continue;
		packages.set(name, pkg);
	}
	return { packages, packageScopes };
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
): Package['outDirs'] {
	const outDirs: Package['outDirs'] = [];
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
 * The tsconfigs each folder's files may belong to: its tsconfig.json or jsconfig.json, or, when
 * it has neither (a package built only with `tsconfig.server.json`), every `tsconfig.*.json` in
 * it, each followed by the projects it `references`, depth first. A file then takes the first
 * one that lists it (`tsProjectFor`), the way tsc puts a file in a solution's project.
 */
function readTsScopes(
	json: ReadonlyMap<string, Record<string, unknown>>,
	packages: ReadonlyMap<string, Package>
): Map<string, TsProject[]> {
	const byDir = new Map<string, string[]>();
	for (const path of json.keys()) {
		if (!/^[jt]sconfig(\..+)?\.json$/.test(basename(path))) continue;
		const list = byDir.get(dirname(path)) ?? [];
		list.push(path);
		byDir.set(dirname(path), list);
	}
	const scopes = new Map<string, TsProject[]>();
	for (const [dir, paths] of byDir) {
		const primary =
			paths.find((p) => basename(p) === 'tsconfig.json') ??
			paths.find((p) => basename(p) === 'jsconfig.json');
		const order: string[] = [];
		const visit = (path: string) => {
			if (order.includes(path) || !json.has(path)) return;
			order.push(path);
			for (const ref of referencedConfigs(path, json)) visit(ref);
		};
		(primary ? [primary] : [...paths].sort()).forEach(visit);
		scopes.set(
			dir,
			order.map((path) => tsProject(path, json, packages))
		);
	}
	return scopes;
}

/** The read configs that `path`'s `references` name. */
function referencedConfigs(
	path: string,
	json: ReadonlyMap<string, Record<string, unknown>>
): string[] {
	return referenceTargets(path, json).filter((target) => json.has(target));
}

/** The config each `references` entry names: a `.json` file, or the tsconfig.json in a folder. */
function referenceTargets(
	path: string,
	json: ReadonlyMap<string, Record<string, unknown>>
): string[] {
	const references = json.get(path)?.references;
	if (!Array.isArray(references)) return [];
	return references.flatMap((ref: { path?: unknown } | null) => {
		if (typeof ref?.path !== 'string') return [];
		const target = joinPath(dirname(path), ref.path);
		if (target === null) return [];
		if (target.endsWith('.json')) return [target];
		return [target ? `${target}/tsconfig.json` : 'tsconfig.json'];
	});
}

function tsProject(
	path: string,
	json: ReadonlyMap<string, Record<string, unknown>>,
	packages: ReadonlyMap<string, Package>
): TsProject {
	const options = effectiveOptions(path, json, packages, new Set());
	const targetDir = options.baseUrl ?? options.pathsDir;
	const aliases: PathAlias[] = [];
	if (options.rawPaths && targetDir !== null) {
		for (const [pattern, targets] of Object.entries(options.rawPaths)) {
			if (!Array.isArray(targets)) continue;
			const resolved = targets
				.filter((t): t is string => typeof t === 'string')
				.map((t) => joinPath(targetDir, t))
				.filter((t): t is string => t !== null);
			aliases.push({ pattern, targets: resolved });
		}
	}
	return {
		aliases,
		baseUrl: options.baseUrl,
		files: new Set(options.files ?? []),
		include: projectInclude(path, options, json).map(globToRegExp),
		exclude: (
			options.exclude ?? [
				`${prefixOf(dirname(path))}node_modules/**/*`,
				...(options.outDir === null ? [] : [`${prefixOf(options.outDir)}**/*`])
			]
		).map(globToRegExp)
	};
}

/**
 * tsc's defaults: no `files` and no `include` takes every TS/JS file in the folder, and `files`
 * alone takes only those. A solution config, one with `references` and neither list, takes none,
 * so its files fall through to the projects it references instead of losing their aliases. tsc
 * itself would compile them in the solution too, but a config written that way means a solution.
 */
function projectInclude(
	path: string,
	options: TsOptions,
	json: ReadonlyMap<string, Record<string, unknown>>
): string[] {
	if (options.include) return options.include;
	if (options.files) return [];
	if (referencedConfigs(path, json).length > 0) return [];
	const dir = prefixOf(dirname(path));
	return TS_INCLUDE_EXTS.map((ext) => `${dir}**/*${ext}`);
}

/** The extensions tsc's default `include` takes (`.d.ts` ends in `.ts`) */
const TS_INCLUDE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

function prefixOf(dir: string): string {
	return dir ? `${dir}/` : '';
}

/** Options after `extends`, with paths in key space. null means no config in the chain sets it. */
interface TsOptions {
	baseUrl: string | null;
	/** The folder of the config that wrote `paths`, which its targets resolve against without `baseUrl` */
	pathsDir: string | null;
	rawPaths: Record<string, string[]> | null;
	/** `compilerOptions.outDir`, which the default `exclude` leaves out */
	outDir: string | null;
	files: string[] | null;
	include: string[] | null;
	exclude: string[] | null;
}

const NO_OPTIONS: TsOptions = {
	baseUrl: null,
	pathsDir: null,
	rawPaths: null,
	outDir: null,
	files: null,
	include: null,
	exclude: null
};

/**
 * `paths`, `baseUrl`, `outDir`, `files`, `include` and `exclude` after `extends`, as tsc merges them: a
 * child's value replaces its parents', a later `extends` entry beats an earlier one, and each
 * path resolves against the config that wrote it (`paths` targets against `baseUrl` when set).
 * `chain` holds only this config's own ancestors, so two parents that share a base both read it.
 */
function effectiveOptions(
	path: string,
	json: ReadonlyMap<string, Record<string, unknown>>,
	packages: ReadonlyMap<string, Package>,
	chain: ReadonlySet<string>
): TsOptions {
	const config = json.get(path);
	if (!config || chain.has(path)) return NO_OPTIONS;
	const ancestors = new Set(chain).add(path);
	const dir = dirname(path);

	let inherited = NO_OPTIONS;
	const parents = Array.isArray(config.extends) ? config.extends : [config.extends];
	for (const parent of parents) {
		if (typeof parent !== 'string') continue;
		const parentPath = extendsPath(dir, parent, json, packages);
		if (!parentPath) continue;
		const options = effectiveOptions(parentPath, json, packages, ancestors);
		inherited = {
			baseUrl: options.baseUrl ?? inherited.baseUrl,
			pathsDir: options.rawPaths ? options.pathsDir : inherited.pathsDir,
			rawPaths: options.rawPaths ?? inherited.rawPaths,
			outDir: options.outDir ?? inherited.outDir,
			files: options.files ?? inherited.files,
			include: options.include ?? inherited.include,
			exclude: options.exclude ?? inherited.exclude
		};
	}

	const options = (config.compilerOptions ?? {}) as CompilerOptions;
	const ownPaths = options.paths && typeof options.paths === 'object' ? options.paths : null;
	return {
		baseUrl:
			typeof options.baseUrl === 'string' ? joinPath(dir, options.baseUrl) : inherited.baseUrl,
		pathsDir: ownPaths ? dir : inherited.pathsDir,
		rawPaths: ownPaths ?? inherited.rawPaths,
		outDir: typeof options.outDir === 'string' ? joinPath(dir, options.outDir) : inherited.outDir,
		files: configPatterns(config.files, dir, false) ?? inherited.files,
		include: configPatterns(config.include, dir, true) ?? inherited.include,
		exclude: configPatterns(config.exclude, dir, true) ?? inherited.exclude
	};
}

/**
 * A `files`, `include` or `exclude` list in key space. In `include` and `exclude`, a last
 * segment with no wildcard and no extension names a folder, so `"src"` takes every file under `src/`.
 */
function configPatterns(value: unknown, dir: string, globs: boolean): string[] | null {
	if (!Array.isArray(value)) return null;
	return value
		.filter((p): p is string => typeof p === 'string')
		.map((p) => {
			const last = p.slice(p.lastIndexOf('/') + 1);
			const folder = globs && (last === '.' || last === '..' || !/[*?.]/.test(last));
			return joinPath(dir, folder ? `${p}/**/*` : p);
		})
		.filter((p): p is string => p !== null);
}

function extendsPath(
	dir: string,
	parent: string,
	json: ReadonlyMap<string, unknown>,
	packages: ReadonlyMap<string, Package>
): string | null {
	return extendsCandidates(dir, parent, packages).find((p) => json.has(p)) ?? null;
}

/** The files an `extends` entry may name, in the order tsc tries them: as written, then with `.json`. */
function extendsCandidates(
	dir: string,
	parent: string,
	packages: ReadonlyMap<string, Package>
): string[] {
	let path: string | null = null;
	if (parent.startsWith('.')) {
		path = joinPath(dir, parent);
	} else {
		const { name, subpath } = splitPackage(parent);
		const pkg = packages.get(name);
		if (pkg) path = joinPath(pkg.dir, subpath === '.' ? 'tsconfig.json' : subpath);
	}
	if (path === null) return [];
	return path.endsWith('.json') ? [path] : [path, `${path}.json`];
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

/** A path glob: `*` and `?` stay in one segment, and `**` spans any number of folders, none included. */
function globToRegExp(glob: string): RegExp {
	const parts = glob.split('/');
	const body = parts
		.map((part, i) => {
			const last = i === parts.length - 1;
			if (part === '**') return last ? '.*' : '(?:[^/]+/)*';
			const segment = part
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '[^/]');
			return last ? segment : `${segment}/`;
		})
		.join('');
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
