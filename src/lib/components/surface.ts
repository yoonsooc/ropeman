import { siteHref } from '$lib/services/bridgeSession';

/** The page a shared component serves: the main app, or the Bridge viewer of `ropeman serve`. */
export type Surface = 'app' | 'bridge';

export interface SiteLink {
	href: string;
	target?: '_blank';
	rel?: 'noopener';
}

/**
 * A link to a site page (`resolved` comes from `resolve()`). The Bridge viewer opens it in a new
 * tab: leaving the page closes serve's connection, and on ropeman.dev the token goes with it.
 */
export function siteLink(surface: Surface, resolved: string): SiteLink {
	if (surface === 'app') return { href: resolved };
	return { href: siteHref(location, resolved), target: '_blank', rel: 'noopener' };
}

export interface Shortcut {
	/** i18n key under `shortcuts.` */
	label:
		| 'search'
		| 'toggleTheme'
		| 'toggleView'
		| 'toggleSidebar'
		| 'exportDiagram'
		| 'showHelp'
		| 'closeModal'
		| 'closeTab'
		| 'nextPrevTab'
		| 'toggleSplit'
		| 'focusPrimary'
		| 'focusSecondary';
	keys: string[];
	/** The pages whose keyboard handler runs it */
	surfaces: readonly Surface[];
	/** Settings lists the everyday ones; Help lists them all */
	inSettings: boolean;
}

const BOTH: readonly Surface[] = ['app', 'bridge'];
const APP: readonly Surface[] = ['app'];

export const SHORTCUTS: readonly Shortcut[] = [
	{ label: 'search', keys: ['Ctrl', 'K'], surfaces: APP, inSettings: true },
	{ label: 'toggleTheme', keys: ['Ctrl', 'Shift', 'D'], surfaces: BOTH, inSettings: true },
	{ label: 'toggleView', keys: ['Ctrl', 'Shift', 'V'], surfaces: BOTH, inSettings: true },
	{ label: 'toggleSidebar', keys: ['Ctrl', 'B'], surfaces: BOTH, inSettings: true },
	{ label: 'exportDiagram', keys: ['Ctrl', 'Shift', 'E'], surfaces: BOTH, inSettings: false },
	{ label: 'showHelp', keys: ['?'], surfaces: BOTH, inSettings: true },
	{ label: 'closeModal', keys: ['Esc'], surfaces: BOTH, inSettings: true },
	{ label: 'closeTab', keys: ['Ctrl', 'W'], surfaces: APP, inSettings: false },
	{ label: 'nextPrevTab', keys: ['Ctrl', 'Tab'], surfaces: APP, inSettings: false },
	{ label: 'toggleSplit', keys: ['Ctrl', '\\'], surfaces: APP, inSettings: false },
	{ label: 'focusPrimary', keys: ['Ctrl', '1'], surfaces: APP, inSettings: false },
	{ label: 'focusSecondary', keys: ['Ctrl', '2'], surfaces: APP, inSettings: false }
];
