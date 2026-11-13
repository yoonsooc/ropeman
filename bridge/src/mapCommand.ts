import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { extractDirectory, type Extraction } from '../../packages/core/src/extract';
import { groupExtraction, type GroupedMap } from '../../packages/core/src/groupedMap';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { parseRopemanMap } from '../../src/lib/services/ropemanMapSchema';
import { DEFAULT_PATH_FILTER, shouldSkipPath } from '../../src/lib/utils/filePriority';
import type { CodeMap } from '../../src/lib/types/codeMap';
import type { CoverageReason } from '../../src/lib/types/coverage';
import type { Violation, ViolationCode } from '../../src/lib/types/mapVerification';
import {
	MAP_FORMAT,
	MAP_SCHEMA_VERSION,
	type MapFailure,
	type MapLevel,
	type RopemanMap
} from '../../src/lib/types/ropemanMap';
import { resolveRoot } from './fileRead.js';
import { applyNames, parseNamingAnswer, summarizePart, type PartSummary } from './naming.js';
import { MAP_FILE, NAMES_FILE, WORK_FILE, readQueue, writeAtomic } from './workFolder.js';

/**
 * `ropeman map`, `verify` and `next`: the agent the user talks to names the map, one stage
 * (depth) at a time, then the folders the user opened in the browser (`queue.json`). `map`
 * extracts the root, applies the names the agent wrote to `names.json`, keeps the levels the
 * verifier passes, writes `ropeman.json`, and lists what to name next in `work.json`. The agent
 * only writes words; which files a node holds and every relation stay deterministic (A-12).
 * Each run starts from the files on disk, so a rerun after a crash or an edit converges.
 */

export const DEFAULT_DEPTH = 2;

/** What the agent writes per node id: the same fields serve asks its CLI for. */
export type NamesInput = ReadonlyMap<string, unknown>;

/** Problems with the agent's names; verifier codes keep the verifier's meaning. */
export type ProblemCode =
	| 'names-unreadable'
	| 'node-unknown'
	| 'name-missing'
	| 'name-invalid'
	| 'map-invalid'
	| ViolationCode;

export interface Problem {
	code: ProblemCode;
	/** The node the level expands (null for the top level); null when the problem is the whole file */
	level: string | null;
	nodeId: string | null;
	message: string;
}

/** One level of the grouped map, in tree order. */
interface Slot {
	parentId: string | null;
	depth: number;
	folder: string;
	grouped: MapLevel;
}

type SlotState =
	| { kind: 'grouped' }
	| { kind: 'named'; level: MapLevel }
	| { kind: 'rejected'; problems: Problem[] };

export interface WorkLevel {
	level: string | null;
	/** The user opened this folder in the browser; serve shows its names once `map` keeps them */
	queued: boolean;
	folder: string;
	/** The parent's name, when the stage above named it */
	parent: { label: string; description: string } | null;
	parts: PartSummary[];
	imports: { from: string; to: string; imports: number }[];
	/** Why the names written for this level were refused last run */
	problems: Problem[];
}

export interface Work {
	project: string;
	/** The stage `levels` names, or null when only queued folders are left */
	stage: number | null;
	levels: WorkLevel[];
}

export interface Coverage {
	/** Every file the walk listed (skipped folders such as node_modules are not walked) */
	listed: number;
	/** Files in the map, read or skipped with a reason */
	inMap: number;
	byReason: Partial<Record<CoverageReason, number>>;
	/** Listed files in no language the extractor reads (docs, images, data) */
	noGrammar: number;
	/** The first skipped files, with why */
	skippedExamples: { path: string; reason: CoverageReason }[];
}

export interface MapReport {
	done: boolean;
	coverage: Coverage;
	verification: { violations: number; levels: number; nodes: number; edges: number };
	stages: { depth: number; levels: number; named: number }[];
	problems: Problem[];
	next: { stage: number | null; queued: number; levels: number; parts: number } | null;
}

const SKIPPED_EXAMPLES = 20;

function slotsOf(grouped: GroupedMap): Slot[] {
	const slots: Slot[] = [];
	const visit = (level: MapLevel, depth: number, folder: string) => {
		slots.push({ parentId: level.parentId, depth, folder, grouped: level });
		for (const node of level.nodes) {
			const child = grouped.expand(node.id);
			if (child) visit(child, depth + 1, grouped.group(node.id)!.path);
		}
	};
	visit(grouped.top, 1, '');
	return slots;
}

/** `names.json` as text, or null when the agent has not written one yet. */
export function parseNames(text: string | null): { names: NamesInput; problems: Problem[] } {
	if (text === null) return { names: new Map(), problems: [] };
	const unreadable = (message: string) => ({
		names: new Map(),
		problems: [{ code: 'names-unreadable' as const, level: null, nodeId: null, message }]
	});
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return unreadable(`${NAMES_FILE} is not valid JSON.`);
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return unreadable(`${NAMES_FILE} must be one JSON object keyed by node id.`);
	}
	return { names: new Map(Object.entries(value)), problems: [] };
}

/** The level's names, or why they cannot be applied; null when the agent named none of it. */
function stateOf(slot: Slot, names: NamesInput): SlotState {
	const entries = slot.grouped.nodes.map((node) => ({ node, entry: names.get(node.id) }));
	if (entries.every((e) => e.entry === undefined)) return { kind: 'grouped' };
	const problem = (code: ProblemCode, nodeId: string | null, message: string): Problem => ({
		code,
		level: slot.parentId,
		nodeId,
		message
	});
	const missing = entries.filter((e) => e.entry === undefined);
	if (missing.length > 0) {
		return {
			kind: 'rejected',
			problems: missing.map(({ node }) =>
				problem(
					'name-missing',
					node.id,
					`${node.id} has no name; name every part of a level or none of them.`
				)
			)
		};
	}
	const answer = parseNamingAnswer(
		JSON.stringify({
			nodes: entries.map(({ node, entry }) => ({ ...(entry as object), id: node.id }))
		})
	);
	if (!answer.ok) {
		return {
			kind: 'rejected',
			problems: answer.problems.map((message) => problem('name-invalid', null, message))
		};
	}
	return { kind: 'named', level: applyNames(slot.grouped, answer.names) };
}

function compose(
	project: string,
	generator: RopemanMap['generator'],
	generatedAt: string,
	grouped: GroupedMap,
	levels: MapLevel[]
): RopemanMap {
	return {
		format: MAP_FORMAT,
		schemaVersion: MAP_SCHEMA_VERSION,
		project: { name: project },
		generator,
		generatedAt,
		files: grouped.files,
		levels
	};
}

const levelIndex = (at: string | null) => {
	const match = at?.match(/^levels\[(\d+)\]/);
	return match ? Number(match[1]) : null;
};

function coverageOf(extraction: Extraction, grouped: GroupedMap): Coverage {
	const byReason: Partial<Record<CoverageReason, number>> = {};
	for (const file of grouped.files) byReason[file.reason] = (byReason[file.reason] ?? 0) + 1;
	return {
		listed: extraction.listed,
		inMap: grouped.files.length,
		byReason,
		noGrammar: extraction.listed - grouped.files.length,
		skippedExamples: grouped.files
			.filter((f) => f.reason !== 'sent')
			.slice(0, SKIPPED_EXAMPLES)
			.map(({ path, reason }) => ({ path, reason }))
	};
}

export interface NamedMap {
	map: RopemanMap;
	report: MapReport;
	work: Work;
}

/**
 * The map with every level the names complete and the verifier passes, every other level
 * grouped, so the result always verifies; the refused names come back as problems.
 */
export function buildNamedMap(input: {
	extraction: Extraction;
	project: string;
	names: NamesInput;
	nameProblems: Problem[];
	depth: number;
	/** Node ids the user opened in the browser, from `queue.json` */
	queued: readonly string[];
	generator: RopemanMap['generator'];
	generatedAt: string;
}): NamedMap {
	const { extraction, project, names, depth } = input;
	const codeMap: CodeMap = extraction.map;
	const grouped = groupExtraction(extraction, project);
	const slots = slotsOf(grouped);
	const problems: Problem[] = [...input.nameProblems];

	const known = new Set(slots.flatMap((s) => s.grouped.nodes.map((n) => n.id)));
	for (const id of names.keys()) {
		if (!known.has(id)) {
			problems.push({
				code: 'node-unknown',
				level: null,
				nodeId: id,
				message: `${id} is not a node of the map; use the part ids from ${WORK_FILE}.`
			});
		}
	}

	const states = slots.map((slot) => stateOf(slot, names));
	const levels = () =>
		slots.map((slot, i) => {
			const state = states[i];
			return state.kind === 'named' ? state.level : slot.grouped;
		});
	const reject = (i: number, found: Problem[]) => {
		states[i] = { kind: 'rejected', problems: found };
	};

	// A parser failure names one field; that level goes back to grouped until the map parses
	for (;;) {
		const result = verifyMap(
			compose(project, input.generator, input.generatedAt, grouped, levels()),
			codeMap
		);
		if (result.parsed) {
			const byLevel = new Map<number, Violation[]>();
			for (const v of result.violations) {
				if (v.level === null || states[v.level]?.kind !== 'named') {
					throw new Error(`The deterministic map failed the verifier: ${v.at}: ${v.message}`);
				}
				byLevel.set(v.level, [...(byLevel.get(v.level) ?? []), v]);
			}
			if (byLevel.size === 0) break;
			for (const [i, found] of byLevel) {
				reject(
					i,
					found.map((v) => ({
						code: v.code,
						level: slots[i].parentId,
						nodeId: v.nodeId,
						message: v.message
					}))
				);
			}
			continue;
		}
		const i = levelIndex(result.failure.at);
		if (i === null || states[i]?.kind !== 'named') {
			throw new Error(`The deterministic map failed to parse: ${result.failure.message}`);
		}
		reject(i, [
			{
				code: 'map-invalid',
				level: slots[i].parentId,
				nodeId: null,
				message: `${result.failure.at}: ${result.failure.message}`
			}
		]);
	}

	const map = compose(project, input.generator, input.generatedAt, grouped, levels());
	const final = verifyMap(map, codeMap);
	if (!final.parsed || final.violations.length > 0) {
		throw new Error('The map failed the verifier after the refused names were dropped.');
	}
	for (const state of states) if (state.kind === 'rejected') problems.push(...state.problems);

	const stages: MapReport['stages'] = [];
	for (let d = 1; d <= depth; d++) {
		const at = slots.flatMap((s, i) => (s.depth === d ? [i] : []));
		if (at.length === 0) break;
		stages.push({
			depth: d,
			levels: at.length,
			named: at.filter((i) => states[i].kind === 'named').length
		});
	}
	const stage = stages.find((s) => s.named < s.levels)?.depth ?? null;

	const namedNode = new Map<string, { label: string; description: string }>();
	for (const state of states) {
		if (state.kind !== 'named') continue;
		for (const n of state.level.nodes) {
			namedNode.set(n.id, { label: n.label, description: n.description });
		}
	}
	const queued = new Set(input.queued);
	const workLevels: WorkLevel[] = slots.flatMap((slot, i) => {
		const state = states[i];
		const isQueued = slot.parentId !== null && queued.has(slot.parentId);
		if (state.kind === 'named' || (slot.depth !== stage && !isQueued)) return [];
		return [
			{
				level: slot.parentId,
				queued: isQueued,
				folder: slot.folder,
				parent: slot.parentId ? (namedNode.get(slot.parentId) ?? null) : null,
				parts: slot.grouped.nodes.map((node) => summarizePart(node, codeMap)),
				imports: slot.grouped.edges.map((edge) => ({
					from: edge.source,
					to: edge.target,
					imports: edge.evidence?.refs.length ?? 0
				})),
				problems: state.kind === 'rejected' ? state.problems : []
			}
		];
	});

	const report: MapReport = {
		done: workLevels.length === 0 && problems.length === 0,
		coverage: coverageOf(extraction, grouped),
		verification: {
			violations: final.violations.length,
			levels: final.checked.levels,
			nodes: final.checked.nodes,
			edges: final.checked.edges
		},
		stages,
		problems,
		next:
			workLevels.length === 0
				? null
				: {
						stage,
						queued: workLevels.filter((l) => l.queued).length,
						levels: workLevels.length,
						parts: workLevels.reduce((n, l) => n + l.parts.length, 0)
					}
	};
	return { map, report, work: { project, stage, levels: workLevels } };
}

// --- The commands ---------------------------------------------------------------------------

export interface CommandEnv {
	wasmDir: string;
	generator: RopemanMap['generator'];
	out: (text: string) => void;
	err: (text: string) => void;
	now?: () => Date;
}

class UsageError extends Error {}

const MAP_USAGE = 'usage: ropeman map --root <repo> --out <folder> [--depth <n>]';
const VERIFY_USAGE = 'usage: ropeman verify --root <repo> --map <ropeman.json>';
const NEXT_USAGE = 'usage: ropeman next --out <folder> [--timeout <seconds>]';
/** Under the two minutes most agent shells give a command by default */
export const DEFAULT_NEXT_TIMEOUT_S = 90;
const NEXT_POLL_MS = 500;

function options(args: string[], names: string[], usage: string) {
	const spec = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]));
	try {
		return parseArgs({ args, options: spec, strict: true }).values as Record<
			string,
			string | undefined
		>;
	} catch (err) {
		throw new UsageError(`${(err as Error).message}\n${usage}`);
	}
}

function rootOf(value: string | undefined, usage: string): string {
	if (!value) throw new UsageError(`--root is required.\n${usage}`);
	try {
		return resolveRoot(value);
	} catch (err) {
		throw new UsageError(`--root ${value}: ${(err as Error).message}`);
	}
}

/**
 * The output folder, created if needed. Inside the root it must be a folder the walk skips
 * (`.ropeman`), or the map would list its own files and serve would re-extract on every write.
 */
export function outFolder(root: string, value: string | undefined): string {
	if (!value) throw new UsageError(`--out is required.\n${MAP_USAGE}`);
	fs.mkdirSync(value, { recursive: true });
	const out = fs.realpathSync.native(value);
	const rel = path.relative(root, out);
	const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
	if (inside && (rel === '' || !shouldSkipPath(`${rel.split(path.sep).join('/')}/`))) {
		throw new UsageError(
			`--out ${value} is inside the repo; use a hidden folder such as .ropeman, or a folder outside it.`
		);
	}
	return out;
}

function extract(root: string, env: CommandEnv): Promise<Extraction> {
	const started = performance.now();
	return extractDirectory(root, { wasmDir: env.wasmDir }).then((extraction) => {
		const seconds = ((performance.now() - started) / 1000).toFixed(1);
		env.err(`Extracted ${extraction.map.files.size} files of ${extraction.listed} in ${seconds}s`);
		return extraction;
	});
}

export async function runMap(args: string[], env: CommandEnv): Promise<number> {
	const values = options(args, ['root', 'out', 'depth'], MAP_USAGE);
	const root = rootOf(values.root, MAP_USAGE);
	const depth = values.depth === undefined ? DEFAULT_DEPTH : Number(values.depth);
	if (!Number.isInteger(depth) || depth < 1) {
		throw new UsageError(`--depth must be a whole number from 1.\n${MAP_USAGE}`);
	}
	const out = outFolder(root, values.out);
	const namesPath = path.join(out, NAMES_FILE);
	const namesText = fs.existsSync(namesPath) ? fs.readFileSync(namesPath, 'utf8') : null;
	const { names, problems } = parseNames(namesText);

	const built = buildNamedMap({
		extraction: await extract(root, env),
		project: path.basename(root),
		names,
		nameProblems: problems,
		depth,
		queued: readQueue(out),
		generator: env.generator,
		generatedAt: (env.now?.() ?? new Date()).toISOString()
	});
	const mapPath = path.join(out, MAP_FILE);
	const workPath = path.join(out, WORK_FILE);
	writeAtomic(mapPath, JSON.stringify(built.map));
	writeAtomic(workPath, `${JSON.stringify(built.work, null, 1)}\n`);
	env.out(
		JSON.stringify(
			{ ...built.report, files: { map: mapPath, work: workPath, names: namesPath } },
			null,
			1
		)
	);
	return built.report.problems.length > 0 ? 1 : 0;
}

export async function runVerify(args: string[], env: CommandEnv): Promise<number> {
	const values = options(args, ['root', 'map'], VERIFY_USAGE);
	const root = rootOf(values.root, VERIFY_USAGE);
	if (!values.map) throw new UsageError(`--map is required.\n${VERIFY_USAGE}`);
	let text: string;
	try {
		text = fs.readFileSync(values.map, 'utf8');
	} catch (err) {
		throw new UsageError(`--map ${values.map}: ${(err as Error).message}`);
	}
	const report = (value: object) => env.out(JSON.stringify(value, null, 1));
	const refused = (f: MapFailure) => {
		report({ ok: false, failure: { code: f.code, at: f.at, message: f.message } });
		return 1;
	};
	const parsed = parseRopemanMap(text);
	if (!parsed.ok) return refused(parsed);
	const result = verifyMap(parsed.value, (await extract(root, env)).map);
	if (!result.parsed) return refused(result.failure);
	report({
		ok: result.violations.length === 0,
		violations: result.violations,
		unverifiedEdges: result.unverified.length,
		checked: result.checked
	});
	return result.violations.length === 0 ? 0 : 1;
}

/** The levels `ropeman.json` names, by the node they expand; re-read only when the file changes. */
function namedLevelsReader(file: string): () => Set<string> {
	let seen = -1;
	let named = new Set<string>();
	return () => {
		const mtime = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
		if (mtime === seen) return named;
		seen = mtime;
		try {
			const levels = (JSON.parse(fs.readFileSync(file, 'utf8')) as RopemanMap).levels ?? [];
			named = new Set(
				levels.flatMap((l) => (l.naming === 'named' && l.parentId ? [l.parentId] : []))
			);
		} catch {
			named = new Set();
		}
		return named;
	};
}

/**
 * Waits until the browser has queued a folder `ropeman.json` does not name yet and prints the
 * queued ids, or prints none when `--timeout` passes, so an agent can loop on it ("follow in
 * the browser"). It only reads files, so any number of runs may wait at once.
 */
export async function runNext(args: string[], env: CommandEnv): Promise<number> {
	const values = options(args, ['out', 'timeout'], NEXT_USAGE);
	if (!values.out) throw new UsageError(`--out is required.\n${NEXT_USAGE}`);
	if (!fs.statSync(values.out, { throwIfNoEntry: false })?.isDirectory()) {
		throw new UsageError(`--out ${values.out} is not a folder; run ropeman map first.`);
	}
	const seconds = values.timeout === undefined ? DEFAULT_NEXT_TIMEOUT_S : Number(values.timeout);
	if (!(seconds >= 0))
		throw new UsageError(`--timeout must be a number of seconds, 0 to check once.\n${NEXT_USAGE}`);
	const out = values.out;
	const named = namedLevelsReader(path.join(out, MAP_FILE));
	const end = Date.now() + seconds * 1000;
	for (;;) {
		const pending = readQueue(out).filter((id) => !named().has(id));
		if (pending.length > 0 || Date.now() >= end) {
			env.out(JSON.stringify({ queued: pending, timedOut: pending.length === 0 }, null, 1));
			return 0;
		}
		await new Promise((resolve) => setTimeout(resolve, Math.min(NEXT_POLL_MS, end - Date.now())));
	}
}

/** Runs a subcommand: 0 passed, 1 problems reported on stdout, 2 bad arguments or a failed read. */
export async function runCommand(
	command: (args: string[], env: CommandEnv) => Promise<number>,
	args: string[],
	env: CommandEnv
): Promise<number> {
	try {
		return await command(args, env);
	} catch (err) {
		env.err(`ropeman: ${(err as Error).message}`);
		return 2;
	}
}
