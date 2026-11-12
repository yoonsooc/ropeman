import type { CodeMap, FilePath, RelationRef } from '$lib/types/codeMap';
import type { FileCoverage } from '$lib/types/coverage';
import type { HierarchyGroup } from '$lib/services/hierarchySummary';
import type { MapEdge, MapLevel, MapNode } from '$lib/types/ropemanMap';
import type { Extraction } from './extract';

/**
 * The deterministic map of one extraction: the folder tree of the hierarchy summary, one level
 * per folder, each edge backed by the imports between its two parts. A node id names the folder
 * part it holds (`dir:<path>` for a subfolder, `files:<path>` for the files directly in a
 * folder), so any level is rebuilt from the id alone and stays the same across extractions of
 * the same tree.
 */
export interface GroupedMap {
	/** Every file the extraction saw, with where it ended up */
	files: FileCoverage[];
	top: MapLevel;
	/** The level that expands `nodeId`, or null when the id names no subfolder of the map */
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

export const dirNodeId = (folder: string) => `${DIR}${folder}`;
const filesNodeId = (folder: string) => `${FILES}${folder || '.'}`;
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

	const refsByLink = importRefs(map);
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
		const edges: MapEdge[] = group.links.map((link) => {
			const refs = refsByLink.get(`${group.path}\n${link.from}\n${link.to}`) ?? [];
			const extracted = refs.filter(
				(r): r is RelationRef<'EXTRACTED'> => r.confidence === 'EXTRACTED'
			);
			const inferred = refs.filter(
				(r): r is RelationRef<'INFERRED'> => r.confidence === 'INFERRED'
			);
			const [first, ...rest] = extracted;
			return {
				source: partId(group, link.from),
				target: partId(group, link.to),
				type: 'depends_on',
				label: null,
				evidence: first
					? { confidence: 'EXTRACTED', refs: [first, ...rest] }
					: { confidence: 'INFERRED', refs: inferred }
			};
		});
		return { parentId, naming: 'grouped', nodes, edges, assignment: null };
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

/**
 * Every import resolved to one file, keyed by the folder whose two parts it joins, the way
 * `summarizeHierarchy` counts its links.
 */
function importRefs(map: CodeMap): Map<string, RelationRef[]> {
	const byLink = new Map<string, RelationRef[]>();
	for (const [path, record] of map.files) {
		for (const site of record.imports) {
			const { module } = site;
			if (module.state !== 'bound' || module.candidates.length !== 1) continue;
			const [{ to, provenance }] = module.candidates;
			if (to.kind !== 'file') continue;
			const from = dirOf(path).split('/').filter(Boolean);
			const toDir = dirOf(to.path).split('/').filter(Boolean);
			let shared = 0;
			while (shared < from.length && shared < toDir.length && from[shared] === toDir[shared])
				shared++;
			const at = from.slice(0, shared).join('/');
			const part = (segments: string[]) =>
				segments.length > shared ? segments.slice(0, shared + 1).join('/') : at;
			if (part(from) === part(toDir)) continue;
			const key = `${at}\n${part(from)}\n${part(toDir)}`;
			const refs = byLink.get(key) ?? [];
			refs.push({
				path: path as FilePath,
				line: site.line,
				relation: 'imports_from',
				toPath: to.path,
				confidence: provenance.confidence
			});
			byLink.set(key, refs);
		}
	}
	return byLink;
}
