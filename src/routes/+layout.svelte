<script lang="ts">
	import '$lib/styles/global.css';
	import '$lib/styles/chat.css';
	import { onMount } from 'svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { injectThemeCSS } from '$lib/services/syntaxThemeService';
	import { attachKeyboardInsetTracking } from '$lib/utils/keyboardInset';
	import AnalysisStatus from '$lib/components/AnalysisStatus.svelte';

	let { children } = $props();

	$effect(() => {
		injectThemeCSS(settingsStore.syntaxTheme);
	});

	onMount(() => {
		// Analysis state survives SvelteKit route navigation because the store,
		// AbortControllers, and in-flight fetch promises are module-level singletons.
		// The global AnalysisStatus pill stays visible on every route, so no
		// in-app navigation warning is needed. Only guard tab close/refresh,
		// which actually tears down the fetch.
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (semanticStore.isAnalyzing) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', onBeforeUnload);

		// M2: Track iOS keyboard inset on a global CSS variable so modals can
		// reserve bottom padding when a virtual keyboard is open.
		const detachKeyboardInset = attachKeyboardInsetTracking();

		// Dev-only: expose __uploadExplore() console helper for manual
		// gallery snapshot uploads. Tree-shaken out of production builds.
		if (import.meta.env.DEV) {
			import('$lib/dev/exploreUploader');
		}

		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
			detachKeyboardInset();
		};
	});
</script>

{@render children()}

<AnalysisStatus />
