export interface BridgeCallbacks {
	onStatusChange: (
		status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
	) => void;
	onError: (error: string) => void;
	onPortChange: (port: number) => void;
}

let callbacks: BridgeCallbacks | null = null;

export function setBridgeCallbacks(cb: BridgeCallbacks): void {
	callbacks = cb;
}

let ws: WebSocket | null = null;
let messageId = 0;
const pendingRequests = new Map<
	number,
	{ resolve: (v: string) => void; reject: (e: Error) => void }
>();

// Auto-reconnect state
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastPort: number = 9800;
let intentionalClose = false;
// Internal status tracking (replaces reading from authStore)
let currentStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' =
	'disconnected';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

function getBackoffDelay(attempt: number): number {
	return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 16000);
}

function clearReconnectTimer(): void {
	if (reconnectTimer !== null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function setStatus(
	status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
): void {
	currentStatus = status;
	callbacks?.onStatusChange(status);
}

function setError(error: string): void {
	callbacks?.onError(error);
}

function scheduleReconnect(): void {
	if (intentionalClose || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		setStatus('disconnected');
		if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			setError('Max reconnect attempts reached');
		}
		reconnectAttempts = 0;
		return;
	}

	setStatus('reconnecting');
	const delay = getBackoffDelay(reconnectAttempts);
	reconnectAttempts++;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectBridge(lastPort).catch(() => {
			// connectBridge failure triggers onclose → scheduleReconnect again
		});
	}, delay);
}

function rejectAllPending(): void {
	for (const [id, pending] of pendingRequests) {
		pending.reject(new Error('Connection closed'));
		pendingRequests.delete(id);
	}
}

export function connectBridge(port: number = 9800): Promise<void> {
	return new Promise((resolve, reject) => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			resolve();
			return;
		}

		// Clean up any existing connection
		if (ws) {
			intentionalClose = true;
			ws.close();
			ws = null;
			intentionalClose = false;
		}

		lastPort = port;
		const isReconnecting = currentStatus === 'reconnecting';
		if (!isReconnecting) {
			setStatus('connecting');
		}
		setError('');
		intentionalClose = false;

		try {
			ws = new WebSocket(`ws://localhost:${port}`);
		} catch (err) {
			setStatus('error');
			setError((err as Error).message);
			reject(err);
			return;
		}

		const timeout = setTimeout(() => {
			if (ws && ws.readyState !== WebSocket.OPEN) {
				ws.close();
				setStatus('error');
				setError('Connection timeout');
				reject(new Error('Connection timeout'));
			}
		}, 5000);

		ws.onopen = () => {
			clearTimeout(timeout);
			reconnectAttempts = 0;
			setStatus('connected');
			callbacks?.onPortChange(port);
			resolve();
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.id !== undefined && pendingRequests.has(data.id)) {
					const pending = pendingRequests.get(data.id)!;
					pendingRequests.delete(data.id);
					if (data.error) {
						pending.reject(new Error(data.error));
					} else {
						pending.resolve(data.result ?? data.content ?? '');
					}
				}
			} catch {
				// ignore non-JSON messages
			}
		};

		ws.onerror = () => {
			clearTimeout(timeout);
			if (currentStatus !== 'reconnecting') {
				setStatus('error');
				setError('WebSocket connection failed');
			}
			reject(new Error('WebSocket connection failed'));
		};

		ws.onclose = () => {
			clearTimeout(timeout);
			ws = null;
			rejectAllPending();

			if (!intentionalClose) {
				scheduleReconnect();
			} else {
				setStatus('disconnected');
			}
		};
	});
}

export function sendViaBridge(
	message: string,
	cli?: string,
	signal?: AbortSignal
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			reject(new Error('Bridge not connected'));
			return;
		}

		const id = ++messageId;
		pendingRequests.set(id, { resolve, reject });

		const onAbort = () => {
			if (pendingRequests.has(id)) {
				pendingRequests.delete(id);
				reject(new DOMException('Aborted', 'AbortError'));
			}
		};
		signal?.addEventListener('abort', onAbort, { once: true });

		ws.send(JSON.stringify({ id, type: 'chat', message, cli }));

		// Timeout after 5 minutes (CLI subprocess can be slow for large projects)
		setTimeout(() => {
			if (pendingRequests.has(id)) {
				pendingRequests.delete(id);
				signal?.removeEventListener('abort', onAbort);
				reject(new Error('Bridge request timeout'));
			}
		}, 300000);
	});
}

export function disconnectBridge(): void {
	intentionalClose = true;
	clearReconnectTimer();
	reconnectAttempts = 0;
	if (ws) {
		ws.close();
		ws = null;
	}
	rejectAllPending();
	setStatus('disconnected');
}

export function getBridgeReconnectInfo(): { attempts: number; maxAttempts: number } {
	return { attempts: reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS };
}
