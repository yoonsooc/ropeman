import type {
	Binding,
	CodeMap,
	Confidence,
	Endpoint,
	FileRecord,
	GuessBinding,
	SymbolRecord
} from '$lib/types/codeMap';

/**
 * One relation written at a line, reduced to the two files it joins. Only a binding with one
 * candidate counts, so every edge names exactly one target file.
 */
export interface FileEdge {
	kind: string;
	path: string;
	line: number;
	toPath: string;
	/** The target symbol's own name, or null when the target is a file */
	toName: string | null;
	confidence: Confidence;
}

/** A part of a folder: one direct subfolder, or one file directly in the folder. */
export interface Part {
	path: string;
	type: 'folder' | 'file';
	files: number;
	symbols: number;
	/** Up to NAMES_PER_PART top-level class and function names, biggest files first */
	names: string[];
}

export interface Evidence {
	path: string;
	line: number;
	to: string;
}

/** Relations of one kind from files in `from` to files in `to`, with the first few sites. */
export interface PartRelation {
	from: string;
	to: string;
	kind: string;
	count: number;
	evidence: Evidence[];
}

/** What the model sees for one folder. Built from the code map alone, so one map gives one view. */
export interface FolderView {
	folder: string;
	parts: Part[];
	relations: PartRelation[];
}

export const NAMES_PER_PART = 6;
export const EVIDENCE_PER_RELATION = 3;

const fileOfEndpoint = (to: Endpoint): string | null =>
	to.kind === 'file' ? to.path : to.kind === 'symbol' ? to.id.slice(0, to.id.indexOf('#')) : null;

/** `a.ts#Outer.inner~2` -> `inner` */
const nameOfEndpoint = (to: Endpoint): string | null =>
	to.kind === 'symbol'
		? to.id
				.slice(to.id.indexOf('#') + 1)
				.replace(/~\d+$/, '')
				.split('.')
				.at(-1)!
		: null;

function edgeOf(
	kind: string,
	record: FileRecord,
	line: number,
	binding: Binding<Endpoint> | GuessBinding<Endpoint>
): FileEdge | null {
	if (binding.state !== 'bound' || binding.candidates.length !== 1) return null;
	const [{ to, provenance }] = binding.candidates;
	const toPath = fileOfEndpoint(to);
	if (toPath === null || toPath === record.path) return null;
	return {
		kind,
		path: record.path,
		line,
		toPath,
		toName: nameOfEndpoint(to),
		confidence: provenance.confidence
	};
}

/** Every cross-file relation in the map: module sites as `imports`, reference sites by their kind. */
export function fileEdges(map: CodeMap): FileEdge[] {
	const edges: FileEdge[] = [];
	const push = (edge: FileEdge | null) => edge && edges.push(edge);
	for (const record of map.files.values()) {
		for (const site of [...record.imports, ...record.reexports]) {
			push(edgeOf('imports', record, site.line, site.module));
		}
		for (const ref of record.refs) push(edgeOf(ref.kind, record, ref.line, ref.target));
	}
	return edges;
}

const countSymbols = (symbols: readonly SymbolRecord[]): number =>
	symbols.reduce((sum, sym) => sum + 1 + countSymbols(sym.children), 0);

const within = (path: string, folder: string) => folder === '' || path.startsWith(`${folder}/`);

/** The part of `folder` that `path` falls in, or null when it is outside the folder. */
export function partOf(path: string, folder: string): string | null {
	if (!within(path, folder)) return null;
	const rest = folder === '' ? path : path.slice(folder.length + 1);
	const slash = rest.indexOf('/');
	const head = slash === -1 ? rest : rest.slice(0, slash);
	return folder === '' ? head : `${folder}/${head}`;
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The folder's parts and the EXTRACTED relations between them. INFERRED ones are left out. */
export function folderView(map: CodeMap, folder: string, edges: readonly FileEdge[]): FolderView {
	const members = new Map<string, FileRecord[]>();
	for (const [path, record] of map.files) {
		const part = partOf(path, folder);
		if (part === null) continue;
		const list = members.get(part) ?? [];
		list.push(record);
		members.set(part, list);
	}
	const parts: Part[] = [...members.entries()]
		.sort(([a], [b]) => byPath(a, b))
		.map(([path, records]) => ({
			path,
			type: records.length === 1 && records[0].path === path ? 'file' : 'folder',
			files: records.length,
			symbols: records.reduce((sum, r) => sum + countSymbols(r.symbols), 0),
			names: topNames(records)
		}));

	const relations = new Map<string, PartRelation>();
	for (const edge of edges) {
		if (edge.confidence !== 'EXTRACTED') continue;
		const from = partOf(edge.path, folder);
		const to = partOf(edge.toPath, folder);
		if (from === null || to === null || from === to) continue;
		const key = `${from}\n${to}\n${edge.kind}`;
		const relation = relations.get(key) ?? { from, to, kind: edge.kind, count: 0, evidence: [] };
		relation.count++;
		relation.evidence.push({ path: edge.path, line: edge.line, to: edge.toPath });
		relations.set(key, relation);
	}
	const finished = [...relations.values()]
		.map((r) => ({ ...r, evidence: firstSites(r.evidence) }))
		.sort((a, b) => b.count - a.count || byPath(a.from, b.from) || byPath(a.to, b.to));
	return { folder, parts, relations: finished };
}

const siteOrder = (a: Evidence, b: Evidence) =>
	byPath(a.path, b.path) || a.line - b.line || byPath(a.to, b.to);

const firstSites = (evidence: Evidence[]) =>
	[...evidence].sort(siteOrder).slice(0, EVIDENCE_PER_RELATION);

function topNames(records: readonly FileRecord[]): string[] {
	const names = new Set<string>();
	const ordered = [...records].sort(
		(a, b) => countSymbols(b.symbols) - countSymbols(a.symbols) || byPath(a.path, b.path)
	);
	for (const record of ordered) {
		for (const sym of record.symbols) {
			if (sym.kind !== 'class' && sym.kind !== 'function') continue;
			names.add(sym.name);
			if (names.size === NAMES_PER_PART) return [...names];
		}
	}
	return [...names];
}

export const PROMPT_VERSION = 1;

const INSTRUCTIONS = `You are naming the structure of one folder of a codebase for a code map.
The input lists the folder's parts (its direct subfolders and the files directly in it) with what
static extraction found in each, and the relations between parts. Each relation has a kind, a
count, and up to three evidence sites: {"path": file the relation is written in, "line": line,
"to": file it points at}.

Group the parts into roles. Rules:
- Every part goes in exactly one group. Use part paths exactly as written.
- Use between 2 and 8 groups, and fewer groups than parts.
- Give each group a short name (at most 4 words) and a one-sentence summary of its role.
- For each group, cite up to 3 evidence sites copied exactly from the input relations that
  support the grouping or the role. Cite none when no relation applies.

Reply with JSON only, no prose and no code fence:
{"groups":[{"name":"...","summary":"...","members":["<part path>"],"evidence":[{"path":"...","line":1,"to":"..."}]}]}`;

/** The full prompt for one view. The instructions are fixed; only the view's JSON differs. */
export function renderPrompt(view: FolderView): string {
	const input = {
		folder: view.folder === '' ? '(repository root)' : view.folder,
		parts: view.parts,
		relations: view.relations
	};
	return `${INSTRUCTIONS}\n\nInput:\n${JSON.stringify(input)}\n`;
}
