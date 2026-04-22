import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track WebSocket instances and callbacks
let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = MockWebSocket.CONNECTING;
	onopen: ((ev: any) => void) | null = null;
	onclose: ((ev: any) => void) | null = null;
	onmessage: ((ev: any) => void) | null = null;
	onerror: ((ev: any) => void) | null = null;
	url: string;
	send = vi.fn();
	close = vi.fn(() => {
		this.readyState = MockWebSocket.CLOSED;
		if (this.onclose) this.onclose({});
	});

	constructor(url: string) {
		this.url = url;
		wsInstances.push(this);
	}

	// Helper to simulate server responses
	simulateOpen() {
		this.readyState = MockWebSocket.OPEN;
		if (this.onopen) this.onopen({});
	}

	simulateMessage(data: any) {
		if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
	}

	simulateError() {
		if (this.onerror) this.onerror({});
	}
}

// Assign mock WebSocket to global before import
(globalThis as any).WebSocket = MockWebSocket;

// Module-level import (uses our MockWebSocket)
import type { BridgeCallbacks } from './bridgeService';
import {
	connectBridge,
	disconnectBridge,
	sendViaBridge,
	setBridgeCallbacks,
	getBridgeReconnectInfo
} from './bridgeService';

describe('bridgeService', () => {
	let callbacks: BridgeCallbacks;

	beforeEach(() => {
		vi.useFakeTimers();
		wsInstances = [];
		callbacks = {
			onStatusChange: vi.fn() as unknown as BridgeCallbacks['onStatusChange'],
			onError: vi.fn() as unknown as BridgeCallbacks['onError'],
			onPortChange: vi.fn() as unknown as BridgeCallbacks['onPortChange']
		};
		setBridgeCallbacks(callbacks);
		// Ensure clean state
		disconnectBridge();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('connectBridge', () => {
		it('resolves on successful connection', async () => {
			const connectPromise = connectBridge(9800);

			// Simulate WebSocket open
			const ws = wsInstances[wsInstances.length - 1];
			ws.simulateOpen();

			await connectPromise;

			expect(callbacks.onStatusChange).toHaveBeenCalledWith('connecting');
			expect(callbacks.onStatusChange).toHaveBeenCalledWith('connected');
			expect(callbacks.onPortChange).toHaveBeenCalledWith(9800);
		});

		it('rejects on connection error', async () => {
			const connectPromise = connectBridge(9800);

			const ws = wsInstances[wsInstances.length - 1];
			ws.simulateError();

			await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
			expect(callbacks.onStatusChange).toHaveBeenCalledWith('error');
		});

		it('resolves immediately if already connected', async () => {
			// First: connect
			const p1 = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p1;

			// Second: should resolve immediately (no new WebSocket)
			const countBefore = wsInstances.length;
			await connectBridge(9800);
			expect(wsInstances.length).toBe(countBefore);
		});
	});

	describe('disconnectBridge', () => {
		it('sets status to disconnected', async () => {
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			vi.clearAllMocks();
			disconnectBridge();

			expect(callbacks.onStatusChange).toHaveBeenCalledWith('disconnected');
		});
	});

	describe('sendViaBridge', () => {
		it('rejects when not connected', async () => {
			await expect(sendViaBridge('hello')).rejects.toThrow('Bridge not connected');
		});

		it('sends message and resolves with response', async () => {
			// Connect
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			const ws = wsInstances[wsInstances.length - 1];
			const sendPromise = sendViaBridge('test message', 'claude');

			// Verify send was called
			expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"message":"test message"'));

			// Parse the sent data to get the id
			const sentData = JSON.parse(ws.send.mock.calls[0][0]);

			// Simulate server response
			ws.simulateMessage({ id: sentData.id, result: 'ai response' });

			const result = await sendPromise;
			expect(result).toBe('ai response');
		});

		it('rejects on error response from server', async () => {
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			const ws = wsInstances[wsInstances.length - 1];
			const sendPromise = sendViaBridge('test');

			const sentData = JSON.parse(ws.send.mock.calls[0][0]);
			ws.simulateMessage({ id: sentData.id, error: 'CLI not found' });

			await expect(sendPromise).rejects.toThrow('CLI not found');
		});

		it('times out after 5 minutes', async () => {
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			const sendPromise = sendViaBridge('test');

			// Advance 5 minutes (CLI subprocess can be slow for large projects)
			vi.advanceTimersByTime(300000);

			await expect(sendPromise).rejects.toThrow('Bridge request timeout');
		});

		it('rejects immediately when signal is already aborted', async () => {
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			const controller = new AbortController();
			controller.abort();

			await expect(sendViaBridge('test', undefined, controller.signal)).rejects.toThrow('Aborted');
		});

		it('rejects when signal is aborted during request', async () => {
			const p = connectBridge(9800);
			wsInstances[wsInstances.length - 1].simulateOpen();
			await p;

			const controller = new AbortController();
			const sendPromise = sendViaBridge('test', undefined, controller.signal);

			controller.abort();

			await expect(sendPromise).rejects.toThrow('Aborted');
		});
	});

	describe('getBridgeReconnectInfo', () => {
		it('returns reconnect info', () => {
			const info = getBridgeReconnectInfo();
			expect(info).toEqual({ attempts: 0, maxAttempts: 5 });
		});
	});
});
