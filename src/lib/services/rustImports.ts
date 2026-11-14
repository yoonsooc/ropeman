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
	/** The name `use` writes for its library: `[lib] name`, else `[package] name` with `-` as `_` */
	libName: string;
	/** Key-space path of the library root: `[lib] path`, else `src/lib.rs` */
	libPath: string;
	/** Key-space paths of the `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` roots it names */
	roots: string[];
}

export const isCargoManifest = (path: string) =>
	path === 'Cargo.toml' || path.endsWith('/Cargo.toml');

/**
 * Every package manifest. Each Cargo.toml in the tree is read, so the workspace `members` list is
 * not needed to find the members.
 */
export function readCargoPackages(texts: ReadonlyMap<string, string>): CargoPackage[] {
	const packages: CargoPackage[] = [];
	for (const [path, text] of texts) {
		if (!isCargoManifest(path)) continue;
		const values = readTomlStrings(text);
		const name = values.find((v) => v.table === 'package' && v.key === 'name')?.value;
		if (!name) continue;
		const dir = dirname(path);
		const lib = (key: string) => values.find((v) => v.table === 'lib' && v.key === key)?.value;
		packages.push({
			dir,
			libName: lib('name') ?? name.replace(/-/g, '_'),
			libPath: join(dir, lib('path') ?? 'src/lib.rs'),
			roots: values
				.filter((v) => ['bin', 'test', 'example', 'bench'].includes(v.table) && v.key === 'path')
				.map((v) => join(dir, v.value))
		});
	}
	return packages;
}

/** The string values of a TOML file by table, the only shape Cargo's target fields take. */
function readTomlStrings(text: string): { table: string; key: string; value: string }[] {
	const values: { table: string; key: string; value: string }[] = [];
	let table = '';
	for (const line of text.split('\n')) {
		const header = line.match(/^\s*\[\[?\s*([\w.-]+)\s*\]\]?/);
		if (header) {
			table = header[1];
			continue;
		}
		const pair = line.match(/^\s*([\w-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/);
		if (pair) values.push({ table, key: pair[1], value: pair[2] ?? pair[3] });
	}
	return values;
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

	const libs = new Map<string, string>();
	for (const pkg of packages) if (files.has(pkg.libPath)) libs.set(pkg.libName, pkg.libPath);

	const cache = new Map<string, string | null>();
	const rootOf = (file: string): string | null => {
		const cached = cache.get(file);
		if (cached !== undefined) return cached;
		const pkg = packageOf(file);
		const found = pkg ? pickRoot(pkg, roots.get(pkg)!, file, declares) : null;
		cache.set(file, found);
		return found;
	};
	return { libs, rootOf };
}

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
 * another first segment is a submodule or item of the current module (2018 uniform paths), then a
 * library in the tree by its crate name, else a crate outside the map (`std`, `serde`).
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
		const own = ownModule(from, root);
		if (submodule(own, first, files) || declaresType(from, first)) return local(own, [...path]);
	}
	const lib = crates.libs.get(first);
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
