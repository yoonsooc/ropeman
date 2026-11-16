import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { extractDirectory, type Extraction } from '../../packages/core/src/extract';
import {
	extractGraphFile,
	type GraphCoverage,
	type GraphExtraction
} from '../../packages/core/src/graphExtraction';
import { readOutFile, writeAtomic } from './workFolder.js';

/**
 * What a map is built from. Ropeman's own extraction is the default. A graph file another tool
 * already wrote (Graphify's graph.json) is used only when the user chose it: on the terminal's
 * prompt, with `--input`, or by an earlier choice recorded in the work folder. Ropeman never
 * runs or installs the tool that writes the file (ADR-28).
 */

/** Where the user's choice is kept, so later runs, `verify` and serve use the same input. */
export const INPUT_FILE = 'input.json';

/** The `--input` value for Ropeman's own extraction. */
export const OWN_INPUT = 'ropeman';

/** Repo-relative places where tools write a graph file. */
export const GRAPH_LOCATIONS = ['graphify-out/graph.json', '.graphicle/graph.json'] as const;

const MAX_INPUT_FILE_BYTES = 64 * 1024;

type GraphRead = Extract<GraphExtraction, { ok: true }>;

/** The input of a map; a graph input carries the file as it was read. */
export type MapInput = { kind: 'ropeman' } | { kind: 'graph'; file: string; read: GraphRead };

/** How this run's input was decided. */
export type Decision = 'default' | 'flag' | 'prompt' | 'recorded';

/** A graph file found at one of GRAPH_LOCATIONS. */
export interface Candidate {
	/** Repo-relative, one of GRAPH_LOCATIONS */
	location: string;
	file: string;
	bytes: number;
	modified: Date;
	read: GraphExtraction | { ok: false; code: 'link' | 'not-a-file'; message: string };
}

export interface Chosen {
	input: MapInput;
	decidedBy: Decision;
	/** Graph files found that cannot be read, so the run used Ropeman's own extraction */
	notUsed?: { location: string; code: string; message: string }[];
}

const OWN: MapInput = { kind: 'ropeman' };

/** null when the user closed the input without answering. */
export type Ask = (question: string) => Promise<string | null>;

/** Reads one line from the terminal; the question goes to stderr, so stdout stays the report. */
export const askOnTerminal: Ask = (question) =>
	new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
		let answered = false;
		rl.on('close', () => {
			if (!answered) resolve(null);
		});
		rl.question(question, (answer) => {
			answered = true;
			rl.close();
			resolve(answer);
		});
	});

export class InputError extends Error {}

/** Each graph file at a known location of `root`, read and checked against the files on disk. */
export async function findCandidates(root: string): Promise<Candidate[]> {
	const found: Candidate[] = [];
	for (const location of GRAPH_LOCATIONS) {
		const file = path.join(root, location);
		const stat = fs.lstatSync(file, { throwIfNoEntry: false });
		if (!stat) continue;
		const base = { location, file, bytes: stat.size, modified: stat.mtime };
		// A cloned repository can ship the file, or a folder on its path, as a link to the user's files
		if (stat.isSymbolicLink() || fs.realpathSync.native(file) !== file) {
			found.push({
				...base,
				read: {
					ok: false,
					code: 'link',
					message: 'The file is a link; pass the file it points to with --input.'
				}
			});
		} else if (!stat.isFile()) {
			found.push({
				...base,
				read: { ok: false, code: 'not-a-file', message: 'Not a regular file.' }
			});
		} else {
			found.push({ ...base, read: await extractGraphFile(root, file) });
		}
	}
	return found;
}

async function readGraph(root: string, value: string, from: string): Promise<GraphRead> {
	const file = path.resolve(value);
	if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
		throw new InputError(`${from} ${value}: no such file.`);
	}
	const read = await extractGraphFile(root, file);
	if (!read.ok) throw new InputError(`${from} ${value}: ${read.message} (${read.code})`);
	return read;
}

/** The input an `--input` value names: `ropeman`, or the path of a graph file. */
async function inputOf(root: string, value: string, from: string): Promise<MapInput> {
	if (value === OWN_INPUT) return OWN;
	return { kind: 'graph', file: path.resolve(value), read: await readGraph(root, value, from) };
}

/** This user's key for signing recorded choices, created on first use. */
function inputKey(): Buffer {
	const file = path.join(os.homedir(), '.ropeman', 'input-key');
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
	}
	return fs.readFileSync(file);
}

/** Binds a choice to one work folder, so a copied or planted `input.json` does not verify. */
const signature = (folder: string, value: string) =>
	createHmac('sha256', inputKey()).update(`${folder}\n${value}`).digest('base64url');

/**
 * The choice recorded in `folder`, a real path, or null when there is none. A cloned repository
 * can ship `.ropeman/input.json` with any mode, and Windows keeps no modes, so the record is
 * trusted only when it carries the signature `record` made with this user's key for this folder.
 * Otherwise it would pick a graph file the user never chose.
 */
export function recordedInput(folder: string): string | null {
	const read = readOutFile(folder, INPUT_FILE, MAX_INPUT_FILE_BYTES);
	if (read === null) return null;
	const bad = (why: string) =>
		new InputError(
			`${path.join(folder, INPUT_FILE)} ${why}; pass --input ropeman or --input <graph file> to choose again.`
		);
	if ('refused' in read) throw bad(`was not read: ${read.refused}`);
	let value: unknown;
	let mac: unknown;
	try {
		({ input: value, mac } = JSON.parse(read.text) as { input?: unknown; mac?: unknown });
	} catch {
		// reported below
	}
	if (read.cut || typeof value !== 'string' || value.length === 0 || typeof mac !== 'string') {
		throw bad('is not a recorded choice');
	}
	const want = Buffer.from(signature(folder, value));
	const got = Buffer.from(mac);
	if (got.length !== want.length || !timingSafeEqual(got, want)) {
		throw bad('was not written by ropeman map for this folder on this machine');
	}
	return value;
}

function record(out: string, input: MapInput): void {
	const value = input.kind === 'ropeman' ? OWN_INPUT : input.file;
	const text = `${JSON.stringify({ input: value, mac: signature(out, value) })}\n`;
	writeAtomic(path.join(out, INPUT_FILE), text, 0o600);
}

const usable = (candidates: readonly Candidate[]) =>
	candidates.filter((c): c is Candidate & { read: GraphRead } => c.read.ok);

/**
 * The input of one `ropeman map` run. `--input` wins and is recorded; otherwise an earlier
 * choice recorded in `out` is used; otherwise, when graph files exist, the user picks on the
 * terminal (`ask`) and the answer is recorded. With no terminal the run stops and returns the
 * candidates, so the agent asks the user and passes `--input`. With no graph file the input is
 * Ropeman's own extraction and nothing is recorded, as before graph files were an input.
 */
export async function chooseInput(options: {
	root: string;
	out: string;
	flag: string | undefined;
	ask: Ask | undefined;
	err: (text: string) => void;
}): Promise<Chosen | { needed: Candidate[] }> {
	const { root, out, flag, ask } = options;
	if (flag !== undefined) {
		const input = await inputOf(root, flag, '--input');
		record(out, input);
		return { input, decidedBy: 'flag' };
	}
	const recorded = recordedInput(out);
	if (recorded !== null) {
		const from = `The input recorded in ${path.join(out, INPUT_FILE)},`;
		return { input: await inputOf(root, recorded, from), decidedBy: 'recorded' };
	}
	const candidates = await findCandidates(root);
	const graphs = usable(candidates);
	if (graphs.length === 0) {
		const notUsed = candidates.flatMap(({ location, read }) =>
			read.ok ? [] : [{ location, code: read.code, message: read.message }]
		);
		for (const n of notUsed) options.err(`ropeman: ${n.location} is not used: ${n.message}`);
		return { input: OWN, decidedBy: 'default', ...(notUsed.length > 0 && { notUsed }) };
	}
	if (!ask) return { needed: candidates };

	const picked = await promptChoice(candidates, ask, options.err);
	const graph = graphs[picked - 1];
	const input: MapInput = graph ? { kind: 'graph', file: graph.file, read: graph.read } : OWN;
	record(out, input);
	return { input, decidedBy: 'prompt' };
}

/** The input `verify` checks a map against: `--input`, else the choice recorded beside the map. */
export async function inputForVerify(
	root: string,
	mapFile: string,
	flag: string | undefined
): Promise<Chosen> {
	if (flag !== undefined) return { input: await inputOf(root, flag, '--input'), decidedBy: 'flag' };
	let folder: string;
	try {
		folder = fs.realpathSync.native(path.dirname(path.resolve(mapFile)));
	} catch {
		return { input: OWN, decidedBy: 'default' };
	}
	const recorded = recordedInput(folder);
	if (recorded === null) return { input: OWN, decidedBy: 'default' };
	const from = `The input recorded in ${path.join(folder, INPUT_FILE)},`;
	return { input: await inputOf(root, recorded, from), decidedBy: 'recorded' };
}

/** The input serve maps: the choice recorded in `out`, else Ropeman's own extraction. */
export async function inputForServe(root: string, out: string | null): Promise<Chosen> {
	const recorded = out ? recordedInput(out) : null;
	if (recorded === null) return { input: OWN, decidedBy: 'default' };
	const from = `The input recorded in ${path.join(out!, INPUT_FILE)},`;
	return { input: await inputOf(root, recorded, from), decidedBy: 'recorded' };
}

/** A fresh extraction of the input, for serve: the graph file is read again from disk. */
export async function extractInput(
	root: string,
	input: MapInput,
	wasmDir: string
): Promise<Extraction> {
	if (input.kind === 'ropeman') return extractDirectory(root, { wasmDir });
	return (await readGraph(root, input.file, 'The graph file')).extraction;
}

// --- What the user and the agent see ---------------------------------------------------------

const count = (n: number) => n.toLocaleString('en-US');

const size = (bytes: number) =>
	bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;

const when = (date: Date) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** What a graph file holds compared with the code on disk, in one or two sentences. */
export function coverageText(coverage: GraphCoverage): string {
	const percent = Math.floor(coverage.ratio * 100);
	const parts = [
		`Holds ${count(coverage.covered)} of ${count(coverage.codeFiles)} code files on disk (${percent}%).`
	];
	if (coverage.missing > 0) {
		const folders = coverage.missingByFolder.map((m) => `${m.folder} ${count(m.files)}`).join(', ');
		const kinds = coverage.missingByExtension
			.map((m) => `${m.extension} ${count(m.files)}`)
			.join(', ');
		parts.push(`Not in it: ${folders}; by type: ${kinds}.`);
	}
	if (coverage.notOnDisk > 0) {
		parts.push(`${count(coverage.notOnDisk)} files in it are not on disk now.`);
	}
	return parts.join(' ');
}

/** Warnings about a graph input that the user must know before choosing it. */
export function graphWarnings(coverage: GraphCoverage): string[] {
	const warnings: string[] = [];
	if (coverage.low) {
		warnings.push(
			`Low coverage: the map shows only the ${count(coverage.covered)} files in this graph, ${Math.floor(coverage.ratio * 100)}% of the code on disk.`
		);
	}
	if (coverage.notOnDisk > 0) {
		warnings.push(
			`The graph may be out of date: ${count(coverage.notOnDisk)} of its files are not on disk (${coverage.notOnDiskExamples.join(', ')}).`
		);
	}
	return warnings;
}

/** The terminal prompt: own extraction first as the default, then each usable graph file. */
export function promptText(candidates: readonly Candidate[]): string {
	const lines = [
		"Graph files in this repository can be the input of the map instead of Ropeman's own extraction.",
		"  1. Ropeman's own extraction (default)"
	];
	let n = 1;
	for (const c of candidates) {
		const head = `${c.location}: ${size(c.bytes)}, modified ${when(c.modified)}`;
		if (!c.read.ok) {
			lines.push(`  -  ${head}. Cannot be used: ${c.read.message}`);
			continue;
		}
		n++;
		lines.push(`  ${n}. ${head}, written by Graphify ${c.read.writer.version}`);
		lines.push(`     ${coverageText(c.read.coverage)}`);
		for (const warning of graphWarnings(c.read.coverage)) lines.push(`     ${warning}`);
	}
	return lines.join('\n');
}

const MAX_TRIES = 3;

/** 0 for Ropeman's own extraction, else the 1-based index among the usable graph files. */
async function promptChoice(
	candidates: readonly Candidate[],
	ask: Ask,
	err: (text: string) => void
): Promise<number> {
	const last = usable(candidates).length + 1;
	err(promptText(candidates));
	for (let tries = 0; tries < MAX_TRIES; tries++) {
		const answer = await ask(`Choose 1-${last} [1]: `);
		if (answer === null) {
			throw new InputError('No answer was given; run again and choose, or pass --input.');
		}
		const trimmed = answer.trim();
		if (trimmed === '') return 0;
		const picked = Number(trimmed);
		if (Number.isInteger(picked) && picked >= 1 && picked <= last) return picked - 1;
		err(`Type a number from 1 to ${last}, or press Enter for 1.`);
	}
	throw new InputError(`No valid answer after ${MAX_TRIES} tries; pass --input instead.`);
}

/** One choice as the agent reads it from the report of a run that needs one. */
export function choicesOf(candidates: readonly Candidate[]) {
	return [
		{ input: OWN_INPUT, label: "Ropeman's own extraction", default: true },
		...candidates.map((c) => {
			const head = {
				input: c.read.ok ? c.file : null,
				location: c.location,
				bytes: c.bytes,
				modified: c.modified.toISOString()
			};
			return c.read.ok
				? {
						...head,
						writer: c.read.writer,
						coverage: c.read.coverage,
						summary: coverageText(c.read.coverage),
						warnings: graphWarnings(c.read.coverage)
					}
				: { ...head, refused: { code: c.read.code, message: c.read.message } };
		})
	];
}

/** The `input` field of a report: what the map was built from, and how that was decided. */
export function inputReport({ input, decidedBy, notUsed }: Chosen) {
	if (input.kind === 'ropeman') {
		return { kind: input.kind, decidedBy, ...(notUsed && { notUsed }) };
	}
	return {
		kind: input.kind,
		file: input.file,
		decidedBy,
		writer: input.read.writer,
		coverage: input.read.coverage,
		warnings: graphWarnings(input.read.coverage),
		/** graph.json entries the adapter left out or weakened, by reason */
		issues: input.read.issues
	};
}
