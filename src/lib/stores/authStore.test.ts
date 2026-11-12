import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authStore } from './authStore.svelte';
import { settingsStore } from './settingsStore.svelte';

describe('authStore', () => {
	beforeEach(() => {
		authStore.bridgeStatus = 'disconnected';
		authStore.bridgePort = 9800;
		authStore.bridgeError = '';
		settingsStore.clearAll();
	});

	describe('initial state', () => {
		it('bridgeStatus is disconnected', () => {
			expect(authStore.bridgeStatus).toBe('disconnected');
		});

		it('bridgePort starts on the port a bare `npx @ropeman/bridge` listens on', async () => {
			// Regression: the app defaulted to 9876 while the bridge listens on 9800,
			// so the README command never connected without editing the port field.
			const serverSource = readFileSync(
				resolve(__dirname, '../../../bridge/src/server.ts'),
				'utf8'
			);
			const bridgeDefault = Number(serverSource.match(/const DEFAULT_PORT = (\d+);/)?.[1]);
			vi.resetModules();

			const { authStore: fresh } = await import('./authStore.svelte');

			expect(bridgeDefault).toBe(9800);
			expect(fresh.bridgePort).toBe(bridgeDefault);
		});

		it('bridgeError is empty string', () => {
			expect(authStore.bridgeError).toBe('');
		});
	});

	describe('setters', () => {
		it('sets bridgeStatus', () => {
			authStore.bridgeStatus = 'connected';
			expect(authStore.bridgeStatus).toBe('connected');
		});

		it('sets bridgeStatus to all valid states', () => {
			const states = ['disconnected', 'connecting', 'connected', 'reconnecting', 'error'] as const;
			for (const state of states) {
				authStore.bridgeStatus = state;
				expect(authStore.bridgeStatus).toBe(state);
			}
		});

		it('sets bridgePort', () => {
			authStore.bridgePort = 3000;
			expect(authStore.bridgePort).toBe(3000);
		});

		it('sets bridgeError', () => {
			authStore.bridgeError = 'Connection refused';
			expect(authStore.bridgeError).toBe('Connection refused');
		});
	});

	describe('isReady (derived getter)', () => {
		it('returns false when no API key and bridge disconnected', () => {
			expect(authStore.isReady).toBe(false);
		});

		it('returns true when bridge is connected', () => {
			authStore.bridgeStatus = 'connected';
			expect(authStore.isReady).toBe(true);
		});

		it('returns true when API key is set (BYOK)', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.isReady).toBe(true);
		});

		it('returns true when both bridge connected and API key set', () => {
			authStore.bridgeStatus = 'connected';
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.isReady).toBe(true);
		});

		it('returns false when bridge is connecting but no API key', () => {
			authStore.bridgeStatus = 'connecting';
			expect(authStore.isReady).toBe(false);
		});
	});

	describe('activeTrack (derived getter)', () => {
		it('returns none when no auth configured', () => {
			expect(authStore.activeTrack).toBe('none');
		});

		it('returns bridge when bridge is connected', () => {
			authStore.bridgeStatus = 'connected';
			expect(authStore.activeTrack).toBe('bridge');
		});

		it('returns byok when API key is set', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.activeTrack).toBe('byok');
		});

		it('returns bridge when both bridge connected and API key set (bridge takes priority)', () => {
			authStore.bridgeStatus = 'connected';
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.activeTrack).toBe('bridge');
		});
	});
});
