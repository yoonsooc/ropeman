import http from 'http';
import { spawn } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import {
	type CLIType,
	isCLIType,
	isHostAllowed,
	isOriginAllowed,
	localOrigins,
	tokenFromRequestUrl,
	tokensMatch
} from './auth.js';
import { type FileContent, type FileReadRejection, readRootedFile } from './fileRead.js';
import { serveViewerFile } from './viewer.js';

/** Loopback only: nothing else on the network can reach the CLI. */
export const HOST = '127.0.0.1';
/** Skeleton payloads are a few hundred KB; this leaves room without accepting arbitrary sizes. */
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

export interface BridgeOptions {
	port: number;
	token: string;
	allowedOrigins: Set<string>;
	defaultCli: CLIType | null;
	/** Real path from `resolveRoot`; `file.read` is refused without one. */
	root: string | null;
	/** Directory served at `http://127.0.0.1:<port>/` (local mode); none serves nothing. */
	viewerDir: string | null;
	log?: (msg: string) => void;
}

interface BridgeMessage {
	id?: number;
	type: 'analyze' | 'chat' | 'status' | 'ping' | 'file.read';
	payload?: unknown;
	message?: string;
	cli?: 'claude' | 'gemini';
	path?: unknown;
}

interface BridgeResponse {
	id?: number;
	type: string;
	result?: string | FileContent;
	error?: string;
	code?: FileReadRejection | 'no-root';
}

/** CLI별 인자 및 stdin 전략 */
function buildCLIArgs(cli: CLIType, prompt: string): { args: string[]; stdin: string | null } {
	switch (cli) {
		case 'claude':
			// claude -p: reads prompt from stdin
			return { args: ['-p'], stdin: prompt };
		case 'gemini':
			// gemini -p "prompt": requires value as argument
			return { args: ['-p', prompt], stdin: null };
	}
}

function runCLI(cli: CLIType, prompt: string, timeoutMs = 120000): Promise<string> {
	return new Promise((resolve, reject) => {
		const { args, stdin } = buildCLIArgs(cli, prompt);
		const child = spawn(cli, args, {
			timeout: timeoutMs,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env }
		});

		child.stdin.on('error', () => {});
		if (stdin !== null) {
			child.stdin.write(stdin);
		}
		child.stdin.end();

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				reject(new Error(stderr.trim() || `CLI exited with code ${code}`));
			}
		});

		child.on('error', (err) => {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				reject(new Error(`CLI '${cli}' not found. Please install it first.`));
			} else {
				reject(err);
			}
		});
	});
}

/**
 * One loopback port carries the WebSocket and, in local mode, the viewer's static files, so the
 * served page and the socket share an origin. The server is returned unbound; call `listen`.
 */
export function createBridgeServer(options: BridgeOptions): {
	server: http.Server;
	clients: Set<WebSocket>;
} {
	const { port, token, defaultCli, root, viewerDir } = options;
	const log = options.log ?? (() => {});
	const allowedOrigins = new Set(options.allowedOrigins);
	if (viewerDir) for (const origin of localOrigins(port)) allowedOrigins.add(origin);
	const clients = new Set<WebSocket>();

	const server = http.createServer((req, res) => {
		if (!isHostAllowed(req.headers.host, port)) {
			res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Host not allowed');
			return;
		}
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
		maxPayload: MAX_PAYLOAD_BYTES,
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
	log(`Allowed origins: ${[...allowedOrigins].join(', ')}`);

	wss.on('connection', (ws, req) => {
		const addr = req.socket.remoteAddress ?? 'unknown';
		clients.add(ws);
		log(
			`Client connected from ${addr} origin=${req.headers.origin ?? '-'} (${clients.size} total)`
		);

		const reply = (response: BridgeResponse) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
		};

		ws.on('message', (raw) => {
			let msg: BridgeMessage;
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				ws.send(JSON.stringify({ error: 'Invalid JSON' }));
				return;
			}

			log(`Received [${msg.type}] id=${msg.id ?? '-'}`);

			const response: BridgeResponse = { id: msg.id, type: msg.type };

			switch (msg.type) {
				case 'ping':
					response.result = 'pong';
					break;
				case 'status':
					response.result = JSON.stringify({
						clients: clients.size,
						uptime: process.uptime(),
						cli: defaultCli
					});
					break;
				case 'file.read': {
					if (!root) {
						reply({
							...response,
							code: 'no-root',
							error: 'file.read is off. Start the bridge with --root <dir>.'
						});
						return;
					}
					readRootedFile(root, msg.path)
						.then((read) => {
							if (read.ok) {
								log(`file.read id=${msg.id ?? '-'} ${read.file.size} bytes`);
								reply({ ...response, result: read.file });
							} else {
								log(`file.read id=${msg.id ?? '-'} refused: ${read.reason}`);
								reply({ ...response, code: read.reason, error: read.message });
							}
						})
						.catch((err: Error) => reply({ ...response, error: err.message }));
					return;
				}
				case 'analyze':
				case 'chat': {
					const prompt =
						msg.message ||
						(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload));
					if (msg.cli !== undefined && !isCLIType(msg.cli)) {
						response.error = `Unknown CLI: ${String(msg.cli)}. Use 'claude' or 'gemini'.`;
						ws.send(JSON.stringify(response));
						return;
					}
					const cliToUse = msg.cli || defaultCli;

					if (!cliToUse) {
						response.error =
							'No CLI tool available. Install Claude Code or Gemini CLI, or specify --cli flag.';
						ws.send(JSON.stringify(response));
						return;
					}

					const startTime = Date.now();
					const promptLen = prompt.length;
					log(
						`Running ${cliToUse} CLI for [${msg.type}] id=${msg.id ?? '-'} (prompt: ${promptLen} chars)`
					);

					runCLI(cliToUse, prompt)
						.then((result) => {
							const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
							log(`✓ CLI done id=${msg.id ?? '-'} (${elapsed}s, response: ${result.length} chars)`);
							reply({ ...response, result });
						})
						.catch((err: Error) => {
							const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
							log(`✗ CLI failed id=${msg.id ?? '-'} (${elapsed}s): ${err.message}`);
							reply({ ...response, error: err.message });
						});
					return; // Don't send synchronous response
				}
				default:
					response.error = `Unknown message type: ${msg.type}`;
			}

			ws.send(JSON.stringify(response));
		});

		ws.on('close', () => {
			clients.delete(ws);
			log(`Client disconnected (${clients.size} remaining)`);
		});

		ws.on('error', (err) => {
			log(`Client error: ${err.message}`);
			clients.delete(ws);
		});

		// Send welcome
		ws.send(JSON.stringify({ type: 'status', result: 'connected' }));
	});

	return { server, clients };
}
