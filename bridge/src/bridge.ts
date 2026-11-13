import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
	isHostAllowed,
	isOriginAllowed,
	localOrigins,
	tokenFromRequestUrl,
	tokensMatch
} from './auth.js';
import type { CliRunner } from './cli.js';
import { readRootedFile } from './fileRead.js';
import type { MapSession, Subscriber } from './mapSession.js';
import { parseRpcRequest } from '../../src/lib/services/ropemanMapSchema';
import {
	MAP_SCHEMA_VERSION,
	MAX_MAP_BYTES,
	type RpcRequest,
	type RpcResponse,
	type ServerMessage
} from '../../src/lib/types/ropemanMap.js';
import { serveViewerFile } from './viewer.js';

/** Loopback only: nothing else on the network can reach the CLI. */
export const HOST = '127.0.0.1';
/** Per connection, so one page cannot tie up every libuv thread with reads. */
const MAX_FILE_READS_IN_FLIGHT = 8;
/** Per connection: the namings it waits for. */
export const MAX_NAMINGS_IN_FLIGHT = 4;
/** Carries `BridgeOptions.instance` on every HTTP answer */
export const INSTANCE_HEADER = 'x-ropeman-instance';

export interface BridgeOptions {
	port: number;
	token: string;
	allowedOrigins: Set<string>;
	/** Real path from `resolveRoot`; `file.read` is refused without one. */
	root: string | null;
	/** Directory served at `http://127.0.0.1:<port>/` (local mode); none serves nothing. */
	viewerDir: string | null;
	/** The map of `root`; without one `map.get` and `node.expand` answer `not-ready`. */
	session: MapSession | null;
	/** The session's naming runs here; `close` waits for its process trees */
	runner: CliRunner;
	server: { name: string; version: string };
	/**
	 * A random id of this process, sent on every HTTP answer, so `ropeman stop` and a second
	 * start can tell this server from whatever else holds a recorded pid or port.
	 */
	instance?: string;
	log?: (msg: string) => void;
}

/** The answer to a message the parser refused; its type may be one the schema does not know. */
interface BadRequest {
	id: number;
	type: string;
	code: 'bad-request';
	error: string;
}

/** The id and type of a message the parser refused, echoed so the client can match the error. */
function echo(text: string): { id: number; type: string } {
	try {
		const o = JSON.parse(text) as { id?: unknown; type?: unknown };
		return {
			id: Number.isSafeInteger(o?.id) ? (o.id as number) : 0,
			type: typeof o?.type === 'string' ? o.type.slice(0, 64) : 'unknown'
		};
	} catch {
		return { id: 0, type: 'unknown' };
	}
}

/**
 * One loopback port carries the WebSocket and, in local mode, the viewer's static files, so the
 * served page and the socket share an origin. The server is returned unbound; call `listen`.
 */
export function createBridgeServer(options: BridgeOptions): {
	server: http.Server;
	clients: Set<WebSocket>;
	/** Closes every socket and the server, and resolves once every CLI process tree is gone. */
	close(): Promise<void>;
} {
	const { port, token, root, viewerDir, session, runner } = options;
	const log = options.log ?? (() => {});
	const allowedOrigins = new Set(options.allowedOrigins);
	if (viewerDir) for (const origin of localOrigins(port)) allowedOrigins.add(origin);
	const clients = new Set<WebSocket>();

	const server = http.createServer((req, res) => {
		if (!isHostAllowed(req.headers.host, port)) {
			res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Host not allowed');
			return;
		}
		if (options.instance) res.setHeader(INSTANCE_HEADER, options.instance);
		if (!viewerDir) {
			res.writeHead(426, { 'Content-Type': 'text/plain' }).end('Upgrade Required');
			return;
		}
		serveViewerFile(viewerDir, req, res).catch((err: Error) => {
			log(`Viewer request failed: ${err.message}`);
			if (!res.headersSent) res.writeHead(500).end();
		});
	});

	const wss = new WebSocketServer({
		server,
		// A map is at most this large, and nothing a client sends comes close
		maxPayload: MAX_MAP_BYTES,
		verifyClient: ({ origin, req }, done) => {
			if (!isHostAllowed(req.headers.host, port)) {
				log(`Rejected connection: Host ${JSON.stringify(req.headers.host).slice(0, 100)}`);
				done(false, 403, 'Host not allowed');
				return;
			}
			if (!isOriginAllowed(origin || undefined, allowedOrigins)) {
				log(
					`Rejected connection from origin ${JSON.stringify(origin).slice(0, 100)} (not allowed)`
				);
				done(false, 403, 'Origin not allowed');
				return;
			}
			if (!tokensMatch(tokenFromRequestUrl(req.url), token)) {
				log('Rejected connection: missing or wrong token');
				done(false, 401, 'Invalid token');
				return;
			}
			done(true);
		}
	});

	// ws re-emits the server's errors here, and an 'error' with no listener throws; the caller's
	// listener on `server` reports them
	wss.on('error', () => {});
	server.on('close', () => session?.close());
	log(`Allowed origins: ${[...allowedOrigins].join(', ')}`);

	wss.on('connection', (ws, req) => {
		const addr = req.socket.remoteAddress ?? 'unknown';
		clients.add(ws);
		log(
			`Client connected from ${addr} origin=${req.headers.origin ?? '-'} (${clients.size} total)`
		);

		let readsInFlight = 0;
		const send = (message: ServerMessage | BadRequest) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
		};
		const subscriber: Subscriber = { push: send };
		session?.join(subscriber);

		const notReady = (request: RpcRequest) =>
			send({
				id: request.id,
				type: request.type,
				code: 'not-ready',
				error: 'No map: start the bridge with --root <dir>.'
			} as RpcResponse);

		const handlers: { [T in RpcRequest['type']]: (r: Extract<RpcRequest, { type: T }>) => void } = {
			'map.get': (request) => {
				if (!session) return notReady(request);
				session.map().then(
					(result) => send({ id: request.id, type: 'map.get', result }),
					(err: Error) =>
						send({ id: request.id, type: 'map.get', code: 'internal', error: err.message })
				);
			},
			'node.expand': (request) => {
				if (!session) return notReady(request);
				const { id, nodeId } = request;
				if (session.pendingFor(subscriber) >= MAX_NAMINGS_IN_FLIGHT) {
					send({
						id,
						type: 'node.expand',
						code: 'busy',
						error: `At most ${MAX_NAMINGS_IN_FLIGHT} nodes are named at a time per connection.`
					});
					return;
				}
				session.expand(nodeId).then(
					(expanded) => {
						if (!expanded.ok) {
							send({ id, type: 'node.expand', code: expanded.code, error: expanded.error });
							return;
						}
						send({ id, type: 'node.expand', result: expanded.level });
						if (expanded.level.naming === 'grouped') {
							session.name(nodeId, subscriber);
						}
					},
					(err: Error) => send({ id, type: 'node.expand', code: 'internal', error: err.message })
				);
			},
			'file.read': (request) => {
				const { id } = request;
				if (!root) {
					send({
						id,
						type: 'file.read',
						code: 'no-root',
						error: 'file.read is off. Start the bridge with --root <dir>.'
					});
					return;
				}
				if (readsInFlight >= MAX_FILE_READS_IN_FLIGHT) {
					send({
						id,
						type: 'file.read',
						code: 'busy',
						error: `At most ${MAX_FILE_READS_IN_FLIGHT} file.read requests at a time.`
					});
					return;
				}
				readsInFlight++;
				readRootedFile(root, request.path)
					.then((read) => {
						if (read.ok) {
							log(`file.read id=${id} ${read.file.size} bytes`);
							send({ id, type: 'file.read', result: read.file });
						} else {
							log(`file.read id=${id} refused: ${read.reason}`);
							send({ id, type: 'file.read', code: read.reason, error: read.message });
						}
					})
					.catch((err: Error) =>
						send({ id, type: 'file.read', code: 'internal', error: err.message })
					)
					.finally(() => readsInFlight--);
			}
		};

		ws.on('message', (raw) => {
			const text = raw.toString();
			const parsed = parseRpcRequest(text);
			if (!parsed.ok) {
				const { id, type } = echo(text);
				log(`Refused message id=${id} type=${JSON.stringify(type)}: ${parsed.message}`);
				send({ id, type, code: 'bad-request', error: parsed.message });
				return;
			}
			const request = parsed.value;
			log(`Received [${request.type}] id=${request.id}`);
			(handlers[request.type] as (r: RpcRequest) => void)(request);
		});

		ws.on('close', () => {
			clients.delete(ws);
			session?.leave(subscriber);
			log(`Client disconnected (${clients.size} remaining)`);
		});

		ws.on('error', (err) => {
			log(`Client error: ${err.message}`);
			clients.delete(ws);
			session?.leave(subscriber);
		});

		send({ type: 'hello', schemaVersion: MAP_SCHEMA_VERSION, server: options.server });
	});

	const close = async () => {
		for (const ws of clients) ws.close(1000, 'Server shutting down');
		const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
		await runner.close();
		await stopped;
	};

	return { server, clients, close };
}
