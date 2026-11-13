const STORAGE_KEY = 'ropeman-onboarding';

export type TourPhase = 'idle' | 'phase1' | 'phase2' | 'done';

interface OnboardingState {
	phase1Completed: boolean;
	phase2Completed: boolean;
}

function loadState(): OnboardingState {
	if (typeof window === 'undefined') return { phase1Completed: false, phase2Completed: false };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		/* ignore */
	}
	return { phase1Completed: false, phase2Completed: false };
}

function saveState(state: OnboardingState) {
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}
}

function createOnboardingStore() {
	const initial = loadState();

	let phase = $state<TourPhase>('idle');
	let currentStep = $state(0);
	let phase1Completed = $state(initial.phase1Completed);
	let phase2Completed = $state(initial.phase2Completed);

	// Phase 1: steps 1-3, Phase 2: steps 4-8
	const PHASE1_START = 1;
	const PHASE1_END = 3;
	const PHASE2_START = 4;
	const PHASE2_END = 8;

	function persist() {
		saveState({ phase1Completed, phase2Completed });
	}

	return {
		get phase() {
			return phase;
		},
		get currentStep() {
			return currentStep;
		},
		get isActive() {
			return phase === 'phase1' || phase === 'phase2';
		},
		get phase1Completed() {
			return phase1Completed;
		},
		get phase2Completed() {
			return phase2Completed;
		},

		/** Start Phase 1 if not already completed */
		startPhase1() {
			if (phase1Completed) return;
			phase = 'phase1';
			currentStep = PHASE1_START;
		},

		/** Phase 2 runs once, after any analysis, whether or not Phase 1 ever ran, but never over a running Phase 1 */
		get canStartPhase2() {
			return !phase2Completed && phase === 'idle';
		},

		startPhase2() {
			if (!this.canStartPhase2) return;
			phase = 'phase2';
			currentStep = PHASE2_START;
		},

		/** Whether the current step can go back */
		get canPrev() {
			if (phase === 'phase1') return currentStep > PHASE1_START;
			if (phase === 'phase2') return currentStep > PHASE2_START;
			return false;
		},

		/** Go back to the previous step */
		prev() {
			if (phase === 'phase1' && currentStep > PHASE1_START) {
				currentStep = currentStep - 1;
			} else if (phase === 'phase2' && currentStep > PHASE2_START) {
				currentStep = currentStep - 1;
			}
		},

		/** Advance to the next step. Element visibility is handled by the component. */
		next() {
			if (phase === 'phase1') {
				if (currentStep < PHASE1_END) {
					currentStep = currentStep + 1;
				} else {
					this.finishPhase1();
				}
			} else if (phase === 'phase2') {
				if (currentStep < PHASE2_END) {
					currentStep = currentStep + 1;
				} else {
					this.finishPhase2();
				}
			}
		},

		/** Skip (close) the entire tour */
		skip() {
			if (phase === 'phase1') {
				this.finishPhase1();
			} else if (phase === 'phase2') {
				this.finishPhase2();
			}
		},

		finishPhase1() {
			phase1Completed = true;
			phase = 'idle';
			currentStep = 0;
			persist();
		},

		finishPhase2() {
			phase2Completed = true;
			phase = 'done';
			currentStep = 0;
			persist();
		},

		/** Reset all state — for "Restart Tour" in Settings */
		reset() {
			phase1Completed = false;
			phase2Completed = false;
			currentStep = 0;
			phase = 'idle';
			persist();
			// Auto-start Phase 1 after reset
			this.startPhase1();
		}
	};
}

export const onboardingStore = createOnboardingStore();
