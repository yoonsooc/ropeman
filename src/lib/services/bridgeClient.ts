/**
 * The viewer's side of the `ropeman serve` RPC (ADR-24). One connection per call to
 * `connectBridge`: it opens the socket, waits for the server's `hello`, refuses another schema
 * major, then matches each response to its request by id. Every message passes through
 * `parseServerMessage` first, because the socket is input from outside the app.
 */
import {
	type RpcErrorCode,
	type RpcMethod,
	type RpcPush,
	type RpcResponse,
	type RpcResults
} from '$lib/types/ropemanMap';
import { parseServerMessage } from './ropemanMapSchema';

/** The part of a browser `WebSocket` the client uses, so a test can hand it a fake. */
export interface BridgeSocket {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onopen: ((event: unknown) => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: unknown) => void) | null;
	onerror: ((event: unknown) => void) | null;
}

export type OpenSocket = (url: string) => BridgeSocket;

export interface RpcParams {
	'map.get': Record<string, never>;
	'node.expand': { nodeId: string };
	'file.read': { path: string };
}

/** `disconnected`: the socket closed before the answer came. */
export type RpcOutcome<M extends RpcMethod> =
	| { ok: true; result: RpcResults[M] }
	| { ok: false; code: RpcErrorCode<M> | 'disconnected'; error: string };

/**
 * Why a connection never reached `hello`. A browser reports a refused port, a wrong token (401),
 * a disallowed origin (403) and a blocked local-network request the same way, as a close before
 * any message, so `closed` cannot say which.
 */
export type ConnectFailure =
	| { reason: 'closed' }
	| { reason: 'newer-server' | 'older-server'; version: string }
	| { reason: 'bad-hello'; message: string };

export type BridgePush = Exclude<RpcPush, { type: 'hello' }>;

export interface BridgeConnection {
	server: { name: string; version: string };
	request<M extends RpcMethod>(type: M, params: RpcParams[M]): Promise<RpcOutcome<M>>;
	close(): void;
}

export type ConnectResult =
	| { ok: true; connection: BridgeConnection }
	| { ok: false; failure: ConnectFailure };

export interface ConnectOptions {
	/** `ws://127.0.0.1:9800/?token=…`, from `bridgeSocketUrl` */
	url: string;
	onPush: (push: BridgePush) => void;
	/** Once, when a connection that reached `hello` closes for any reason other than `close()` */
	onLost: () => void;
	open?: OpenSocket;
}

/** Same host spelling as the page in local mode, so the socket stays same-origin. */
export function bridgeSocketUrl(host: string, token: string): string {
	return `ws://${host}/?token=${encodeURIComponent(token)}`;
}

// The browser's handlers take narrower events than the fake's; the client reads only `data`
const browserSocket: OpenSocket = (url) => new WebSocket(url) as unknown as BridgeSocket;

/** The id of a message the parser refused, so the request it answers does not wait forever. */
function rawId(text: string): number | null {
	try {
		const id = (JSON.parse(text) as { id?: unknown })?.id;
		return Number.isSafeInteger(id) ? (id as number) : null;
	} catch {
		return null;
	}
}

export function connectBridge(options: ConnectOptions): Promise<ConnectResult> {
	const socket = (options.open ?? browserSocket)(options.url);
	const pending = new Map<
		number,
		{ type: RpcMethod; settle: (o: RpcOutcome<RpcMethod>) => void }
	>();
	let nextId = 1;
	let phase: 'opening' | 'open' | 'closed' = 'opening';

	return new Promise<ConnectResult>((resolve) => {
		const fail = (failure: ConnectFailure) => {
			phase = 'closed';
			socket.close();
			resolve({ ok: false, failure });
		};

		const settleAll = () => {
			for (const { settle } of pending.values()) {
				settle({ ok: false, code: 'disconnected', error: 'The connection to serve closed.' });
			}
			pending.clear();
		};

		const connection = (server: BridgeConnection['server']): BridgeConnection => ({
			server,
			request<M extends RpcMethod>(type: M, params: RpcParams[M]) {
				return new Promise<RpcOutcome<M>>((settle) => {
					if (phase !== 'open') {
						settle({ ok: false, code: 'disconnected', error: 'Not connected to serve.' });
						return;
					}
					const id = nextId++;
					pending.set(id, { type, settle: settle as (o: RpcOutcome<RpcMethod>) => void });
					socket.send(JSON.stringify({ ...params, id, type }));
				});
			},
			close() {
				if (phase === 'closed') return;
				phase = 'closed';
				socket.close(1000);
				settleAll();
			}
		});

		const answer = (message: RpcResponse) => {
			const waiting = pending.get(message.id);
			if (!waiting || waiting.type !== message.type) return;
			pending.delete(message.id);
			waiting.settle(
				'result' in message
					? { ok: true, result: message.result }
					: { ok: false, code: message.code, error: message.error }
			);
		};

		socket.onmessage = ({ data }) => {
			if (phase === 'closed' || typeof data !== 'string') return;
			const parsed = parseServerMessage(data);
			if (phase === 'opening') {
				// The parser refuses another major in the hello before it reads the rest
				if (!parsed.ok) {
					return fail(
						parsed.code === 'newer-version' || parsed.code === 'unsupported-version'
							? {
									reason: parsed.code === 'newer-version' ? 'newer-server' : 'older-server',
									version: parsed.version
								}
							: { reason: 'bad-hello', message: parsed.message }
					);
				}
				const hello = parsed.value;
				if (hello.type !== 'hello') {
					return fail({ reason: 'bad-hello', message: `Expected hello, got ${hello.type}.` });
				}
				phase = 'open';
				resolve({ ok: true, connection: connection(hello.server) });
				return;
			}
			if (!parsed.ok) {
				const id = rawId(data);
				const waiting = id === null ? undefined : pending.get(id);
				if (id !== null && waiting) {
					pending.delete(id);
					waiting.settle({ ok: false, code: 'unknown', error: parsed.message });
				}
				return;
			}
			const message = parsed.value;
			if ('id' in message) answer(message);
			else if (message.type !== 'hello') options.onPush(message);
		};

		socket.onclose = () => {
			if (phase === 'opening') {
				phase = 'closed';
				resolve({ ok: false, failure: { reason: 'closed' } });
				return;
			}
			if (phase === 'closed') return;
			phase = 'closed';
			settleAll();
			options.onLost();
		};
		// A failed socket always closes next; the close decides what it meant
		socket.onerror = () => {};
	});
}
