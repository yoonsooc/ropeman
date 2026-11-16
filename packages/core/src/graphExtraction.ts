import { readFile, stat } from 'node:fs/promises';
import type { FilePath } from '$lib/types/codeMap';
import {
	GraphifyFormatError,
	identifyGraphFile,
	readGraphifyGraph,
	type GraphFileRefusal,
	type IssueReason
} from '$lib/services/graphifyAdapter';
import { inferLanguage } from '$lib/services/codeMapBuilder';
import { summarizeHierarchy } from '$lib/services/hierarchySummary';
import { supportedFiles } from '$lib/services/sourceExtraction';
import { detectConfigLanguage, isEnvValueFile } from '$lib/utils/languageDetector';
import { foldersOf, type Extraction } from './extract';
import { walkDirectory } from './walk';

/** PASEO's graph.json of `packages/server` alone is 28 MB; a file over this is refused unread. */
export const MAX_GRAPH_BYTES = 512 * 1024 * 1024;

/** Below this share of the code files on disk, a graph file is reported as low coverage. */
export const LOW_COVERAGE = 0.9;

const EXAMPLES = 5;

/** A path from the graph file, cut so a planted one cannot fill the report. */
const shown = (path: string) => (path.length > 80 ? `${path.slice(0, 79)}…` : path);

/** How much of the code on disk a graph file holds. */
export interface GraphCoverage {
	/** Code files on disk: every source file in a language Ropeman parses, and every other file the graph holds */
	codeFiles: number;
	/** Code files on disk that the graph holds: the files a map from it shows */
	covered: number;
	/** covered / codeFiles, to three decimals; 0 when there is no code file */
	ratio: number;
	/** ratio is below LOW_COVERAGE */
	low: boolean;
	/** Code files on disk that the graph does not hold */
	missing: number;
	/** Where the missing files are, by the first two folders of their path, most first */
	missingByFolder: { folder: string; files: number }[];
	missingByExtension: { extension: string; files: number }[];
	/** Files the graph holds that are not on disk now, or are in a folder Ropeman does not walk */
	notOnDisk: number;
	notOnDiskExamples: string[];
}

export type GraphRefusalCode =
	GraphFileRefusal | 'unreadable' | 'too-large' | 'not-json' | 'malformed' | 'no-files-on-disk';

export type GraphExtraction =
	| {
			ok: true;
			extraction: Extraction;
			writer: { name: 'graphify'; version: string };
			coverage: GraphCoverage;
			/** What the adapter left out or weakened, by reason */
			issues: Partial<Record<IssueReason, number>>;
			/**
			 * Files Ropeman's own extraction would read (docs and config files too) that the graph
			 * does not hold, so a report can tell them from files in no language Ropeman reads
			 */
			notInGraph: number;
	  }
	| { ok: false; code: GraphRefusalCode; message: string };

const countBy = <K extends string>(keys: Iterable<K>) => {
	const counts = new Map<K, number>();
	for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
};

/** A file in a language Ropeman builds code records for; docs and config files do not count. */
const isCode = (path: string) => {
	const language = inferLanguage(path);
	return language !== null && language !== 'markdown' && detectConfigLanguage(path) === null;
};

const folderOf = (path: string) => {
	const folders = path.split('/').slice(0, -1);
	return folders.length === 0 ? '.' : folders.slice(0, 2).join('/');
};

const extensionOf = (path: string) => {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot) : name;
};

/**
 * A graph file as the extraction of `root`: the code map of the files it holds that are on disk
 * now, with the folders the walk entered, so grouping, naming, the verifier and serve's watcher
 * run on it as on Ropeman's own extraction. Graph files that the walk does not list (deleted
 * since, or in a folder such as node_modules) are left out. Refused, with the reason, when the
 * file is not a format Ropeman checked, or holds no file of this folder.
 */
export async function extractGraphFile(root: string, file: string): Promise<GraphExtraction> {
	const refuse = (code: GraphRefusalCode, message: string): GraphExtraction => ({
		ok: false,
		code,
		message
	});
	let json: unknown;
	try {
		const { size } = await stat(file);
		if (size > MAX_GRAPH_BYTES) {
			return refuse('too-large', `The file is over ${MAX_GRAPH_BYTES} bytes.`);
		}
		json = JSON.parse(await readFile(file, 'utf8'));
	} catch (err) {
		return err instanceof SyntaxError
			? refuse('not-json', 'The file is not valid JSON.')
			: refuse('unreadable', `The file could not be read (${(err as Error).message}).`);
	}
	const format = identifyGraphFile(json);
	if (!format.ok) return format;

	const { tree, paths } = await walkDirectory(root);
	const listed = new Set(paths);
	const onDisk = (path: string) => listed.has(path) && !isEnvValueFile(path.toLowerCase());
	const notOnDisk = new Set<string>();
	let graph: ReturnType<typeof readGraphifyGraph>;
	try {
		graph = readGraphifyGraph(json, null, (sourceFile) => {
			if (onDisk(sourceFile)) return true;
			notOnDisk.add(sourceFile);
			return false;
		});
	} catch (err) {
		if (!(err instanceof GraphifyFormatError)) throw err;
		return refuse('malformed', `The file is not a graph this version reads: ${err.message}.`);
	}
	const { map: graphMap, issues } = graph;
	if (graphMap.files.size === 0) {
		return refuse(
			'no-files-on-disk',
			notOnDisk.size > 0
				? `None of the ${notOnDisk.size} files the graph holds is in this folder (${[...notOnDisk].slice(0, 3).map(shown).join(', ')}); it may be a graph of another folder.`
				: 'The graph holds no code file (no file node of its ast layer).'
		);
	}

	const covered = new Set<string>(graphMap.files.keys());
	const missing = paths.filter((p) => !covered.has(p) && isCode(p) && onDisk(p));
	const codeFiles = covered.size + missing.length;
	const ratio = Math.round((covered.size / codeFiles) * 1000) / 1000;
	const coverage: GraphCoverage = {
		codeFiles,
		covered: covered.size,
		ratio,
		low: ratio < LOW_COVERAGE,
		missing: missing.length,
		missingByFolder: countBy(missing.map(folderOf))
			.slice(0, EXAMPLES)
			.map(([folder, files]) => ({ folder, files })),
		missingByExtension: countBy(missing.map(extensionOf))
			.slice(0, EXAMPLES)
			.map(([extension, files]) => ({ extension, files })),
		notOnDisk: notOnDisk.size,
		notOnDiskExamples: [...notOnDisk].sort().slice(0, EXAMPLES).map(shown)
	};
	const notInGraph = supportedFiles(tree).filter((f) => !covered.has(f.path)).length;
	const map = { ...graphMap, files: new Map([...graphMap.files].sort(byPath)) };
	return {
		ok: true,
		extraction: {
			map,
			hierarchy: summarizeHierarchy(map),
			listed: paths.length,
			skipped: [],
			folders: foldersOf(tree)
		},
		writer: format.writer,
		coverage,
		issues: Object.fromEntries(countBy(issues.map((i) => i.reason))),
		notInGraph
	};
}

const byPath = ([a]: [FilePath, unknown], [b]: [FilePath, unknown]) => (a < b ? -1 : a > b ? 1 : 0);
