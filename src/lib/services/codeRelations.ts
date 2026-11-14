import type { CodeMap, FilePath, RelationRef } from '$lib/types/codeMap';

/**
 * Every relation of the map resolved to exactly one file, as the evidence a map edge cites:
 * the file, the line, the relation kind, the target file and the resolver's confidence. An
 * import with several candidates is a guess and an external module has no file, so neither
 * is here. In the order of the map's files, then of each file's import sites.
 */
export function fileRelations(map: CodeMap): RelationRef[] {
	const relations: RelationRef[] = [];
	for (const [path, record] of map.files) {
		for (const site of record.imports) {
			const { module } = site;
			if (module.state !== 'bound' || module.candidates.length !== 1) continue;
			const [{ to, provenance }] = module.candidates;
			if (to.kind !== 'file') continue;
			relations.push({
				path: path as FilePath,
				line: site.line,
				relation: 'imports_from',
				toPath: to.path,
				confidence: provenance.confidence
			});
		}
	}
	return relations;
}
