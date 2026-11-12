import { execFile, spawn } from 'child_process';
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
	cwd?: string;
}

/** Grace between SIGTERM and SIGKILL for a run that is stopped. */
const KILL_GRACE_MS = 2_000;

/** Runs one command to completion and resolves its trimmed stdout, or rejects with a CliError. */
export function runCommand(run: CommandRun): Promise<string> {
	return new Promise((resolve, reject) => {
		if (run.signal?.aborted) {
			reject(new CliError('aborted', 'Cancelled before it started.'));
			return;
		}
		const child = spawn(run.command, run.args, {
			cwd: run.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env }
		});

		let stopped: CliError | null = null;
		let killTimer: NodeJS.Timeout | undefined;
		const stop = (error: CliError) => {
			if (stopped) return;
			stopped = error;
			child.kill('SIGTERM');
			killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
			killTimer.unref();
		};
		const timer = setTimeout(
			() => stop(new CliError('timeout', `No answer within ${run.timeoutMs} ms.`)),
			run.timeoutMs
		);
		const onAbort = () => stop(new CliError('aborted', 'Cancelled.'));
		run.signal?.addEventListener('abort', onAbort, { once: true });

		child.stdin.on('error', () => {});
		if (run.stdin !== null) child.stdin.write(run.stdin);
		child.stdin.end();

		const out: Buffer[] = [];
		let outBytes = 0;
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => {
			outBytes += chunk.length;
			if (outBytes > run.maxOutputBytes) {
				stop(new CliError('too-large', `Output passed ${run.maxOutputBytes} bytes.`));
				return;
			}
			out.push(chunk);
		});
		child.stderr.on('data', (chunk: Buffer) => {
			// Only the tail is reported, so a chatty CLI cannot grow this without bound
			stderr = (stderr + chunk.toString()).slice(-4_000);
		});

		const settle = () => {
			clearTimeout(timer);
			run.signal?.removeEventListener('abort', onAbort);
		};
		child.on('error', (err: NodeJS.ErrnoException) => {
			settle();
			clearTimeout(killTimer);
			reject(
				err.code === 'ENOENT'
					? new CliError('not-found', `CLI '${run.command}' not found. Please install it first.`)
					: new CliError('exit', err.message)
			);
		});
		child.on('close', (code) => {
			settle();
			clearTimeout(killTimer);
			if (stopped) reject(stopped);
			else if (code === 0) resolve(Buffer.concat(out).toString('utf8').trim());
			else reject(new CliError('exit', stderr.trim() || `CLI exited with code ${code}`));
		});
	});
}

/** Whether `cli --version` runs. Argv only, like every other run. */
function answers(cli: CLIType): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(cli, ['--version'], { timeout: 10_000 }, (err) => resolve(!err));
	});
}

/** The first CLI that runs, claude before gemini. */
export async function detectCLI(): Promise<CLIType | null> {
	if (await answers('claude')) return 'claude';
	if (await answers('gemini')) return 'gemini';
	return null;
}
