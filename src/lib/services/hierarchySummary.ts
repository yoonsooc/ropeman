import type { CodeMap, SymbolRecord } from '$lib/types/codeMap';
import { fileRelations } from './codeRelations';

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
	/** Relations between two parts of this folder (`fileRelations`), by `from` then `to` */
	links: HierarchyLink[];
}

/**
 * Relations from files in `from` to files in `to`: imports, and calls and class bases the code
 * decides (`fileRelations`). A part is a direct subfolder's path, or the folder's own path for
 * the files directly in it. Relations inside one part are counted in that part's own links.
 */
export interface HierarchyLink {
	from: string;
	to: string;
	relations: number;
}

interface Draft {
	group: HierarchyGroup;
	children: Map<string, Draft>;
	links: Map<string, HierarchyLink>;
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const countSymbols = (symbols: readonly SymbolRecord[]): number =>
	symbols.reduce((sum, sym) => sum + 1 + countSymbols(sym.children), 0);

/** The folder tree of `map` with file, symbol and cross-folder relation counts. */
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

	for (const { path, toPath } of fileRelations(map)) addLink(drafts, dirOf(path), dirOf(toPath));

	return finish(root);
}

function draft(path: string): Draft {
	return {
		group: { path, files: 0, symbols: 0, ownFiles: 0, children: [], links: [] },
		children: new Map(),
		links: new Map()
	};
}

/** Count one relation at the deepest folder holding both ends, between the parts they sit in. */
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
	const link = links.get(key) ?? { from: fromPart, to: toPart, relations: 0 };
	link.relations++;
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
