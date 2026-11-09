<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';
	import { getViewportForBounds } from '@xyflow/system';
	import { exportAsPNG, exportAsSVG } from '$lib/services/exportService';
	import { exportAsMarkdown } from '$lib/services/markdownExporter';
	import { exportAsHtml } from '$lib/services/htmlExporter';
	import { exportAsPdf } from '$lib/services/pdfExporter';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { onMount } from 'svelte';

	let {
		onready
	}: {
		onready: (fns: {
			exportPNG: () => void;
			exportSVG: () => void;
			exportMarkdown: () => void;
			exportHtml: () => void;
			exportPdf: () => void;
			fitView: () => void;
			getZoom: () => number;
		}) => void;
	} = $props();

	const { getNodes, getNodesBounds, fitView, getViewport } = useSvelteFlow();

	function getExportElement(): HTMLElement | null {
		return document.querySelector('.svelte-flow__viewport') as HTMLElement | null;
	}

	function calcBounds() {
		const nodes = getNodes();
		if (nodes.length === 0) return null;
		const bounds = getNodesBounds(nodes);
		const padding = 50;
		return {
			x: bounds.x - padding,
			y: bounds.y - padding,
			width: bounds.width + padding * 2,
			height: bounds.height + padding * 2
		};
	}

	async function handleExportPNG() {
		const el = getExportElement();
		if (!el) return;
		const bounds = calcBounds();
		const name = projectStore.projectName || 'diagram';

		if (bounds) {
			// Set viewport to fit all nodes before export
			const viewport = getViewportForBounds(bounds, bounds.width, bounds.height, 0.05, 4, 0);
			const prevTransform = el.style.transform;
			el.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

			try {
				await exportAsPNG(el, `${name}.png`, { width: bounds.width, height: bounds.height });
			} finally {
				el.style.transform = prevTransform;
			}
		} else {
			await exportAsPNG(el, `${name}.png`);
		}
	}

	async function handleExportSVG() {
		const el = getExportElement();
		if (!el) return;
		const bounds = calcBounds();
		const name = projectStore.projectName || 'diagram';

		if (bounds) {
			const viewport = getViewportForBounds(bounds, bounds.width, bounds.height, 0.05, 4, 0);
			const prevTransform = el.style.transform;
			el.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

			try {
				await exportAsSVG(el, `${name}.svg`, { width: bounds.width, height: bounds.height });
			} finally {
				el.style.transform = prevTransform;
			}
		} else {
			await exportAsSVG(el, `${name}.svg`);
		}
	}

	async function handleExportMarkdown() {
		const root = semanticStore.currentLevel;
		if (!root) return;
		await exportAsMarkdown({
			projectName: projectStore.projectName || 'project',
			rootLevel: root,
			cache: semanticStore.cache,
			includeNested: true
		});
	}

	async function handleExportHtml() {
		const root = semanticStore.currentLevel;
		if (!root) return;
		await exportAsHtml({
			projectName: projectStore.projectName || 'project',
			rootLevel: root,
			cache: semanticStore.cache
		});
	}

	async function handleExportPdf() {
		const root = semanticStore.currentLevel;
		if (!root) return;
		await exportAsPdf({
			projectName: projectStore.projectName || 'project',
			rootLevel: root,
			cache: semanticStore.cache
		});
	}

	onMount(() => {
		onready({
			exportPNG: handleExportPNG,
			exportSVG: handleExportSVG,
			exportMarkdown: handleExportMarkdown,
			exportHtml: handleExportHtml,
			exportPdf: handleExportPdf,
			fitView: () => void fitView(),
			getZoom: () => getViewport().zoom
		});
	});
</script>
