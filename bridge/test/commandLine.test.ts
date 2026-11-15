import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { HOST } from '../src/bridge';
import { buildBundle } from './bundle';

const USAGE_LINES = [
	'ropeman serve [--root <repo>]',
	'ropeman map --root <repo> --out <folder>',
	'ropeman verify --root <repo> --map <ropeman.json>'
];
const EXIT_WITHIN_MS = 10_000;
const TEST_TIMEOUT = { timeout: EXIT_WITHIN_MS + 5_000 };

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.on('error', reject);
		probe.listen(0, HOST, () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

const listening = (port: number) =>
	new Promise<boolean>((resolve) => {
		const socket = net.connect(port, HOST);
		socket.on('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.on('error', () => resolve(false));
	});

interface Run {
	code: number | null;
	timedOut: boolean;
	stdout: string;
	stderr: string;
}

const row = (args: string[]) => ({ command: args.join(' '), args });

describe('the ropeman command line', () => {
	let dir: string | undefined;
	let bundle: string;
	let base: string;

	beforeAll(async () => {
		({ dir, bundle } = await buildBundle());
	}, 60_000);

	afterAll(() => {
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	});

	beforeEach(() => {
		base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-cli-')));
		fs.mkdirSync(path.join(base, 'home'));
		fs.mkdirSync(path.join(base, 'project', 'src'), { recursive: true });
		fs.writeFileSync(path.join(base, 'project', 'src', 'index.ts'), 'export const one = 1;\n');
	});

	afterEach(() => {
		spawnSync('pkill', ['-KILL', '-f', base]);
		fs.rmSync(base, { recursive: true, force: true });
	});

	const root = () => path.join(base, 'project');
	const out = () => path.join(root(), '.ropeman');
	const tokenFile = () => path.join(base, 'home', '.ropeman', 'bridge-token');
	const env = () => ({
		PATH: [path.dirname(process.execPath), '/bin', '/usr/bin'].join(path.delimiter),
		HOME: path.join(base, 'home'),
		USERPROFILE: path.join(base, 'home')
	});

	function ropeman(args: string[]): Promise<Run> {
		return new Promise((resolve) => {
			// The child's fields, not the error's, since a serve stopped by the timeout's SIGTERM exits 0
			const child = execFile(
				process.execPath,
				[bundle, ...args],
				{ env: env(), timeout: EXIT_WITHIN_MS },
				(_err, stdout, stderr) =>
					resolve({ code: child.exitCode, timedOut: child.killed, stdout, stderr })
			);
		});
	}

	it.each([
		row(['serve', '--help']),
		row(['serve', '-h']),
		row(['serve', '--port', '9900', '--cli', 'claude', '--help']),
		row(['--help']),
		row(['-h']),
		row(['map', '--help']),
		row(['map', '-h']),
		row(['verify', '--help']),
		row(['inbox', '--help']),
		row(['stop', '--help'])
	])('ropeman $command prints the usage and exits 0', TEST_TIMEOUT, async ({ args }) => {
		// Act
		const run = await ropeman(args);

		// Assert
		expect(run).toMatchObject({ code: 0, timedOut: false, stderr: '' });
		for (const line of USAGE_LINES) expect(run.stdout).toContain(line);
		expect(fs.existsSync(tokenFile())).toBe(false);
	});

	it('ropeman serve --detach --help starts no serve in the background', TEST_TIMEOUT, async () => {
		// Arrange
		const port = await freePort();

		// Act
		const run = await ropeman([
			'serve',
			'--root',
			root(),
			'--out',
			out(),
			'--port',
			String(port),
			'--detach',
			'--help'
		]);

		// Assert
		expect(run).toMatchObject({ code: 0, timedOut: false });
		expect(await listening(port)).toBe(false);
		expect(fs.existsSync(out())).toBe(false);
		expect(fs.existsSync(tokenFile())).toBe(false);
	});

	it('ropeman map --help with its options writes no map', TEST_TIMEOUT, async () => {
		// Act
		const run = await ropeman(['map', '--root', root(), '--out', out(), '--help']);

		// Assert
		expect(run).toMatchObject({ code: 0, timedOut: false });
		expect(fs.existsSync(out())).toBe(false);
	});

	it.each([
		{ ...row(['serve', '--bogus']), names: "'--bogus'" },
		{ ...row(['serve', '.']), names: "'.'" },
		{ ...row(['serve', '--port=9900']), names: "'--port=9900'" },
		{ ...row(['mpa']), names: "'mpa'" },
		{ ...row(['serve', '--', '--help']), names: "'--'" },
		{ ...row(['serve', '--port', '--local']), names: '--port' },
		{ ...row(['serve', '--port', '--help']), names: '--port' },
		{ ...row(['serve', '--out', '-h']), names: '--out' },
		{ ...row(['serve', '--root']), names: '--root' }
	])(
		'ropeman $command names the argument serve cannot read and exits 1 with the usage',
		TEST_TIMEOUT,
		async ({ args, names }) => {
			// Act
			const run = await ropeman(args);

			// Assert
			expect(run).toMatchObject({ code: 1, timedOut: false, stdout: '' });
			const [problem, ...usage] = run.stderr.split('\n');
			expect(problem).toContain(names);
			expect(usage.join('\n')).toContain(USAGE_LINES[0]);
			expect(fs.existsSync(tokenFile())).toBe(false);
		}
	);

	it(
		'ropeman map reads --help after -- as an argument, not as a request for help',
		TEST_TIMEOUT,
		async () => {
			// Act
			const run = await ropeman(['map', '--root', root(), '--out', out(), '--', '--help']);

			// Assert
			expect(run).toMatchObject({ code: 2, timedOut: false, stdout: '' });
			expect(run.stderr).toContain("'--help'");
			expect(fs.existsSync(out())).toBe(false);
		}
	);

	it(
		'starts with every option the docs list for serve, and a token that starts with --',
		{ timeout: 20_000 },
		async () => {
			// Arrange
			const port = await freePort();
			const viewer = path.join(base, 'viewer');
			fs.mkdirSync(viewer);
			fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>v</title>');
			const child = spawn(
				process.execPath,
				[
					bundle,
					'serve',
					'--root',
					root(),
					'--out',
					out(),
					'--port',
					String(port),
					'--cli',
					'claude',
					'--token',
					'--command-line-test-token',
					'--allow-origin',
					'https://preview.example.com',
					'--local',
					'--viewer',
					viewer,
					'--idle-minutes',
					'0'
				],
				{ env: env(), stdio: ['ignore', 'pipe', 'pipe'] }
			);
			const exited = new Promise((resolve) => child.on('exit', resolve));

			// Act
			let output = '';
			const ready = `Bridge server ready on ws://${HOST}:${port}`;
			const started = await Promise.race([
				new Promise<boolean>((resolve) => {
					const take = (d: Buffer) => {
						output += d;
						if (output.includes(ready)) resolve(true);
					};
					child.stdout!.on('data', take);
					child.stderr!.on('data', take);
				}),
				exited.then(() => false)
			]);

			// Assert
			expect(started, output).toBe(true);
			expect(await listening(port)).toBe(true);
			child.kill('SIGTERM');
			await exited;
		}
	);
});
