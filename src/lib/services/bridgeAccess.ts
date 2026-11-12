/**
 * Why the Bridge page can or cannot reach `ropeman serve`, for the guide card. A browser reports a
 * refused port, a wrong token, an origin serve does not allow and a blocked local-network request
 * alike, as a socket that closes before any message (`bridgeClient`'s `closed`). The page tells some
 * of them apart with two more facts: the `loopback-network` permission (Chromium only, ADR-23) and
 * whether anything answers plain HTTP on serve's port. The token and the origin stay together:
 * serve rejects both at the upgrade, and only its terminal says which.
 */

/** Which browser's menus the guide names. `chromium` is any other Chromium (Brave, Arc, Opera). */
export type BrowserFamily = 'chrome' | 'edge' | 'chromium' | 'firefox' | 'safari' | 'other';

/** `unknown`: the browser has no such permission, or refused the query. Never read as denied. */
export type LoopbackPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * Why a socket closed before `hello`.
 * - `denied`: the user (or a policy) blocked this site from reaching the device.
 * - `unanswered`: the permission is still undecided, so the prompt was dismissed or never shown;
 *   serve may also be down, which the page cannot check without asking again.
 * - `serve-down`: the page may reach the device and nothing listens on the port.
 * - `refused`: the page may reach the device and something listens on the port and turned the
 *   socket down: a wrong token, or serve does not allow this page's origin.
 * - `unexplained`: the browser has no permission to read (Firefox, Safari), so the page cannot
 *   tell any of these apart without a probe that could prompt a second time.
 */
export type ClosedCause = 'denied' | 'unanswered' | 'serve-down' | 'refused' | 'unexplained';

/**
 * What the guide card shows. Before connecting: `unasked`, `granted`, `unknown` (no permission to
 * read, as in Firefox), `denied` (blocked earlier) or `safari` (cannot connect from https at all).
 * While connecting: `prompt-pending`. After a failed attempt: its cause.
 */
export type AccessState =
	| 'unasked'
	| 'granted'
	| 'unknown'
	| 'safari'
	| 'prompt-pending'
	| ClosedCause;

export type PermissionsLike = Pick<Permissions, 'query'>;
export type FetchLike = (url: string, init: RequestInit) => Promise<unknown>;

export const PROBE_TIMEOUT_MS = 3000;

/** For the guide's wording only; what the page does next never depends on it, except Safari. */
export function browserFamily(userAgent: string): BrowserFamily {
	// Every iOS browser is WebKit underneath and blocks the same way Safari does
	if (/iPhone|iPad|iPod/.test(userAgent) || /CriOS|FxiOS|EdgiOS/.test(userAgent)) return 'safari';
	if (/Edg\//.test(userAgent)) return 'edge';
	if (/Firefox\//.test(userAgent)) return 'firefox';
	if (/OPR\/|Brave|Vivaldi/.test(userAgent)) return 'chromium';
	if (/Chrome\/|Chromium\//.test(userAgent)) return 'chrome';
	if (/Safari\//.test(userAgent)) return 'safari';
	return 'other';
}

async function permissionStatus(
	permissions: PermissionsLike | undefined
): Promise<PermissionStatus | null> {
	try {
		// Only this name: querying the legacy `local-network-access` crashes some Chrome versions
		return (await permissions?.query({ name: 'loopback-network' as PermissionName })) ?? null;
	} catch {
		return null;
	}
}

function readState(status: PermissionStatus | null): LoopbackPermission {
	const state = status?.state;
	return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'unknown';
}

export async function queryLoopbackPermission(
	permissions: PermissionsLike | undefined
): Promise<LoopbackPermission> {
	return readState(await permissionStatus(permissions));
}

/**
 * Reports the permission now and on each change (the prompt answered, or the site setting
 * changed in another tab). Returns the function that stops listening.
 */
export async function watchLoopbackPermission(
	permissions: PermissionsLike | undefined,
	onChange: (state: LoopbackPermission) => void
): Promise<() => void> {
	const status = await permissionStatus(permissions);
	onChange(readState(status));
	if (!status) return () => {};
	const listener = () => onChange(readState(status));
	status.addEventListener('change', listener);
	return () => status.removeEventListener('change', listener);
}

/**
 * Whether anything answers HTTP on `host`. serve answers every request with the right Host (426
 * without local mode), and a no-cors request resolves on any answer, so a rejection means nothing
 * listens there, or the browser blocked the request.
 */
export async function probeServe(
	host: string,
	fetchFn: FetchLike,
	timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		await fetchFn(`http://${host}/`, {
			mode: 'no-cors',
			cache: 'no-store',
			credentials: 'omit',
			signal: controller.signal
		});
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

export interface ExplainEnv {
	/** A page on 127.0.0.1 or localhost (local mode, a dev server) reaches loopback ungated. */
	loopbackPage: boolean;
	permissions: PermissionsLike | undefined;
	fetch: FetchLike;
}

/**
 * Why the socket to `host` closed before `hello`; asks the permission again, it may have changed.
 * Probes the port only once the page may reach the device: under `denied` the probe hits the same
 * block, and under `prompt` or `unknown` it could raise the prompt again.
 */
export async function explainClosed(host: string, env: ExplainEnv): Promise<ClosedCause> {
	const permission = env.loopbackPage ? 'granted' : await queryLoopbackPermission(env.permissions);
	switch (permission) {
		case 'denied':
			return 'denied';
		case 'prompt':
			return 'unanswered';
		case 'unknown':
			return 'unexplained';
		case 'granted':
			return (await probeServe(host, env.fetch)) ? 'refused' : 'serve-down';
	}
}

export interface AccessInput {
	browser: BrowserFamily;
	permission: LoopbackPermission;
	connection: 'idle' | 'connecting' | 'failed';
	/** The last failed attempt's cause, once known */
	cause: ClosedCause | null;
}

/** The one card the page shows on ropeman.dev, from what it knows right now. */
export function accessState({ browser, permission, connection, cause }: AccessInput): AccessState {
	if (connection === 'failed' && cause) return cause;
	if (connection === 'connecting' && permission === 'prompt') return 'prompt-pending';
	if (permission === 'denied') return 'denied';
	if (permission === 'granted') return 'granted';
	if (browser === 'safari') return 'safari';
	return permission === 'prompt' ? 'unasked' : 'unknown';
}
