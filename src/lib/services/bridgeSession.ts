/**
 * Whether the Bridge page keeps serve's token across a reload. Only local mode does, where serve
 * itself hosts the page on loopback; then the token sits in that tab's sessionStorage. ropeman.dev
 * loads third-party scripts (the Cloudflare analytics beacon) that could read storage, so there
 * the token stays in memory and a reload asks for it again.
 */

export interface BridgeSession {
	/** `127.0.0.1:<port>`, or the page's own host in local mode */
	host: string;
	token: string;
}

export type PageLocation = Pick<Location, 'protocol' | 'hostname' | 'host'>;

const KEY = 'ropeman-bridge';

export function isLoopbackPage(page: PageLocation): boolean {
	return (
		page.protocol === 'http:' && (page.hostname === '127.0.0.1' || page.hostname === 'localhost')
	);
}

/** Local mode: the page and the socket share serve's loopback host. */
function keepsToken(page: PageLocation, host: string): boolean {
	return isLoopbackPage(page) && host === page.host;
}

export function saveSession(page: PageLocation, session: BridgeSession): void {
	if (!keepsToken(page, session.host)) return;
	try {
		sessionStorage.setItem(KEY, JSON.stringify(session));
	} catch {
		// Storage off (private mode): the user opens serve's link again after a reload
	}
}

/** The session this tab saved for this very page, so a reload in local mode reconnects. */
export function loadSession(page: PageLocation): BridgeSession | null {
	if (!isLoopbackPage(page)) return null;
	try {
		const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
		return typeof saved?.host === 'string' &&
			typeof saved?.token === 'string' &&
			keepsToken(page, saved.host)
			? { host: saved.host, token: saved.token }
			: null;
	} catch {
		return null;
	}
}
