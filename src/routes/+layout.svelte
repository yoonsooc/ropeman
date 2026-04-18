<script lang="ts">
	import '$lib/styles/global.css';
	import '$lib/styles/chat.css';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { injectThemeCSS } from '$lib/services/syntaxThemeService';
	import AnalysisStatus from '$lib/components/AnalysisStatus.svelte';

	let { children } = $props();

	$effect(() => {
		injectThemeCSS(settingsStore.syntaxTheme);
	});

	// Warn on SvelteKit route navigation while analysis is in progress
	beforeNavigate((nav) => {
		if (!semanticStore.isAnalyzing) return;
		if (typeof window === 'undefined') return;
		const ok = window.confirm(i18nStore.t('analysisLeaveConfirm'));
		if (!ok) {
			nav.cancel();
		} else {
			// User chose to leave — cancel all analysis requests
			for (const req of semanticStore.analysisRequests.values()) {
				semanticStore.cancelAnalysisRequest(req.nodeId);
			}
		}
	});

	onMount(() => {
		// Warn on tab close/refresh while analysis is running
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (semanticStore.isAnalyzing) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', onBeforeUnload);

		// Dev-only: expose __uploadExplore() console helper for manual
		// gallery snapshot uploads. Tree-shaken out of production builds.
		if (import.meta.env.DEV) {
			import('$lib/dev/exploreUploader');
		}

		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});
</script>

{@render children()}

<AnalysisStatus />
