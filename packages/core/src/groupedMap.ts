import type { CodeMap, RelationRef } from '$lib/types/codeMap';
import { fileRelations } from '$lib/services/codeRelations';
import type { FileCoverage } from '$lib/types/coverage';
import type { HierarchyGroup } from '$lib/services/hierarchySummary';
import type { MapEdge, MapLevel, MapNode } from '$lib/types/ropemanMap';
import type { Extraction } from './extract';

/**
 * The deterministic map of one extraction: the folder tree of the hierarchy summary, one level
 * per folder that has two or more parts, each edge backed by the relations between its two parts
 * (`fileRelations`: imports, and the calls and class bases the code decides). A part is a
 * subfolder that holds a file, or the files directly in the folder.
 *
 * A level never holds a single part (ADR-30). A chain of folders that each hold one subfolder and
 * no file is one node, the deepest folder of the chain, labelled by its path from the level's
 * folder (`src/main/scala/com/acme`), and the root collapses the same way into the top level. A
 * folder that holds files and no subfolder expands straight to its file level.
 *
 * A node id names the folder part it holds (`dir:<path>` for a subfolder, `files:<path>` for the
 * files directly in a folder), so any level is rebuilt from the id alone and stays the same
 * across extractions of the same tree. A `files:` node with two or more files expands to a file
 * level: one `file:<path>` node per file and the relations between them, which no folder level
 * can show.
 */
export interface GroupedMap {
	/** Every file the extraction saw, with where it ended up */
	files: FileCoverage[];
	/** The folder the top level shows: '' (the root) unless the root is a chain of one subfolder */
	topFolder: string;
	top: MapLevel;
	/**
	 * The level that expands `nodeId`: a folder level for a `dir:` node of a folder with
	 * subfolders, a file level for a `dir:` or `files:` node of two or more files directly in one
	 * folder, null for any other id
	 */
	expand(nodeId: string): MapLevel | null;
	/** The node whose level holds `nodeId`: null for a top-level node, undefined for no node */
	parentOf(nodeId: string): string | null | undefined;
	/** The folder a `dir:` node holds, for a prompt or a watcher; undefined for any other id */
	group(nodeId: string): HierarchyGroup | undefined;
	/** The files of a `dir:` or `files:` node, in map order */
	filesOf(nodeId: string): string[];
}

const DIR = 'dir:';
const FILES = 'files:';
const FILE = 'file:';

export const dirNodeId = (folder: string) => `${DIR}${folder}`;
const filesNodeId = (folder: string) => `${FILES}${folder || '.'}`;
const fileNodeId = (path: string) => `${FILE}${path}`;
const filesFolder = (nodeId: string) => {
	const folder = nodeId.slice(FILES.length);
	return folder === '.' ? '' : folder;
};

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const relative = (folder: string, path: string) =>
	folder === '' ? path : path.slice(folder.length + 1);

/** Where a chain of folders with one subfolder and no file of their own ends: the folder itself otherwise. */
export const chainEnd = (group: HierarchyGroup): HierarchyGroup =>
	group.ownFiles === 0 && group.children.length === 1 ? chainEnd(group.children[0]) : group;

export function groupExtraction({ map, hierarchy, skipped }: Extraction, name: string): GroupedMap {
	const files: FileCoverage[] = [
		...[...map.files.keys()].map((path) => ({ path, reason: 'sent' as const })),
		...skipped.map(({ path, reason }) => ({ path, reason }))
	];

	const groups = new Map<string, HierarchyGroup>();
	const index = (group: HierarchyGroup) => {
		groups.set(group.path, group);
		group.children.forEach(index);
	};
	index(hierarchy);

	const own = new Map<string, string[]>();
	for (const path of map.files.keys()) {
		const dir = dirOf(path);
		const list = own.get(dir);
		if (list) list.push(path);
		else own.set(dir, [path]);
	}
	const under = (group: HierarchyGroup): string[] => [
		...(own.get(group.path) ?? []),
		...group.children.flatMap(under)
	];

	const top = chainEnd(hierarchy);
	// The folders a folder level shows, by the node that expands it (null for the top level)
	const levelFolders = new Map<string, string | null>([[top.path, null]]);
	const dirs = new Map<string, { group: HierarchyGroup; parentId: string | null }>();
	const visit = (group: HierarchyGroup, parentId: string | null) => {
		for (const child of group.children) {
			const end = chainEnd(child);
			const id = dirNodeId(end.path);
			dirs.set(id, { group: end, parentId });
			if (end.children.length > 0) {
				levelFolders.set(end.path, id);
				visit(end, id);
			}
		}
	};
	visit(top, null);

	const { byLink: refsByLink, byFolder: refsByFolder } = relationRefs(map);

	const folderLevel = (group: HierarchyGroup, parentId: string | null): MapLevel => {
		const nodes: MapNode[] = group.children.map((child) => {
			const end = chainEnd(child);
			return {
				id: dirNodeId(end.path),
				label: relative(group.path, end.path),
				description: '',
				filePaths: under(end),
				keySymbols: []
			};
		});
		if (group.ownFiles > 0) {
			nodes.push({
				id: filesNodeId(group.path),
				label: `${group.path === '' ? name : baseName(group.path)}/*`,
				description: '',
				filePaths: own.get(group.path) ?? [],
				keySymbols: []
			});
		}
		// A link names the direct subfolder; its node is where that subfolder's chain ends
		const partId = (part: string) =>
			part === group.path ? filesNodeId(group.path) : dirNodeId(chainEnd(groups.get(part)!).path);
		const edges = group.links.map((link) =>
			dependsOn(
				partId(link.from),
				partId(link.to),
				refsByLink.get(`${group.path}\n${link.from}\n${link.to}`) ?? []
			)
		);
		return { parentId, naming: 'grouped', nodes, edges, assignment: null };
	};

	const fileLevel = (folder: string, parentId: string): MapLevel | null => {
		const paths = own.get(folder) ?? [];
		if (paths.length < 2) return null;
		const pairs = refsByFolder.get(folder) ?? new Map<string, RelationRef[]>();
		return {
			parentId,
			naming: 'grouped',
			nodes: paths.map((path) => ({
				id: fileNodeId(path),
				label: baseName(path),
				description: '',
				filePaths: [path],
				keySymbols: []
			})),
			edges: [...pairs.values()].map((refs) =>
				dependsOn(fileNodeId(refs[0].path), fileNodeId(refs[0].toPath), refs)
			),
			assignment: null,
			fileLevel: true
		};
	};

	return {
		files,
		topFolder: top.path,
		top: folderLevel(top, null),
		expand: (nodeId) => {
			if (nodeId.startsWith(FILES)) {
				const folder = filesFolder(nodeId);
				return levelFolders.has(folder) ? fileLevel(folder, nodeId) : null;
			}
			const dir = dirs.get(nodeId);
			if (!dir) return null;
			return dir.group.children.length > 0
				? folderLevel(dir.group, nodeId)
				: fileLevel(dir.group.path, nodeId);
		},
		parentOf: (nodeId) => {
			if (!nodeId.startsWith(FILES)) return dirs.get(nodeId)?.parentId;
			const folder = filesFolder(nodeId);
			return own.has(folder) ? levelFolders.get(folder) : undefined;
		},
		group: (nodeId) => dirs.get(nodeId)?.group,
		filesOf: (nodeId) => {
			if (nodeId.startsWith(FILES)) return own.get(filesFolder(nodeId)) ?? [];
			const dir = dirs.get(nodeId);
			return dir ? under(dir.group) : [];
		}
	};
}

/** The evidence of one edge: EXTRACTED when any of its imports is, INFERRED otherwise. */
/**
 * How many call and class-base refs an edge cites. Every import stays (the naming prompt counts
 * them); the references that back an edge after them are a sample, since a verifier checks each
 * cited ref and a reader needs a few lines, not every call site.
 */
export const MAX_CITED_REFERENCES = 20;

/**
 * The refs an edge cites: its imports, then its other relations once per file pair and kind (the
 * lowest line), at most MAX_CITED_REFERENCES of them.
 */
export function citedRefs(refs: readonly RelationRef[]): RelationRef[] {
	const imports = refs.filter((r) => r.relation === 'imports_from');
	const first = new Map<string, RelationRef>();
	for (const ref of refs) {
		if (ref.relation === 'imports_from') continue;
		const key = `${ref.path}\n${ref.relation}\n${ref.toPath}`;
		const seen = first.get(key);
		if (!seen || ref.line < seen.line) first.set(key, ref);
	}
	return [...imports, ...[...first.values()].slice(0, MAX_CITED_REFERENCES)];
}

function dependsOn(source: string, target: string, all: RelationRef[]): MapEdge {
	const refs = citedRefs(all);
	const extracted = refs.filter((r): r is RelationRef<'EXTRACTED'> => r.confidence === 'EXTRACTED');
	const inferred = refs.filter((r): r is RelationRef<'INFERRED'> => r.confidence === 'INFERRED');
	const [first, ...rest] = extracted;
	return {
		source,
		target,
		type: 'depends_on',
		label: null,
		evidence: first
			? { confidence: 'EXTRACTED', refs: [first, ...rest] }
			: { confidence: 'INFERRED', refs: inferred }
	};
}

/**
 * Every relation resolved to one file. `byLink` keys one between two parts of a folder by that
 * folder and the parts, the way `summarizeHierarchy` counts its links. `byFolder` keeps one
 * between two files of the same folder, which no part link holds, by folder then file pair.
 */
function relationRefs(map: CodeMap): {
	byLink: Map<string, RelationRef[]>;
	byFolder: Map<string, Map<string, RelationRef[]>>;
} {
	const byLink = new Map<string, RelationRef[]>();
	const byFolder = new Map<string, Map<string, RelationRef[]>>();
	for (const ref of fileRelations(map)) {
		const from = dirOf(ref.path).split('/').filter(Boolean);
		const toDir = dirOf(ref.toPath).split('/').filter(Boolean);
		let shared = 0;
		while (shared < from.length && shared < toDir.length && from[shared] === toDir[shared])
			shared++;
		const at = from.slice(0, shared).join('/');
		const part = (segments: string[]) =>
			segments.length > shared ? segments.slice(0, shared + 1).join('/') : at;
		if (part(from) !== part(toDir)) {
			append(byLink, `${at}\n${part(from)}\n${part(toDir)}`, ref);
		} else if (ref.toPath !== ref.path) {
			// Parts match only when both files sit directly in `at`
			if (!byFolder.has(at)) byFolder.set(at, new Map());
			append(byFolder.get(at)!, `${ref.path}\n${ref.toPath}`, ref);
		}
	}
	return { byLink, byFolder };
}

function append<K, V>(lists: Map<K, V[]>, key: K, value: V) {
	const list = lists.get(key);
	if (list) list.push(value);
	else lists.set(key, [value]);
}
