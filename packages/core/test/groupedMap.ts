import {
	MAP_FORMAT,
	MAP_SCHEMA_VERSION,
	type MapLevel,
	type RopemanMap
} from '$lib/types/ropemanMap';
import type { Extraction } from '../src/extract';
import { groupExtraction } from '../src/groupedMap';

/**
 * The grouped map with every folder expanded at once, for measuring the verifier on a real
 * extraction. Serve expands one node per request; this walks them all.
 */
export function groupedMap(extraction: Extraction, name: string): RopemanMap {
	const grouped = groupExtraction(extraction, name);
	const levels: MapLevel[] = [];
	const visit = (level: MapLevel) => {
		levels.push(level);
		for (const node of level.nodes) {
			const child = grouped.expand(node.id);
			if (child) visit(child);
		}
	};
	visit(grouped.top);
	return {
		format: MAP_FORMAT,
		schemaVersion: MAP_SCHEMA_VERSION,
		project: { name },
		generator: { name: 'verifier-measurement', version: '0' },
		generatedAt: new Date(0).toISOString(),
		files: grouped.files,
		levels
	};
}
