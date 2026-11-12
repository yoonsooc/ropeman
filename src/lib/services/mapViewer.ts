/**
 * Opens a `ropeman.json` in the snapshot viewer: parse the file, then lay its levels out the
 * way the semantic store caches them.
 */
import type { SemanticLevel } from '$lib/types/semantic';
import {
	MAX_MAP_BYTES,
	RESERVED_NODE_ID,
	type MapLevel,
	type ParseResult,
	type RopemanMap
} from '$lib/types/ropemanMap';
import { parseRopemanMap } from './ropemanMapSchema';
import { SEMANTIC_COLORS } from './semanticAnalysisService';

/** Checks the size before reading, so a huge file is refused without loading it. */
export async function readMapFile(file: Blob): Promise<ParseResult<RopemanMap>> {
	if (file.size > MAX_MAP_BYTES) {
		return {
			ok: false,
			code: 'too-large',
			message: `The file is over ${MAX_MAP_BYTES} bytes.`,
			at: null
		};
	}
	return parseRopemanMap(await file.text());
}

/**
 * The top level under `__root__` and every other level under the node it expands, as the
 * semantic store caches them. Colors come from the app's palette, never from the file.
 */
export function toViewerLevels(map: RopemanMap): Map<string, SemanticLevel> {
	const byParent = new Map(map.levels.map((l) => [l.parentId, l]));
	const levels = new Map<string, SemanticLevel>();
	// The parser proved the levels are a tree under the top level, so this walk visits each once
	const walk = (l: MapLevel, depth: number, label: string) => {
		levels.set(l.parentId ?? RESERVED_NODE_ID, {
			parentId: l.parentId,
			breadcrumbLabel: label,
			assignment: l.assignment ?? undefined,
			nodes: l.nodes.map((n, i) => ({
				...n,
				color: SEMANTIC_COLORS[i % SEMANTIC_COLORS.length],
				parentId: l.parentId,
				depth,
				fileCount: n.filePaths.length
			})),
			edges: l.edges.map((e, i) => ({
				id: `map-edge:${i}:${e.source}->${e.target}`,
				source: e.source,
				target: e.target,
				type: e.type,
				label: e.label ?? undefined,
				evidence: e.evidence ?? undefined
			}))
		});
		for (const n of l.nodes) {
			const child = byParent.get(n.id);
			if (child) walk(child, depth + 1, n.label);
		}
	};
	walk(byParent.get(null)!, 0, 'Project');
	return levels;
}
