/**
 * Rust `use` paths to files. A Cargo.toml names a package's crate roots (`src/lib.rs`,
 * `src/main.rs`, `[lib] path`, `[[bin]]`), and a module path walks the file layout from a root:
 * `a::b` is `a.rs` or `a/mod.rs`, then `b.rs` or `b/mod.rs` in `a/`. `mod` declarations are not
 * read, so a `#[path]` attribute or an inline `mod a { … }` is not followed. Pure, like the
 * resolver that calls it.
 */
import type { FilePath } from '$lib/types/codeMap';
import type { ImportRule, ModuleResolution } from './importResolver';

/** One Cargo package. A virtual workspace manifest has no package and is not listed. */
export interface CargoPackage {
	dir: string;
	/** `[package] name` as written, the name a renamed dependency's `package` gives */
	name: string;
	/** The name `use` writes for its library: `[lib] name`, else `[package] name` with `-` as `_` */
	libName: string;
	/** Key-space path of the library root: `[lib] path`, else `src/lib.rs` */
	libPath: string;
	/** Key-space paths of the `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` roots it names */
	roots: string[];
	/** Renamed dependencies, `foo = { package = "bar" }`: the name `use` writes (`foo`) to the package (`bar`) */
	renames: ReadonlyMap<string, string>;
	/** Edition 2015 resolves a plain `use a::b` from the crate root, later editions from the current module */
	edition2015: boolean;
}

export const isCargoManifest = (path: string) =>
	path === 'Cargo.toml' || path.endsWith('/Cargo.toml');

/** Copies of crates that are not the tree's own source */
const FOREIGN_DIRS = /(?:^|\/)(?:vendor|target)\//;

/**
 * Every package manifest outside `vendor/` and `target/`. Each Cargo.toml in the tree is read, so
 * the workspace `members` list is not needed to find the members. A workspace's
 * `[workspace.dependencies]` renames and `[workspace.package] edition` apply to every package
 * below it, since a member can only write a dependency it declares (`foo.workspace = true`).
 */
export function readCargoPackages(texts: ReadonlyMap<string, string>): CargoPackage[] {
	const manifests = [...texts]
		.filter(([path]) => isCargoManifest(path) && !FOREIGN_DIRS.test(path))
		.map(([path, text]) => ({ dir: dirname(path), entries: readToml(text) }));
	const workspaces = manifests
		.filter(({ entries }) => entries.some((e) => e.table[0] === 'workspace'))
		.map(({ dir, entries }) => ({
			dir,
			renames: dependencyRenames(entries, true),
			edition: stringAt(entries, ['workspace', 'package'], ['edition'])
		}));
	const packages: CargoPackage[] = [];
	for (const { dir, entries } of manifests) {
		const name = stringAt(entries, ['package'], ['name']);
		if (!name) continue;
		const above = workspaces.filter(
			(w) => w.dir === '' || w.dir === dir || dir.startsWith(`${w.dir}/`)
		);
		const workspace = above.sort((a, b) => b.dir.length - a.dir.length)[0];
		const edition =
			stringAt(entries, ['package'], ['edition']) ??
			(entries.some(
				(e) => e.table.join('.') === 'package' && e.key.join('.') === 'edition.workspace'
			)
				? (workspace?.edition ?? '2021')
				: '2015');
		packages.push({
			dir,
			name,
			libName: stringAt(entries, ['lib'], ['name']) ?? name.replace(/-/g, '_'),
			libPath: join(dir, stringAt(entries, ['lib'], ['path']) ?? 'src/lib.rs'),
			roots: entries
				.filter(
					(e) =>
						e.table.length === 1 &&
						['bin', 'test', 'example', 'bench'].includes(e.table[0]) &&
						e.key.join('.') === 'path'
				)
				.flatMap((e) => {
					const value = tomlString(e.value);
					return value === null ? [] : [join(dir, value)];
				}),
			renames: new Map([...(workspace?.renames ?? []), ...dependencyRenames(entries, false)]),
			edition2015: edition === '2015'
		});
	}
	return packages;
}

interface TomlEntry {
	/** The table header as key segments: `target.'cfg(unix)'.dependencies` is three */
	table: string[];
	key: string[];
	/** The value as written, after `=` */
	value: string;
}

/** Key-value lines by table. Enough of TOML for Cargo's fields; multi-line arrays are not read. */
function readToml(text: string): TomlEntry[] {
	const entries: TomlEntry[] = [];
	let table: string[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('[')) {
			const header = readKey(trimmed.replace(/^\[\[?/, ''));
			if (header && /^\]\]?\s*(?:#.*)?$/.test(header.rest)) table = header.segments;
			continue;
		}
		const key = readKey(trimmed);
		const value = key?.rest.match(/^=\s*(.*)$/);
		if (key && value) entries.push({ table, key: key.segments, value: value[1] });
	}
	return entries;
}

/** A dotted key at the start of `text`, bare or quoted segments, and what follows it. */
function readKey(text: string): { segments: string[]; rest: string } | null {
	const segment = /^\s*(?:([A-Za-z0-9_-]+)|"((?:[^"\\]|\\.)*)"|'([^']*)')\s*/;
	const segments: string[] = [];
	let rest = text;
	for (;;) {
		const m = rest.match(segment);
		if (!m) return null;
		segments.push(m[1] ?? m[2] ?? m[3]);
		rest = rest.slice(m[0].length);
		if (!rest.startsWith('.')) return { segments, rest };
		rest = rest.slice(1);
	}
}

/** A quoted string value, null for any other value. */
function tomlString(value: string): string | null {
	const m = value.match(/^(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/);
	return m ? (m[1] ?? m[2]) : null;
}

function stringAt(entries: readonly TomlEntry[], table: string[], key: string[]): string | null {
	const hit = entries.find(
		(e) => e.table.join('\0') === table.join('\0') && e.key.join('\0') === key.join('\0')
	);
	return hit ? tomlString(hit.value) : null;
}

const DEPENDENCY_TABLES = new Set(['dependencies', 'dev-dependencies', 'build-dependencies']);

/**
 * `foo = { package = "bar" }`, `foo.package = "bar"` or `[dependencies.foo] package = "bar"`, in
 * plain, `[target.'cfg(…)'.…]` and (for a workspace) `[workspace.dependencies]` tables. The name
 * `use` writes is the dependency key with `-` as `_`.
 */
function dependencyRenames(entries: readonly TomlEntry[], workspace: boolean): Map<string, string> {
	const renames = new Map<string, string>();
	const add = (key: string, value: string | null | undefined) => {
		if (value) renames.set(key.replace(/-/g, '_'), value);
	};
	for (const { table, key, value } of entries) {
		const at = dependencyTableEnd(table, workspace);
		if (at === table.length) {
			if (key.length === 1)
				add(
					key[0],
					value
						.match(/\bpackage\s*=\s*(?:"([^"]*)"|'([^']*)')/)
						?.slice(1)
						.find(Boolean)
				);
			else if (key.length === 2 && key[1] === 'package') add(key[0], tomlString(value));
		} else if (at === table.length - 1 && key.join('.') === 'package') {
			add(table[at], tomlString(value));
		}
	}
	return renames;
}

/** The index just past `dependencies` in a dependency table header, -1 when it is not one. */
function dependencyTableEnd(table: readonly string[], workspace: boolean): number {
	let i = 0;
	if (workspace) {
		if (table[0] !== 'workspace' || table[1] !== 'dependencies') return -1;
		return 2;
	}
	if (table[0] === 'target' && table.length >= 3) i = 2;
	return DEPENDENCY_TABLES.has(table[i]) ? i + 1 : -1;
}

/** One `use` as written, split into the paths it imports. */
export interface UseTree {
	/** The path before the top-level `{…}` or `*`: `crate::store` in `use crate::store::{a, b}`. null for a plain path. */
	group: string[] | null;
	leaves: UseLeaf[];
}

/** One imported path, from the first written segment. A `self` leaf (`{self}`) ends in `self`. */
export interface UseLeaf {
	path: string[];
	alias: string | null;
	glob: boolean;
}

/** `use a::b as c;`, `pub(crate) use a::{b, c::*};` and the like. null when it does not parse. */
export function readUse(text: string): UseTree | null {
	const body = text
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/.*$/gm, '')
		.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+([\s\S]*?);?\s*$/);
	if (!body) return null;
	const tokens = body[1].match(/::|[{}*,]|(?:r#)?[A-Za-z_]\w*/g) ?? [];
	let i = tokens[0] === '::' ? 1 : 0;
	let group: string[] | null = null;

	const tree = (base: string[], top: boolean): UseLeaf[] | null => {
		const path = [...base];
		for (;;) {
			const token = tokens[i];
			if (token === '*' || token === '{') {
				if (top) group = path;
				i++;
				if (token === '*') return [{ path, alias: null, glob: true }];
				const leaves: UseLeaf[] = [];
				while (tokens[i] !== '}') {
					if (i >= tokens.length) return null;
					const inner = tree(path, false);
					if (!inner) return null;
					leaves.push(...inner);
					if (tokens[i] === ',') i++;
				}
				i++;
				return leaves;
			}
			if (!token || !/^(?:r#)?[A-Za-z_]/.test(token)) return null;
			path.push(token.replace(/^r#/, ''));
			i++;
			if (tokens[i] === '::') {
				i++;
				continue;
			}
			let alias: string | null = null;
			if (tokens[i] === 'as' && tokens[i + 1]) {
				alias = tokens[i + 1].replace(/^r#/, '');
				i += 2;
			}
			return [{ path, alias, glob: false }];
		}
	};

	const leaves = tree([], true);
	return leaves?.length && i === tokens.length ? { group, leaves } : null;
}

/** What the crates of a tree hold, from the manifests and the file list. */
export interface RustCrates {
	/** Library roots in the map, by the name `use` writes */
	libs: ReadonlyMap<string, string>;
	/** The crate root whose module tree holds `file`, null for a file in no package */
	rootOf(file: string): string | null;
	/** The library root `name` means in `file`'s package: a renamed dependency, else a library by that name */
	libFor(file: string, name: string): string | null;
	/** True when `file`'s package is edition 2015, where a plain path starts at the crate root */
	edition2015(file: string): boolean;
}

/**
 * The crates of `packages` as far as `files` holds them. A file belongs to the root whose folder
 * is the deepest one above it. Roots that share a folder (`lib.rs` and `main.rs` in `src/`) are
 * told apart by the module the file sits in: the root that has a top-level item of that name,
 * which is how the parser records `mod args;`, else the library.
 */
export function rustCrates(
	packages: readonly CargoPackage[],
	files: ReadonlySet<string>,
	declares: (file: string, name: string) => boolean
): RustCrates {
	const byDir = [...packages].sort((a, b) => b.dir.length - a.dir.length);
	const packageOf = (file: string) =>
		byDir.find((pkg) => pkg.dir === '' || file.startsWith(`${pkg.dir}/`)) ?? null;

	const roots = new Map<CargoPackage, string[]>(packages.map((pkg) => [pkg, []]));
	for (const file of [...files].sort()) {
		if (!file.endsWith('.rs')) continue;
		const pkg = packageOf(file);
		if (pkg && isRoot(pkg, file)) roots.get(pkg)!.push(file);
	}

	// Two packages with one library name (a copied example crate): the shallowest one wins
	const libs = new Map<string, string>();
	const byName = new Map<string, string>();
	for (const pkg of [...packages].sort((a, b) => depth(a.dir) - depth(b.dir))) {
		if (!files.has(pkg.libPath)) continue;
		if (!libs.has(pkg.libName)) libs.set(pkg.libName, pkg.libPath);
		if (!byName.has(pkg.name)) byName.set(pkg.name, pkg.libPath);
	}

	const cache = new Map<string, string | null>();
	const rootOf = (file: string): string | null => {
		const cached = cache.get(file);
		if (cached !== undefined) return cached;
		const pkg = packageOf(file);
		const found = pkg ? pickRoot(pkg, roots.get(pkg)!, file, declares) : null;
		cache.set(file, found);
		return found;
	};
	const libFor = (file: string, name: string): string | null => {
		const renamed = packageOf(file)?.renames.get(name);
		return renamed !== undefined ? (byName.get(renamed) ?? null) : (libs.get(name) ?? null);
	};
	const edition2015 = (file: string) => packageOf(file)?.edition2015 ?? false;
	return { libs, rootOf, libFor, edition2015 };
}

const depth = (dir: string) => (dir === '' ? 0 : dir.split('/').length);

function isRoot(pkg: CargoPackage, file: string): boolean {
	if (file === pkg.libPath || pkg.roots.includes(file)) return true;
	const rel = pkg.dir ? file.slice(pkg.dir.length + 1) : file;
	return /^(?:build\.rs|src\/main\.rs|src\/bin\/[^/]+\.rs|src\/bin\/[^/]+\/main\.rs|(?:tests|examples|benches)\/[^/]+\.rs|(?:tests|examples|benches)\/[^/]+\/main\.rs)$/.test(
		rel
	);
}

function pickRoot(
	pkg: CargoPackage,
	roots: readonly string[],
	file: string,
	declares: (file: string, name: string) => boolean
): string | null {
	if (roots.includes(file)) return file;
	let depth = -1;
	let nearest: string[] = [];
	for (const root of roots) {
		const dir = dirname(root);
		if (dir !== '' && !file.startsWith(`${dir}/`)) continue;
		if (dir.length > depth) {
			depth = dir.length;
			nearest = [root];
		} else if (dir.length === depth) {
			nearest.push(root);
		}
	}
	if (nearest.length <= 1) return nearest[0] ?? null;
	const top = modulePath(file, nearest[0])[0];
	return (
		nearest.find((root) => declares(root, top)) ??
		nearest.find((root) => root === pkg.libPath) ??
		nearest[0]
	);
}

/** The module path of `file` in the crate at `root`: `src/a/b.rs` and `src/a/b/mod.rs` are `a::b`. */
export function modulePath(file: string, root: string): string[] {
	if (file === root) return [];
	const dir = dirname(root);
	const segments = (dir ? file.slice(dir.length + 1) : file).replace(/\.rs$/, '').split('/');
	if (segments.at(-1) === 'mod') segments.pop();
	return segments;
}

/** Where a path lands: the deepest module file it walks to, and how many of `rest` are modules. */
export type PathEnd =
	| { kind: 'local'; rule: ImportRule; file: string; rest: string[]; modules: number }
	| { kind: 'external'; crate: string }
	| { kind: 'unresolved'; rule: ImportRule; reason: 'no-file' | 'outside-root' };

interface Module {
	file: string;
	/** The folder its submodules sit in */
	dir: string;
}

/**
 * Walk a written path from `from`. `crate`, `self` and `super` start in the file's own crate;
 * another first segment is a submodule or item of the current module (2018 uniform paths; the
 * crate root in edition 2015), then a renamed dependency or a library in the tree by its crate
 * name, else a crate outside the map (`std`, `serde`).
 */
export function resolveUsePath(
	path: readonly string[],
	from: string,
	crates: RustCrates,
	files: ReadonlySet<string>,
	/** A struct, enum, trait or other type at the top of a file */
	declaresType: (file: string, name: string) => boolean
): PathEnd {
	const root = crates.rootOf(from);
	const [first, ...after] = path;
	const local = (start: Module, rest: string[], rule: ImportRule = 'rust-module'): PathEnd => {
		let module = start;
		let modules = 0;
		for (const segment of rest) {
			const next = submodule(module, segment, files);
			if (!next) break;
			module = next;
			modules++;
		}
		return { kind: 'local', rule, file: module.file, rest, modules };
	};

	if (first === 'crate' || first === 'self' || first === 'super') {
		if (!root) return { kind: 'unresolved', rule: 'rust-module', reason: 'no-file' };
		if (first === 'crate') return local(crateRoot(root), after);
		if (first === 'self') return local(ownModule(from, root), after);
		const supers = path.findIndex((segment) => segment !== 'super');
		const up = supers === -1 ? path.length : supers;
		const base = modulePath(from, root);
		if (up > base.length)
			return { kind: 'unresolved', rule: 'rust-module', reason: 'outside-root' };
		const parent = walkAll(crateRoot(root), base.slice(0, base.length - up), files);
		if (!parent) return { kind: 'unresolved', rule: 'rust-module', reason: 'no-file' };
		return local(parent, path.slice(up));
	}
	if (root) {
		// Edition 2015 reads `use a::b` from the crate root, later editions from the current module
		const own = crates.edition2015(from) ? crateRoot(root) : ownModule(from, root);
		if (submodule(own, first, files) || declaresType(own.file, first)) return local(own, [...path]);
	}
	const lib = crates.libFor(from, first);
	if (lib) return local(crateRoot(lib), after, 'rust-crate');
	return { kind: 'external', crate: first };
}

const crateRoot = (root: string): Module => ({ file: root, dir: dirname(root) });

/** A crate root or a `mod.rs` keeps its submodules beside it, any other file in a folder of its name. */
function ownModule(file: string, root: string): Module {
	const besides = file === root || file.endsWith('/mod.rs') || file === 'mod.rs';
	return { file, dir: besides ? dirname(file) : file.replace(/\.rs$/, '') };
}

function submodule(module: Module, name: string, files: ReadonlySet<string>): Module | null {
	const dir = join(module.dir, name);
	if (files.has(`${dir}.rs`)) return { file: `${dir}.rs`, dir };
	if (files.has(`${dir}/mod.rs`)) return { file: `${dir}/mod.rs`, dir };
	return null;
}

function walkAll(start: Module, segments: string[], files: ReadonlySet<string>): Module | null {
	let module: Module | null = start;
	for (const segment of segments) {
		module = submodule(module, segment, files);
		if (!module) return null;
	}
	return module;
}

/** The module a path end names, as a resolution. */
export function endResolution(end: PathEnd): ModuleResolution {
	if (end.kind === 'external') return { status: 'external', module: end.crate };
	if (end.kind === 'unresolved')
		return { status: 'unresolved', rule: end.rule, reason: end.reason };
	return { status: 'file', rule: end.rule, paths: [end.file as FilePath] };
}

function join(dir: string, path: string): string {
	const parts: string[] = dir ? dir.split('/') : [];
	for (const part of path.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') parts.pop();
		else parts.push(part);
	}
	return parts.join('/');
}

function dirname(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? '' : path.slice(0, slash);
}
