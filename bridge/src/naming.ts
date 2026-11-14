import type { CodeMap, FilePath } from '../../src/lib/types/codeMap.js';
import type { MapEdge, MapLevel, MapNode } from '../../src/lib/types/ropemanMap.js';
import { CliError } from './cli.js';
import { isEnvValueFile } from './fileRead.js';

/**
 * Naming one expanded node: the CLI gets the structure of the node's parts and answers with a
 * name, a sentence and key symbols for each part. Files stay where the deterministic grouping
 * put them, so the CLI only writes words and the verifier decides whether to keep them (A-12).
 */

/** The prompt goes to `gemini -p` as one argv string, and Linux caps one at 128 KiB. */
export const MAX_PROMPT_BYTES = 100_000;
/** A level with more parts than this is left grouped: no answer names that many reliably. */
export const MAX_PARTS = 80;
export const MAX_ATTEMPTS = 2;
const LABEL_MAX = 60;
const DESCRIPTION_MAX = 280;
const KEY_SYMBOLS_MAX = 6;
/** Starting sample sizes per part; halved until the prompt fits MAX_PROMPT_BYTES. */
const SAMPLE_FILES = 12;
const SAMPLE_SYMBOLS = 24;
/** Declared names that say what code does. Config kinds (`command`, `key`) can quote values. */
const PROMPT_SYMBOL_KINDS: ReadonlySet<string> = new Set([
	'function',
	'class',
	'interface',
	'type',
	'variable',
	'service',
	'target',
	'job',
	'resource'
]);

export interface NamingTarget {
	project: string;
	/** The node being expanded */
	nodeId: string;
	/** Its folder, repo-relative */
	folder: string;
	/** Its grouped level: the parts to name */
	level: MapLevel;
	/** The user's agent's `brief.md` (intent, terms, naming rules), already cut to size */
	brief?: string | null;
	/** The name the folder itself got one level up */
	parent?: { label: string; description: string } | null;
}

/** What the prompt says about one part. Paths and names only, never a line of a file. */
export interface PartSummary {
	id: string;
	kind: 'subfolder' | 'files directly in the folder';
	files: number;
	sampleFiles: string[];
	symbols: string[];
}

function summarize(
	node: MapNode,
	codeMap: CodeMap,
	maxFiles: number,
	maxSymbols: number
): PartSummary {
	const files = node.filePaths.filter((path) => !isEnvValueFile(path));
	const symbols = new Set<string>();
	for (const path of files) {
		if (symbols.size >= maxSymbols) break;
		const record = codeMap.files.get(path as FilePath);
		for (const symbol of record?.symbols ?? []) {
			if (symbols.size >= maxSymbols) break;
			if (PROMPT_SYMBOL_KINDS.has(symbol.kind)) symbols.add(`${symbol.kind} ${symbol.name}`);
		}
	}
	return {
		id: node.id,
		kind: node.id.startsWith('files:') ? 'files directly in the folder' : 'subfolder',
		files: files.length,
		sampleFiles: files.slice(0, maxFiles),
		symbols: [...symbols]
	};
}

/**
 * The import statements behind an edge. Its evidence also cites the calls and class bases the
 * code decides (`fileRelations`); the prompt counts imports, as it says.
 */
export const importCount = (edge: MapEdge): number =>
	edge.evidence?.refs.filter((ref) => ref.relation === 'imports_from').length ?? 0;

/** One part at the starting sample sizes, for `ropeman map`'s work list. */
export const summarizePart = (node: MapNode, codeMap: CodeMap) =>
	summarize(node, codeMap, SAMPLE_FILES, SAMPLE_SYMBOLS);

function render(target: NamingTarget, parts: PartSummary[], feedback: readonly string[]): string {
	const links = target.level.edges.map((edge) => ({
		from: edge.source,
		to: edge.target,
		imports: importCount(edge)
	}));
	const lines = [
		'You name the parts of one folder of a code map. You see structure only: file paths, declared symbol names and import counts between parts. You see no file contents.',
		'',
		`Project: ${target.project}`,
		`Folder: ${target.folder}`,
		...(target.parent
			? [`This folder is named: ${target.parent.label}. ${target.parent.description}`]
			: []),
		...(target.brief
			? [
					'Brief from the agent the user works with (intent, terms, naming conventions; follow its naming conventions):',
					target.brief,
					'End of brief.'
				]
			: []),
		'Parts:',
		JSON.stringify(parts),
		'Imports between parts:',
		JSON.stringify(links),
		'',
		'Answer with one JSON object and nothing else, in this shape:',
		'{"nodes":[{"id":"<a part id>","label":"<what the part does, 2 to 5 words>","description":"<one sentence>","keySymbols":["<a name from that part>"]}]}',
		`Rules: list every part id exactly once and no other id. label is at most ${LABEL_MAX} characters, description at most ${DESCRIPTION_MAX}. keySymbols has at most ${KEY_SYMBOLS_MAX} names, each the name after the kind in that part's "symbols" (for "function parseArgs" write "parseArgs").`
	];
	if (feedback.length > 0) {
		lines.push('', 'Your previous answer was refused for these reasons:');
		for (const problem of feedback) lines.push(`- ${problem}`);
		lines.push('Answer again with every reason fixed.');
	}
	return lines.join('\n');
}

/**
 * The prompt for `target`, or null when its parts cannot fit MAX_PROMPT_BYTES. Samples shrink
 * by half until the prompt fits, so the same target always gives the same prompt.
 */
export function buildNamingPrompt(
	target: NamingTarget,
	codeMap: CodeMap,
	feedback: readonly string[] = []
): string | null {
	if (target.level.nodes.length > MAX_PARTS) return null;
	for (let files = SAMPLE_FILES, symbols = SAMPLE_SYMBOLS; ; ) {
		const parts = target.level.nodes.map((node) => summarize(node, codeMap, files, symbols));
		const prompt = render(target, parts, feedback);
		if (Buffer.byteLength(prompt) <= MAX_PROMPT_BYTES) return prompt;
		if (files === 0 && symbols === 0) return null;
		files >>= 1;
		symbols >>= 1;
	}
}

export interface PartNames {
	id: string;
	label: string;
	description: string;
	keySymbols: string[];
}

export type AnswerParse = { ok: true; names: PartNames[] } | { ok: false; problems: string[] };

/** The JSON object in `text`, which a model may wrap in prose or a code fence. */
function jsonObject(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start === -1 || end < start) return undefined;
		try {
			return JSON.parse(text.slice(start, end + 1));
		} catch {
			return undefined;
		}
	}
}

/** Reads the model's answer into names. Ids are not checked here: the verifier does that. */
export function parseNamingAnswer(text: string): AnswerParse {
	const value = jsonObject(text);
	const nodes = (value as { nodes?: unknown } | undefined)?.nodes;
	if (!Array.isArray(nodes)) {
		return { ok: false, problems: ['The answer was not a JSON object with a "nodes" array.'] };
	}
	const problems: string[] = [];
	const names: PartNames[] = [];
	nodes.forEach((raw: unknown, i) => {
		const at = `nodes[${i}]`;
		const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
		const { id, label, description, keySymbols } = o;
		if (typeof id !== 'string' || id === '') return problems.push(`${at}.id is not a part id.`);
		if (typeof label !== 'string' || label.trim() === '' || label.length > LABEL_MAX) {
			return problems.push(`${at}.label for ${id} must be 1 to ${LABEL_MAX} characters.`);
		}
		if (typeof description !== 'string' || description.length > DESCRIPTION_MAX) {
			return problems.push(
				`${at}.description for ${id} must be a string of at most ${DESCRIPTION_MAX} characters.`
			);
		}
		if (
			!Array.isArray(keySymbols) ||
			keySymbols.length > KEY_SYMBOLS_MAX ||
			!keySymbols.every((s) => typeof s === 'string' && s !== '')
		) {
			return problems.push(`${at}.keySymbols for ${id} must be at most ${KEY_SYMBOLS_MAX} names.`);
		}
		names.push({ id, label: label.trim(), description: description.trim(), keySymbols });
	});
	return problems.length > 0 ? { ok: false, problems } : { ok: true, names };
}

/**
 * The named level: the answer's words on the grouped level's files and edges. A part the answer
 * invents gets no files and a part it leaves out keeps its files in no node, so the verifier
 * reports both (`node-empty`, `file-unassigned`).
 */
export function applyNames(level: MapLevel, names: readonly PartNames[]): MapLevel {
	const files = new Map(level.nodes.map((node) => [node.id, node.filePaths]));
	return {
		parentId: level.parentId,
		naming: 'named',
		nodes: names.map((n) => ({
			id: n.id,
			label: n.label,
			description: n.description,
			filePaths: files.get(n.id) ?? [],
			keySymbols: n.keySymbols
		})),
		edges: level.edges,
		assignment: { leftOut: 0, duplicated: 0, invented: 0, emptied: 0 }
	};
}

/** Tokens the CLI reported for one run; claude's JSON output carries them, gemini's text does not. */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	costUsd: number | null;
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** The answer text inside the CLI's output, and the tokens when the CLI reports them. */
export function readCliOutput(stdout: string): { text: string; usage: TokenUsage | null } {
	let envelope: unknown;
	try {
		envelope = JSON.parse(stdout);
	} catch {
		return { text: stdout, usage: null };
	}
	const e = envelope as Record<string, unknown> | null;
	if (typeof e !== 'object' || e === null || typeof e.result !== 'string') {
		return { text: stdout, usage: null };
	}
	if (e.is_error === true) throw new CliError('exit', e.result || 'The CLI reported an error.');
	const u = (typeof e.usage === 'object' && e.usage !== null ? e.usage : {}) as Record<
		string,
		unknown
	>;
	return {
		text: e.result,
		usage: {
			inputTokens: count(u.input_tokens),
			outputTokens: count(u.output_tokens),
			cacheReadTokens: count(u.cache_read_input_tokens),
			cacheCreationTokens: count(u.cache_creation_input_tokens),
			costUsd: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : null
		}
	};
}

export type NamingOutcome =
	| { ok: true; level: MapLevel; names: PartNames[]; attempts: number; usage: TokenUsage[] }
	| {
			ok: false;
			code: 'naming-failed' | 'verification-failed';
			error: string;
			attempts: number;
			usage: TokenUsage[];
	  };

export interface NamingDeps {
	codeMap: CodeMap;
	/** Runs the CLI on one prompt and resolves its stdout */
	run: (prompt: string) => Promise<string>;
	/** The verifier's complaints about a named level; empty when it passes */
	verify: (level: MapLevel) => string[];
}

/** Feedback names the first few problems; the rest add length, not information. */
const FEEDBACK_MAX = 20;

/**
 * Asks for names, checks them, and asks once more with the complaints when they fail. A CLI
 * that cannot answer (missing, timed out, crashed) is not asked again. Cancellation rejects.
 */
export async function nameLevel(target: NamingTarget, deps: NamingDeps): Promise<NamingOutcome> {
	const usage: TokenUsage[] = [];
	let feedback: string[] = [];
	for (let attempt = 1; ; attempt++) {
		const prompt = buildNamingPrompt(target, deps.codeMap, feedback);
		if (prompt === null) {
			return {
				ok: false,
				code: 'naming-failed',
				error: `${target.level.nodes.length} parts do not fit one naming prompt (at most ${MAX_PARTS} parts, ${MAX_PROMPT_BYTES} bytes).`,
				attempts: attempt - 1,
				usage
			};
		}
		let text: string;
		try {
			const output = readCliOutput(await deps.run(prompt));
			if (output.usage) usage.push(output.usage);
			text = output.text;
		} catch (err) {
			if (err instanceof CliError && err.reason === 'aborted') throw err;
			return {
				ok: false,
				code: 'naming-failed',
				error: (err as Error).message,
				attempts: attempt,
				usage
			};
		}
		const answer = parseNamingAnswer(text);
		const problems = answer.ok
			? deps.verify(applyNames(target.level, answer.names))
			: answer.problems;
		if (answer.ok && problems.length === 0) {
			return {
				ok: true,
				level: applyNames(target.level, answer.names),
				names: answer.names,
				attempts: attempt,
				usage
			};
		}
		feedback = problems.slice(0, FEEDBACK_MAX);
		if (attempt === MAX_ATTEMPTS) {
			return {
				ok: false,
				code: 'verification-failed',
				error: `Names failed the checks twice; the folder names stay. ${problems.slice(0, 5).join(' ')}`,
				attempts: attempt,
				usage
			};
		}
	}
}
