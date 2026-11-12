import { describe, expect, it } from 'vitest';
import { bridgeSocketUrl, connectBridge, type BridgePush, type BridgeSocket } from './bridgeClient';
import type { MapLevel } from '$lib/types/ropemanMap';

/** A socket the test drives: it records what the client sent and plays the server's side. */
class FakeSocket implements BridgeSocket {
	sent: Record<string, unknown>[] = [];
	closed = false;
	onopen: BridgeSocket['onopen'] = null;
	onmessage: BridgeSocket['onmessage'] = null;
	onclose: BridgeSocket['onclose'] = null;
	onerror: BridgeSocket['onerror'] = null;

	constructor(readonly url: string) {}

	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		queueMicrotask(() => this.onclose?.({}));
	}
	serverSends(message: unknown) {
		this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
	}
	serverCloses() {
		this.closed = true;
		this.onclose?.({});
	}
	last() {
		return this.sent[this.sent.length - 1] as { id: number; type: string };
	}
}

const HELLO = {
	type: 'hello',
	schemaVersion: '1.3',
	server: { name: '@ropeman/bridge', version: '0.3.0' }
};

const LEVEL: MapLevel = {
	parentId: 'dir:src',
	naming: 'grouped',
	nodes: [
		{
			id: 'dir:src/api',
			label: 'api',
			description: '',
			filePaths: ['src/api/a.ts'],
			keySymbols: []
		}
	],
	edges: [],
	assignment: null
};

function setup() {
	let socket: FakeSocket | undefined;
	const pushes: BridgePush[] = [];
	let lost = 0;
	const result = connectBridge({
		url: bridgeSocketUrl('127.0.0.1:9800', 'tok en/1'),
		onPush: (p) => pushes.push(p),
		onLost: () => lost++,
		open: (url) => (socket = new FakeSocket(url))
	});
	return { result, socket: socket!, pushes, lost: () => lost };
}

async function connected() {
	const s = setup();
	s.socket.serverSends(HELLO);
	const r = await s.result;
	if (!r.ok) throw new Error('expected a connection');
	return { ...s, connection: r.connection };
}

describe('connectBridge', () => {
	it('opens the loopback socket with the token in the query and reads the hello', async () => {
		// Arrange
		const { result, socket } = setup();

		// Act
		socket.serverSends(HELLO);
		const r = await result;

		// Assert
		expect(socket.url).toBe('ws://127.0.0.1:9800/?token=tok%20en%2F1');
		expect(r).toMatchObject({ ok: true, connection: { server: HELLO.server } });
	});

	it('reports a close before any message as closed, which covers refusal, bad token and a block', async () => {
		const { result, socket } = setup();

		socket.serverCloses();

		expect(await result).toEqual({ ok: false, failure: { reason: 'closed' } });
	});

	it.each([
		['2.0', 'newer-server'],
		['0.9', 'older-server']
	])('refuses a server of schema %s as %s and closes the socket', async (version, reason) => {
		const { result, socket } = setup();

		socket.serverSends({ ...HELLO, schemaVersion: version });

		expect(await result).toEqual({ ok: false, failure: { reason, version } });
		expect(socket.closed).toBe(true);
	});

	it('refuses a first message that is not a hello', async () => {
		const { result, socket } = setup();

		socket.serverSends({ type: 'map.changed', paths: [] });

		expect(await result).toMatchObject({ ok: false, failure: { reason: 'bad-hello' } });
		expect(socket.closed).toBe(true);
	});

	it('matches each response to its request by id, whatever order they come in', async () => {
		const { connection, socket } = await connected();

		const expand = connection.request('node.expand', { nodeId: 'dir:src' });
		const expandId = socket.last().id;
		const read = connection.request('file.read', { path: 'src/api/a.ts' });
		const readId = socket.last().id;
		socket.serverSends({ id: readId, type: 'file.read', code: 'env-file', error: 'No.' });
		socket.serverSends({ id: expandId, type: 'node.expand', result: LEVEL });

		expect(socket.sent).toEqual([
			{ id: expandId, type: 'node.expand', nodeId: 'dir:src' },
			{ id: readId, type: 'file.read', path: 'src/api/a.ts' }
		]);
		expect(await read).toEqual({ ok: false, code: 'env-file', error: 'No.' });
		expect(await expand).toEqual({ ok: true, result: LEVEL });
	});

	it('reads an error code it does not know as unknown and keeps the server sentence', async () => {
		const { connection, socket } = await connected();

		const read = connection.request('file.read', { path: 'a.ts' });
		socket.serverSends({ id: socket.last().id, type: 'file.read', code: 'quota', error: 'Later.' });

		expect(await read).toEqual({ ok: false, code: 'unknown', error: 'Later.' });
	});

	it('fails the one request whose answer the parser refuses, so it does not wait forever', async () => {
		const { connection, socket } = await connected();

		const read = connection.request('file.read', { path: 'a.ts' });
		socket.serverSends({ id: socket.last().id, type: 'file.read', result: { path: 'a.ts' } });

		expect(await read).toMatchObject({ ok: false, code: 'unknown' });
	});

	it('hands node.named and map.changed to the push listener', async () => {
		const { socket, pushes } = await connected();
		const named = { ...LEVEL, naming: 'named' };

		socket.serverSends({ type: 'node.named', nodeId: 'dir:src', level: named });
		socket.serverSends({ type: 'node.named', nodeId: 'dir:lib', code: 'no-cli', error: 'None.' });
		socket.serverSends({ type: 'map.changed', paths: ['src/api/a.ts'] });

		expect(pushes).toEqual([
			{ type: 'node.named', nodeId: 'dir:src', level: named },
			{ type: 'node.named', nodeId: 'dir:lib', code: 'no-cli', error: 'None.' },
			{ type: 'map.changed', paths: ['src/api/a.ts'] }
		]);
	});

	it('answers the waiting requests as disconnected and reports the loss once when serve goes away', async () => {
		const { connection, socket, lost } = await connected();

		const read = connection.request('file.read', { path: 'a.ts' });
		socket.serverCloses();

		expect(await read).toMatchObject({ ok: false, code: 'disconnected' });
		expect(lost()).toBe(1);
		expect(await connection.request('map.get', {})).toMatchObject({ code: 'disconnected' });
		expect(socket.sent).toHaveLength(1);
	});

	it('does not report a loss for a close the viewer asked for', async () => {
		const { connection, socket, lost } = await connected();

		connection.close();
		await Promise.resolve();

		expect(socket.closed).toBe(true);
		expect(lost()).toBe(0);
	});
});
