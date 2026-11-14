/**
 * Go import paths to files. A go.mod names the module a folder holds, and an import path under
 * that module names the package in the folder below it. A package is every non-test `.go` file
 * of one folder, but a site has one module end, so it points at one representative file. All
 * of a package's files sit in the same folder, so a folder-level map draws the same edge
 * whichever file stands for it. Pure, like the resolver that calls it.
 */
import type { FilePath } from '$lib/types/codeMap';
import type { ModuleResolution } from './importResolver';

/** One go.mod: the module path it declares and the folder it sits in, in key space. */
export interface GoModule {
	path: string;
	dir: string;
}

export const isGoModFile = (path: string) => path === 'go.mod' || path.endsWith('/go.mod');

/**
 * Every go.mod's module, longest path first, so a nested module (`example.com/x/tools` in
 * `tools/go.mod`) owns the imports under it. Each go.mod in the tree is read, which covers the
 * folders a go.work `use` lists, so go.work itself is not read.
 */
export function readGoModules(texts: ReadonlyMap<string, string>): GoModule[] {
	const modules: GoModule[] = [];
	for (const [path, text] of texts) {
		if (!isGoModFile(path)) continue;
		const declared = text
			.replace(/\/\/.*$/gm, '')
			.match(/^\s*module\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/m);
		const name = declared && (declared[1] ?? declared[2] ?? declared[3]);
		if (name) modules.push({ path: name, dir: dirname(path) });
	}
	return modules.sort((a, b) => b.path.length - a.path.length);
}

/**
 * The import path of a Go import site: `import "fmt"`, or one spec of a grouped import
 * (`"fmt"`, `api "x/web/api"`, `_ "x/plugin"`, `. "x/model"`). null for anything else.
 */
export function readGoImport(text: string): string | null {
	const spec = text
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/.*$/gm, '')
		.trim()
		.match(
			/^(?:import\s+)?(?:[\p{L}_][\p{L}\p{N}_]*\s+|\.\s*)?(?:"((?:[^"\\]|\\.)*)"|`([^`]*)`)$/u
		);
	return spec ? (spec[1] ?? spec[2]) : null;
}

/** `package x`, which the parser lists with the imports of a Go file. It names no module. */
export const isGoPackageClause = (text: string) => /^package\s/.test(text);

/** Each folder's non-test `.go` files in path order: the packages an import can name. */
export function goPackages(files: Iterable<string>): Map<string, string[]> {
	const packages = new Map<string, string[]>();
	for (const file of files) {
		if (!file.endsWith('.go') || file.endsWith('_test.go')) continue;
		const dir = dirname(file);
		const list = packages.get(dir);
		if (list) list.push(file);
		else packages.set(dir, [file]);
	}
	for (const list of packages.values()) list.sort();
	return packages;
}

/**
 * The package an import path names, outside the map when no module in the tree holds it (the
 * standard library and third-party modules), unresolved when its folder has no package.
 */
export function resolveGoImport(
	importPath: string,
	modules: readonly GoModule[],
	packages: ReadonlyMap<string, readonly string[]>
): ModuleResolution {
	const module = modules.find((m) => importPath === m.path || importPath.startsWith(`${m.path}/`));
	if (!module) return { status: 'external', module: importPath };
	const rest = importPath.slice(module.path.length + 1);
	const dir = [module.dir, rest].filter(Boolean).join('/');
	const files = packages.get(dir);
	if (!files) return { status: 'unresolved', rule: 'go-module', reason: 'no-file' };
	return { status: 'file', rule: 'go-module', paths: [representative(importPath, files)] };
}

/**
 * The file named after the package (`gin.go` for `…/gin`, `json.go` for `…/codec/json`, with a
 * `/v2` suffix skipped), else the first file other than `doc.go`, which holds only comments.
 */
function representative(importPath: string, files: readonly string[]): FilePath {
	const parts = importPath.split('/');
	const last = parts.length > 1 && /^v\d+$/.test(parts.at(-1)!) ? parts.at(-2)! : parts.at(-1)!;
	const named = files.find((file) => basename(file) === `${last}.go`);
	return (named ?? files.find((file) => basename(file) !== 'doc.go') ?? files[0]) as FilePath;
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function dirname(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? '' : path.slice(0, slash);
}
