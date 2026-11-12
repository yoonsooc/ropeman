import { randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type CLIType = 'claude' | 'gemini';

/** Pages allowed to open a socket. A browser always sends Origin, so any other site is refused. */
export const DEFAULT_ALLOWED_ORIGINS = [
	'https://ropeman.dev',
	'http://localhost:5173',
	'http://localhost:5174',
	'http://localhost:4173',
	'http://127.0.0.1:5173',
	'http://127.0.0.1:4173'
];

export const TOKEN_ENV = 'ROPEMAN_BRIDGE_TOKEN';

export const MIN_TOKEN_LENGTH = 16;

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

/** The origins of the bridge's own pages in local mode. */
export function localOrigins(port: number): string[] {
	return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

/**
 * Blocks DNS rebinding: a page on an attacker's domain that resolves to 127.0.0.1 still sends
 * its own name as Host, while a page the bridge serves or accepts reaches it by the loopback name.
 */
export function isHostAllowed(host: string | undefined, port: number): boolean {
	const name = host?.toLowerCase();
	return name === `127.0.0.1:${port}` || name === `localhost:${port}`;
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
 * browser does not need a new token every run. The file is kept owner-only. Throws when a given
 * token is shorter than MIN_TOKEN_LENGTH.
 */
export function resolveToken(
	args: string[],
	env: NodeJS.ProcessEnv,
	tokenFile: string = defaultTokenFile()
): string {
	const idx = args.indexOf('--token');
	const given = idx !== -1 && args[idx + 1] ? args[idx + 1] : env[TOKEN_ENV];
	if (given) {
		if (given.length < MIN_TOKEN_LENGTH) {
			throw new Error(`Token must be at least ${MIN_TOKEN_LENGTH} characters.`);
		}
		return given;
	}

	let stored = '';
	try {
		stored = fs.readFileSync(tokenFile, 'utf8').trim();
	} catch {
		/* no token yet */
	}
	if (stored) {
		// The mode option only applies when a file is created, so tighten a file made another way.
		try {
			fs.chmodSync(tokenFile, 0o600);
		} catch {
			/* e.g. a file owned by another user; reading it still works */
		}
		return stored;
	}
	const token = randomBytes(24).toString('base64url');
	fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
	fs.writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
	return token;
}
