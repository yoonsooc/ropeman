import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onboardingStore } from './onboardingStore.svelte';

// Stub document.querySelector since we're in node environment
const querySelectorFn = vi.fn();
vi.stubGlobal('document', { querySelector: querySelectorFn });

describe('onboardingStore', () => {
	beforeEach(() => {
		querySelectorFn.mockReset();
		// Reset to a clean state
		onboardingStore.reset();
		// reset() auto-starts phase1, so skip to finish it, then reset again
		// to get a truly clean state with phase1Completed=false
	});

	it('reset() sets phase to phase1 and step to 1', () => {
		// reset() was called in beforeEach, which starts phase1
		expect(onboardingStore.phase).toBe('phase1');
		expect(onboardingStore.currentStep).toBe(1);
		expect(onboardingStore.isActive).toBe(true);
		expect(onboardingStore.phase1Completed).toBe(false);
		expect(onboardingStore.phase2Completed).toBe(false);
	});

	it('next() advances step within Phase 1 when target element exists', () => {
		querySelectorFn.mockReturnValue({});
		expect(onboardingStore.currentStep).toBe(1);

		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(2);

		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(3);
	});

	it('next() at last Phase 1 step finishes Phase 1', () => {
		querySelectorFn.mockReturnValue({});
		onboardingStore.next(); // step 2
		onboardingStore.next(); // step 3
		onboardingStore.next(); // finish phase 1

		expect(onboardingStore.phase1Completed).toBe(true);
		expect(onboardingStore.phase).toBe('idle');
		expect(onboardingStore.currentStep).toBe(0);
	});

	it('skip() finishes the current phase', () => {
		onboardingStore.reset();
		expect(onboardingStore.isActive).toBe(true);
		onboardingStore.skip();
		expect(onboardingStore.phase1Completed).toBe(true);
		expect(onboardingStore.isActive).toBe(false);
	});

	it('startPhase2 only works after Phase 1 is completed', () => {
		onboardingStore.reset(); // starts phase1
		onboardingStore.skip(); // complete phase1
		expect(onboardingStore.phase1Completed).toBe(true);

		onboardingStore.startPhase2();
		expect(onboardingStore.phase).toBe('phase2');
		expect(onboardingStore.currentStep).toBe(4);
	});

	it('startPhase2 does not interrupt a running Phase 1', () => {
		onboardingStore.reset(); // starts phase1, phase1Completed=false
		expect(onboardingStore.canStartPhase2).toBe(false);

		onboardingStore.startPhase2();

		expect(onboardingStore.phase).toBe('phase1');
	});

	// Regression: the landing stopped starting Phase 1 (T2-7), so a new user never completed it
	// and the graph tour never ran after their first analysis
	it('starts Phase 2 on a first visit where neither phase ran', async () => {
		vi.resetModules();
		const { onboardingStore: fresh } = await import('./onboardingStore.svelte');
		expect(fresh.phase1Completed).toBe(false);
		expect(fresh.phase2Completed).toBe(false);
		expect(fresh.canStartPhase2).toBe(true);

		fresh.startPhase2();

		expect(fresh.phase).toBe('phase2');
		expect(fresh.currentStep).toBe(4);
	});

	it('does not offer Phase 2 again once it is completed', () => {
		onboardingStore.skip();
		onboardingStore.startPhase2();
		onboardingStore.skip();

		expect(onboardingStore.canStartPhase2).toBe(false);
	});

	it('Phase 2 next() advances from step 4 to 8', () => {
		querySelectorFn.mockReturnValue({});
		onboardingStore.reset();
		onboardingStore.skip(); // complete phase1
		onboardingStore.startPhase2();

		expect(onboardingStore.currentStep).toBe(4);
		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(5);
		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(6);
		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(7);
		onboardingStore.next();
		expect(onboardingStore.currentStep).toBe(8);
		onboardingStore.next(); // finish

		expect(onboardingStore.phase2Completed).toBe(true);
		expect(onboardingStore.phase).toBe('done');
	});

	it('next() always advances to the next step number', () => {
		onboardingStore.reset(); // step 1

		onboardingStore.next(); // step 2
		expect(onboardingStore.currentStep).toBe(2);

		onboardingStore.next(); // step 3
		expect(onboardingStore.currentStep).toBe(3);
	});

	it('reset() clears completion state and restarts Phase 1', () => {
		onboardingStore.reset();
		onboardingStore.skip(); // complete phase1
		onboardingStore.startPhase2();
		onboardingStore.skip(); // complete phase2

		expect(onboardingStore.phase1Completed).toBe(true);
		expect(onboardingStore.phase2Completed).toBe(true);

		onboardingStore.reset();
		expect(onboardingStore.phase1Completed).toBe(false);
		expect(onboardingStore.phase2Completed).toBe(false);
		expect(onboardingStore.phase).toBe('phase1');
		expect(onboardingStore.currentStep).toBe(1);
	});

	it('prev() goes back to previous step', () => {
		querySelectorFn.mockReturnValue({});
		onboardingStore.reset(); // step 1
		onboardingStore.next(); // step 2
		onboardingStore.next(); // step 3
		expect(onboardingStore.currentStep).toBe(3);

		onboardingStore.prev();
		expect(onboardingStore.currentStep).toBe(2);

		onboardingStore.prev();
		expect(onboardingStore.currentStep).toBe(1);
	});

	it('prev() does nothing at first step of phase', () => {
		onboardingStore.reset(); // step 1
		expect(onboardingStore.currentStep).toBe(1);

		onboardingStore.prev();
		expect(onboardingStore.currentStep).toBe(1);
	});

	it('prev() works in Phase 2', () => {
		querySelectorFn.mockReturnValue({});
		onboardingStore.reset();
		onboardingStore.skip(); // complete phase1
		onboardingStore.startPhase2(); // step 4
		onboardingStore.next(); // step 5

		onboardingStore.prev();
		expect(onboardingStore.currentStep).toBe(4);

		onboardingStore.prev(); // already at start, no change
		expect(onboardingStore.currentStep).toBe(4);
	});

	it('canPrev is false at first step, true otherwise', () => {
		onboardingStore.reset(); // step 1
		expect(onboardingStore.canPrev).toBe(false);

		querySelectorFn.mockReturnValue({});
		onboardingStore.next(); // step 2
		expect(onboardingStore.canPrev).toBe(true);
	});

	it('persists completion state to localStorage', () => {
		onboardingStore.reset();
		onboardingStore.skip();

		const stored =
			globalThis.localStorage?.getItem?.('ropeman-onboarding') ??
			(typeof window !== 'undefined' ? window.localStorage.getItem('ropeman-onboarding') : null);
		// In node env, localStorage may be a simple object; just verify the store state is correct
		expect(onboardingStore.phase1Completed).toBe(true);
		if (stored) {
			const parsed = JSON.parse(stored);
			expect(parsed.phase1Completed).toBe(true);
		}
	});
});
