import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusTrap } from './focusTrap';

// vitest runs in node, so the card is a minimal stand-in with the DOM calls focusTrap makes
function control() {
	return { focus: vi.fn(), getClientRects: () => [{}] };
}

function card(controls: ReturnType<typeof control>[], autofocus?: ReturnType<typeof control>) {
	return {
		focus: vi.fn(),
		querySelector: (selector: string) =>
			selector === '[data-autofocus]' ? (autofocus ?? null) : null,
		querySelectorAll: () => controls,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	} as unknown as HTMLElement;
}

describe('focusTrap', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('focuses the control marked data-autofocus before the first control', () => {
		// Arrange: "don't ask again" checkbox comes first, Cancel is the safe choice
		vi.stubGlobal('HTMLElement', class {});
		vi.stubGlobal('document', { activeElement: null });
		const checkbox = control();
		const cancel = control();

		// Act
		focusTrap(card([checkbox, cancel], cancel));

		// Assert
		expect(cancel.focus).toHaveBeenCalledOnce();
		expect(checkbox.focus).not.toHaveBeenCalled();
	});

	it('focuses the first control when nothing is marked', () => {
		// Arrange
		vi.stubGlobal('HTMLElement', class {});
		vi.stubGlobal('document', { activeElement: null });
		const first = control();
		const second = control();

		// Act
		focusTrap(card([first, second]));

		// Assert
		expect(first.focus).toHaveBeenCalledOnce();
		expect(second.focus).not.toHaveBeenCalled();
	});
});
