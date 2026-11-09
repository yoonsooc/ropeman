/** Smooth scrolling is motion too; honor the reduced-motion preference. */
export function scrollBehavior(): ScrollBehavior {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
