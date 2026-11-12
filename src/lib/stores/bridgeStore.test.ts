import { beforeEach, describe, expect, it } from 'vitest';
import { bridgeStore } from './bridgeStore.svelte';
import { semanticStore } from './semanticStore.svelte';
import { projectStore } from './projectStore.svelte';
import type { BridgeSocket } from '$lib/services/bridgeClient';
import type { MapLevel, RopemanMap } from '$lib/types/ropemanMap';

/** The far end of the socket: the test answers each request the store sends. */
class FakeServer implements BridgeSocket {
	sent: { id: number; type: string; nodeId?: string; path?: string }[] = [];
	onopen: BridgeSocket['onopen'] = null;
	onmessage: BridgeSocket['onmessage'] = null;
	onclose: BridgeSocket['onclose'] = null;
	onerror: BridgeSocket['onerror'] = null;
	closed = false;

	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		queueMicrotask(() => this.onclose?.({}));
	}
	push(message: unknown) {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
	hello() {
		this.push({
			type: 'hello',
			schemaVersion: '1.0',
			server: { name: '@ropeman/bridge', version: '0.3.0' }
		});
	}
	/** Answers the oldest unanswered request of `type`. */
	answer(type: string, body: { result: unknown } | { code: string; error: string }) {
		const i = this.sent.findIndex((m) => m.type === type);
		if (i === -1) throw new Error(`no ${type} request to answer`);
		const [request] = this.sent.splice(i, 1);
		this.push({ id: request.id, type, ...body });
	}
	drop() {
		this.closed = true;
		this.onclose?.({});
	}
}

const node = (id: string, filePaths: string[]) => ({
	id,
	label: id
		.slice(id.indexOf(':') + 1)
		.split('/')
		.pop()!,
	description: '',
	filePaths,
	keySymbols: []
});

const TOP: MapLevel = {
	parentId: null,
	naming: 'grouped',
	nodes: [node('dir:src', ['src/api/a.ts', 'src/b.ts']), node('files:.', ['README.md'])],
	edges: [],
	assignment: null
};

const SRC: MapLevel = {
	parentId: 'dir:src',
	naming: 'grouped',
	nodes: [node('dir:src/api', ['src/api/a.ts']), node('files:src', ['src/b.ts'])],
	edges: [],
	assignment: null
};

const SRC_NAMED: MapLevel = {
	...SRC,
	naming: 'named',
	nodes: SRC.nodes.map((n) => ({ ...n, label: `Named ${n.label}`, description: 'What it does.' })),
	assignment: { leftOut: 0, duplicated: 0, invented: 0, emptied: 0 }
};

function mapOf(levels: MapLevel[]): RopemanMap {
	return {
		format: 'ropeman-map',
		schemaVersion: '1.0',
		project: { name: 'shop' },
		generator: { name: '@ropeman/bridge', version: '0.3.0' },
		generatedAt: '2026-11-13T00:00:00.000Z',
		files: ['src/api/a.ts', 'src/b.ts', 'README.md'].map((path) => ({ path, reason: 'sent' })),
		levels
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const labels = () => semanticStore.currentLevel?.nodes.map((n) => n.label);
const topNode = (id: string) =>
	semanticStore.getCachedLevel('__root__')!.nodes.find((n) => n.id === id)!;

let sockets: FakeServer[] = [];
const open = () => {
	const socket = new FakeServer();
	sockets.push(socket);
	return socket;
};

async function connected(map = mapOf([TOP])) {
	const done = bridgeStore.connect('127.0.0.1:9800', 'token-0123456789abcdef', open);
	const server = sockets[sockets.length - 1];
	server.hello();
	await flush();
	server.answer('map.get', { result: map });
	await done;
	return server;
}

/** Drills into dir:src the way a click does, with serve answering the grouped level. */
async function expandSrc(server: FakeServer) {
	const expanding = bridgeStore.expand(topNode('dir:src'));
	await flush();
	server.answer('node.expand', { result: SRC });
	return expanding;
}

describe('bridgeStore', () => {
	beforeEach(() => {
		bridgeStore.disconnect();
		sockets = [];
	});

	it('connects, then shows the whole map serve holds under the project name', async () => {
		// Arrange, Act
		await connected();

		// Assert
		expect(bridgeStore.status).toMatchObject({ state: 'connected', server: { version: '0.3.0' } });
		expect(projectStore.projectName).toBe('shop');
		expect(labels()).toEqual(['src', '.']);
	});

	it('reports a socket that closed before hello as a failed connection', async () => {
		const server = new FakeServer();
		const done = bridgeStore.connect('127.0.0.1:9800', 'wrong-token-0123456', () => server);

		server.drop();
		await done;

		expect(bridgeStore.status).toEqual({
			state: 'failed',
			host: '127.0.0.1:9800',
			failure: { reason: 'closed' }
		});
	});

	it('shows the folder grouping at once with names pending, then swaps in node.named', async () => {
		const server = await connected();

		const outcome = await expandSrc(server);

		expect(outcome).toBe('opened');
		expect(semanticStore.drilldownPath).toEqual([{ nodeId: 'dir:src', label: 'src' }]);
		expect(labels()).toEqual(['api', 'src']);
		expect(bridgeStore.namingOf('dir:src')).toEqual({ state: 'pending' });

		server.push({ type: 'node.named', nodeId: 'dir:src', level: SRC_NAMED });

		expect(labels()).toEqual(['Named api', 'Named src']);
		expect(bridgeStore.namingOf('dir:src')).toBeNull();
	});

	it('keeps the folder names and the reason serve gave when naming fails', async () => {
		const server = await connected();
		await expandSrc(server);

		server.push({
			type: 'node.named',
			nodeId: 'dir:src',
			code: 'verification-failed',
			error: 'file-unassigned at levels[1].nodes'
		});

		expect(labels()).toEqual(['api', 'src']);
		expect(bridgeStore.namingOf('dir:src')).toEqual({
			state: 'failed',
			code: 'verification-failed',
			error: 'file-unassigned at levels[1].nodes'
		});
	});

	it('opens the file list of a node serve does not expand', async () => {
		const server = await connected();

		const expanding = bridgeStore.expand(topNode('files:.'));
		await flush();
		server.answer('node.expand', { code: 'unknown-node', error: 'Files open with file.read.' });

		expect(await expanding).toBe('files');
		expect(semanticStore.selectedSemanticNode?.id).toBe('files:.');
		expect(semanticStore.panelDismissed).toBe(false);
		expect(semanticStore.drilldownPath).toEqual([]);
	});

	it('shows why an expand failed and stays on the level', async () => {
		const server = await connected();

		const expanding = bridgeStore.expand(topNode('dir:src'));
		await flush();
		server.answer('node.expand', { code: 'busy', error: 'At most 4.' });

		expect(await expanding).toBe('failed');
		expect(bridgeStore.notice).toEqual({
			kind: 'expand',
			label: 'src',
			code: 'busy',
			error: 'At most 4.'
		});
		expect(labels()).toEqual(['src', '.']);
	});

	it('caches but does not drill into a level that answers after the user moved on', async () => {
		const server = await connected();
		const expanding = bridgeStore.expand(topNode('dir:src'));
		semanticStore.currentLevel = null;
		await flush();
		server.answer('node.expand', { result: SRC });

		expect(await expanding).toBe('stale');
		expect(semanticStore.hasCachedLevel('dir:src')).toBe(true);
		expect(semanticStore.drilldownPath).toEqual([]);
	});

	it('reloads on map.changed and walks back to where the user was', async () => {
		// Arrange: inside dir:src with a node selected, the names still pending
		const server = await connected();
		await expandSrc(server);
		semanticStore.selectedSemanticNode = semanticStore.currentLevel!.nodes[1];

		// Act: a file changes; serve's new map holds only the top level
		server.push({ type: 'map.changed', paths: ['src/b.ts'] });
		await flush();
		server.answer('map.get', { result: mapOf([TOP]) });
		await flush();
		server.answer('node.expand', { result: SRC });
		await flush();

		// Assert
		expect(bridgeStore.revisionOf('src/b.ts')).toBe(1);
		expect(bridgeStore.revisionOf('src/api/a.ts')).toBe(0);
		expect(semanticStore.drilldownPath).toEqual([{ nodeId: 'dir:src', label: 'src' }]);
		expect(labels()).toEqual(['api', 'src']);
		expect(semanticStore.selectedSemanticNode?.id).toBe('files:src');
	});

	// Review of PR #79: a busy reply for the level still naming moved the user up to the top
	it.each([
		['busy', 'At most 4 nodes are named at a time per connection.'],
		['internal', 'boom']
	])(
		'stays on a level still naming when serve answers %s on map.changed, then takes the names',
		async (code, error) => {
			// Arrange: inside dir:src, its names still on the way
			const server = await connected();
			await expandSrc(server);

			// Act: a file changes and serve refuses the level again
			server.push({ type: 'map.changed', paths: ['src/b.ts'] });
			await flush();
			server.answer('map.get', { result: mapOf([TOP]) });
			await flush();
			server.answer('node.expand', { code, error });
			await flush();

			// Assert: the folder grouping stays, and the naming already running still lands
			expect(semanticStore.drilldownPath).toEqual([{ nodeId: 'dir:src', label: 'src' }]);
			expect(labels()).toEqual(['api', 'src']);
			expect(bridgeStore.namingOf('dir:src')).toEqual({ state: 'pending' });

			server.push({ type: 'node.named', nodeId: 'dir:src', level: SRC_NAMED });

			expect(labels()).toEqual(['Named api', 'Named src']);
		}
	);

	it('goes up when serve says the folder is no longer one it expands', async () => {
		const server = await connected();
		await expandSrc(server);

		server.push({ type: 'map.changed', paths: ['src/b.ts'] });
		await flush();
		server.answer('map.get', { result: mapOf([TOP]) });
		await flush();
		server.answer('node.expand', { code: 'unknown-node', error: 'dir:src is not a folder node.' });
		await flush();

		expect(semanticStore.drilldownPath).toEqual([]);
		expect(labels()).toEqual(['src', '.']);
	});

	it('uses a named level the new map already holds without asking serve again', async () => {
		const server = await connected();
		await expandSrc(server);

		server.push({ type: 'map.changed', paths: ['src/b.ts'] });
		await flush();
		server.answer('map.get', { result: mapOf([TOP, SRC_NAMED]) });
		await flush();

		expect(server.sent).toEqual([]);
		expect(labels()).toEqual(['Named api', 'Named src']);
	});

	it('falls back to the deepest level that still exists when a folder disappears', async () => {
		const server = await connected();
		await expandSrc(server);
		const withoutSrc: MapLevel = { ...TOP, nodes: [node('files:.', ['README.md'])] };
		const map = mapOf([withoutSrc]);
		map.files = [{ path: 'README.md', reason: 'sent' }];

		server.push({ type: 'map.changed', paths: ['src/b.ts', 'src/api/a.ts'] });
		await flush();
		server.answer('map.get', { result: map });
		await flush();

		expect(semanticStore.drilldownPath).toEqual([]);
		expect(labels()).toEqual(['.']);
		expect(semanticStore.hasCachedLevel('dir:src')).toBe(false);
	});

	it('keeps the map on screen when serve goes away and returns to the same place on reconnect', async () => {
		// Arrange
		const server = await connected();
		await expandSrc(server);

		// Act: serve stops, then comes back
		server.drop();
		await flush();
		const lostStatus = bridgeStore.status;
		const lostRead = await bridgeStore.readFile('src/b.ts');
		const reconnecting = bridgeStore.reconnect();
		const next = sockets[1];
		next.hello();
		await flush();
		next.answer('map.get', { result: mapOf([TOP]) });
		await flush();
		next.answer('node.expand', { result: SRC });
		await reconnecting;

		// Assert
		expect(lostStatus).toMatchObject({ state: 'lost' });
		expect(lostRead).toMatchObject({ ok: false, code: 'disconnected' });
		expect(bridgeStore.status).toMatchObject({ state: 'connected' });
		expect(semanticStore.drilldownPath).toEqual([{ nodeId: 'dir:src', label: 'src' }]);
		expect(labels()).toEqual(['api', 'src']);
	});

	it('answers file.read through the socket and passes serve refusals through by code', async () => {
		const server = await connected();

		const read = bridgeStore.readFile('.env');
		await flush();
		server.answer('file.read', { code: 'env-file', error: 'Refused.' });

		expect(await read).toEqual({ ok: false, code: 'env-file', error: 'Refused.' });
	});
});
