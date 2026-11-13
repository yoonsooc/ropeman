import { type ChildProcess, execFile, spawn } from 'child_process';
import type { CLIType } from './auth.js';

/** Why a CLI run produced no answer. */
export type CliFailure = 'not-found' | 'timeout' | 'aborted' | 'too-large' | 'exit';

export class CliError extends Error {
	constructor(
		readonly reason: CliFailure,
		message: string
	) {
		super(message);
	}
}

export interface CommandRun {
	/** The program; spawned with `args` as argv, never through a shell */
	command: string;
	args: string[];
	/** Written to stdin, then stdin is closed; null closes it at once */
	stdin: string | null;
	timeoutMs: number;
	/** stdout past this many bytes kills the run */
	maxOutputBytes: number;
	signal?: AbortSignal;
}

/** Grace between SIGTERM and SIGKILL for a run that is stopped. */
export const KILL_GRACE_MS = 2_000;

const isWindows = process.platform === 'win32';

/**
 * Signals the child and everything it started. On POSIX the child leads its own process group
 * (`detached`), so a wrapper's grandchildren get the signal too. On Windows `taskkill /T /F`
 * ends the tree at once whatever the signal; that path is not tested.
 */
function signalTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
	if (child.pid === undefined) return;
	if (isWindows) {
		execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
		return;
	}
	try {
		process.kill(-child.pid, signal);
	} catch {
		// ESRCH: every process of the group has exited
	}
}

function treeAlive(child: ChildProcess): boolean {
	if (isWindows || child.pid === undefined) return false;
	try {
		process.kill(-child.pid, 0);
		return true;
	} catch {
		return false;
	}
}

interface Started {
	child: ChildProcess;
	/** Trimmed stdout, or a CliError */
	output: Promise<string>;
	/** Resolves once the child has exited and, for a stopped run, its process group is gone */
	gone: Promise<void>;
}

function startCommand(run: CommandRun, cwd: string): Started {
	const child = spawn(run.command, run.args, {
		cwd,
		detached: !isWindows,
		stdio: ['pipe', 'pipe', 'pipe'],
		env: { ...process.env }
	});

	let markGone!: () => void;
	const gone = new Promise<void>((resolve) => (markGone = resolve));
	let stopped: CliError | null = null;
	let killTimer: NodeJS.Timeout | undefined;
	const stop = (error: CliError) => {
		if (stopped) return;
		stopped = error;
		signalTree(child, 'SIGTERM');
		// Not unref'd: a shutdown waits on `gone`, so the SIGKILL must fire before the process exits
		killTimer = setTimeout(() => {
			signalTree(child, 'SIGKILL');
			markGone();
		}, KILL_GRACE_MS);
	};

	const output = new Promise<string>((resolve, reject) => {
		const timer = setTimeout(
			() => stop(new CliError('timeout', `No answer within ${run.timeoutMs} ms.`)),
			run.timeoutMs
		);
		const onAbort = () => stop(new CliError('aborted', 'Cancelled.'));
		run.signal?.addEventListener('abort', onAbort, { once: true });

		child.stdin!.on('error', () => {});
		if (run.stdin !== null) child.stdin!.write(run.stdin);
		child.stdin!.end();

		const out: Buffer[] = [];
		let outBytes = 0;
		let stderr = '';
		child.stdout!.on('data', (chunk: Buffer) => {
			outBytes += chunk.length;
			if (outBytes > run.maxOutputBytes) {
				stop(new CliError('too-large', `Output passed ${run.maxOutputBytes} bytes.`));
				return;
			}
			out.push(chunk);
		});
		child.stderr!.on('data', (chunk: Buffer) => {
			// Only the tail is reported, so a chatty CLI cannot grow this without bound
			stderr = (stderr + chunk.toString()).slice(-4_000);
		});

		const settle = () => {
			clearTimeout(timer);
			run.signal?.removeEventListener('abort', onAbort);
			// A stopped tree with a member still alive (it ignored SIGTERM and let go of stdio)
			// keeps its SIGKILL
			if (!stopped || !treeAlive(child)) {
				clearTimeout(killTimer);
				markGone();
			}
		};
		child.on('error', (err: NodeJS.ErrnoException) => {
			settle();
			reject(
				err.code === 'ENOENT'
					? new CliError('not-found', `CLI '${run.command}' not found. Please install it first.`)
					: new CliError('exit', err.message)
			);
		});
		child.on('close', (code) => {
			settle();
			if (stopped) reject(stopped);
			else if (code === 0) resolve(Buffer.concat(out).toString('utf8').trim());
			else reject(new CliError('exit', stderr.trim() || `CLI exited with code ${code}`));
		});
	});
	return { child, output, gone };
}

/**
 * Every CLI run of one server: at most `concurrency` at a time over every socket, each in `cwd`
 * (an empty folder, so even a CLI that reads files starts outside the project), and each process
 * tree ended on cancel, timeout or `close`.
 */
export class CliRunner {
	private free: number;
	private waiting: Array<() => void> = [];
	private readonly live = new Set<Started>();
	private readonly closing = new AbortController();

	constructor(
		concurrency: number,
		private readonly cwd: string
	) {
		this.free = concurrency;
	}

	/** Waits for a slot, then runs to completion: trimmed stdout, or a CliError. */
	async run(run: CommandRun): Promise<string> {
		const signal = run.signal
			? AbortSignal.any([run.signal, this.closing.signal])
			: this.closing.signal;
		await this.acquire(signal);
		try {
			const started = startCommand({ ...run, signal }, this.cwd);
			this.live.add(started);
			started.gone.then(() => this.live.delete(started));
			return await started.output;
		} finally {
			this.release();
		}
	}

	/** Cancels queued and running runs; resolves once every process tree is gone. */
	async close(): Promise<void> {
		this.closing.abort();
		await Promise.all([...this.live].map((s) => s.gone));
	}

	/** SIGKILLs every live tree synchronously, for `process.on('exit')`. */
	killNow(): void {
		for (const { child } of this.live) signalTree(child, 'SIGKILL');
	}

	private acquire(signal: AbortSignal): Promise<void> {
		if (signal.aborted) return Promise.reject(new CliError('aborted', 'Cancelled.'));
		if (this.free > 0) {
			this.free--;
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			const grant = () => {
				signal.removeEventListener('abort', onAbort);
				resolve();
			};
			const onAbort = () => {
				this.waiting = this.waiting.filter((w) => w !== grant);
				reject(new CliError('aborted', 'Cancelled while queued.'));
			};
			signal.addEventListener('abort', onAbort, { once: true });
			this.waiting.push(grant);
		});
	}

	private release(): void {
		const next = this.waiting.shift();
		if (next) next();
		else this.free++;
	}
}

/** An MCP server name nobody uses: gemini then starts none of the user's servers. */
const NO_MCP_SERVER = 'ropeman-none';

/**
 * Argv and stdin for one headless run, so the answer comes from the prompt alone. claude gets
 * no tools, no MCP servers and no saved session, and wraps its answer in a JSON envelope with the
 * token counts. gemini has no flag that turns every tool off: `--approval-mode default` drops
 * shell, edit, write and web fetch in headless mode, and it starts no MCP server or extension,
 * but its read and search tools stay, limited to the empty working folder.
 */
export function headlessCommand(
	cli: CLIType,
	prompt: string
): { args: string[]; stdin: string | null } {
	switch (cli) {
		case 'claude':
			return {
				args: [
					'-p',
					'--output-format',
					'json',
					'--no-session-persistence',
					'--strict-mcp-config',
					'--tools',
					''
				],
				stdin: prompt
			};
		case 'gemini':
			return {
				args: [
					'-p',
					prompt,
					'--approval-mode',
					'default',
					'--allowed-mcp-server-names',
					NO_MCP_SERVER,
					'-e',
					'none'
				],
				stdin: null
			};
	}
}

/** Whether `cli --version` runs. Argv only, like every other run. */
function answers(cli: CLIType): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(cli, ['--version'], { timeout: 10_000 }, (err) => resolve(!err));
	});
}

/**
 * `claude` when it runs. gemini is never picked on its own: whether a wrapper may run it headless
 * is unclear and accounts have been banned for it, so only `--cli gemini` uses it (ADR-25).
 */
export async function detectCLI(): Promise<CLIType | null> {
	return (await answers('claude')) ? 'claude' : null;
}
