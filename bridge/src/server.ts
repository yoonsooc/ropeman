#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	type CLIType,
	TOKEN_ENV,
	defaultTokenFile,
	parseAllowedOrigins,
	resolveToken
} from './auth.js';
import { HOST, createBridgeServer } from './bridge.js';
import { detectCLI } from './cli.js';
import { resolveRoot } from './fileRead.js';
import { MapSession } from './mapSession.js';
import pkg from '../package.json';

const DEFAULT_PORT = 9800;

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

/** `--root` and `--viewer` take a directory; a missing one stops startup instead of serving nothing. */
function parseDirFlag(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1 || !args[idx + 1]) return null;
	try {
		return resolveRoot(args[idx + 1]);
	} catch (err) {
		console.error(`Cannot start: ${flag} ${args[idx + 1]}: ${(err as Error).message}`);
		process.exit(1);
	}
}

function log(msg: string): void {
	const ts = new Date().toISOString().slice(11, 19);
	console.log(`[${ts}] ${msg}`);
}

/** Long enough for `claude -p` on a folder of a large repo (PASEO: see docs/ARCH.md). */
const NAMING_TIMEOUT_MS = 180_000;
const NAMING_CONCURRENCY = 2;
const NAMING_MAX_OUTPUT_BYTES = 1_000_000;
const WATCH_DEBOUNCE_MS = 300;

async function main() {
	// `ropeman serve …` and `ropeman-bridge …` run the same server
	const argv = process.argv.slice(2);
	if (argv[0] === 'serve') argv.shift();
	const port = parsePort(argv);
	const root = parseDirFlag(argv, '--root');
	const viewerDir = parseDirFlag(argv, '--viewer');
	let defaultCli: CLIType | null = parseCLIFlag(argv);

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

	// The value stays off the console (and out of captured logs) unless it is part of a link to open
	const tokenSource = argv.includes('--token')
		? 'the --token value'
		: process.env[TOKEN_ENV]
			? `the ${TOKEN_ENV} value`
			: `stored in ${defaultTokenFile()}`;

	const identity = { name: pkg.name, version: pkg.version };
	// The CLI runs in an empty folder, so even a CLI that reads files starts outside the project
	const namingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-naming-'));
	const session = root
		? new MapSession({
				root,
				wasmDir: fileURLToPath(new URL('./wasm', import.meta.url)),
				naming: defaultCli
					? {
							cli: defaultCli,
							command: defaultCli,
							timeoutMs: NAMING_TIMEOUT_MS,
							concurrency: NAMING_CONCURRENCY,
							maxOutputBytes: NAMING_MAX_OUTPUT_BYTES,
							cwd: namingDir
						}
					: null,
				server: identity,
				debounceMs: WATCH_DEBOUNCE_MS,
				log
			})
		: null;

	const { server, clients } = createBridgeServer({
		port,
		token,
		allowedOrigins: parseAllowedOrigins(argv),
		defaultCli,
		root,
		viewerDir,
		session,
		server: identity,
		log
	});

	server.on('error', (err) => {
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
		fs.rmSync(namingDir, { recursive: true, force: true });
		server.close(() => {
			log('Server stopped');
			process.exit(0);
		});
		// Force exit after 3s
		setTimeout(() => process.exit(0), 3000);
	}

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	server.listen(port, HOST, () => {
		log(`Bridge server ready on ws://${HOST}:${port}`);
		log(
			`Token: ${tokenSource}. Paste it into the Token field on the Local Bridge card in Ropeman.`
		);
		log(`Map and file.read root: ${root ?? 'off (pass --root <dir>)'}`);
		session?.start();
		if (viewerDir) log(`Local mode: open http://${HOST}:${port}/#token=${token}`);
	});
}

main();
