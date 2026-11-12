/**
 * The deterministic checks of A-12. An LLM may write a map's names and relations; this module
 * decides whether the map is true to the code: every file in one node per level, every path and
 * key symbol in the code map, every relation backed by a code relation of the confidence it
 * claims. Pure and synchronous, and it imports `$lib/types` and the map parser only, so the
 * browser, the bridge and `packages/core` run the same code.
 */
import type {
	Binding,
	CodeMap,
	Confidence,
	Endpoint,
	FilePath,
	FileRecord,
	GuessBinding,
	SymbolRecord
} from '$lib/types/codeMap';
import { COVERAGE_REASONS, type CoverageReason } from '$lib/types/coverage';
import type {
	MapVerification,
	UnverifiedEdge,
	Violation,
	ViolationCode
} from '$lib/types/mapVerification';
import type { MapLevel, RopemanMap } from '$lib/types/ropemanMap';
import { parseRopemanMapValue } from './ropemanMapSchema';

/**
 * A repo-relative path in NFC. macOS hands out NFD file names and an LLM writes NFC, so both
 * sides compare in this form, and only this type keys the sets the checks share.
 */
type PathKey = string & { readonly __brand: 'PathKey' };

const nfc = (text: string) => text.normalize('NFC');
const key = (path: string) => nfc(path) as PathKey;

type Report = (
	code: ViolationCode,
	at: string,
	where: { level?: number; nodeId?: string; path?: string },
	message: string
) => void;

/** The key of a path that is normalized and a file of the code map; reports any other path. */
type Known = (path: string, at: string, where: { level: number; nodeId: string }) => PathKey | null;

/** The coverage reasons of a file the parser read, which therefore has a code map record. */
const READ_REASONS: ReadonlySet<CoverageReason> = new Set([
	'sent',
	'over-budget',
	'no-symbols',
	'excluded-path'
]);

/** Repo-relative, `/`-separated, no empty, `.` or `..` segment, nothing absolute. */
export function isNormalizedPath(path: string): boolean {
	return (
		path.length > 0 &&
		!path.includes('\\') &&
		!/^[A-Za-z]:/.test(path) &&
		// eslint-disable-next-line no-control-regex
		!/[\u0000-\u001f]/.test(path) &&
		path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
	);
}

/**
 * Parses `input` as `ropeman.json` would be, then checks the parsed map against the code map it
 * describes and reports every violation found. Any value is safe to pass: one the parser refuses
 * comes back as `parsed: false`, so no check ever runs on a map the parser has not seen.
 */
export function verifyMap(input: unknown, codeMap: CodeMap): MapVerification {
	const parsed = parseRopemanMapValue(input);
	if (!parsed.ok) {
		const { ok: _ok, ...failure } = parsed;
		return { parsed: false, failure };
	}
	const map = parsed.value;

	const violations: Violation[] = [];
	const report: Report = (code, at, where, message) => {
		violations.push({
			code,
			at,
			level: where.level ?? null,
			nodeId: where.nodeId ?? null,
			path: where.path ?? null,
			message
		});
	};

	const prefix = codeMap.root === null ? '' : `${codeMap.root}/`;
	const repoPath = (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : path);
	const files = codeFiles(codeMap, repoPath, report);
	const known: Known = (path, at, where) => {
		if (!isNormalizedPath(path)) {
			report(
				'path-invalid',
				at,
				{ ...where, path },
				`${JSON.stringify(path)} is not a normalized repo-relative path.`
			);
			return null;
		}
		const k = key(path);
		if (!files.has(k)) {
			report('path-unknown', at, { ...where, path }, `${path} is not a file of the code map.`);
			return null;
		}
		return k;
	};

	const onMap = checkCoverage(map, files, repoPath, report);
	const relations = relationIndex(files, codeMap.files, repoPath);
	const symbols = symbolIndex(files);
	const unverified: UnverifiedEdge[] = [];
	const checked = { files: map.files.length, levels: 0, nodes: 0, edges: 0, refs: 0 };

	for (const { index, level, scope } of levelTree(map, onMap)) {
		const nodeFiles = checkAssignment(level, index, scope, known, report);
		checkKeySymbols(level, index, nodeFiles, symbols, report);
		checked.refs += checkEvidence(level, index, nodeFiles, relations, known, report, unverified);
		checked.levels++;
		checked.nodes += level.nodes.length;
		checked.edges += level.edges.length;
	}
	return { parsed: true, map, violations, unverified, checked };
}

/**
 * The code map's files by key. Two files with one key (`한글.ts` in NFC and in NFD, which Linux
 * keeps apart) leave a map path that cannot say which one it means, so that fails the map.
 */
function codeFiles(
	codeMap: CodeMap,
	repoPath: (path: string) => string,
	report: Report
): Map<PathKey, FileRecord> {
	const files = new Map<PathKey, FileRecord>();
	for (const record of codeMap.files.values()) {
		const path = repoPath(record.path);
		const first = files.get(key(path));
		if (first) {
			report(
				'path-collision',
				'files',
				{ path },
				`${JSON.stringify(path)} and ${JSON.stringify(repoPath(first.path))} are one path in NFC.`
			);
		} else files.set(key(path), record);
	}
	return files;
}

/**
 * `files` names every file of the code map once, with a reason that agrees with it. Returns the
 * files marked sent that the code map has: the scope the top level divides.
 */
function checkCoverage(
	map: RopemanMap,
	files: ReadonlyMap<PathKey, FileRecord>,
	repoPath: (path: string) => string,
	report: Report
): Set<PathKey> {
	const listed = new Set<PathKey>();
	const sent = new Set<PathKey>();
	map.files.forEach(({ path, reason }, i) => {
		const at = `files[${i}]`;
		if (!isNormalizedPath(path)) {
			report(
				'path-invalid',
				`${at}.path`,
				{ path },
				`${JSON.stringify(path)} is not a normalized repo-relative path.`
			);
			return;
		}
		const k = key(path);
		if (listed.has(k)) {
			report('coverage-duplicate', `${at}.path`, { path }, `${path} is listed twice.`);
			return;
		}
		listed.add(k);
		if (READ_REASONS.has(reason) !== files.has(k)) {
			report(
				'coverage-mismatch',
				`${at}.reason`,
				{ path },
				files.has(k)
					? `${path} is in the code map, but its reason ${reason} says it was not read.`
					: `${path} is not in the code map, but its reason ${reason} says it was read.`
			);
			return;
		}
		if (COVERAGE_REASONS[reason] === 'sent') sent.add(k);
	});
	for (const [k, record] of files) {
		if (!listed.has(k)) {
			const path = repoPath(record.path);
			report('coverage-missing', 'files', { path }, `${path} is in the code map but not in files.`);
		}
	}
	return sent;
}

interface TreeLevel {
	index: number;
	level: MapLevel;
	/** The files this level divides: the top level's sent files, or the files of the node it expands */
	scope: ReadonlySet<PathKey>;
}

/**
 * The levels from the top, parents before children, each with its scope. The parser has made
 * them one tree (one top level, unique node ids, every level reached once), so this only walks.
 */
function levelTree(map: RopemanMap, topScope: ReadonlySet<PathKey>): TreeLevel[] {
	const byParent = new Map(map.levels.map((level, li) => [level.parentId, li]));
	const top = byParent.get(null)!;
	const reached: TreeLevel[] = [{ index: top, level: map.levels[top], scope: topScope }];
	for (let i = 0; i < reached.length; i++) {
		for (const node of reached[i].level.nodes) {
			const child = byParent.get(node.id);
			if (child === undefined) continue;
			const scope = new Set(node.filePaths.map(key).filter((k) => reached[i].scope.has(k)));
			reached.push({ index: child, level: map.levels[child], scope });
		}
	}
	return reached;
}

/** Each file of the scope in exactly one node. Returns each node's files, for the edges. */
function checkAssignment(
	level: MapLevel,
	li: number,
	scope: ReadonlySet<PathKey>,
	known: Known,
	report: Report
): Map<string, ReadonlySet<PathKey>> {
	const at = `levels[${li}]`;
	if ((level.naming === 'grouped') !== (level.assignment === null)) {
		report(
			'assignment-counts',
			`${at}.assignment`,
			{ level: li },
			level.naming === 'grouped'
				? 'A grouped level has assignment counts.'
				: 'A named level has no assignment counts.'
		);
	}

	const owner = new Map<PathKey, string>();
	const owned = new Map<string, number>();
	const nodeFiles = new Map<string, ReadonlySet<PathKey>>();
	level.nodes.forEach((node, ni) => {
		const where = { level: li, nodeId: node.id };
		if (node.filePaths.length === 0) {
			report('node-empty', `${at}.nodes[${ni}].filePaths`, where, `${node.id} has no files.`);
		}
		const keys = new Set<PathKey>();
		node.filePaths.forEach((path, pi) => {
			const fat = `${at}.nodes[${ni}].filePaths[${pi}]`;
			const k = known(path, fat, where);
			if (k === null) return;
			keys.add(k);
			const first = owner.get(k);
			if (!scope.has(k)) {
				report(
					'file-outside-scope',
					fat,
					{ ...where, path },
					`${path} is not a file of the level's scope.`
				);
			} else if (first !== undefined) {
				report('file-duplicated', fat, { ...where, path }, `${path} is already in ${first}.`);
			} else {
				owner.set(k, node.id);
				owned.set(node.id, (owned.get(node.id) ?? 0) + 1);
			}
		});
		nodeFiles.set(node.id, keys);
	});
	for (const k of scope) {
		if (!owner.has(k)) {
			report('file-unassigned', at, { level: li, path: k }, `${k} is in no node of this level.`);
		}
	}

	// T0-7 moves the files the LLM left out into one node of their own, so one node holds that many
	const leftOut = level.assignment?.leftOut ?? 0;
	if (leftOut > 0 && ![...owned.values()].includes(leftOut)) {
		report(
			'assignment-left-out',
			`${at}.assignment.leftOut`,
			{ level: li },
			`leftOut says ${leftOut} files went to no node of the answer, but no node holds ${leftOut} files.`
		);
	}
	return nodeFiles;
}

type SymbolLookup = (path: PathKey) => ReadonlySet<string>;

/** Each key symbol is a name or a dotted name (`Store.load`) declared in a file of its node. */
function checkKeySymbols(
	level: MapLevel,
	li: number,
	nodeFiles: ReadonlyMap<string, ReadonlySet<PathKey>>,
	symbols: SymbolLookup,
	report: Report
): void {
	level.nodes.forEach((node, ni) => {
		const files = [...nodeFiles.get(node.id)!];
		node.keySymbols.forEach((name, si) => {
			if (files.some((path) => symbols(path).has(nfc(name)))) return;
			report(
				'key-symbol-unknown',
				`levels[${li}].nodes[${ni}].keySymbols[${si}]`,
				{ level: li, nodeId: node.id },
				`No file of ${node.id} declares ${JSON.stringify(name)}.`
			);
		});
	});
}

/** The names and dotted names a file declares, built on first use like the relation index. */
function symbolIndex(files: ReadonlyMap<PathKey, FileRecord>): SymbolLookup {
	const byFile = new Map<PathKey, Set<string>>();
	return (path) => {
		let names = byFile.get(path);
		if (!names) {
			const found = new Set<string>();
			const walk = (records: readonly SymbolRecord[], parent: string | null) => {
				for (const { name, children } of records) {
					const dotted = parent === null ? name : `${parent}.${name}`;
					found.add(nfc(name)).add(nfc(dotted));
					walk(children, dotted);
				}
			};
			walk(files.get(path)?.symbols ?? [], null);
			names = found;
			byFile.set(path, names);
		}
		return names;
	};
}

type RelationLookup = (
	path: PathKey,
	line: number,
	relation: string,
	toPath: PathKey
) => ReadonlySet<Confidence> | undefined;

/**
 * Every edge carries evidence whose refs are code relations from its source to its target. An
 * INFERRED edge with no refs passes (ADR-21) and goes to `unverified`.
 */
function checkEvidence(
	level: MapLevel,
	li: number,
	nodeFiles: ReadonlyMap<string, ReadonlySet<PathKey>>,
	relations: RelationLookup,
	known: Known,
	report: Report,
	unverified: UnverifiedEdge[]
): number {
	let refs = 0;
	level.edges.forEach((edge, ei) => {
		const at = `levels[${li}].edges[${ei}]`;
		const where = { level: li, nodeId: edge.source };
		// The parser puts both ends in this level
		const source = nodeFiles.get(edge.source)!;
		const target = nodeFiles.get(edge.target)!;
		if (edge.evidence === null) {
			report(
				'evidence-missing',
				`${at}.evidence`,
				where,
				`${edge.source} -> ${edge.target} has no evidence.`
			);
			return;
		}
		// The parser lets only INFERRED evidence cite nothing
		if (edge.evidence.refs.length === 0) {
			unverified.push({ at, level: li, source: edge.source, target: edge.target });
			return;
		}
		edge.evidence.refs.forEach((ref, ri) => {
			refs++;
			const rat = `${at}.evidence.refs[${ri}]`;
			const from = known(ref.path, `${rat}.path`, where);
			const to = known(ref.toPath, `${rat}.toPath`, where);
			if (from === null || to === null) return;
			const name = `${ref.path}:${ref.line} ${ref.relation} ${ref.toPath}`;
			if (!source.has(from) || !target.has(to)) {
				report(
					'evidence-ends',
					rat,
					{ ...where, path: ref.path },
					`${name} does not run from ${edge.source} to ${edge.target}.`
				);
			}
			const found = relations(from, ref.line, ref.relation, to);
			if (!found) {
				report(
					'evidence-unknown',
					rat,
					{ ...where, path: ref.path },
					`${name} is not a relation of the code map.`
				);
			} else if (!found.has(ref.confidence)) {
				report(
					'evidence-confidence',
					`${rat}.confidence`,
					{ ...where, path: ref.path },
					`${name} is ${[...found].join(' or ')} in the code map, not ${ref.confidence}.`
				);
			}
		});
	});
	return refs;
}

/**
 * The confidences the code map gives one relation, keyed as a `RelationRef` names it: the file,
 * the line, the relation kind and the target file. Built per file on first use, since a map
 * cites relations from a few files and a code map holds hundreds of thousands (PASEO).
 * `contains` and `method` stay inside one file, so they never back a relation between nodes.
 */
function relationIndex(
	files: ReadonlyMap<PathKey, FileRecord>,
	codeFiles: ReadonlyMap<FilePath, FileRecord>,
	repoPath: (path: string) => string
): RelationLookup {
	const byFile = new Map<PathKey, Map<string, Set<Confidence>>>();
	return (path, line, relation, toPath) => {
		let index = byFile.get(path);
		if (!index) {
			index = indexFile(files.get(path)!, codeFiles, repoPath);
			byFile.set(path, index);
		}
		return index.get(`${line}\n${relation}\n${toPath}`);
	};
}

function indexFile(
	record: FileRecord,
	codeFiles: ReadonlyMap<FilePath, FileRecord>,
	repoPath: (path: string) => string
): Map<string, Set<Confidence>> {
	const index = new Map<string, Set<Confidence>>();
	const add = (line: number, relation: string, to: Endpoint, confidence: Confidence) => {
		const file = endFile(to, codeFiles);
		if (file === null) return;
		const k = `${line}\n${relation}\n${key(repoPath(file))}`;
		const seen = index.get(k);
		if (seen) seen.add(confidence);
		else index.set(k, new Set([confidence]));
	};
	const bound = (
		line: number,
		relation: string,
		binding: Binding<Endpoint> | GuessBinding<Endpoint>
	) => {
		if (binding.state !== 'bound') return;
		for (const { to, provenance } of binding.candidates)
			add(line, relation, to, provenance.confidence);
	};

	for (const [sites, moduleRelation, nameRelation] of [
		[record.imports, 'imports_from', 'imports'],
		[record.reexports, 're_exports', 're_exports']
	] as const) {
		for (const site of sites) {
			bound(site.line, moduleRelation, site.module);
			for (const specifier of site.specifiers ?? [])
				bound(site.line, nameRelation, specifier.target);
		}
	}
	for (const ref of record.refs) bound(ref.line, ref.kind, ref.target);
	return index;
}

/**
 * The code map file an endpoint lies in; null for one outside the project. A SymbolId is
 * `${FilePath}#${names}`, and either side may hold a `#` (`a#b.ts`, a heading `C#`), so the file
 * is the longest prefix before a `#` that the code map has. An id with none names no file.
 */
function endFile(to: Endpoint, codeFiles: ReadonlyMap<FilePath, FileRecord>): FilePath | null {
	if (to.kind === 'file') return to.path;
	if (to.kind === 'external') return null;
	for (let hash = to.id.lastIndexOf('#'); hash > 0; hash = to.id.lastIndexOf('#', hash - 1)) {
		const path = to.id.slice(0, hash) as FilePath;
		if (codeFiles.has(path)) return path;
	}
	return null;
}
