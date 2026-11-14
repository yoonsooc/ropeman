/**
 * Turns a verified `ropeman.json` into the Explore gallery snapshot, with the Korean side map
 * next to the English levels. Run by `scripts/explore/pipeline.mjs`, never by the app.
 */
import type { MapLevel, RopemanMap } from '$lib/types/ropemanMap';
import { parseRopemanMap } from './ropemanMapSchema';
import { toViewerLevels } from './mapViewer';
import {
	validateSnapshot,
	type ExploreSnapshot,
	type NodeText,
	type SnapshotTranslation
} from './exploreService';

/** The explore worker's `MAX_BODY_SIZE` (a test keeps them equal): a bigger one cannot be uploaded */
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
/** Stages the skill names when the prompt asks for no other depth */
const DEFAULT_STAGES = 2;
/** The bridge's limits for a named part (`ropeman map` rejects longer names) */
const MAX_LABEL = 60;
const MAX_DESCRIPTION = 280;
const HANGUL = /[가-힣]/;

export interface SnapshotSource {
	owner: string;
	repo: string;
	commit: string;
	ko: SnapshotTranslation;
}

const levelDepths = (map: RopemanMap): Map<MapLevel, number> => {
	const byParent = new Map(map.levels.map((l) => [l.parentId, l]));
	const depths = new Map<MapLevel, number>();
	const walk = (level: MapLevel, depth: number) => {
		depths.set(level, depth);
		for (const n of level.nodes) {
			const child = byParent.get(n.id);
			if (child) walk(child, depth + 1);
		}
	};
	walk(byParent.get(null)!, 0);
	return depths;
};

/** Levels the agent should have named but left grouped by folder; empty when it named them all. */
export function namingGaps(map: RopemanMap, stages = DEFAULT_STAGES): string[] {
	return [...levelDepths(map)]
		.filter(([level, depth]) => depth < stages && level.naming !== 'named')
		.map(([level, depth]) => `stage ${depth + 1} level ${level.parentId ?? 'top'} is not named`);
}

/**
 * The map has no level below a `files:` node (the files directly in one folder), so the viewer
 * would call it "not in snapshot". The snapshot gives each such node with several files a level
 * of one node per file, which opens the file the way a one-file node does.
 */
function withFileLevels(map: RopemanMap): RopemanMap {
	const expanded = new Set(map.levels.map((l) => l.parentId));
	const fileLevels: MapLevel[] = [];
	for (const level of map.levels) {
		for (const n of level.nodes) {
			if (expanded.has(n.id) || n.filePaths.length < 2) continue;
			fileLevels.push({
				parentId: n.id,
				naming: 'grouped',
				edges: [],
				assignment: null,
				nodes: n.filePaths.map((path) => ({
					id: `file:${path}`,
					label: path.slice(path.lastIndexOf('/') + 1),
					description: '',
					filePaths: [path],
					keySymbols: []
				}))
			});
		}
	}
	return { ...map, levels: [...map.levels, ...fileLevels] };
}

export function parseMap(text: string): RopemanMap {
	const parsed = parseRopemanMap(text);
	if (!parsed.ok)
		throw new Error(`ropeman.json: ${parsed.code} at ${parsed.at}: ${parsed.message}`);
	return parsed.value;
}

/** The English texts to translate: parts the agent named, not the folder-named levels below them. */
export function translationSource(map: RopemanMap): SnapshotTranslation {
	const source: SnapshotTranslation = {};
	for (const level of map.levels) {
		if (level.naming !== 'named') continue;
		for (const n of level.nodes) source[n.id] = { label: n.label, description: n.description };
	}
	return source;
}

/** The model answers a list (a JSON schema cannot key an object by id); the snapshot keys it. */
export function translationFromList(list: ({ id: string } & NodeText)[]): SnapshotTranslation {
	const out: SnapshotTranslation = {};
	for (const { id, label, description } of list)
		out[id] = { label: label.trim(), description: description.trim() };
	return out;
}

export function buildExploreSnapshot(map: RopemanMap, source: SnapshotSource): ExploreSnapshot {
	return {
		projectName: source.repo,
		owner: source.owner,
		repo: source.repo,
		commit: source.commit,
		analyzedAt: map.generatedAt.slice(0, 10),
		semanticLevels: Object.fromEntries(toViewerLevels(withFileLevels(map))),
		filePaths: map.files.filter((f) => f.reason === 'sent').map((f) => f.path),
		translations: { ko: source.ko }
	};
}

/** Every reason the snapshot must not ship; empty when it can. */
export function checkSnapshot(snapshot: ExploreSnapshot, source: SnapshotTranslation): string[] {
	const problems: string[] = [];
	const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
	if (bytes > MAX_SNAPSHOT_BYTES)
		problems.push(`snapshot is ${bytes} bytes, over ${MAX_SNAPSHOT_BYTES}`);
	const roundTrip = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
	if (!roundTrip?.commit) problems.push('commit is not a 40-hex SHA');
	const levelCount = Object.keys(snapshot.semanticLevels).length;
	if (!roundTrip || Object.keys(roundTrip.semanticLevels).length !== levelCount) {
		problems.push('validateSnapshot drops levels');
	}
	if (!snapshot.semanticLevels.__root__) problems.push('no __root__ level');

	const ko = snapshot.translations?.ko ?? {};
	for (const id of Object.keys(source)) {
		const t = ko[id];
		if (!t) problems.push(`ko: ${id} is missing`);
		else if (!t.label || t.label.length > MAX_LABEL)
			problems.push(`ko: ${id} label is empty or over ${MAX_LABEL}`);
		else if (!t.description || t.description.length > MAX_DESCRIPTION) {
			problems.push(`ko: ${id} description is empty or over ${MAX_DESCRIPTION}`);
		} else if (!HANGUL.test(t.description)) problems.push(`ko: ${id} description has no Korean`);
	}
	for (const id of Object.keys(ko)) if (!source[id]) problems.push(`ko: ${id} is not a named part`);
	return problems;
}

export function snapshotStats(snapshot: ExploreSnapshot) {
	const levels = Object.values(snapshot.semanticLevels);
	return {
		levels: levels.length,
		nodes: levels.reduce((n, l) => n + l.nodes.length, 0),
		edges: levels.reduce((n, l) => n + l.edges.length, 0),
		files: snapshot.filePaths?.length ?? 0,
		koParts: Object.keys(snapshot.translations?.ko ?? {}).length
	};
}
