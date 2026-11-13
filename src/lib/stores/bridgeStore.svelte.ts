/**
 * Bridge mode: the map `ropeman serve` holds, shown through the semantic store. The store keeps
 * the connection and what the socket said about each node (naming pending or failed); the levels
 * themselves live in `semanticStore`, so the canvas, breadcrumb and detail panel work unchanged.
 */
import {
	bridgeSocketUrl,
	connectBridge,
	type BridgeConnection,
	type BridgePush,
	type ConnectFailure,
	type OpenSocket,
	type RpcOutcome
} from '$lib/services/bridgeClient';
import { toViewerLevel, toViewerLevels } from '$lib/services/mapViewer';
import {
	RESERVED_NODE_ID,
	type MapLevel,
	type NAMING_CODES,
	type RopemanMap,
	type RpcErrorCode
} from '$lib/types/ropemanMap';
import type { SemanticNode } from '$lib/types/semantic';
import { projectStore } from './projectStore.svelte';
import { semanticStore } from './semanticStore.svelte';
import { tabStore } from './tabStore.svelte';

export type BridgeStatus =
	| { state: 'idle' }
	| { state: 'connecting'; host: string }
	| { state: 'connected'; host: string; server: { name: string; version: string } }
	| { state: 'failed'; host: string; failure: ConnectFailure }
	/** Was connected; the map stays on screen until the viewer reconnects or leaves. */
	| { state: 'lost'; host: string };

export type NamingFailureCode = Exclude<(typeof NAMING_CODES)[number], 'queued'> | 'unknown';

/**
 * What serve said about naming a node's children. `queued`: the user's agent names them the
 * next time it runs, and a named level follows then. A named level clears the entry.
 */
export type Naming =
	| { state: 'pending' }
	| { state: 'queued' }
	| { state: 'failed'; code: NamingFailureCode; error: string };

/** The last request that failed, for the banner. */
export type BridgeNotice =
	| {
			kind: 'expand';
			label: string;
			code: RpcErrorCode<'node.expand'> | 'disconnected';
			error: string;
	  }
	| { kind: 'map'; code: RpcErrorCode<'map.get'> | 'disconnected'; error: string };

/** `files`: serve does not expand this node (its files open one by one), so its file list shows. */
export type ExpandOutcome = 'opened' | 'files' | 'failed' | 'stale';

function createBridgeStore() {
	let status = $state<BridgeStatus>({ state: 'idle' });
	let map = $state.raw<RopemanMap | null>(null);
	let naming = $state(new Map<string, Naming>());
	/** The worker serve said named each node's children, this connection */
	let namedBy = $state(new Map<string, string>());
	/** serve's count of worker runs this session, from its latest push */
	let workerRuns = $state<number | null>(null);
	let notice = $state<BridgeNotice | null>(null);
	let revisions = $state(new Map<string, number>());

	let connection: BridgeConnection | null = null;
	let last: { host: string; token: string; open?: OpenSocket } | null = null;
	// A newer connect or disconnect makes the older attempt's answers stale
	let attempt = 0;
	// A newer map makes an older restore of the user's place stale
	let generation = 0;
	let reloading = false;
	let reloadAgain = false;

	function setNaming(nodeId: string, next: Naming | null) {
		const copy = new Map(naming);
		if (next) copy.set(nodeId, next);
		else copy.delete(nodeId);
		naming = copy;
	}

	/** Caches the level serve sent for `node` and notes whether its names are still coming. */
	function cacheExpansion(node: SemanticNode, level: MapLevel) {
		semanticStore.setCachedLevel(node.id, toViewerLevel(level, node.depth + 1, node.label));
		setNaming(node.id, level.naming === 'grouped' ? { state: 'pending' } : null);
	}

	/** Puts a fresh map in the store and walks the user's drilldown path back into it. */
	async function apply(next: RopemanMap, keepPlace: boolean) {
		const mine = ++generation;
		const path = keepPlace ? semanticStore.drilldownPath : [];
		const selectedId = semanticStore.selectedSemanticNode?.id ?? null;
		// What the user saw on the way down, for a level serve will not hand out again right now
		const seen = new Map(
			path.map((step) => [step.nodeId, semanticStore.getCachedLevel(step.nodeId)])
		);
		map = next;
		projectStore.projectName = next.project.name;
		semanticStore.replaceLevels(toViewerLevels(next));

		const kept: { nodeId: string; label: string }[] = [];
		let key = RESERVED_NODE_ID;
		for (const step of path) {
			const node = semanticStore.getCachedLevel(key)?.nodes.find((n) => n.id === step.nodeId);
			if (!node) break;
			// map.get holds named levels only; a level still grouped is asked for again
			if (!semanticStore.hasCachedLevel(node.id)) {
				const expanded = await connection?.request('node.expand', { nodeId: node.id });
				if (mine !== generation) return;
				const before = seen.get(node.id);
				if (expanded?.ok) cacheExpansion(node, expanded.result);
				// busy (the naming cap) or another refusal keeps the level and its naming state, so a
				// node.named already on the way still lands; only a node serve no longer expands goes
				else if (before && expanded?.code !== 'unknown-node') {
					semanticStore.setCachedLevel(node.id, before);
				} else break;
			}
			kept.push({ nodeId: node.id, label: node.label });
			key = node.id;
		}
		const level = semanticStore.getCachedLevel(key) ?? null;
		semanticStore.drilldownPath = kept;
		semanticStore.currentLevel = level;
		semanticStore.selectedSemanticNode = level?.nodes.find((n) => n.id === selectedId) ?? null;
	}

	async function loadMap(keepPlace: boolean) {
		const conn = connection;
		if (!conn) return;
		const got = await conn.request('map.get', {});
		if (conn !== connection) return;
		if (!got.ok) {
			notice = { kind: 'map', code: got.code, error: got.error };
			return;
		}
		notice = null;
		await apply(got.result, keepPlace);
	}

	/** map.changed may come in bursts; one reload runs at a time and one more follows if needed. */
	async function reload() {
		if (reloading) {
			reloadAgain = true;
			return;
		}
		reloading = true;
		try {
			do {
				reloadAgain = false;
				await loadMap(true);
			} while (reloadAgain);
		} finally {
			reloading = false;
		}
	}

	function onNamed(push: Extract<BridgePush, { type: 'node.named' }>) {
		if (!('level' in push)) {
			setNaming(
				push.nodeId,
				push.code === 'queued'
					? { state: 'queued' }
					: { state: 'failed', code: push.code, error: push.error }
			);
			return;
		}
		setNaming(push.nodeId, null);
		if (push.namedBy) {
			namedBy = new Map(namedBy).set(push.nodeId, push.namedBy.worker);
			workerRuns = push.namedBy.runs;
		}
		const shown = semanticStore.getCachedLevel(push.nodeId);
		// A level the map dropped meanwhile comes back named the next time it is expanded
		if (!shown) return;
		const level = toViewerLevel(push.level, shown.nodes[0]?.depth ?? 1, shown.breadcrumbLabel);
		semanticStore.setCachedLevel(push.nodeId, level);
		const byId = new Map(level.nodes.map((n) => [n.id, n]));
		semanticStore.drilldownPath = semanticStore.drilldownPath.map((step) => {
			const renamed = byId.get(step.nodeId);
			return renamed ? { ...step, label: renamed.label } : step;
		});
		if (semanticStore.currentLevel?.parentId === push.nodeId) {
			semanticStore.currentLevel = level;
			const selected = semanticStore.selectedSemanticNode;
			if (selected) semanticStore.selectedSemanticNode = byId.get(selected.id) ?? null;
		}
	}

	function onPush(push: BridgePush) {
		if (push.type === 'node.named') {
			onNamed(push);
			return;
		}
		const copy = new Map(revisions);
		for (const p of push.paths) copy.set(p, (copy.get(p) ?? 0) + 1);
		revisions = copy;
		void reload();
	}

	async function establish(
		host: string,
		token: string,
		open: OpenSocket | undefined,
		keepPlace: boolean
	) {
		const mine = ++attempt;
		connection?.close();
		connection = null;
		last = { host, token, open };
		status = { state: 'connecting', host };
		const result = await connectBridge({
			url: bridgeSocketUrl(host, token),
			open,
			onPush: (push) => {
				if (mine === attempt) onPush(push);
			},
			onLost: () => {
				if (mine !== attempt) return;
				connection = null;
				status = { state: 'lost', host };
			}
		});
		if (mine !== attempt) {
			if (result.ok) result.connection.close();
			return;
		}
		if (!result.ok) {
			status = { state: 'failed', host, failure: result.failure };
			return;
		}
		connection = result.connection;
		status = { state: 'connected', host, server: result.connection.server };
		await loadMap(keepPlace);
	}

	function reset() {
		connection?.close();
		connection = null;
		map = null;
		naming = new Map();
		namedBy = new Map();
		workerRuns = null;
		notice = null;
		revisions = new Map();
		generation++;
		semanticStore.clear();
		projectStore.projectName = '';
	}

	return {
		get status(): BridgeStatus {
			return status;
		},
		get map(): RopemanMap | null {
			return map;
		},
		get notice(): BridgeNotice | null {
			return notice;
		},
		dismissNotice() {
			notice = null;
		},
		namingOf(nodeId: string): Naming | null {
			return naming.get(nodeId) ?? null;
		},
		/** The worker that named this node's children, when serve said so */
		namedByOf(nodeId: string): string | null {
			return namedBy.get(nodeId) ?? null;
		},
		get workerRuns(): number | null {
			return workerRuns;
		},
		/** Goes up by one each time serve reports the file changed, so an open view reads it again. */
		revisionOf(path: string): number {
			return revisions.get(path) ?? 0;
		},

		/** `host` is `127.0.0.1:<port>` (or the page's own host in local mode). */
		async connect(host: string, token: string, open?: OpenSocket): Promise<void> {
			reset();
			await establish(host, token, open, false);
		},

		/** After a loss: same host and token, and the user's place is kept. */
		async reconnect(): Promise<void> {
			if (!last) return;
			naming = new Map();
			namedBy = new Map();
			workerRuns = null;
			await establish(last.host, last.token, last.open, true);
		},

		/** Back to the connect card: closes the socket and forgets the map. */
		disconnect() {
			attempt++;
			last = null;
			reset();
			status = { state: 'idle' };
		},

		/**
		 * Opens a node's level from serve: the deterministic children at once, their names later
		 * by `node.named`. A node serve does not expand shows its file list instead.
		 */
		async expand(node: SemanticNode): Promise<ExpandOutcome> {
			const conn = connection;
			if (!conn) {
				notice = {
					kind: 'expand',
					label: node.label,
					code: 'disconnected',
					error: 'Not connected to serve.'
				};
				return 'failed';
			}
			const got: RpcOutcome<'node.expand'> = await conn.request('node.expand', {
				nodeId: node.id
			});
			if (conn !== connection) return 'stale';
			const stillShown = semanticStore.currentLevel?.nodes.some((n) => n.id === node.id) ?? false;
			if (!got.ok) {
				if (got.code === 'unknown-node') {
					if (stillShown) {
						semanticStore.selectedSemanticNode = node;
						semanticStore.panelDismissed = false;
					}
					return 'files';
				}
				notice = { kind: 'expand', label: node.label, code: got.code, error: got.error };
				return 'failed';
			}
			notice = null;
			cacheExpansion(node, got.result);
			// The user moved on while serve answered: keep the level, do not pull them back
			if (!stillShown) return 'stale';
			semanticStore.drillDown(node);
			tabStore.openDiagramTab(semanticStore.drilldownPath, node.label);
			return 'opened';
		},

		async readFile(path: string): Promise<RpcOutcome<'file.read'>> {
			if (!connection) {
				return { ok: false, code: 'disconnected', error: 'Not connected to serve.' };
			}
			return connection.request('file.read', { path });
		}
	};
}

export const bridgeStore = createBridgeStore();
