import type { CodeMap, FilePath, RelationRef } from '$lib/types/codeMap';
import type { FileCoverage } from '$lib/types/coverage';
import type { HierarchyGroup } from '$lib/services/hierarchySummary';
import {
	MAP_FORMAT,
	MAP_SCHEMA_VERSION,
	type MapEdge,
	type MapLevel,
	type MapNode,
	type RopemanMap
} from '$lib/types/ropemanMap';
import type { Extraction } from '../src/extract';

/**
 * A fully expanded grouped map, for measuring the verifier on a real extraction: the folder
 * tree of the hierarchy summary as levels, each edge backed by the imports between its two
 * parts. Not the format T2-4 serves: it expands every folder at once and labels by path.
 */
export function groupedMap({ map, hierarchy, skipped }: Extraction, name: string): RopemanMap {
	const files: FileCoverage[] = [
		...[...map.files.keys()].map((path) => ({ path, reason: 'sent' as const })),
		...skipped.map(({ path, reason }) => ({ path, reason }))
	];
	const refsByLink = importRefs(map);
	const levels: MapLevel[] = [];

	const filesUnder = (group: HierarchyGroup) =>
		[...map.files.keys()].filter((p) => group.path === '' || p.startsWith(`${group.path}/`));
	const ownFiles = (group: HierarchyGroup) =>
		[...map.files.keys()].filter((p) => dirOf(p) === group.path);
	const nodeId = (group: HierarchyGroup, part: string) =>
		part === group.path ? `files:${group.path || '.'}` : `dir:${part}`;

	const expand = (group: HierarchyGroup, parentId: string | null) => {
		const nodes: MapNode[] = group.children.map((child) => ({
			id: `dir:${child.path}`,
			label: child.path.slice(child.path.lastIndexOf('/') + 1),
			description: '',
			filePaths: filesUnder(child),
			keySymbols: []
		}));
		if (group.ownFiles > 0) {
			nodes.push({
				id: nodeId(group, group.path),
				label: `${group.path || name}/*`,
				description: '',
				filePaths: ownFiles(group),
				keySymbols: []
			});
		}
		const edges: MapEdge[] = group.links.map((link) => {
			const refs = refsByLink.get(`${group.path}\n${link.from}\n${link.to}`) ?? [];
			if (refs.length !== link.imports) {
				throw new Error(
					`${link.from} -> ${link.to}: ${refs.length} refs for ${link.imports} imports`
				);
			}
			const extracted = refs.filter(
				(r): r is RelationRef<'EXTRACTED'> => r.confidence === 'EXTRACTED'
			);
			const inferred = refs.filter(
				(r): r is RelationRef<'INFERRED'> => r.confidence === 'INFERRED'
			);
			const [first, ...rest] = extracted;
			return {
				source: nodeId(group, link.from),
				target: nodeId(group, link.to),
				type: 'depends_on',
				label: null,
				evidence: first
					? { confidence: 'EXTRACTED', refs: [first, ...rest] }
					: { confidence: 'INFERRED', refs: inferred }
			};
		});
		levels.push({ parentId, naming: 'grouped', nodes, edges, assignment: null });
		for (const child of group.children) expand(child, `dir:${child.path}`);
	};
	expand(hierarchy, null);

	return {
		format: MAP_FORMAT,
		schemaVersion: MAP_SCHEMA_VERSION,
		project: { name },
		generator: { name: 'verifier-measurement', version: '0' },
		generatedAt: new Date(0).toISOString(),
		files,
		levels
	};
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

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
