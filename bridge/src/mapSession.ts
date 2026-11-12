import path from 'path';
import { extractDirectory, type Extraction } from '../../packages/core/src/extract';
import { groupExtraction, type GroupedMap } from '../../packages/core/src/groupedMap';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { DEFAULT_PATH_FILTER, shouldSkipPath } from '../../src/lib/utils/filePriority';
import {
	MAP_FORMAT,
	MAP_SCHEMA_VERSION,
	type MapLevel,
	type RopemanMap,
	type RpcErrorCode,
	type RpcPush
} from '../../src/lib/types/ropemanMap';
import type { CLIType } from './auth.js';
import { CliError, runCommand } from './cli.js';
import { isEnvValueFile } from './fileRead.js';
import {
	applyNames,
	nameLevel,
	namingCommand,
	type NamingTarget,
	type PartNames,
	type TokenUsage
} from './naming.js';
import { createTreeWatcher, type TreeWatcher } from './watch.js';

/** One open socket, as the session sees it: somewhere to push. */
export interface Subscriber {
	push(message: RpcPush): void;
}

export interface NamingOptions {
	cli: CLIType;
	/** The program to spawn; the CLI's own name unless a test points it at a fake */
	command: string;
	timeoutMs: number;
	/** CLI runs at once, over every socket */
	concurrency: number;
	maxOutputBytes: number;
	/** An empty folder to run the CLI in, so it starts outside the project */
	cwd: string;
}

export interface SessionOptions {
	/** Real path of `--root` */
	root: string;
	wasmDir: string;
	/** null when no CLI was found: every expansion stays grouped and says so */
	naming: NamingOptions | null;
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
}

interface NamingJob {
	subscribers: Set<Subscriber>;
	abort: AbortController;
}

export type ExpandResult =
	| { ok: true; level: MapLevel }
	| { ok: false; code: RpcErrorCode<'node.expand'>; error: string };

/** A counting semaphore whose waiters leave the queue when their signal aborts. */
class Slots {
	private free: number;
	private waiting: Array<() => void> = [];
	constructor(size: number) {
		this.free = size;
	}
	acquire(signal: AbortSignal): Promise<void> {
		if (signal.aborted) return Promise.reject(new CliError('aborted', 'Cancelled.'));
		if (this.free > 0) {
			this.free--;
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			const grant = () => {
				signal.removeEventListener('abort', onAbort);
				resolve();
			};
			const onAbort = () => {
				this.waiting = this.waiting.filter((w) => w !== grant);
				reject(new CliError('aborted', 'Cancelled while queued.'));
			};
			signal.addEventListener('abort', onAbort, { once: true });
			this.waiting.push(grant);
		});
	}
	release() {
		const next = this.waiting.shift();
		if (next) next();
		else this.free++;
	}
}

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
	/** The last verified names of each node, by node id */
	private readonly names = new Map<string, PartNames[]>();
	private readonly jobs = new Map<string, NamingJob>();
	private readonly slots: Slots;
	private readonly listeners = new Set<Subscriber>();
	private readonly watcher: TreeWatcher;
	private changed = new Set<string>();
	private debounce: NodeJS.Timeout | undefined;
	private refreshAgain = false;
	private closed = false;

	constructor(private readonly options: SessionOptions) {
		this.project = path.basename(options.root);
		this.slots = new Slots(options.naming?.concurrency ?? 1);
		this.watcher = createTreeWatcher(options.root, (p) => this.onFileEvent(p), options.log);
	}

	/** Starts the first extraction without waiting for a request. */
	start(): void {
		this.ready().catch(() => {});
	}

	/** Pushes `map.changed` to this subscriber until `leave`. */
	join(subscriber: Subscriber): void {
		this.listeners.add(subscriber);
	}

	/** Drops the subscriber everywhere and cancels each naming no other socket waits for. */
	leave(subscriber: Subscriber): void {
		this.listeners.delete(subscriber);
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
				named: new Map()
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
			levels: [snap.grouped.top, ...levels]
		};
	}

	/** What the verifier says about `level` placed in the map; empty when it passes. */
	private problems(snap: Snapshot, nodeId: string, level: MapLevel): string[] {
		const result = verifyMap(this.compose(snap, new Map([[nodeId, level]])), snap.extraction.map);
		if (!result.parsed) return [`${result.failure.at ?? 'map'}: ${result.failure.message}`];
		return result.violations.map((v) => `${v.at}: ${v.message}`);
	}

	private target(snap: Snapshot, nodeId: string, level: MapLevel): NamingTarget {
		return { project: this.project, nodeId, folder: folderOfNode(snap.grouped, nodeId), level };
	}

	/**
	 * The node's level for an immediate reply: its named level when it has verified names for
	 * this extraction, otherwise the grouped one. `name` then starts the CLI for a grouped one.
	 */
	async expand(nodeId: string): Promise<ExpandResult> {
		const snap = await this.ready();
		const named = this.namedLevel(snap, nodeId);
		if (named) return { ok: true, level: named };
		const grouped = snap.grouped.expand(nodeId);
		if (!grouped) {
			return {
				ok: false,
				code: 'unknown-node',
				error: `${nodeId} is not a folder node of the map. Files open with file.read.`
			};
		}
		return { ok: true, level: grouped };
	}

	/** The node's named level on this extraction, from its kept names if they still pass. */
	private namedLevel(snap: Snapshot, nodeId: string): MapLevel | null {
		const known = snap.named.get(nodeId);
		if (known) return known;
		const names = this.names.get(nodeId);
		const grouped = snap.grouped.expand(nodeId);
		if (!names || !grouped) return null;
		const level = applyNames(grouped, names);
		if (this.problems(snap, nodeId, level).length > 0) {
			this.names.delete(nodeId);
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
		if (!naming) {
			subscriber.push({
				type: 'node.named',
				nodeId,
				code: 'no-cli',
				error:
					'No CLI found, so the folder names stay. Install Claude Code or Gemini CLI, or pass --cli.'
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
			await this.slots.acquire(signal);
		} catch {
			return;
		}
		try {
			const outcome = await nameLevel(target, {
				codeMap: snap.extraction.map,
				run: (prompt) => {
					const { args, stdin } = namingCommand(naming.cli, prompt);
					return runCommand({
						command: naming.command,
						args,
						stdin,
						timeoutMs: naming.timeoutMs,
						maxOutputBytes: naming.maxOutputBytes,
						signal,
						cwd: naming.cwd
					});
				},
				verify: (level) => this.problems(snap, nodeId, level)
			});
			const ms = Math.round(performance.now() - started);
			this.options.log(
				`node.named ${nodeId}: ${outcome.ok ? 'named' : outcome.code} after ${outcome.attempts} run(s), ${ms} ms${tokens(outcome.usage)}`
			);
			if (outcome.ok) {
				this.names.set(nodeId, outcome.names);
				snap.named.set(nodeId, outcome.level);
				push({ type: 'node.named', nodeId, level: outcome.level });
			} else {
				push({ type: 'node.named', nodeId, code: outcome.code, error: outcome.error });
			}
		} catch (err) {
			if (err instanceof CliError && err.reason === 'aborted') {
				this.options.log(`node.named ${nodeId}: cancelled, no socket waits for it`);
				return;
			}
			push({ type: 'node.named', nodeId, code: 'naming-failed', error: (err as Error).message });
		} finally {
			this.slots.release();
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
				() => {
					if (this.closed) return;
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
