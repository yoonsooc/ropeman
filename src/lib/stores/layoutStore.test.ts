import { describe, it, expect, beforeEach } from 'vitest';
import { layoutStore, SIDEBAR_WIDTH_LIMITS } from './layoutStore.svelte';

describe('layoutStore', () => {
	beforeEach(() => {
		// Reset to defaults
		layoutStore.isSplit = false;
		layoutStore.splitDirection = 'vertical';
		layoutStore.splitRatio = 0.5;
		layoutStore.focusedPane = 'primary';
		layoutStore.secondaryActiveTabId = null;
		layoutStore.sidebarWidth = SIDEBAR_WIDTH_LIMITS.default;
	});

	describe('initial state', () => {
		it('isSplit defaults to false', () => {
			expect(layoutStore.isSplit).toBe(false);
		});

		it('splitDirection defaults to vertical', () => {
			expect(layoutStore.splitDirection).toBe('vertical');
		});

		it('splitRatio defaults to 0.5', () => {
			expect(layoutStore.splitRatio).toBe(0.5);
		});

		it('focusedPane defaults to primary', () => {
			expect(layoutStore.focusedPane).toBe('primary');
		});

		it('secondaryActiveTabId defaults to null', () => {
			expect(layoutStore.secondaryActiveTabId).toBeNull();
		});
	});

	describe('setters', () => {
		it('sets isSplit', () => {
			layoutStore.isSplit = true;
			expect(layoutStore.isSplit).toBe(true);
		});

		it('sets splitDirection', () => {
			layoutStore.splitDirection = 'horizontal';
			expect(layoutStore.splitDirection).toBe('horizontal');
		});

		it('clamps splitRatio to min 0.15', () => {
			layoutStore.splitRatio = 0.05;
			expect(layoutStore.splitRatio).toBe(0.15);
		});

		it('clamps splitRatio to max 0.85', () => {
			layoutStore.splitRatio = 0.95;
			expect(layoutStore.splitRatio).toBe(0.85);
		});

		it('sets valid splitRatio without clamping', () => {
			layoutStore.splitRatio = 0.7;
			expect(layoutStore.splitRatio).toBe(0.7);
		});

		it('sets focusedPane', () => {
			layoutStore.focusedPane = 'secondary';
			expect(layoutStore.focusedPane).toBe('secondary');
		});

		it('sets secondaryActiveTabId', () => {
			layoutStore.secondaryActiveTabId = 'tab-1';
			expect(layoutStore.secondaryActiveTabId).toBe('tab-1');
		});
	});

	describe('toggleSplit', () => {
		it('enables split when currently off', () => {
			layoutStore.toggleSplit();
			expect(layoutStore.isSplit).toBe(true);
		});

		it('disables split and resets focus/secondary when on', () => {
			// Arrange
			layoutStore.isSplit = true;
			layoutStore.focusedPane = 'secondary';
			layoutStore.secondaryActiveTabId = 'tab-2';

			// Act
			layoutStore.toggleSplit();

			// Assert
			expect(layoutStore.isSplit).toBe(false);
			expect(layoutStore.focusedPane).toBe('primary');
			expect(layoutStore.secondaryActiveTabId).toBeNull();
		});
	});

	describe('focusPrimary', () => {
		it('sets focused pane to primary', () => {
			layoutStore.focusedPane = 'secondary';
			layoutStore.focusPrimary();
			expect(layoutStore.focusedPane).toBe('primary');
		});
	});

	describe('focusSecondary', () => {
		it('sets focused pane to secondary', () => {
			layoutStore.focusSecondary();
			expect(layoutStore.focusedPane).toBe('secondary');
		});
	});

	describe('sidebarWidth', () => {
		it('defaults to 232', () => {
			expect(layoutStore.sidebarWidth).toBe(232);
		});

		it('clamps below minimum (160)', () => {
			layoutStore.sidebarWidth = 100;
			expect(layoutStore.sidebarWidth).toBe(160);
		});

		it('clamps above maximum (480)', () => {
			layoutStore.sidebarWidth = 600;
			expect(layoutStore.sidebarWidth).toBe(480);
		});

		it('sets valid width without clamping', () => {
			layoutStore.sidebarWidth = 300;
			expect(layoutStore.sidebarWidth).toBe(300);
		});

		it('persists to localStorage (when available)', () => {
			layoutStore.sidebarWidth = 280;
			const raw =
				globalThis.localStorage?.getItem?.('ropeman-layout') ??
				(typeof window !== 'undefined' ? window.localStorage.getItem('ropeman-layout') : null);
			expect(layoutStore.sidebarWidth).toBe(280);
			if (raw) {
				expect(JSON.parse(raw)).toEqual({ sidebarWidth: 280 });
			}
		});
	});
});
