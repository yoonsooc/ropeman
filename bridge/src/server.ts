#!/usr/bin/env node

import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { type CLIType, parseAllowedOrigins, resolveToken } from './auth.js';
import { HOST, createBridgeServer } from './bridge.js';
import { resolveRoot } from './fileRead.js';

const exec = promisify(execCb);

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

async function main() {
	const argv = process.argv.slice(2);
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

	const { server, clients } = createBridgeServer({
		port,
		token,
		allowedOrigins: parseAllowedOrigins(argv),
		defaultCli,
		root,
		viewerDir,
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
		log(`Token: ${token}`);
		log('Paste this token into the Token field on the Local Bridge card in Ropeman.');
		log(`file.read root: ${root ?? 'off (pass --root <dir>)'}`);
		if (viewerDir) log(`Local mode: open http://${HOST}:${port}/#token=${token}`);
	});
}

main();
