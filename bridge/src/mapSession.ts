import fs from 'fs';
import path from 'path';
import { extractDirectory, type Extraction } from '../../packages/core/src/extract';
import { groupExtraction, type GroupedMap } from '../../packages/core/src/groupedMap';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { DEFAULT_PATH_FILTER, shouldSkipPath } from '../../src/lib/utils/filePriority';
import {
	MAP_FORMAT,
	MAP_SCHEMA_VERSION,
	RESERVED_NODE_ID,
	type MapLevel,
	type RopemanMap,
	type RpcErrorCode,
	type RpcPush
} from '../../src/lib/types/ropemanMap';
import type { CLIType } from './auth.js';
import { CliError, type CliRunner, headlessCommand } from './cli.js';
import { isEnvValueFile } from './fileRead.js';
import {
	applyNames,
	nameLevel,
	type NamingTarget,
	type PartNames,
	type TokenUsage
} from './naming.js';
import { createTreeWatcher, type TreeWatcher } from './watch.js';
import { MAP_FILE, appendLog, readBrief, readQueue, writeQueue } from './workFolder.js';
import { parseRopemanMap } from '../../src/lib/services/ropemanMapSchema';

/** One open socket, as the session sees it: somewhere to push. */
export interface Subscriber {
	push(message: RpcPush): void;
}

export interface NamingOptions {
	cli: CLIType;
	/** The program to spawn; the CLI's own name unless a test points it at a fake */
	command: string;
	timeoutMs: number;
	maxOutputBytes: number;
	/** Shared with the legacy relay: its slots cap CLI runs over every socket */
	runner: CliRunner;
}

export interface SessionOptions {
	/** Real path of `--root` */
	root: string;
	wasmDir: string;
	/** The headless worker CLI that names an expanded node; null leaves it to the agent's queue */
	naming: NamingOptions | null;
	/**
	 * The folder shared with the user's agent (`--out`, see `workFolder.ts`): the named levels of
	 * its `ropeman.json` are served while they pass the verifier. A node expanded without names
	 * goes to the worker CLI with the agent's `brief.md`, and the result to `naming-log.jsonl`;
	 * with no CLI it goes on the queue. null with no CLI: every expansion stays grouped.
	 */
	out?: string | null;
	server: { name: string; version: string };
	/** Quiet time after the last file event before the root is extracted again */
	debounceMs: number;
	log: (msg: string) => void;
}

/** One extraction of the root and what has been derived from it. */
interface Snapshot {
	version: number;
	extraction: Extraction;
	grouped: GroupedMap;
	generatedAt: string;
	/** Named levels verified against this extraction, by the node they expand */
	named: Map<string, MapLevel>;
	/** Levels whose kept names failed on this extraction; the next extraction checks them again */
	refused: Set<string>;
}

interface NamingJob {
	subscribers: Set<Subscriber>;
	abort: AbortController;
}

export type ExpandResult =
	| { ok: true; level: MapLevel }
	| { ok: false; code: RpcErrorCode<'node.expand'>; error: string };

/** The key of the top level among levels kept by the node they expand; no node may use it. */
const TOP = RESERVED_NODE_ID;

/** The folder a `dir:` node holds, repo-relative. */
const folderOfNode = (grouped: GroupedMap, nodeId: string) => grouped.group(nodeId)?.path ?? '';

/**
 * The map of one `--root`, shared by every socket: extracts it, answers `map.get` and
 * `node.expand`, runs the CLI to name expanded nodes, and re-extracts when files change.
 * Names outlive the extraction they were made for while they still pass the verifier on the
 * new one, so an edit keeps them and a new subfolder or a removed key symbol asks again.
 */
export class MapSession {
	private readonly project: string;
	private snapshot: Snapshot | null = null;
	private extracting: Promise<Snapshot> | null = null;
	private version = 0;
	/** The last verified names of each level, by the node it expands (TOP for the top level) */
	private readonly names = new Map<string, PartNames[]>();
	/** Queued node ids, oldest first, with the sockets waiting for their names */
	private readonly queue = new Map<string, Set<Subscriber>>();
	/** CLI runs this session, retries included, for the viewer's count */
	private workerRuns = 0;
	/** The levels `--out/ropeman.json` named when it was last read */
	private fromFile = new Set<string>();
	private outWatcher: fs.FSWatcher | null = null;
	private outDebounce: NodeJS.Timeout | undefined;
	private readonly jobs = new Map<string, NamingJob>();
	private readonly listeners = new Set<Subscriber>();
	private readonly watcher: TreeWatcher;
	private changed = new Set<string>();
	private debounce: NodeJS.Timeout | undefined;
	private refreshAgain = false;
	private closed = false;

	constructor(private readonly options: SessionOptions) {
		this.project = path.basename(options.root);
		if (options.out) {
			for (const id of readQueue(options.out)) this.queue.set(id, new Set());
			this.readNames();
		}
		this.watcher = createTreeWatcher(options.root, (p) => this.onFileEvent(p), options.log);
	}

	/** Starts the first extraction without waiting for a request, and watches `--out`. */
	start(): void {
		const out = this.options.out;
		if (out) {
			this.outWatcher = fs.watch(out, (_event, file) => {
				// Some platforms report no file name; reading the map again is then the safe guess
				if (file && file !== MAP_FILE) return;
				clearTimeout(this.outDebounce);
				this.outDebounce = setTimeout(() => this.onNamesWritten(), this.options.debounceMs);
			});
			// A removed --out folder must not crash serve; names stop updating until a restart
			this.outWatcher.on('error', (err) =>
				this.options.log(`Stopped watching ${out}: ${err.message}`)
			);
		}
		this.ready().then(
			(snap) => {
				if (!out) return;
				this.settleQueue(snap);
				if (this.names.size === 0) return;
				const kept = [...this.names.keys()].filter((id) => this.namedLevel(snap, id)).length;
				this.options.log(`Serving the names of ${kept} of ${this.names.size} levels from ${out}`);
			},
			() => {}
		);
	}

	/**
	 * Takes the named levels of `--out/ropeman.json`, which only `ropeman map` writes and only
	 * with names the verifier passed. Returns the levels whose names changed.
	 */
	private readNames(): string[] {
		const file = path.join(this.options.out!, MAP_FILE);
		let text: string;
		try {
			text = fs.readFileSync(file, 'utf8');
		} catch {
			return [];
		}
		const parsed = parseRopemanMap(text);
		if (!parsed.ok) {
			this.options.log(`${file}: ${parsed.message}`);
			return [];
		}
		const changed: string[] = [];
		const inFile = new Set<string>();
		for (const level of parsed.value.levels) {
			if (level.naming !== 'named') continue;
			const key = level.parentId ?? TOP;
			inFile.add(key);
			const names = level.nodes.map(({ id, label, description, keySymbols }) => ({
				id,
				label,
				description,
				keySymbols
			}));
			if (JSON.stringify(this.names.get(key)) === JSON.stringify(names)) continue;
			this.names.set(key, names);
			this.snapshot?.named.delete(key);
			changed.push(key);
		}
		// A level the agent's last run left grouped stops showing the names it had before
		for (const key of this.fromFile) {
			if (inFile.has(key)) continue;
			this.names.delete(key);
			this.snapshot?.named.delete(key);
			changed.push(key);
		}
		this.fromFile = inFile;
		return changed;
	}

	/**
	 * Answers each queued node that now has names and drops each one the map no longer expands
	 * (a deleted folder), so the agent is never asked for a folder it cannot name. Returns the
	 * answered nodes.
	 */
	private settleQueue(snap: Snapshot): Set<string> {
		const answered = new Set<string>();
		const before = this.queue.size;
		for (const [nodeId, waiting] of this.queue) {
			const level = this.namedLevel(snap, nodeId);
			if (level) {
				for (const subscriber of waiting) subscriber.push({ type: 'node.named', nodeId, level });
				answered.add(nodeId);
			} else if (snap.grouped.expand(nodeId)) continue;
			this.queue.delete(nodeId);
		}
		if (this.queue.size !== before) writeQueue(this.options.out!, [...this.queue.keys()]);
		return answered;
	}

	/** The agent ran `ropeman map`: answer the queued nodes it named, and reload the rest. */
	private onNamesWritten(): void {
		if (this.closed) return;
		const changed = this.readNames();
		const snap = this.snapshot;
		if (changed.length === 0 || !snap) return;
		const answered = this.settleQueue(snap);
		this.options.log(`Names for ${changed.length} levels from ${MAP_FILE}`);
		if (changed.some((key) => !answered.has(key))) {
			const message: RpcPush = { type: 'map.changed', paths: [] };
			for (const listener of this.listeners) listener.push(message);
		}
	}

	/** Pushes `map.changed` to this subscriber until `leave`. */
	join(subscriber: Subscriber): void {
		this.listeners.add(subscriber);
	}

	/** Drops the subscriber everywhere and cancels each naming no other socket waits for. */
	leave(subscriber: Subscriber): void {
		this.listeners.delete(subscriber);
		for (const waiting of this.queue.values()) waiting.delete(subscriber);
		for (const [key, job] of this.jobs) {
			if (job.subscribers.delete(subscriber) && job.subscribers.size === 0) {
				job.abort.abort();
				this.jobs.delete(key);
			}
		}
	}

	/** Namings this subscriber still waits for. */
	pendingFor(subscriber: Subscriber): number {
		let n = 0;
		for (const job of this.jobs.values()) if (job.subscribers.has(subscriber)) n++;
		return n;
	}

	close(): void {
		this.closed = true;
		clearTimeout(this.debounce);
		clearTimeout(this.outDebounce);
		this.outWatcher?.close();
		this.watcher.close();
		for (const job of this.jobs.values()) job.abort.abort();
		this.jobs.clear();
		this.listeners.clear();
	}

	/** The current extraction, waiting for the first one. A failed first try runs again. */
	private ready(): Promise<Snapshot> {
		if (this.snapshot) return Promise.resolve(this.snapshot);
		return this.extract();
	}

	private extract(): Promise<Snapshot> {
		if (this.extracting) return this.extracting;
		const started = performance.now();
		const run = (async () => {
			const extraction = await extractDirectory(this.options.root, {
				wasmDir: this.options.wasmDir
			});
			const snapshot: Snapshot = {
				version: ++this.version,
				extraction,
				grouped: groupExtraction(extraction, this.project),
				generatedAt: new Date().toISOString(),
				named: new Map(),
				refused: new Set()
			};
			this.snapshot = snapshot;
			if (!this.closed) this.watcher.watch(extraction.folders);
			const seconds = ((performance.now() - started) / 1000).toFixed(2);
			this.options.log(
				`Extracted ${extraction.map.files.size} files of ${extraction.listed} listed in ${seconds}s`
			);
			return snapshot;
		})();
		this.extracting = run;
		run.then(
			() => (this.extracting = null),
			(err: Error) => {
				this.extracting = null;
				this.options.log(`Extraction failed: ${err.message}`);
			}
		);
		return run;
	}

	async map(): Promise<RopemanMap> {
		const snap = await this.ready();
		for (const nodeId of [...this.names.keys()]) this.namedLevel(snap, nodeId);
		return this.compose(snap, new Map());
	}

	/**
	 * The levels of every named node and the grouped levels above them, so the map is one tree
	 * from the top level, as the parser requires.
	 */
	private compose(snap: Snapshot, extra: ReadonlyMap<string, MapLevel>): RopemanMap {
		const expanded = new Set<string>();
		for (const id of [...snap.named.keys(), ...extra.keys()]) {
			if (id === TOP) continue;
			for (let at: string | null | undefined = id; at; at = snap.grouped.parentOf(at)) {
				expanded.add(at);
			}
		}
		const depth = (id: string) => id.split('/').length;
		const levels = [...expanded]
			.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : 1))
			.map((id) => extra.get(id) ?? snap.named.get(id) ?? snap.grouped.expand(id)!);
		return {
			format: MAP_FORMAT,
			schemaVersion: MAP_SCHEMA_VERSION,
			project: { name: this.project },
			generator: this.options.server,
			generatedAt: snap.generatedAt,
			files: snap.grouped.files,
			levels: [extra.get(TOP) ?? snap.named.get(TOP) ?? snap.grouped.top, ...levels]
		};
	}

	/** What the verifier says about `level` placed in the map; empty when it passes. */
	private problems(snap: Snapshot, nodeId: string, level: MapLevel): string[] {
		const result = verifyMap(this.compose(snap, new Map([[nodeId, level]])), snap.extraction.map);
		if (!result.parsed) return [`${result.failure.at ?? 'map'}: ${result.failure.message}`];
		return result.violations.map((v) => `${v.at}: ${v.message}`);
	}

	/** The worker's task, with the agent's brief and the name the folder got one level up. */
	private target(snap: Snapshot, nodeId: string, level: MapLevel): NamingTarget {
		const above = snap.grouped.parentOf(nodeId);
		const parentLevel = above === undefined ? null : this.namedLevel(snap, above ?? TOP);
		const self = parentLevel?.nodes.find((n) => n.id === nodeId);
		return {
			project: this.project,
			nodeId,
			folder: folderOfNode(snap.grouped, nodeId),
			level,
			brief: this.options.out ? readBrief(this.options.out) : null,
			parent: self ? { label: self.label, description: self.description } : null
		};
	}

	/**
	 * The node's level for an immediate reply: its named level when it has verified names for
	 * this extraction, otherwise the grouped one. `name` then starts the CLI for a grouped one.
	 */
	async expand(nodeId: string): Promise<ExpandResult> {
		const snap = await this.ready();
		const grouped = snap.grouped.expand(nodeId);
		if (!grouped) {
			return {
				ok: false,
				code: 'unknown-node',
				error: `${nodeId} is not a folder node of the map. Files open with file.read.`
			};
		}
		return { ok: true, level: this.namedLevel(snap, nodeId) ?? grouped };
	}

	/** The node's named level on this extraction, from its kept names if they still pass. */
	private namedLevel(snap: Snapshot, nodeId: string): MapLevel | null {
		const known = snap.named.get(nodeId);
		if (known) return known;
		const names = this.names.get(nodeId);
		const grouped = nodeId === TOP ? snap.grouped.top : snap.grouped.expand(nodeId);
		if (!names || !grouped || snap.refused.has(nodeId)) return null;
		const level = applyNames(grouped, names);
		// Kept, not deleted: a folder added and removed again, or a branch switched back, passes later
		if (this.problems(snap, nodeId, level).length > 0) {
			snap.refused.add(nodeId);
			return null;
		}
		snap.named.set(nodeId, level);
		return level;
	}

	/**
	 * Names the grouped level `expand` just returned and pushes one `node.named` to `subscriber`:
	 * the level, or why there is none. Only a socket that closes first gets nothing. Two sockets
	 * that expand the same node share one CLI run.
	 */
	name(nodeId: string, subscriber: Subscriber): void {
		const snap = this.snapshot!;
		const known = this.namedLevel(snap, nodeId);
		if (known) {
			subscriber.push({ type: 'node.named', nodeId, level: known });
			return;
		}
		if (!snap.grouped.expand(nodeId)) {
			subscriber.push({
				type: 'node.named',
				nodeId,
				code: 'naming-failed',
				error: `${nodeId} left the map when the files changed.`
			});
			return;
		}
		const naming = this.options.naming;
		if (!naming && this.options.out) {
			const waiting = this.queue.get(nodeId);
			if (waiting) waiting.add(subscriber);
			else {
				this.queue.set(nodeId, new Set([subscriber]));
				writeQueue(this.options.out, [...this.queue.keys()]);
			}
			subscriber.push({
				type: 'node.named',
				nodeId,
				code: 'queued',
				error: 'Queued for your agent; it names this folder the next time it runs ropeman map.'
			});
			return;
		}
		if (!naming) {
			subscriber.push({
				type: 'node.named',
				nodeId,
				code: 'no-cli',
				error:
					'Nothing names this folder, so the folder names stay. Start serve with --out (the folder the Ropeman skill uses) or --cli.'
			});
			return;
		}
		const key = `${snap.version}\n${nodeId}`;
		const running = this.jobs.get(key);
		if (running) {
			running.subscribers.add(subscriber);
			return;
		}
		const job: NamingJob = { subscribers: new Set([subscriber]), abort: new AbortController() };
		this.jobs.set(key, job);
		this.runJob(snap, nodeId, naming, job).finally(() => {
			if (this.jobs.get(key) === job) this.jobs.delete(key);
		});
	}

	private async runJob(snap: Snapshot, nodeId: string, naming: NamingOptions, job: NamingJob) {
		const grouped = snap.grouped.expand(nodeId)!;
		const target = this.target(snap, nodeId, grouped);
		const signal = job.abort.signal;
		const started = performance.now();
		const push = (message: RpcPush) => {
			for (const subscriber of job.subscribers) subscriber.push(message);
		};
		try {
			const outcome = await nameLevel(target, {
				codeMap: snap.extraction.map,
				run: (prompt) => {
					this.workerRuns++;
					const { args, stdin } = headlessCommand(naming.cli, prompt);
					return naming.runner.run({
						command: naming.command,
						args,
						stdin,
						timeoutMs: naming.timeoutMs,
						maxOutputBytes: naming.maxOutputBytes,
						signal
					});
				},
				verify: (level) => this.problems(snap, nodeId, level)
			});
			const ms = Math.round(performance.now() - started);
			this.options.log(
				`node.named ${nodeId}: ${outcome.ok ? 'named' : outcome.code} after ${outcome.attempts} run(s), ${ms} ms${tokens(outcome.usage)}`
			);
			if (this.options.out) {
				appendLog(this.options.out, {
					at: new Date().toISOString(),
					nodeId,
					folder: target.folder,
					worker: naming.cli,
					outcome: outcome.ok ? 'named' : outcome.code,
					names: outcome.ok ? outcome.names : [],
					ms
				});
			}
			if (outcome.ok) {
				this.names.set(nodeId, outcome.names);
				snap.named.set(nodeId, outcome.level);
				push({
					type: 'node.named',
					nodeId,
					level: outcome.level,
					namedBy: { worker: naming.cli, runs: this.workerRuns }
				});
			} else {
				push({ type: 'node.named', nodeId, code: outcome.code, error: outcome.error });
			}
		} catch (err) {
			if (err instanceof CliError && err.reason === 'aborted') {
				this.options.log(`node.named ${nodeId}: cancelled, no socket waits for it`);
				return;
			}
			push({ type: 'node.named', nodeId, code: 'naming-failed', error: (err as Error).message });
		}
	}

	/** A file event under the root; the skip rules of the walk drop most of them here. */
	private onFileEvent(repoPath: string): void {
		if (this.closed) return;
		if (repoPath !== '.' && shouldSkipPath(repoPath, DEFAULT_PATH_FILTER, true)) return;
		if (isEnvValueFile(repoPath)) return;
		this.changed.add(repoPath);
		clearTimeout(this.debounce);
		this.debounce = setTimeout(() => this.refresh(), this.options.debounceMs);
	}

	/**
	 * Extracts again and pushes the paths that changed. Events that arrive during an extraction
	 * run one more after it, so the last edit is always in the map that follows it.
	 */
	private refresh(): void {
		if (this.closed) return;
		if (this.extracting) {
			this.refreshAgain = true;
			return;
		}
		const paths = [...this.changed].sort();
		this.changed.clear();
		this.extract()
			.then(
				(snap) => {
					if (this.closed) return;
					if (this.options.out) this.settleQueue(snap);
					const message: RpcPush = { type: 'map.changed', paths };
					for (const listener of this.listeners) listener.push(message);
				},
				() => {}
			)
			.finally(() => {
				if (this.refreshAgain && !this.closed) {
					this.refreshAgain = false;
					this.refresh();
				}
			});
	}
}

/** The CLI's token report for the log: input split as the CLI reports it, then output and cost. */
function tokens(usage: TokenUsage[]): string {
	if (usage.length === 0) return '';
	const sum = (pick: (u: TokenUsage) => number) => usage.reduce((n, u) => n + pick(u), 0);
	const cost = usage.every((u) => u.costUsd !== null)
		? ` $${sum((u) => u.costUsd!).toFixed(4)}`
		: '';
	return `, tokens in ${sum((u) => u.inputTokens)} + cache read ${sum((u) => u.cacheReadTokens)} + cache write ${sum((u) => u.cacheCreationTokens)}, out ${sum((u) => u.outputTokens)}${cost}`;
}
