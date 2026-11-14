import type {
	Binding,
	CodeMap,
	Endpoint,
	FilePath,
	GuessBinding,
	RelationKind,
	RelationRef
} from '$lib/types/codeMap';

/** Reference site kinds that relate two files; `references` and `indirect_call` have no reader yet. */
const REFERENCE_RELATIONS: ReadonlySet<RelationKind> = new Set([
	'dynamic_import',
	'calls',
	'inherits',
	'implements'
]);

/**
 * Every relation of the map resolved to exactly one file, as the evidence a map edge cites:
 * the file, the line, the relation kind, the target file and the resolver's confidence. An
 * import with several candidates is a guess and an external module has no file, so neither
 * is here. In the order of the map's files, then of each file's import sites, then its
 * reference sites.
 *
 * A reference site (a call, a class base, a dynamic import) counts only when the resolver
 * EXTRACTED it and it reaches another file. An INFERRED one, a call matched by its unique
 * name, stays in the code map: on gin, tokio and FastAPI nearly every one that crossed two
 * folders was a standard library method sharing a repo method's name (`url.Query()`,
 * `iter().collect()`). An imported name (`imports`) restates its statement's module.
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
		for (const ref of record.refs) {
			const toPath = referenceFile(ref.kind, ref.target, map);
			if (toPath === null || toPath === path) continue;
			relations.push({
				path: path as FilePath,
				line: ref.line,
				relation: ref.kind,
				toPath,
				confidence: 'EXTRACTED'
			});
		}
	}
	return relations;
}

/** The other file an EXTRACTED reference reaches, or null. */
function referenceFile(
	kind: RelationKind,
	binding: Binding<Endpoint> | GuessBinding<Endpoint>,
	map: CodeMap
): FilePath | null {
	if (!REFERENCE_RELATIONS.has(kind)) return null;
	if (binding.state !== 'bound' || binding.candidates.length !== 1) return null;
	const [{ to, provenance }] = binding.candidates;
	if (provenance.confidence !== 'EXTRACTED' || to.kind === 'external') return null;
	if (to.kind === 'file') return map.files.has(to.path) ? to.path : null;
	// The longest part of a SymbolId before a `#` that names a map file: a file name (`a#b.ts`)
	// or a symbol name (Markdown `C#`) may hold one too
	for (let at = to.id.lastIndexOf('#'); at > 0; at = to.id.lastIndexOf('#', at - 1)) {
		const file = to.id.slice(0, at) as FilePath;
		if (map.files.has(file)) return file;
	}
	return null;
}
