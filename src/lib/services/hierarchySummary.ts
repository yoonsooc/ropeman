import type { CodeMap, FilePath, ModuleSite, SymbolRecord } from '$lib/types/codeMap';

/**
 * One folder of the code map, counted: the deterministic level a reader or an agent drills
 * into before any file skeleton. Built from the map alone, so the same map gives the same tree.
 */
export interface HierarchyGroup {
	/** Folder path from the project root; '' is the root */
	path: string;
	/** Files at or below this folder */
	files: number;
	/** Symbols in those files, nested ones included */
	symbols: number;
	/** Files directly in this folder */
	ownFiles: number;
	/** Subfolders that hold a file, by path */
	children: HierarchyGroup[];
	/** Imports resolved to one file, between two parts of this folder, by `from` then `to` */
	links: HierarchyLink[];
}

/**
 * Import statements from files in `from` to files in `to`. A part is a direct subfolder's path,
 * or the folder's own path for the files directly in it. Imports inside one part are counted
 * in that part's own links.
 */
export interface HierarchyLink {
	from: string;
	to: string;
	imports: number;
}

interface Draft {
	group: HierarchyGroup;
	children: Map<string, Draft>;
	links: Map<string, HierarchyLink>;
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const countSymbols = (symbols: readonly SymbolRecord[]): number =>
	symbols.reduce((sum, sym) => sum + 1 + countSymbols(sym.children), 0);

/** The folder tree of `map` with file, symbol and cross-folder import counts. */
export function summarizeHierarchy(map: CodeMap): HierarchyGroup {
	const root = draft('');
	const drafts = new Map<string, Draft>([['', root]]);

	const folder = (path: string): Draft => {
		const known = drafts.get(path);
		if (known) return known;
		const made = draft(path);
		drafts.set(path, made);
		folder(dirOf(path)).children.set(path, made);
		return made;
	};

	for (const [path, record] of map.files) {
		const symbols = countSymbols(record.symbols);
		folder(dirOf(path)).group.ownFiles++;
		for (let dir = dirOf(path); ; dir = dirOf(dir)) {
			const { group } = drafts.get(dir)!;
			group.files++;
			group.symbols += symbols;
			if (dir === '') break;
		}
	}

	for (const [path, record] of map.files) {
		for (const site of record.imports) {
			const target = resolvedFile(site.module);
			if (target) addLink(drafts, dirOf(path), dirOf(target));
		}
	}

	return finish(root);
}

function draft(path: string): Draft {
	return {
		group: { path, files: 0, symbols: 0, ownFiles: 0, children: [], links: [] },
		children: new Map(),
		links: new Map()
	};
}

function resolvedFile(module: ModuleSite['module']): FilePath | null {
	if (module.state !== 'bound' || module.candidates.length !== 1) return null;
	const [{ to }] = module.candidates;
	return to.kind === 'file' ? to.path : null;
}

/** Count one import at the deepest folder holding both ends, between the parts they sit in. */
function addLink(drafts: Map<string, Draft>, fromDir: string, toDir: string) {
	const from = fromDir === '' ? [] : fromDir.split('/');
	const to = toDir === '' ? [] : toDir.split('/');
	let shared = 0;
	while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;
	const at = from.slice(0, shared).join('/');
	const part = (segments: string[]) =>
		segments.length > shared ? segments.slice(0, shared + 1).join('/') : at;
	const fromPart = part(from);
	const toPart = part(to);
	if (fromPart === toPart) return;
	const links = drafts.get(at)!.links;
	const key = `${fromPart}\n${toPart}`;
	const link = links.get(key) ?? { from: fromPart, to: toPart, imports: 0 };
	link.imports++;
	links.set(key, link);
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function finish({ group, children, links }: Draft): HierarchyGroup {
	group.children = [...children.values()]
		.sort((a, b) => byPath(a.group.path, b.group.path))
		.map(finish);
	group.links = [...links.values()].sort((a, b) => byPath(a.from, b.from) || byPath(a.to, b.to));
	return group;
}
