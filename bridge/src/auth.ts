import { randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type CLIType = 'claude' | 'gemini';

/** Pages allowed to open a socket. A browser always sends Origin, so any other site is refused. */
export const DEFAULT_ALLOWED_ORIGINS = [
	'https://ropeman.dev',
	'http://localhost:5173',
	'http://localhost:4173',
	'http://127.0.0.1:5173',
	'http://127.0.0.1:4173'
];

export const TOKEN_ENV = 'ROPEMAN_BRIDGE_TOKEN';

export function isCLIType(value: unknown): value is CLIType {
	return value === 'claude' || value === 'gemini';
}

/** Collects every `--allow-origin <url>` on top of the defaults. */
export function parseAllowedOrigins(args: string[]): Set<string> {
	const origins = new Set(DEFAULT_ALLOWED_ORIGINS);
	args.forEach((arg, i) => {
		if (arg === '--allow-origin' && args[i + 1]) origins.add(args[i + 1].replace(/\/+$/, ''));
	});
	return origins;
}

/**
 * A missing Origin means a non-browser client on this machine, which could run the CLI
 * itself; the token still applies to it.
 */
export function isOriginAllowed(origin: string | undefined, allowed: Set<string>): boolean {
	return origin === undefined || allowed.has(origin);
}

export function tokensMatch(given: string | null, expected: string): boolean {
	if (!given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** The socket URL carries the token as `?token=`, since browsers cannot set headers on a WebSocket. */
export function tokenFromRequestUrl(url: string | undefined): string | null {
	if (!url) return null;
	return new URL(url, 'ws://127.0.0.1').searchParams.get('token');
}

export function defaultTokenFile(): string {
	return path.join(os.homedir(), '.ropeman', 'bridge-token');
}

/**
 * Precedence: `--token`, then the environment, then a token file kept across restarts so the
 * browser does not need a new token every run. The file is created owner-only.
 */
export function resolveToken(
	args: string[],
	env: NodeJS.ProcessEnv,
	tokenFile: string = defaultTokenFile()
): string {
	const idx = args.indexOf('--token');
	if (idx !== -1 && args[idx + 1]) return args[idx + 1];
	if (env[TOKEN_ENV]) return env[TOKEN_ENV] as string;

	try {
		const stored = fs.readFileSync(tokenFile, 'utf8').trim();
		if (stored) return stored;
	} catch {
		/* no token yet */
	}
	const token = randomBytes(24).toString('base64url');
	fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
	fs.writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
	return token;
}
