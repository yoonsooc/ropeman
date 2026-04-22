const SIDEBAR_WIDTH_MIN = 160;
const SIDEBAR_WIDTH_MAX = 480;
const SIDEBAR_WIDTH_DEFAULT = 232;

function loadStored() {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem('ropeman-layout');
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function clampSidebarWidth(v: number): number {
	return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, v));
}

function createLayoutStore() {
	const stored = loadStored();

	let isSplit = $state(false);
	let splitDirection = $state<'vertical' | 'horizontal'>('vertical');
	let splitRatio = $state(0.5);
	let focusedPane = $state<'primary' | 'secondary'>('primary');
	let secondaryActiveTabId = $state<string | null>(null);
	let sidebarWidth = $state(clampSidebarWidth(stored.sidebarWidth ?? SIDEBAR_WIDTH_DEFAULT));

	function persist() {
		if (typeof window !== 'undefined') {
			localStorage.setItem('ropeman-layout', JSON.stringify({ sidebarWidth }));
		}
	}

	return {
		get isSplit() {
			return isSplit;
		},
		set isSplit(v: boolean) {
			isSplit = v;
		},

		get splitDirection() {
			return splitDirection;
		},
		set splitDirection(v: 'vertical' | 'horizontal') {
			splitDirection = v;
		},

		get splitRatio() {
			return splitRatio;
		},
		set splitRatio(v: number) {
			splitRatio = Math.max(0.15, Math.min(0.85, v));
		},

		get focusedPane() {
			return focusedPane;
		},
		set focusedPane(v: 'primary' | 'secondary') {
			focusedPane = v;
		},

		get secondaryActiveTabId() {
			return secondaryActiveTabId;
		},
		set secondaryActiveTabId(v: string | null) {
			secondaryActiveTabId = v;
		},

		get sidebarWidth() {
			return sidebarWidth;
		},
		set sidebarWidth(v: number) {
			sidebarWidth = clampSidebarWidth(v);
			persist();
		},

		toggleSplit() {
			if (isSplit) {
				isSplit = false;
				focusedPane = 'primary';
				secondaryActiveTabId = null;
			} else {
				isSplit = true;
			}
		},

		focusPrimary() {
			focusedPane = 'primary';
		},

		focusSecondary() {
			focusedPane = 'secondary';
		}
	};
}

export const layoutStore = createLayoutStore();

export const SIDEBAR_WIDTH_LIMITS = {
	min: SIDEBAR_WIDTH_MIN,
	max: SIDEBAR_WIDTH_MAX,
	default: SIDEBAR_WIDTH_DEFAULT
};
