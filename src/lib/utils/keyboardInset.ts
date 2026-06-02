export function computeKeyboardInset(
	windowHeight: number,
	visualViewportHeight: number,
	visualViewportOffsetTop: number
): number {
	const inset = windowHeight - visualViewportHeight - visualViewportOffsetTop;
	return inset > 0 ? inset : 0;
}

const KEYBOARD_INSET_VAR = '--keyboard-inset';

let activeCount = 0;
let cleanup: (() => void) | null = null;

function applyInset(value: number): void {
	document.documentElement.style.setProperty(KEYBOARD_INSET_VAR, `${value}px`);
}

function startTracking(): void {
	if (typeof window === 'undefined' || !window.visualViewport) return;
	const vv = window.visualViewport;
	const update = () => {
		const inset = computeKeyboardInset(window.innerHeight, vv.height, vv.offsetTop);
		applyInset(inset);
	};
	vv.addEventListener('resize', update);
	vv.addEventListener('scroll', update);
	update();
	cleanup = () => {
		vv.removeEventListener('resize', update);
		vv.removeEventListener('scroll', update);
		document.documentElement.style.removeProperty(KEYBOARD_INSET_VAR);
	};
}

export function attachKeyboardInsetTracking(): () => void {
	activeCount += 1;
	if (activeCount === 1) startTracking();
	return () => {
		activeCount -= 1;
		if (activeCount === 0 && cleanup) {
			cleanup();
			cleanup = null;
		}
	};
}
