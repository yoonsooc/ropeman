import { describe, it, expect, beforeEach } from 'vitest';
import { authStore } from './authStore.svelte';
import { settingsStore } from './settingsStore.svelte';

describe('authStore', () => {
	beforeEach(() => {
		authStore.edgeEnabled = false;
		authStore.preferredTrack = null;
		settingsStore.clearAll();
	});

	describe('isReady (derived getter)', () => {
		it('returns false when nothing is configured', () => {
			expect(authStore.isReady).toBe(false);
		});

		it('returns true when API key is set (BYOK)', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.isReady).toBe(true);
		});

		it('returns true when the edge track is on', () => {
			authStore.edgeEnabled = true;
			expect(authStore.isReady).toBe(true);
		});
	});

	describe('activeTrack (derived getter)', () => {
		it('returns none when no auth configured', () => {
			expect(authStore.activeTrack).toBe('none');
		});

		it('returns byok when API key is set', () => {
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';
			expect(authStore.activeTrack).toBe('byok');
		});

		it('prefers edge over a stored API key unless the user picked byok', () => {
			// Arrange
			authStore.edgeEnabled = true;
			settingsStore.aiProvider = 'google';
			settingsStore.geminiApiKey = 'test-key';

			// Act
			const auto = authStore.activeTrack;
			authStore.preferredTrack = 'byok';

			// Assert
			expect(auto).toBe('edge');
			expect(authStore.activeTrack).toBe('byok');
		});

		it('falls back to the automatic order when the preferred track is not available', () => {
			authStore.preferredTrack = 'byok';
			expect(authStore.activeTrack).toBe('none');
		});
	});
});
