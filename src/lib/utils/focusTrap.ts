const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus into a modal card, keeps Tab inside it, and gives focus back to the opener.
 * Give the node `tabindex="-1"`: a click on its plain text then focuses the card, not <body>.
 */
export function focusTrap(node: HTMLElement) {
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const focusables = () =>
		[...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length);

	(focusables()[0] ?? node).focus();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const items = focusables();
		const first = items[0];
		const last = items.at(-1);
		if (!first || !last) {
			e.preventDefault();
			return;
		}
		const active = document.activeElement;
		if (e.shiftKey && (active === first || active === node)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	node.addEventListener('keydown', handleKeydown);
	return {
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
			if (opener?.isConnected) opener.focus();
		}
	};
}
