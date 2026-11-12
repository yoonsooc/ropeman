import { describe, expect, it, vi } from 'vitest';
import {
	accessState,
	browserFamily,
	explainClosed,
	probeServe,
	queryLoopbackPermission,
	watchLoopbackPermission,
	type FetchLike,
	type LoopbackPermission,
	type PermissionsLike
} from './bridgeAccess';
import { connectBridge, type BridgeSocket } from './bridgeClient';

/** A PermissionStatus the test flips, as the browser does when the prompt is answered. */
class FakeStatus extends EventTarget {
	constructor(public state: string) {
		super();
	}
	set(next: string) {
		this.state = next;
		this.dispatchEvent(new Event('change'));
	}
}

function permissionsWith(status: FakeStatus): PermissionsLike & { names: string[] } {
	const names: string[] = [];
	return {
		names,
		query: async (descriptor) => {
			names.push(descriptor.name);
			return status as unknown as PermissionStatus;
		}
	};
}

/** Firefox and Safari: the name is unknown, so the query rejects with a TypeError. */
const rejecting: PermissionsLike = {
	query: () => Promise.reject(new TypeError("'loopback-network' is not a valid permission name"))
};

const answers: FetchLike = () => Promise.resolve({ type: 'opaque' });
const refusesPort: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));

const UA = {
	chrome:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
	edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
	firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
	safari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
	iosChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0 Mobile/15E148 Safari/604.1',
	opera:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 OPR/120.0.0.0'
};

describe('browserFamily', () => {
	it('names the browser whose menus the guide describes', () => {
		expect(browserFamily(UA.chrome)).toBe('chrome');
		expect(browserFamily(UA.edge)).toBe('edge');
		expect(browserFamily(UA.firefox)).toBe('firefox');
		expect(browserFamily(UA.safari)).toBe('safari');
		expect(browserFamily(UA.opera)).toBe('chromium');
		expect(browserFamily('curl/8.0')).toBe('other');
	});

	it('treats every iOS browser as Safari, since all of them are WebKit', () => {
		expect(browserFamily(UA.iosChrome)).toBe('safari');
	});
});

describe('queryLoopbackPermission', () => {
	it('reads the loopback-network state, and asks for no other name', async () => {
		// Arrange
		const permissions = permissionsWith(new FakeStatus('denied'));

		// Act
		const state = await queryLoopbackPermission(permissions);

		// Assert: the legacy local-network-access query crashes some Chrome versions
		expect(state).toBe('denied');
		expect(permissions.names).toEqual(['loopback-network']);
	});

	it('reads a rejected query as unknown, never as denied', async () => {
		expect(await queryLoopbackPermission(rejecting)).toBe('unknown');
	});

	it('reads a missing Permissions API or an unexpected state as unknown', async () => {
		expect(await queryLoopbackPermission(undefined)).toBe('unknown');
		expect(await queryLoopbackPermission(permissionsWith(new FakeStatus('ask')))).toBe('unknown');
	});
});

describe('watchLoopbackPermission', () => {
	it('reports the state now and again when the prompt is answered, until stopped', async () => {
		// Arrange
		const status = new FakeStatus('prompt');
		const seen: LoopbackPermission[] = [];

		// Act
		const stop = await watchLoopbackPermission(permissionsWith(status), (s) => seen.push(s));
		status.set('granted');
		stop();
		status.set('denied');

		// Assert
		expect(seen).toEqual(['prompt', 'granted']);
	});

	it('reports unknown once when the query rejects', async () => {
		const seen: LoopbackPermission[] = [];
		const stop = await watchLoopbackPermission(rejecting, (s) => seen.push(s));
		stop();
		expect(seen).toEqual(['unknown']);
	});
});

describe('probeServe', () => {
	it('asks the host with a no-cors request that carries no credentials', async () => {
		// Arrange
		const fetchFn = vi.fn(answers);

		// Act
		const listening = await probeServe('127.0.0.1:9800', fetchFn);

		// Assert
		expect(listening).toBe(true);
		expect(fetchFn).toHaveBeenCalledWith(
			'http://127.0.0.1:9800/',
			expect.objectContaining({ mode: 'no-cors', credentials: 'omit' })
		);
	});

	it('says nothing listens when the request fails', async () => {
		expect(await probeServe('127.0.0.1:9800', refusesPort)).toBe(false);
	});

	it('gives up after the timeout when nothing answers at all', async () => {
		// Arrange: a request that only ends when aborted
		const hangs: FetchLike = (_url, init) =>
			new Promise((_resolve, reject) =>
				init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
			);

		// Act
		const listening = await probeServe('127.0.0.1:9800', hangs, 20);

		// Assert
		expect(listening).toBe(false);
	});
});

describe('explainClosed', () => {
	/** A socket the server side closes before hello, as a browser reports every refusal. */
	function closingSocket(): BridgeSocket {
		const socket: BridgeSocket = {
			send() {},
			close() {},
			onopen: null,
			onmessage: null,
			onclose: null,
			onerror: null
		};
		queueMicrotask(() => {
			socket.onerror?.({});
			socket.onclose?.({});
		});
		return socket;
	}

	async function failedConnect() {
		return connectBridge({
			url: 'ws://127.0.0.1:9800/?token=t',
			open: closingSocket,
			onPush: () => {},
			onLost: () => {}
		});
	}

	it('tells a wrong token from serve being down once the page may reach the device', async () => {
		// Arrange
		const connected = await failedConnect();
		const granted = permissionsWith(new FakeStatus('granted'));

		// Act
		const env = { loopbackPage: false, permissions: granted };
		const wrongToken = await explainClosed('127.0.0.1:9800', { ...env, fetch: answers });
		const serveDown = await explainClosed('127.0.0.1:9800', { ...env, fetch: refusesPort });

		// Assert
		expect(connected).toEqual({ ok: false, failure: { reason: 'closed' } });
		expect(wrongToken).toBe('refused');
		expect(serveDown).toBe('serve-down');
	});

	it('says denied without probing, since the probe would be blocked too', async () => {
		// Arrange
		const fetchFn = vi.fn(refusesPort);

		// Act
		const cause = await explainClosed('127.0.0.1:9800', {
			loopbackPage: false,
			permissions: permissionsWith(new FakeStatus('denied')),
			fetch: fetchFn
		});

		// Assert
		expect(cause).toBe('denied');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('does not probe while the permission is undecided, which would prompt again', async () => {
		const fetchFn = vi.fn(answers);
		const cause = await explainClosed('127.0.0.1:9800', {
			loopbackPage: false,
			permissions: permissionsWith(new FakeStatus('prompt')),
			fetch: fetchFn
		});
		expect(cause).toBe('unanswered');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('in Firefox or Safari, where the query rejects, does not probe, which could prompt again', async () => {
		// Arrange: serve answers, so a probe would have said refused
		const fetchFn = vi.fn(answers);

		// Act
		const cause = await explainClosed('127.0.0.1:9800', {
			loopbackPage: false,
			permissions: rejecting,
			fetch: fetchFn
		});

		// Assert
		expect(cause).toBe('unexplained');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('without any permissions API, does not probe either', async () => {
		const fetchFn = vi.fn(answers);
		const cause = await explainClosed('127.0.0.1:9800', {
			loopbackPage: false,
			permissions: undefined,
			fetch: fetchFn
		});
		expect(cause).toBe('unexplained');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('on a loopback page skips the permission, which does not gate loopback to loopback', async () => {
		// Arrange: Chromium answers prompt there even though nothing is gated
		const permissions = permissionsWith(new FakeStatus('prompt'));

		// Act
		const cause = await explainClosed('127.0.0.1:9800', {
			loopbackPage: true,
			permissions,
			fetch: refusesPort
		});

		// Assert
		expect(cause).toBe('serve-down');
		expect(permissions.names).toEqual([]);
	});
});

describe('accessState', () => {
	const base = { browser: 'chrome', connection: 'idle', cause: null } as const;

	it('before connecting, says whether the browser will ask', () => {
		expect(accessState({ ...base, permission: 'prompt' })).toBe('unasked');
		expect(accessState({ ...base, permission: 'granted' })).toBe('granted');
		expect(accessState({ ...base, permission: 'denied' })).toBe('denied');
		expect(accessState({ ...base, browser: 'firefox', permission: 'unknown' })).toBe('unknown');
	});

	it('sends Safari straight to local mode', () => {
		expect(accessState({ ...base, browser: 'safari', permission: 'unknown' })).toBe('safari');
	});

	it('while the socket waits on an undecided permission, says the prompt is open', () => {
		expect(accessState({ ...base, connection: 'connecting', permission: 'prompt' })).toBe(
			'prompt-pending'
		);
		expect(accessState({ ...base, connection: 'connecting', permission: 'granted' })).toBe(
			'granted'
		);
	});

	it('after a failed attempt, shows its cause over what the permission says', () => {
		expect(
			accessState({ ...base, connection: 'failed', permission: 'granted', cause: 'refused' })
		).toBe('refused');
		expect(
			accessState({ ...base, connection: 'failed', permission: 'denied', cause: 'denied' })
		).toBe('denied');
		expect(
			accessState({
				...base,
				browser: 'firefox',
				connection: 'failed',
				permission: 'unknown',
				cause: 'unexplained'
			})
		).toBe('unexplained');
	});

	it('picks the permission back up when the prompt is answered while connecting', () => {
		expect(accessState({ ...base, connection: 'connecting', permission: 'denied' })).toBe('denied');
	});
});
