import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	DEFAULT_ALLOWED_ORIGINS,
	MIN_TOKEN_LENGTH,
	TOKEN_ENV,
	isOriginAllowed,
	parseAllowedOrigins,
	resolveToken,
	tokenFromRequestUrl,
	tokensMatch
} from '../src/auth';

describe('bridge auth', () => {
	describe('isOriginAllowed', () => {
		const allowed = parseAllowedOrigins([]);

		it('allows the production app and local dev servers', () => {
			for (const origin of DEFAULT_ALLOWED_ORIGINS) {
				expect(isOriginAllowed(origin, allowed)).toBe(true);
			}
		});

		it('refuses any other site', () => {
			// Regression: before origin checks, any page the user visited could drive the local CLI
			expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
			expect(isOriginAllowed('https://ropeman.dev.evil.example', allowed)).toBe(false);
			expect(isOriginAllowed('null', allowed)).toBe(false);
		});

		it('allows a non-browser client that sends no Origin', () => {
			expect(isOriginAllowed(undefined, allowed)).toBe(true);
		});
	});

	describe('parseAllowedOrigins', () => {
		it('adds every --allow-origin and drops a trailing slash', () => {
			// Act
			const origins = parseAllowedOrigins([
				'--allow-origin',
				'https://a.example/',
				'--port',
				'9800',
				'--allow-origin',
				'http://localhost:3000'
			]);

			// Assert
			expect(origins.has('https://a.example')).toBe(true);
			expect(origins.has('http://localhost:3000')).toBe(true);
			expect(origins.has('https://ropeman.dev')).toBe(true);
		});
	});

	describe('tokensMatch', () => {
		it('matches only the exact token', () => {
			expect(tokensMatch('abc', 'abc')).toBe(true);
			expect(tokensMatch('abd', 'abc')).toBe(false);
			expect(tokensMatch('ab', 'abc')).toBe(false);
			expect(tokensMatch(null, 'abc')).toBe(false);
			expect(tokensMatch('', 'abc')).toBe(false);
		});
	});

	describe('tokenFromRequestUrl', () => {
		it('reads and decodes the token query parameter', () => {
			expect(tokenFromRequestUrl('/?token=tok%2F%2B%3Den')).toBe('tok/+=en');
			expect(tokenFromRequestUrl('/')).toBeNull();
			expect(tokenFromRequestUrl(undefined)).toBeNull();
		});
	});

	describe('resolveToken', () => {
		let dir: string;
		let tokenFile: string;

		beforeEach(() => {
			dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-bridge-'));
			tokenFile = path.join(dir, 'nested', 'bridge-token');
		});

		afterEach(() => {
			fs.rmSync(dir, { recursive: true, force: true });
		});

		const flagToken = 'flag-token-0123456789';
		const envToken = 'env-token-0123456789';

		it('prefers --token, then the environment', () => {
			expect(resolveToken(['--token', flagToken], { [TOKEN_ENV]: envToken }, tokenFile)).toBe(
				flagToken
			);
			expect(resolveToken([], { [TOKEN_ENV]: envToken }, tokenFile)).toBe(envToken);
			expect(fs.existsSync(tokenFile)).toBe(false);
		});

		it('refuses a given token shorter than the minimum', () => {
			const short = 'x'.repeat(MIN_TOKEN_LENGTH - 1);
			expect(() => resolveToken(['--token', short], {}, tokenFile)).toThrow(/at least 16/);
			expect(() => resolveToken([], { [TOKEN_ENV]: short }, tokenFile)).toThrow(/at least 16/);
			expect(resolveToken(['--token', 'x'.repeat(MIN_TOKEN_LENGTH)], {}, tokenFile)).toHaveLength(
				MIN_TOKEN_LENGTH
			);
		});

		it('creates an owner-only token file and reuses it on the next run', () => {
			// Act
			const first = resolveToken([], {}, tokenFile);
			const second = resolveToken([], {}, tokenFile);

			// Assert
			expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
			expect(second).toBe(first);
			expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
		});

		it.skipIf(process.platform === 'win32')(
			'tightens an existing token file that others can read',
			() => {
				// Arrange
				fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
				fs.writeFileSync(tokenFile, 'stored-token-0123456789\n', { mode: 0o644 });
				fs.chmodSync(tokenFile, 0o644);

				// Act
				const token = resolveToken([], {}, tokenFile);

				// Assert
				expect(token).toBe('stored-token-0123456789');
				expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
			}
		);
	});
});
