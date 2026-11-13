#!/usr/bin/env node

import { randomUUID } from 'crypto';
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
import {
	DEFAULT_IDLE_MINUTES,
	type ServeRecord,
	launchDetached,
	removeRecord,
	runStop,
	runningServe,
	stopServe,
	writeRecord
} from './background.js';
import { HOST, createBridgeServer } from './bridge.js';
import { CliRunner, KILL_GRACE_MS, detectCLI } from './cli.js';
import { resolveRoot } from './fileRead.js';
import {
	type CommandEnv,
	outFolder,
	runCommand,
	runMap,
	runInbox,
	runVerify,
	serveOutValue
} from './mapCommand.js';
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

/** The viewer this package ships (`npm run bundle:viewer`), for `--local`. */
function bundledViewer(): string {
	const dir = fileURLToPath(new URL('./viewer', import.meta.url));
	if (!fs.existsSync(path.join(dir, 'bridge.html'))) {
		console.error(
			`Cannot start: --local needs the viewer bundle in ${dir}. Build it with npm run bundle:viewer.`
		);
		process.exit(1);
	}
	return resolveRoot(dir);
}

const USAGE = `usage:
  ropeman serve [--root <repo>] [--out <folder>] [--local] [--port <n>] [--cli claude|gemini]
                [--detach] [--idle-minutes <n>]
  ropeman stop --out <folder>
  ropeman map --root <repo> --out <folder> [--depth <n>]
  ropeman verify --root <repo> --map <ropeman.json>
  ropeman inbox --out <folder>
  ropeman --version`;

/** Set by `--detach` on the serve it starts: no token in its log, which is a file */
const DETACHED_CHILD = '--detached-child';

/** `--idle-minutes`: stop after this long with no page open; 0, the default here, never. */
function parseIdleMinutes(args: string[]): number {
	const idx = args.indexOf('--idle-minutes');
	if (idx === -1) return 0;
	const minutes = Number(args[idx + 1]);
	if (!args[idx + 1] || !Number.isFinite(minutes) || minutes < 0) {
		console.error('Cannot start: --idle-minutes needs a number of minutes, 0 for never.');
		process.exit(1);
	}
	return minutes;
}

/** `--out`: the folder shared with the agent (`ropeman map --out`), created if missing. */
function parseOutFlag(args: string[], root: string | null): string | null {
	try {
		const value = serveOutValue(args);
		if (value === null) return null;
		if (!root) {
			console.error('Cannot start: --out needs --root, the folder its map describes.');
			process.exit(1);
		}
		return outFolder(root, value);
	} catch (err) {
		console.error(`Cannot start: ${(err as Error).message}`);
		process.exit(1);
	}
}

/**
 * The headless worker that names a folder the user opens without names: `--cli`, else `claude`
 * when it runs (never gemini on its own, ADR-25). null leaves the folder to the user's agent
 * through the queue in `--out`, or to nobody without one.
 */
async function namingCli(flag: CLIType | null): Promise<CLIType | null> {
	return flag ?? detectCLI();
}

function log(msg: string): void {
	const ts = new Date().toISOString().slice(11, 19);
	console.log(`[${ts}] ${msg}`);
}

/** Long enough for `claude -p` on a folder of a large repo (PASEO: see docs/ARCH.md). */
const NAMING_TIMEOUT_MS = 180_000;
/** Namings that run the CLI at once, over every socket */
const CLI_CONCURRENCY = 2;
const NAMING_MAX_OUTPUT_BYTES = 1_000_000;
const WATCH_DEBOUNCE_MS = 300;

const WASM_DIR = fileURLToPath(new URL('./wasm', import.meta.url));

async function main() {
	const argv = process.argv.slice(2);
	const env: CommandEnv = {
		wasmDir: WASM_DIR,
		generator: { name: pkg.name, version: pkg.version },
		out: (text) => process.stdout.write(`${text}\n`),
		err: (text) => process.stderr.write(`${text}\n`)
	};
	const commands = { map: runMap, verify: runVerify, inbox: runInbox, stop: runStop };
	if (Object.hasOwn(commands, argv[0] ?? '')) {
		const command = commands[argv[0] as keyof typeof commands];
		// exitCode, not exit(): exit() can cut a report still flushing to a pipe
		process.exitCode = await runCommand(command, argv.slice(1), env);
		return;
	}
	if (argv[0] === '--version') return void console.log(pkg.version);
	if (argv[0] === '--help' || argv[0] === '-h') return void console.log(USAGE);
	// `ropeman serve …` and `ropeman-bridge …` run the same server
	if (argv[0] === 'serve') argv.shift();
	const port = parsePort(argv);
	const root = parseDirFlag(argv, '--root');
	const out = parseOutFlag(argv, root);
	const viewerDir =
		parseDirFlag(argv, '--viewer') ?? (argv.includes('--local') ? bundledViewer() : null);
	const cliFlag = parseCLIFlag(argv);
	const idleMinutes = parseIdleMinutes(argv);
	const detachedChild = argv.includes(DETACHED_CHILD);

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
	const announce = (record: ServeRecord) => {
		if (record.open) log(`Local mode: open ${record.open}#token=${token}`);
		else log(`Open https://ropeman.dev/bridge and paste the token (${tokenSource}).`);
	};

	// One serve per --out: starting again reuses it, so the agent can run its start command anytime
	if (out && !detachedChild) {
		const running = await runningServe(out);
		if (running && running.root === root && (running.open !== null) === (viewerDir !== null)) {
			log(`serve already runs for ${out} (pid ${running.pid}, port ${running.port}).`);
			announce(running);
			return;
		}
		if (running) {
			await stopServe(out, running);
			log(`Stopped the serve for ${out} that ran with other options (pid ${running.pid}).`);
		}
	}

	if (argv.includes('--detach')) {
		if (!out) {
			console.error(
				'Cannot start: --detach needs --out, the folder that keeps its record and log.'
			);
			process.exit(1);
		}
		const args = ['serve', ...argv.filter((a) => a !== '--detach'), DETACHED_CHILD];
		if (!argv.includes('--idle-minutes')) args.push('--idle-minutes', String(DEFAULT_IDLE_MINUTES));
		const launched = await launchDetached(out, fileURLToPath(import.meta.url), args);
		if (!launched.ok) {
			console.error(`Cannot start serve in the background. Its output:\n${launched.log}`);
			process.exitCode = 1;
			return;
		}
		const { record } = launched;
		console.log(launched.log);
		const idle = record.idleMinutes
			? `It stops after ${record.idleMinutes} minutes with no page open, or with`
			: 'Stop it with';
		log(
			`serve runs in the background (pid ${record.pid}), its output in ${out}/serve.log. ${idle}: ropeman stop --out ${out}`
		);
		announce(record);
		return;
	}

	// Headless naming starts a CLI with none of the conversation's context, so it is opt-in
	const defaultCli = await namingCli(cliFlag);

	if (defaultCli) log(`Workers naming opened folders: ${defaultCli}`);
	if (defaultCli && out) log(`Worker prompts carry ${out}/brief.md; results go to its naming log`);
	if (!defaultCli && out)
		log(`No worker CLI: opened folders go on the queue in ${out} for your agent`);
	if (!defaultCli && !out) {
		log('Warning: claude not found, so opened folders keep folder names.');
		log('Install Claude Code, pass --cli <claude|gemini>, or pass --out <folder> for your agent.');
	}

	const identity = { name: pkg.name, version: pkg.version };
	// The CLI runs in an empty folder, so even a CLI that reads files starts outside the project
	const namingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-naming-'));
	const runner = new CliRunner(CLI_CONCURRENCY, namingDir);
	const instance = randomUUID();
	// Runs lead their own process groups, so a crash would leave them; this is the last resort
	process.on('exit', () => {
		runner.killNow();
		if (out) removeRecord(out, instance);
	});
	const session = root
		? new MapSession({
				root,
				wasmDir: WASM_DIR,
				naming: defaultCli
					? {
							cli: defaultCli,
							command: defaultCli,
							timeoutMs: NAMING_TIMEOUT_MS,
							maxOutputBytes: NAMING_MAX_OUTPUT_BYTES,
							runner
						}
					: null,
				out,
				server: identity,
				debounceMs: WATCH_DEBOUNCE_MS,
				log
			})
		: null;

	const bridge = createBridgeServer({
		port,
		token,
		allowedOrigins: parseAllowedOrigins(argv),
		root,
		viewerDir,
		session,
		runner,
		server: identity,
		instance,
		log
	});

	const { server } = bridge;
	server.on('error', (err) => {
		if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
			console.error(`Port ${port} is already in use. Try a different port with --port <number>`);
			process.exit(1);
		}
		console.error('Server error:', err.message);
	});

	let stopping = false;
	async function shutdown() {
		if (stopping) return;
		stopping = true;
		log('Shutting down...');
		// A CLI that ignores SIGTERM gets SIGKILL after the grace; this cap only covers a stuck close
		setTimeout(() => process.exit(0), KILL_GRACE_MS + 3_000).unref();
		await bridge.close();
		fs.rmSync(namingDir, { recursive: true, force: true });
		log('Server stopped');
		process.exit(0);
	}

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
	// Runs no longer share the terminal's process group, so a closed terminal reaches them only here
	process.on('SIGHUP', shutdown);

	if (idleMinutes > 0) {
		const idleMs = idleMinutes * 60_000;
		let lastUse = Date.now();
		// A page load or a second start (its check is a request) counts as use, like an open socket
		const use = () => (lastUse = Date.now());
		server.on('request', use);
		server.on('upgrade', use);
		setInterval(
			() => {
				if (bridge.clients.size > 0) use();
				else if (Date.now() - lastUse >= idleMs) {
					log(`No page open for ${idleMinutes} minutes.`);
					void shutdown();
				}
			},
			Math.min(idleMs / 4, 60_000)
		).unref();
	}

	server.listen(port, HOST, () => {
		log(`Bridge server ready on ws://${HOST}:${port}`);
		log(`Open https://ropeman.dev/bridge and paste the token (${tokenSource}).`);
		log(`Map and file.read root: ${root ?? 'off (pass --root <dir>)'}`);
		session?.start();
		// The Ropeman viewer opens at /bridge; another --viewer directory (the probe) at its index
		const entry = viewerDir && fs.existsSync(path.join(viewerDir, 'bridge.html')) ? '/bridge' : '/';
		const record: ServeRecord = {
			pid: process.pid,
			port,
			instance,
			root,
			open: viewerDir ? `http://${HOST}:${port}${entry}` : null,
			idleMinutes,
			startedAt: new Date().toISOString(),
			version: pkg.version
		};
		// The detached serve's log is a file; the command that started it prints the token
		if (record.open && !detachedChild) log(`Local mode: open ${record.open}#token=${token}`);
		else if (record.open) log(`Local mode at ${record.open}`);
		else log('Safari, or the browser blocked the connection? Start again with --local.');
		if (out) writeRecord(out, record);
	});
}

main();
