import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLoopbackPage, loadSession, saveSession, type PageLocation } from './bridgeSession';

const page = (url: string): PageLocation => {
	const { protocol, hostname, host } = new URL(url);
	return { protocol, hostname, host };
};

const LOCAL = page('http://127.0.0.1:9800/bridge');
const SITE = page('https://ropeman.dev/bridge');
const TOKEN = 'token-0123456789abcdef';

let stored: Map<string, string>;

describe('bridgeSession', () => {
	beforeEach(() => {
		stored = new Map();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => void stored.set(key, value)
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('tells a page serve hosts on loopback from the site', () => {
		expect(isLoopbackPage(LOCAL)).toBe(true);
		expect(isLoopbackPage(page('http://localhost:9800/bridge'))).toBe(true);
		expect(isLoopbackPage(SITE)).toBe(false);
		expect(isLoopbackPage(page('https://127.0.0.1:9800/bridge'))).toBe(false);
	});

	it('keeps the token for a reload in local mode', () => {
		// Arrange, Act
		saveSession(LOCAL, { host: '127.0.0.1:9800', token: TOKEN });

		// Assert
		expect(loadSession(LOCAL)).toEqual({ host: '127.0.0.1:9800', token: TOKEN });
	});

	// Review of PR #79: ropeman.dev put the pasted token where its analytics script could read it
	it('never writes the token to storage on ropeman.dev', () => {
		// Arrange, Act
		saveSession(SITE, { host: '127.0.0.1:9800', token: TOKEN });

		// Assert
		expect(stored.size).toBe(0);
		expect(loadSession(SITE)).toBeNull();
	});

	it('ignores a token saved in storage when the page is on ropeman.dev', () => {
		stored.set('ropeman-bridge', JSON.stringify({ host: '127.0.0.1:9800', token: TOKEN }));

		expect(loadSession(SITE)).toBeNull();
	});

	it('keeps nothing for a loopback page whose socket goes to another port', () => {
		saveSession(page('http://localhost:5173/bridge'), { host: '127.0.0.1:9800', token: TOKEN });

		expect(stored.size).toBe(0);
	});

	it('returns null for a session saved for another port or in another shape', () => {
		stored.set('ropeman-bridge', JSON.stringify({ host: '127.0.0.1:9801', token: TOKEN }));
		expect(loadSession(LOCAL)).toBeNull();

		stored.set('ropeman-bridge', '{"host":1}');
		expect(loadSession(LOCAL)).toBeNull();

		stored.set('ropeman-bridge', 'not json');
		expect(loadSession(LOCAL)).toBeNull();
	});

	it('works without storage, as in a private window', () => {
		vi.stubGlobal('sessionStorage', {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('SecurityError');
			}
		});

		expect(() => saveSession(LOCAL, { host: '127.0.0.1:9800', token: TOKEN })).not.toThrow();
		expect(loadSession(LOCAL)).toBeNull();
	});
});
