#!/usr/bin/env node

import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import {
	type CLIType,
	isCLIType,
	isOriginAllowed,
	parseAllowedOrigins,
	resolveToken,
	tokenFromRequestUrl,
	tokensMatch
} from './auth.js';

const exec = promisify(execCb);

const DEFAULT_PORT = 9800;
/** Loopback only: nothing else on the network can reach the CLI. */
const HOST = '127.0.0.1';
/** Skeleton payloads are a few hundred KB; this leaves room without accepting arbitrary sizes. */
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

interface ServerAuth {
	token: string;
	allowedOrigins: Set<string>;
}

interface BridgeMessage {
	id?: number;
	type: 'analyze' | 'chat' | 'status' | 'ping';
	payload?: unknown;
	message?: string;
	cli?: 'claude' | 'gemini';
}

interface BridgeResponse {
	id?: number;
	type: string;
	result?: string;
	error?: string;
}

function parsePort(args: string[]): number {
	const portIdx = args.indexOf('--port');
	if (portIdx !== -1 && args[portIdx + 1]) {
		const p = parseInt(args[portIdx + 1], 10);
		if (!isNaN(p) && p > 0 && p < 65536) return p;
	}
	return DEFAULT_PORT;
}

function parseCLIFlag(args: string[]): CLIType | null {
	const idx = args.indexOf('--cli');
	if (idx !== -1 && args[idx + 1]) {
		const cli = args[idx + 1].toLowerCase();
		if (cli === 'claude' || cli === 'gemini') return cli;
		console.error(`Unknown CLI: ${cli}. Use 'claude' or 'gemini'.`);
		process.exit(1);
	}
	return null;
}

function log(msg: string): void {
	const ts = new Date().toISOString().slice(11, 19);
	console.log(`[${ts}] ${msg}`);
}

async function detectCLI(): Promise<CLIType | null> {
	try {
		await exec('claude --version');
		return 'claude';
	} catch {
		/* not available */
	}
	try {
		await exec('gemini --version');
		return 'gemini';
	} catch {
		/* not available */
	}
	return null;
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

function startServer(
	port: number,
	clients: Set<WebSocket>,
	defaultCli: CLIType | null,
	auth: ServerAuth
): void {
	const wss = new WebSocketServer({
		host: HOST,
		port,
		maxPayload: MAX_PAYLOAD_BYTES,
		verifyClient: ({ origin, req }, done) => {
			if (!isOriginAllowed(origin || undefined, auth.allowedOrigins)) {
				log(
					`Rejected connection from origin ${JSON.stringify(origin).slice(0, 100)} (not allowed)`
				);
				done(false, 403, 'Origin not allowed');
				return;
			}
			if (!tokensMatch(tokenFromRequestUrl(req.url), auth.token)) {
				log('Rejected connection: missing or wrong token');
				done(false, 401, 'Invalid token');
				return;
			}
			done(true);
		}
	});

	log(`Ropeman Bridge server starting on ws://${HOST}:${port}`);

	wss.on('connection', (ws, req) => {
		const addr = req.socket.remoteAddress ?? 'unknown';
		clients.add(ws);
		log(`Client connected from ${addr} (${clients.size} total)`);

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
							response.result = result;
							if (ws.readyState === WebSocket.OPEN) {
								ws.send(JSON.stringify(response));
							}
						})
						.catch((err: Error) => {
							const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
							log(`✗ CLI failed id=${msg.id ?? '-'} (${elapsed}s): ${err.message}`);
							response.error = err.message;
							if (ws.readyState === WebSocket.OPEN) {
								ws.send(JSON.stringify(response));
							}
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

	wss.on('error', (err) => {
		if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
			console.error(`Port ${port} is already in use. Try a different port with --port <number>`);
			process.exit(1);
		}
		console.error('Server error:', err.message);
	});

	function shutdown() {
		log('Shutting down...');
		for (const client of clients) {
			client.close(1000, 'Server shutting down');
		}
		wss.close(() => {
			log('Server stopped');
			process.exit(0);
		});
		// Force exit after 3s
		setTimeout(() => process.exit(0), 3000);
	}

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	log(`Bridge server ready on ws://${HOST}:${port}`);
	log(`Token: ${auth.token}`);
	log('Paste this token into the Bridge tab in Ropeman to connect.');
	log(`Allowed origins: ${[...auth.allowedOrigins].join(', ')}`);
}

async function main() {
	const argv = process.argv.slice(2);
	const port = parsePort(argv);
	const defaultCliArg = parseCLIFlag(argv);
	let defaultCli: CLIType | null = defaultCliArg;

	if (!defaultCli) {
		defaultCli = await detectCLI();
	}

	if (defaultCli) {
		log(`Using CLI: ${defaultCli}`);
	} else {
		log('Warning: No CLI tool detected. Install Claude Code (claude) or Gemini CLI (gemini).');
		log('You can also specify --cli <claude|gemini> flag.');
	}

	let token: string;
	try {
		token = resolveToken(argv, process.env);
	} catch (err) {
		console.error(`Cannot start: ${(err as Error).message}`);
		process.exit(1);
	}
	const auth: ServerAuth = { token, allowedOrigins: parseAllowedOrigins(argv) };

	const clients = new Set<WebSocket>();
	startServer(port, clients, defaultCli, auth);
}

main();
