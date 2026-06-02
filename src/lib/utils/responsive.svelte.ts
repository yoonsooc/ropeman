export const BP_MOBILE_MAX = 430;
export const BP_TABLET_MAX = 768;

export interface Breakpoint {
	readonly isMobile: boolean;
	readonly isTablet: boolean;
	readonly isDesktop: boolean;
}

export function computeBreakpoint(width: number): Breakpoint {
	if (width <= BP_MOBILE_MAX) {
		return { isMobile: true, isTablet: false, isDesktop: false };
	}
	if (width <= BP_TABLET_MAX) {
		return { isMobile: false, isTablet: true, isDesktop: false };
	}
	return { isMobile: false, isTablet: false, isDesktop: true };
}

export function useBreakpoint(): Breakpoint {
	let mobileMatches = $state(false);
	let tabletMatches = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;

		const mobileMql = window.matchMedia(`(max-width: ${BP_MOBILE_MAX}px)`);
		const tabletMql = window.matchMedia(`(max-width: ${BP_TABLET_MAX}px)`);

		const updateMobile = (e: MediaQueryListEvent | MediaQueryList) => {
			mobileMatches = e.matches;
		};
		const updateTablet = (e: MediaQueryListEvent | MediaQueryList) => {
			tabletMatches = e.matches;
		};

		updateMobile(mobileMql);
		updateTablet(tabletMql);
		mobileMql.addEventListener('change', updateMobile);
		tabletMql.addEventListener('change', updateTablet);

		return () => {
			mobileMql.removeEventListener('change', updateMobile);
			tabletMql.removeEventListener('change', updateTablet);
		};
	});

	return {
		get isMobile() {
			return mobileMatches;
		},
		get isTablet() {
			return tabletMatches && !mobileMatches;
		},
		get isDesktop() {
			return !tabletMatches;
		}
	};
}
