/**
 * The deterministic checks of A-12. An LLM may write a map's names and relations; this module
 * decides whether the map is true to the code: every file in one node per level, every path a
 * file of the code map, every relation backed by a code relation of the confidence it claims.
 * Pure and synchronous, and it imports `$lib/types` only, so the browser, the bridge and
 * `packages/core` run the same code.
 */
import type {
	Binding,
	CodeMap,
	Confidence,
	Endpoint,
	FileRecord,
	GuessBinding
} from '$lib/types/codeMap';
import { COVERAGE_REASONS, type CoverageReason } from '$lib/types/coverage';
import type { MapVerification, Violation, ViolationCode } from '$lib/types/mapVerification';
import type { MapLevel, MapNode, RopemanMap } from '$lib/types/ropemanMap';

type Report = (
	code: ViolationCode,
	at: string,
	where: { level?: number; nodeId?: string; path?: string },
	message: string
) => void;

/** True for a path that is normalized and a file of the code map; reports any other path. */
type Known = (path: string, at: string, where: { level: number; nodeId: string }) => boolean;

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

/** Checks `map` against the code map it describes and reports every violation found. */
export function verifyMap(map: RopemanMap, codeMap: CodeMap): MapVerification {
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
	const files = new Map(
		[...codeMap.files.values()].map((record) => [repoPath(record.path), record])
	);
	const known: Known = (path, at, where) => {
		if (!isNormalizedPath(path)) {
			report(
				'path-invalid',
				at,
				{ ...where, path },
				`${JSON.stringify(path)} is not a normalized repo-relative path.`
			);
			return false;
		}
		if (!files.has(path)) {
			report('path-unknown', at, { ...where, path }, `${path} is not a file of the code map.`);
			return false;
		}
		return true;
	};

	const onMap = checkCoverage(map, files, report);
	const relations = relationIndex(files, repoPath);
	const checked = { files: map.files.length, levels: 0, nodes: 0, edges: 0, refs: 0 };

	for (const { index, level, scope } of levelTree(map, onMap, report)) {
		const nodeFiles = checkAssignment(level, index, scope, known, report);
		const refs = checkEvidence(level, index, nodeFiles, relations, known, report);
		checked.levels++;
		checked.nodes += level.nodes.length;
		checked.edges += level.edges.length;
		checked.refs += refs;
	}
	return { violations, checked };
}

/**
 * `files` names every file of the code map once, with a reason that agrees with it. Returns the
 * files marked sent that the code map has: the scope the top level divides.
 */
function checkCoverage(
	map: RopemanMap,
	files: ReadonlyMap<string, FileRecord>,
	report: Report
): Set<string> {
	const listed = new Set<string>();
	const sent = new Set<string>();
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
		if (listed.has(path)) {
			report('coverage-duplicate', `${at}.path`, { path }, `${path} is listed twice.`);
			return;
		}
		listed.add(path);
		if (READ_REASONS.has(reason) !== files.has(path)) {
			report(
				'coverage-mismatch',
				`${at}.reason`,
				{ path },
				files.has(path)
					? `${path} is in the code map, but its reason ${reason} says it was not read.`
					: `${path} is not in the code map, but its reason ${reason} says it was read.`
			);
			return;
		}
		if (COVERAGE_REASONS[reason] === 'sent') sent.add(path);
	});
	for (const path of files.keys()) {
		if (!listed.has(path)) {
			report('coverage-missing', 'files', { path }, `${path} is in the code map but not in files.`);
		}
	}
	return sent;
}

interface TreeLevel {
	index: number;
	level: MapLevel;
	/** The files this level divides: the top level's sent files, or the files of the node it expands */
	scope: ReadonlySet<string>;
}

/**
 * The levels reached from the top, parents before children, each with its scope. A level off
 * the tree (a second top level, an unknown or twice-expanded parent, a cycle) is reported once
 * and not checked further.
 */
function levelTree(map: RopemanMap, topScope: Set<string>, report: Report): TreeLevel[] {
	const nodes = new Map<string, MapNode>();
	map.levels.forEach((level, li) =>
		level.nodes.forEach((node, ni) => {
			if (nodes.has(node.id)) {
				report(
					'node-id-duplicate',
					`levels[${li}].nodes[${ni}].id`,
					{ level: li, nodeId: node.id },
					`Another node already has the id ${node.id}.`
				);
			} else nodes.set(node.id, node);
		})
	);

	const byParent = new Map<string | null, number>();
	const offTree = new Set<number>();
	map.levels.forEach(({ parentId }, li) => {
		const at = `levels[${li}].parentId`;
		if (byParent.has(parentId)) {
			offTree.add(li);
			if (parentId === null)
				report('level-root', at, { level: li }, 'A second level has no parent.');
			else
				report(
					'level-parent-twice',
					at,
					{ level: li, nodeId: parentId },
					`Another level already expands ${parentId}.`
				);
		} else if (parentId !== null && !nodes.has(parentId)) {
			offTree.add(li);
			report(
				'level-parent-unknown',
				at,
				{ level: li, nodeId: parentId },
				`No node has the id ${parentId}.`
			);
		} else byParent.set(parentId, li);
	});

	const top = byParent.get(null);
	if (top === undefined) {
		report('level-root', 'levels', {}, 'No level has a null parentId.');
		return [];
	}

	const reached: TreeLevel[] = [{ index: top, level: map.levels[top], scope: topScope }];
	const seen = new Set([top]);
	for (let i = 0; i < reached.length; i++) {
		for (const node of reached[i].level.nodes) {
			const child = byParent.get(node.id);
			if (child === undefined || seen.has(child)) continue;
			seen.add(child);
			const scope = new Set(node.filePaths.filter((path) => reached[i].scope.has(path)));
			reached.push({ index: child, level: map.levels[child], scope });
		}
	}
	map.levels.forEach(({ parentId }, li) => {
		if (!seen.has(li) && !offTree.has(li)) {
			report(
				'level-unreachable',
				`levels[${li}].parentId`,
				{ level: li, nodeId: parentId ?? undefined },
				`This level is not reached from the top level.`
			);
		}
	});
	return reached;
}

/** Each file of the scope in exactly one node. Returns each node's files, for the edges. */
function checkAssignment(
	level: MapLevel,
	li: number,
	scope: ReadonlySet<string>,
	known: Known,
	report: Report
): Map<string, ReadonlySet<string>> {
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

	const owner = new Map<string, string>();
	const nodeFiles = new Map<string, ReadonlySet<string>>();
	level.nodes.forEach((node, ni) => {
		const where = { level: li, nodeId: node.id };
		if (node.filePaths.length === 0) {
			report('node-empty', `${at}.nodes[${ni}].filePaths`, where, `${node.id} has no files.`);
		}
		node.filePaths.forEach((path, pi) => {
			const fat = `${at}.nodes[${ni}].filePaths[${pi}]`;
			if (!known(path, fat, where)) return;
			const first = owner.get(path);
			if (!scope.has(path)) {
				report(
					'file-outside-scope',
					fat,
					{ ...where, path },
					`${path} is not a file of the level's scope.`
				);
			} else if (first !== undefined) {
				report('file-duplicated', fat, { ...where, path }, `${path} is already in ${first}.`);
			} else owner.set(path, node.id);
		});
		nodeFiles.set(node.id, new Set(node.filePaths));
	});
	for (const path of scope) {
		if (!owner.has(path)) {
			report('file-unassigned', at, { level: li, path }, `${path} is in no node of this level.`);
		}
	}
	return nodeFiles;
}

type RelationLookup = (ref: {
	path: string;
	line: number;
	relation: string;
	toPath: string;
}) => ReadonlySet<Confidence> | undefined;

/** Every edge carries evidence whose refs are code relations from its source to its target. */
function checkEvidence(
	level: MapLevel,
	li: number,
	nodeFiles: ReadonlyMap<string, ReadonlySet<string>>,
	relations: RelationLookup,
	known: Known,
	report: Report
): number {
	let refs = 0;
	level.edges.forEach((edge, ei) => {
		const at = `levels[${li}].edges[${ei}]`;
		const where = { level: li, nodeId: edge.source };
		const source = nodeFiles.get(edge.source);
		const target = nodeFiles.get(edge.target);
		for (const [end, files] of [
			['source', source],
			['target', target]
		] as const) {
			if (!files) {
				report(
					'edge-end-unknown',
					`${at}.${end}`,
					where,
					`${edge[end]} is not a node of this level.`
				);
			}
		}
		if (!source || !target) return;
		if (edge.evidence === null) {
			report(
				'evidence-missing',
				`${at}.evidence`,
				where,
				`${edge.source} -> ${edge.target} has no evidence.`
			);
			return;
		}
		edge.evidence.refs.forEach((ref, ri) => {
			refs++;
			const rat = `${at}.evidence.refs[${ri}]`;
			const fromKnown = known(ref.path, `${rat}.path`, where);
			const toKnown = known(ref.toPath, `${rat}.toPath`, where);
			if (!fromKnown || !toKnown) return;
			const name = `${ref.path}:${ref.line} ${ref.relation} ${ref.toPath}`;
			if (!source.has(ref.path) || !target.has(ref.toPath)) {
				report(
					'evidence-ends',
					rat,
					{ ...where, path: ref.path },
					`${name} does not run from ${edge.source} to ${edge.target}.`
				);
			}
			const found = relations(ref);
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
	files: ReadonlyMap<string, FileRecord>,
	repoPath: (path: string) => string
): RelationLookup {
	const byFile = new Map<string, Map<string, Set<Confidence>>>();
	return ({ path, line, relation, toPath }) => {
		let index = byFile.get(path);
		if (!index) {
			const record = files.get(path);
			if (!record) return undefined;
			index = indexFile(record, repoPath);
			byFile.set(path, index);
		}
		return index.get(`${line}\n${relation}\n${toPath}`);
	};
}

function indexFile(
	record: FileRecord,
	repoPath: (path: string) => string
): Map<string, Set<Confidence>> {
	const index = new Map<string, Set<Confidence>>();
	const add = (line: number, relation: string, to: Endpoint, confidence: Confidence) => {
		const file = endFile(to);
		if (file === null) return;
		const key = `${line}\n${relation}\n${repoPath(file)}`;
		const known = index.get(key);
		if (known) known.add(confidence);
		else index.set(key, new Set([confidence]));
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

/** The code map file an endpoint lies in; null for one outside the project. */
function endFile(to: Endpoint): string | null {
	if (to.kind === 'file') return to.path;
	// A SymbolId is `${FilePath}#${names}`, and names hold no `#`
	if (to.kind === 'symbol') return to.id.slice(0, to.id.lastIndexOf('#'));
	return null;
}
