/**
 * UI action handler registry for the global AnalysisStatus component.
 *
 * AnalysisStatus is mounted in +layout.svelte so it renders on every route.
 * Route-specific modals (Settings, Analyze) exist only on /+page, so /+page
 * registers callbacks here in onMount and clears them on destroy. AnalysisStatus
 * renders the corresponding action buttons only when a handler is registered.
 */

interface Handlers {
	openSettings?: () => void;
	openAnalyze?: () => void;
}

function createAnalysisUiStore() {
	let handlers = $state<Handlers>({});

	return {
		get openSettings() {
			return handlers.openSettings;
		},
		get openAnalyze() {
			return handlers.openAnalyze;
		},
		registerActionHandlers(next: Handlers) {
			handlers = { ...handlers, ...next };
		},
		clearActionHandlers() {
			handlers = {};
		}
	};
}

export const analysisUiStore = createAnalysisUiStore();
