import type { CodeMap, RelationRef } from '$lib/types/codeMap';
import { fileRelations } from '$lib/services/codeRelations';
import type { FileCoverage } from '$lib/types/coverage';
import type { HierarchyGroup } from '$lib/services/hierarchySummary';
import type { MapEdge, MapLevel, MapNode } from '$lib/types/ropemanMap';
import type { Extraction } from './extract';

/**
 * The deterministic map of one extraction: the folder tree of the hierarchy summary, one level
 * per folder, each edge backed by the imports between its two parts. A node id names the folder
 * part it holds (`dir:<path>` for a subfolder, `files:<path>` for the files directly in a
 * folder), so any level is rebuilt from the id alone and stays the same across extractions of
 * the same tree. A `files:` node with two or more files expands to a file level: one
 * `file:<path>` node per file and the imports between them, which no folder level can show.
 */
export interface GroupedMap {
	/** Every file the extraction saw, with where it ended up */
	files: FileCoverage[];
	top: MapLevel;
	/**
	 * The level that expands `nodeId`: a folder level for a `dir:` node, a file level for a
	 * `files:` node with two or more files, null for any other id
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
	const filesOf = (nodeId: string): string[] => {
		if (nodeId.startsWith(FILES)) return own.get(filesFolder(nodeId)) ?? [];
		const group = nodeId.startsWith(DIR) ? groups.get(nodeId.slice(DIR.length)) : undefined;
		return group && group.path !== '' ? under(group) : [];
	};

	const { byLink: refsByLink, byFolder: refsByFolder } = importRefs(map);
	const partId = (group: HierarchyGroup, part: string) =>
		part === group.path ? filesNodeId(group.path) : dirNodeId(part);

	const levelOf = (group: HierarchyGroup, parentId: string | null): MapLevel => {
		const nodes: MapNode[] = group.children.map((child) => ({
			id: dirNodeId(child.path),
			label: baseName(child.path),
			description: '',
			filePaths: filesOf(dirNodeId(child.path)),
			keySymbols: []
		}));
		if (group.ownFiles > 0) {
			nodes.push({
				id: filesNodeId(group.path),
				label: `${group.path === '' ? name : baseName(group.path)}/*`,
				description: '',
				filePaths: own.get(group.path) ?? [],
				keySymbols: []
			});
		}
		const edges = group.links.map((link) =>
			dependsOn(
				partId(group, link.from),
				partId(group, link.to),
				refsByLink.get(`${group.path}\n${link.from}\n${link.to}`) ?? []
			)
		);
		return { parentId, naming: 'grouped', nodes, edges, assignment: null };
	};

	const fileLevel = (nodeId: string): MapLevel | null => {
		const folder = filesFolder(nodeId);
		const paths = own.get(folder) ?? [];
		if (paths.length < 2) return null;
		const pairs = refsByFolder.get(folder) ?? new Map<string, RelationRef[]>();
		return {
			parentId: nodeId,
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

	const subfolder = (nodeId: string): HierarchyGroup | undefined => {
		if (!nodeId.startsWith(DIR)) return undefined;
		const group = groups.get(nodeId.slice(DIR.length));
		return group && group.path !== '' ? group : undefined;
	};

	return {
		files,
		top: levelOf(hierarchy, null),
		expand: (nodeId) => {
			if (nodeId.startsWith(FILES)) return fileLevel(nodeId);
			const group = subfolder(nodeId);
			return group ? levelOf(group, nodeId) : null;
		},
		parentOf: (nodeId) => {
			const inFolder = nodeId.startsWith(FILES)
				? filesFolder(nodeId)
				: subfolder(nodeId) && dirOf(nodeId.slice(DIR.length));
			if (inFolder === undefined || (!own.has(inFolder) && !groups.has(inFolder))) return undefined;
			return inFolder === '' ? null : dirNodeId(inFolder);
		},
		group: subfolder,
		filesOf
	};
}

/** The evidence of one edge: EXTRACTED when any of its imports is, INFERRED otherwise. */
function dependsOn(source: string, target: string, refs: RelationRef[]): MapEdge {
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
function importRefs(map: CodeMap): {
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
