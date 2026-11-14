<script lang="ts">
	import {
		SvelteFlow,
		MiniMap,
		Controls,
		Background,
		type Node,
		type Edge,
		type Viewport
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import {
		toSemanticFlowNodes,
		toSemanticFlowEdges,
		neighborNodeIds,
		levelLayoutKey
	} from '$lib/services/semanticGraphBuilder';
	import { screenAspect } from '$lib/services/levelLayout';
	import { analyzeDrilldown } from '$lib/services/semanticAnalysisService';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import ExportController from './ExportController.svelte';
	import SemanticNodeComponent from './nodes/SemanticNode.svelte';
	import RoutedEdge from './edges/RoutedEdge.svelte';
	import DrilldownConfirmModal from './DrilldownConfirmModal.svelte';
	import ExploreDrilldownPromptDialog from './ExploreDrilldownPromptDialog.svelte';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import type { SemanticNode } from '$lib/types/semantic';

	let {
		onexpand,
		namesPending = false
	}: {
		/** Bridge mode: serve opens a level that is not cached, instead of the app's AI analysis */
		onexpand?: (node: SemanticNode) => void;
		/** Bridge mode: the shown level still has folder names while the CLI names it */
		namesPending?: boolean;
	} = $props();

	const breakpoint = useBreakpoint();
	const isCompact = $derived(breakpoint.isMobile || breakpoint.isTablet);

	// Levels are laid out for the window's shape, not the canvas element's: a side panel that
	// opens on a click narrows the canvas, and re-laying the level then would move every card
	let windowWidth = $state(typeof window === 'undefined' ? 0 : window.innerWidth);
	let windowHeight = $state(typeof window === 'undefined' ? 0 : window.innerHeight);
	const aspect = $derived(screenAspect(windowWidth, windowHeight));

	let drilldownConfirmOpen = $state(false);
	let pendingDrilldownNode = $state<SemanticNode | null>(null);
	let exploreDrilldownPromptOpen = $state(false);
	let exploreDrilldownPromptLabel = $state('');

	function requestDrilldown(semNode: SemanticNode) {
		// U5-1: Cached nodes drill down immediately without confirmation
		if (semanticStore.hasCachedLevel(semNode.id)) {
			executeDrilldown(semNode);
			return;
		}

		// ADR-19 follow-up: in snapshot read-only mode (share/explore viewers),
		// do NOT trigger AI analysis for nodes missing from the curated snapshot.
		// Instead, guide the visitor to the main app where they can load the
		// original project themselves.
		if (onexpand) {
			onexpand(semNode);
			return;
		}

		if (semanticStore.readOnlyMode === 'snapshot') {
			exploreDrilldownPromptLabel = semNode.label;
			exploreDrilldownPromptOpen = true;
			return;
		}

		if (settingsStore.skipDrilldownConfirm) {
			executeDrilldown(semNode);
		} else {
			pendingDrilldownNode = semNode;
			drilldownConfirmOpen = true;
		}
	}

	function executeDrilldown(semNode: SemanticNode) {
		const wasCached = semanticStore.drillDown(semNode);
		if (!wasCached) {
			analyzeDrilldown(semNode);
		}
		tabStore.openDiagramTab(semanticStore.drilldownPath, semNode.label);
	}

	function confirmDrilldown() {
		drilldownConfirmOpen = false;
		if (pendingDrilldownNode) {
			executeDrilldown(pendingDrilldownNode);
			pendingDrilldownNode = null;
		}
	}

	// U5-3/U5-4: Re-analyze a node by invalidating cache and triggering new AI call
	function handleReanalyze(nodeId: string) {
		const semNode = semanticStore.currentLevel?.nodes.find((n) => n.id === nodeId);
		if (!semNode) return;
		if (semanticStore.isNodeAnalyzing(semNode.id)) {
			pulseElement('.analysis-progress-pill');
			return;
		}
		semanticStore.invalidateCache(nodeId);
		analyzeDrilldown(semNode);
	}

	function cancelDrilldown() {
		drilldownConfirmOpen = false;
		pendingDrilldownNode = null;
	}

	const nodeTypes = {
		semanticNode: SemanticNodeComponent
	};

	const edgeTypes = {
		routed: RoutedEdge
	};

	const EDGE_TYPE_INFO: { type: string; i18nKey: string; color: string }[] = [
		{ type: 'depends_on', i18nKey: 'legend.depends_on', color: 'var(--color-edge-depends-on)' },
		{ type: 'calls', i18nKey: 'legend.calls', color: 'var(--color-edge-calls)' },
		{ type: 'extends', i18nKey: 'legend.extends', color: 'var(--color-edge-extends)' },
		{ type: 'uses', i18nKey: 'legend.uses', color: 'var(--color-edge-uses)' }
	];

	// Use $state.raw to prevent SvelteFlow's internal mutations (fitView, drag)
	// from triggering our effects through deep reactivity
	let flowNodes = $state.raw<Node[]>([]);
	let flowEdges = $state.raw<Edge[]>([]);
	let allEdges = $state.raw<Edge[]>([]);

	let legendOpen = $state(false);
	let showMinimap = $state(true);
	let hiddenEdgeTypes = $state<Set<string>>(new Set());

	// --- U1-6: Preserve user-dragged node positions ---
	let userPositions = $state(new Map<string, { x: number; y: number }>());
	let prevLevelParentId = $state<string | null | undefined>(undefined);

	// A window that changes shape re-packs the level: positions dragged in the old layout no
	// longer apply, and the new layout needs a fresh fit
	let prevAspect: number | undefined;
	$effect(() => {
		const current = aspect;
		if (prevAspect !== undefined && current !== prevAspect) {
			userPositions = new Map();
			requestAnimationFrame(() => exportFns?.fitView());
		}
		prevAspect = current;
	});

	// The viewport each layout was left at. Going back to a level shows it as the user left it;
	// a level seen for the first time is fit to the screen, since the old viewport would crop it
	const leftViewports: Record<string, Viewport> = {};
	let shownLayout: string | null = null;
	$effect(() => {
		const level = semanticStore.currentLevel;
		const currentParentId = level?.parentId ?? null;
		const layout = level ? levelLayoutKey(level, aspect) : null;
		if (prevLevelParentId !== undefined && currentParentId !== prevLevelParentId) {
			userPositions = new Map();
			if (shownLayout && exportFns) leftViewports[shownLayout] = exportFns.getViewport();
			const left = layout ? leftViewports[layout] : undefined;
			requestAnimationFrame(() => (left ? exportFns?.setViewport(left) : exportFns?.fitView()));
		}
		prevLevelParentId = currentParentId;
		shownLayout = layout;
	});

	function handleNodeDragStop({
		targetNode
	}: {
		targetNode: Node | null;
		nodes: Node[];
		event: MouseEvent | TouchEvent;
	}) {
		if (targetNode) {
			const next = new Map(userPositions);
			next.set(targetNode.id, { x: targetNode.position.x, y: targetNode.position.y });
			userPositions = next;
		}
	}

	// --- U1-2: Node hover relationship preview ---
	interface RelationshipInfo {
		hoveredLabel: string;
		hoveredDescription: string;
		hoveredFileCount: number;
		directEdges: { type: string; label?: string; direction: 'outgoing' | 'incoming' }[];
		sharedFiles: string[];
		x: number;
		y: number;
	}

	let hoverNodeId = $state<string | null>(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let hoverRelation = $state<RelationshipInfo | null>(null);

	const EDGE_VERB_KEYS: Record<string, string> = {
		depends_on: 'canvas.edgeDependsOn',
		calls: 'canvas.edgeCalls',
		extends: 'canvas.edgeExtends',
		uses: 'canvas.edgeUses'
	};

	function edgeVerb(type: string): string {
		const key = EDGE_VERB_KEYS[type];
		return key ? i18nStore.t(key) : type;
	}

	function handleNodePointerEnter({ node, event }: { node: Node; event: PointerEvent }) {
		hoverNodeId = node.id;
		if (hoverTimer) clearTimeout(hoverTimer);
		const pointerX = event.clientX;
		const pointerY = event.clientY;

		hoverTimer = setTimeout(() => {
			if (hoverNodeId !== node.id) return;

			const selected = semanticStore.selectedSemanticNode;
			const level = semanticStore.currentLevel;
			if (!level) return;

			const hoveredSem = level.nodes.find((n) => n.id === node.id);
			if (!hoveredSem) return;

			// Don't show tooltip for the already-selected node
			if (selected && selected.id === node.id) return;

			// Find direct edges between selected and hovered
			const directEdges: RelationshipInfo['directEdges'] = [];
			if (selected) {
				for (const edge of level.edges) {
					if (edge.source === selected.id && edge.target === node.id) {
						directEdges.push({ type: edge.type, label: edge.label, direction: 'outgoing' });
					} else if (edge.source === node.id && edge.target === selected.id) {
						directEdges.push({ type: edge.type, label: edge.label, direction: 'incoming' });
					}
				}
			}

			// Find shared files
			const sharedFiles: string[] = [];
			if (selected) {
				const selectedPaths = new Set(selected.filePaths);
				for (const fp of hoveredSem.filePaths) {
					if (selectedPaths.has(fp)) sharedFiles.push(fp);
				}
			}

			const container = document.querySelector('.zui-canvas');
			const rect = container?.getBoundingClientRect();
			const x = pointerX - (rect?.left ?? 0) + 16;
			const y = pointerY - (rect?.top ?? 0) - 20;

			hoverRelation = {
				hoveredLabel: hoveredSem.label,
				hoveredDescription: hoveredSem.description,
				hoveredFileCount: hoveredSem.fileCount,
				directEdges,
				sharedFiles,
				x,
				y
			};
		}, 600);
	}

	function handleNodePointerLeave(_: { node: Node; event: PointerEvent }) {
		hoverNodeId = null;
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = null;
		hoverRelation = null;
	}

	// --- U1-3: Export diagram ---
	let exportMenuOpen = $state(false);
	let exportFns = $state<{
		exportPNG: () => void;
		exportSVG: () => void;
		exportMarkdown: () => void;
		exportHtml: () => void;
		exportPdf: () => void;
		fitView: () => void;
		getZoom: () => number;
		getViewport: () => Viewport;
		setViewport: (viewport: Viewport) => void;
	} | null>(null);

	export function triggerExport() {
		exportMenuOpen = !exportMenuOpen;
	}

	function handleExportPNG() {
		exportFns?.exportPNG();
		exportMenuOpen = false;
	}

	function handleExportSVG() {
		exportFns?.exportSVG();
		exportMenuOpen = false;
	}

	function handleExportMarkdown() {
		exportFns?.exportMarkdown();
		exportMenuOpen = false;
	}

	function handleExportHtml() {
		exportFns?.exportHtml();
		exportMenuOpen = false;
	}

	function handleExportPdf() {
		exportFns?.exportPdf();
		exportMenuOpen = false;
	}

	// Effect: Semantic view — render from semanticStore.currentLevel
	$effect(() => {
		const level = semanticStore.currentLevel;
		if (!level) {
			flowNodes = [];
			flowEdges = [];
			allEdges = [];
			return;
		}

		// Determine which node should be highlighted based on file selection
		const highlightedNodeId = semanticStore.selectedSemanticNode?.id ?? null;
		const neighbors = highlightedNodeId
			? neighborNodeIds(level, highlightedNodeId)
			: new Set<string>();
		const nodes = toSemanticFlowNodes(level, aspect);
		for (const n of nodes) {
			// U1-6: Apply user-dragged position if available
			const userPos = userPositions.get(n.id);
			if (userPos) {
				n.position = { x: userPos.x, y: userPos.y };
			}

			// U5: Add cache status and reanalyze callback
			// hasCachedLevel(id) = "a child level for THIS node id exists in the
			// semantic cache" (i.e., drilldown target is available without AI).
			const isCached = semanticStore.hasCachedLevel(n.id);
			// ADR-19 follow-up: in snapshot read-only mode (share/explore viewer),
			// a node without a cached child level means the curated snapshot did
			// not include its deep-dive → render muted/dashed so users know not
			// to expect drilldown, and requestDrilldown() will show the prompt
			// dialog instead of triggering an AI call.
			const readOnly = semanticStore.readOnlyMode === 'snapshot';
			const snapshotUnavailable = readOnly && !isCached;
			// A snapshot visitor must not re-run the AI on their own credentials over a frozen level
			// Bridge levels come from serve, so the app's AI must not re-analyze them either
			const onReanalyze = readOnly || onexpand ? undefined : handleReanalyze;

			// Always render as the standard SemanticNode — selection state is
			// communicated via `highlighted` / `dimmed` / `selected` flags so
			// node geometry stays constant and edges stay visually connected.
			n.type = 'semanticNode';
			if (highlightedNodeId) {
				const isSelected = n.id === highlightedNodeId;
				n.data = {
					...n.data,
					highlighted: isSelected,
					dimmed: !isSelected && !neighbors.has(n.id),
					selected: isSelected,
					isCached,
					snapshotUnavailable,
					namePending: namesPending,
					nodeId: n.id,
					onReanalyze,
					onOpen: handleOpenNode
				};
			} else {
				n.data = {
					...n.data,
					highlighted: false,
					dimmed: false,
					selected: false,
					isCached,
					snapshotUnavailable,
					namePending: namesPending,
					nodeId: n.id,
					onReanalyze,
					onOpen: handleOpenNode
				};
			}
		}

		flowNodes = nodes;
		allEdges = toSemanticFlowEdges(level, aspect);
	});

	// Filter edges based on hidden edge types
	$effect(() => {
		if (hiddenEdgeTypes.size === 0) {
			flowEdges = allEdges;
		} else {
			flowEdges = allEdges.filter((e) => !hiddenEdgeTypes.has(e.data?.edgeType as string));
		}
	});

	function toggleEdgeType(type: string) {
		const next = new Set(hiddenEdgeTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		hiddenEdgeTypes = next;
	}

	// Double-click detection via two rapid single clicks
	let lastClickId = '';
	let lastClickTime = 0;
	const DBLCLICK_MS = 400;

	function handleNodeClick({ node }: { node: Node; event: MouseEvent | TouchEvent }) {
		const now = Date.now();

		if (node.id === lastClickId && now - lastClickTime < DBLCLICK_MS) {
			clearTimeout(pendingSelection);
			lastClickId = '';
			lastClickTime = 0;
			handleNodeDblClick(node);
			return;
		}

		lastClickId = node.id;
		lastClickTime = now;

		// Selecting opens the detail panel, which narrows the canvas and can cover this card, so the
		// second click of a double-click would land on the panel. Selection waits out that window
		if (node.type === 'semanticNode') {
			clearTimeout(pendingSelection);
			pendingSelection = setTimeout(() => selectSemanticNode(node.id), DBLCLICK_MS);
		}
	}

	let pendingSelection: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(pendingSelection));

	// Semantic node click → select in semanticStore, clear direct file selection (S7)
	function selectSemanticNode(id: string) {
		const semNode = semanticStore.currentLevel?.nodes.find((n) => n.id === id);
		if (!semNode) return;
		semanticStore.selectedSemanticNode = semNode;
		selectionStore.selectedNode = null;
		// Switch to diagram tab so breadcrumb shows semantic mode
		const path = semanticStore.drilldownPath;
		const label = path.length > 0 ? path[path.length - 1].label : 'Project';
		tabStore.openDiagramTab(path, label);
	}

	let analysisRequestsOpen = $state(false);

	function pulseElement(selector: string) {
		const el = document.querySelector(selector);
		if (el) {
			el.classList.remove('pulse');
			void (el as HTMLElement).offsetWidth;
			el.classList.add('pulse');
		}
	}

	function handleNodeDblClick(node: Node) {
		// Semantic node double-click → drill-down (or switch to code view for leaf nodes)
		if (node.type === 'semanticNode') {
			const semNode = semanticStore.currentLevel?.nodes.find((n) => n.id === node.id);
			if (!semNode) return;

			// Leaf node (1 file): open code tab with that file
			if (semNode.fileCount === 1) {
				semanticStore.selectedSemanticNode = semNode;
				const filePath = semNode.filePaths[0];
				const fileName = filePath.split('/').pop() ?? filePath;
				tabStore.openCodeTab(filePath, fileName, false);
				return;
			}

			// Already analyzing this exact node → pulse pill
			if (semanticStore.isNodeAnalyzing(semNode.id)) {
				pulseElement('.analysis-progress-pill');
				return;
			}

			// Drilldown with confirmation
			requestDrilldown(semNode);
			return;
		}
	}

	// The card's own "open" button: same as double-click, discoverable without it
	function handleOpenNode(id: string) {
		const node = flowNodes.find((n) => n.id === id);
		if (node) handleNodeDblClick(node);
	}

	// How much of a card is legible at the current zoom. Below 0.7 the symbol chips are too
	// small to read and the title starts to grow; below 0.5 the description and file count are too
	type ZoomBand = 'near' | 'far' | 'distant';
	const zoomBandAt = (zoom: number): ZoomBand =>
		zoom < 0.5 ? 'distant' : zoom < 0.7 ? 'far' : 'near';
	// Zoomed out, card titles grow to stay about this size on screen, up to what two lines of
	// a card can hold, so a level fit to the screen keeps its names legible
	const TITLE_SCREEN_PX = 11;
	const TITLE_MAX_PX = 36;
	let zoomBand = $state<ZoomBand>('near');
	let farTitlePx = $state(16);
	function handleMove(_: MouseEvent | TouchEvent | null, viewport: { zoom: number }) {
		const band = zoomBandAt(viewport.zoom);
		if (band !== zoomBand) zoomBand = band;
		// Even steps, so a pinch re-flows the titles a few times rather than on every frame
		const title = 2 * Math.round(TITLE_SCREEN_PX / viewport.zoom / 2);
		const clamped = Math.min(TITLE_MAX_PX, Math.max(16, title));
		if (clamped !== farTitlePx) farTitlePx = clamped;
	}

	function handlePaneClick(_: { event: MouseEvent }) {
		exportMenuOpen = false;

		if (semanticStore.selectedSemanticNode) {
			if (!semanticStore.panelDismissed) {
				// First background click: dismiss panel, keep node highlighted
				semanticStore.panelDismissed = true;
			} else {
				// Second background click: clear node selection
				semanticStore.selectedSemanticNode = null;
			}
		}
		selectionStore.clear();
	}
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<div
	class="zui-canvas"
	data-tour-step="5"
	data-zoom={zoomBand}
	style="--far-title-size: {farTitlePx}px"
>
	<SvelteFlow
		nodes={flowNodes}
		edges={flowEdges}
		{nodeTypes}
		{edgeTypes}
		fitView
		minZoom={0.05}
		maxZoom={4}
		panOnDrag={[0, 1, 2]}
		zoomOnPinch={true}
		panOnScroll={false}
		selectionOnDrag={false}
		onnodeclick={handleNodeClick}
		onnodedragstop={handleNodeDragStop}
		onnodepointerenter={handleNodePointerEnter}
		onnodepointerleave={handleNodePointerLeave}
		onpaneclick={handlePaneClick}
		proOptions={{ hideAttribution: true }}
		onmove={handleMove}
	>
		<Controls />
		{#if showMinimap && !isCompact}
			<MiniMap nodeColor={(n) => (n.data?.color as string) ?? 'var(--color-neutral)'} />
		{/if}
		<Background gap={24} size={1} />
		<ExportController
			onready={(fns) => {
				exportFns = fns;
				// fitView may not emit a move event; read the initial zoom once
				requestAnimationFrame(() => handleMove(null, { zoom: fns.getZoom() }));
			}}
		/>
	</SvelteFlow>

	<!-- U1-2: Node hover relationship preview -->
	{#if hoverRelation}
		<div class="hover-relation-card" style="left: {hoverRelation.x}px; top: {hoverRelation.y}px;">
			<div class="hover-relation-header">{hoverRelation.hoveredLabel}</div>
			<div class="hover-relation-desc">{hoverRelation.hoveredDescription}</div>
			<div class="hover-relation-meta">
				{i18nStore.t(hoverRelation.hoveredFileCount === 1 ? 'node.fileOne' : 'node.fileMany', {
					n: hoverRelation.hoveredFileCount
				})}
			</div>

			{#if semanticStore.selectedSemanticNode}
				<div class="hover-relation-divider"></div>
				{#if hoverRelation.directEdges.length > 0}
					{#each hoverRelation.directEdges as edge}
						<div class="hover-relation-edge">
							<span
								class="hover-edge-dot"
								style="background: {EDGE_TYPE_INFO.find((e) => e.type === edge.type)?.color ??
									'var(--color-edge-depends-on)'};"
							></span>
							{#if edge.direction === 'outgoing'}
								<span class="hover-edge-label">
									<strong>{semanticStore.selectedSemanticNode.label}</strong>
									→ {edgeVerb(edge.type)}
									{#if edge.label}<em>({edge.label})</em>{/if}
								</span>
							{:else}
								<span class="hover-edge-label">
									<strong>{hoverRelation.hoveredLabel}</strong>
									→ {edgeVerb(edge.type)}
									{#if edge.label}<em>({edge.label})</em>{/if}
								</span>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="hover-relation-none">{i18nStore.t('canvas.noDirectConnection')}</div>
				{/if}

				{#if hoverRelation.sharedFiles.length > 0}
					<div class="hover-relation-shared">
						<span class="hover-shared-label"
							>{i18nStore.t('canvas.sharedFiles', { n: hoverRelation.sharedFiles.length })}</span
						>
						{#each hoverRelation.sharedFiles.slice(0, 5) as fp}
							<div class="hover-shared-file">{fp}</div>
						{/each}
						{#if hoverRelation.sharedFiles.length > 5}
							<div class="hover-shared-file">
								{i18nStore.t('canvas.moreFiles', { n: hoverRelation.sharedFiles.length - 5 })}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- U1-9: Diagram top toolbar (legend, minimap toggle, export) -->
	{#if semanticStore.currentLevel}
		<div class="diagram-toolbar">
			<!-- Legend toggle -->
			<div class="toolbar-item">
				<button
					class="toolbar-btn"
					class:active={legendOpen}
					onclick={() => (legendOpen = !legendOpen)}
					title={i18nStore.t('legend.title')}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="7" height="7" />
						<rect x="14" y="3" width="7" height="7" />
						<rect x="3" y="14" width="7" height="7" />
						<rect x="14" y="14" width="7" height="7" />
					</svg>
				</button>
				{#if legendOpen}
					<div class="toolbar-dropdown legend-panel">
						<div class="legend-header">{i18nStore.t('legend.title')}</div>
						{#each EDGE_TYPE_INFO as info}
							<label class="legend-item">
								<input
									type="checkbox"
									checked={!hiddenEdgeTypes.has(info.type)}
									onchange={() => toggleEdgeType(info.type)}
								/>
								<span class="legend-color" style="background: {info.color};"></span>
								<span class="legend-label">{i18nStore.t(info.i18nKey)}</span>
							</label>
						{/each}
						<div class="legend-item legend-note">
							<span class="legend-color legend-dashed" aria-hidden="true"></span>
							<span class="legend-label">{i18nStore.t('legend.inferred')}</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Minimap toggle -->
			<button
				class="toolbar-btn"
				class:active={showMinimap}
				onclick={() => (showMinimap = !showMinimap)}
				title={i18nStore.t('canvas.minimap')}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<rect x="13" y="13" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
				</svg>
			</button>

			<!-- Export -->
			<div class="toolbar-item">
				<button
					class="toolbar-btn"
					onclick={() => (exportMenuOpen = !exportMenuOpen)}
					title={i18nStore.t('shortcuts.exportDiagram')}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
				</button>
				{#if exportMenuOpen}
					<div class="toolbar-dropdown export-menu">
						<button class="export-menu-item" onclick={handleExportPNG}>PNG</button>
						<button class="export-menu-item" onclick={handleExportSVG}>SVG</button>
						<button class="export-menu-item" onclick={handleExportMarkdown}>Markdown</button>
						<button class="export-menu-item" onclick={handleExportHtml}>HTML</button>
						<button class="export-menu-item" onclick={handleExportPdf}>PDF</button>
					</div>
				{/if}
			</div>

			<!-- U1-10: Analysis requests -->
			{#if semanticStore.analysisRequests.size > 0}
				<div class="toolbar-separator"></div>
				<div class="toolbar-item">
					<button
						class="toolbar-btn active"
						onclick={() => (analysisRequestsOpen = !analysisRequestsOpen)}
						title={i18nStore.t('canvas.analysisRequests')}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
						<span class="toolbar-badge">{semanticStore.analysisRequests.size}</span>
					</button>
					{#if analysisRequestsOpen}
						<div class="toolbar-dropdown analysis-requests-panel">
							<div class="legend-header">{i18nStore.t('canvas.analysisRequests')}</div>
							{#each [...semanticStore.analysisRequests.values()] as req (req.nodeId)}
								<div class="analysis-request-item" data-node-id={req.nodeId}>
									<div class="analysis-request-info">
										<span class="analysis-request-name">{req.nodeLabel}</span>
										<span class="analysis-request-progress">{req.progress}</span>
									</div>
									<button
										class="analysis-request-cancel"
										onclick={() => semanticStore.cancelAnalysisRequest(req.nodeId)}
										title={i18nStore.t('common.cancel')}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<DrilldownConfirmModal
	open={drilldownConfirmOpen}
	nodeLabel={pendingDrilldownNode?.label ?? ''}
	onconfirm={confirmDrilldown}
	oncancel={cancelDrilldown}
/>

<ExploreDrilldownPromptDialog
	open={exploreDrilldownPromptOpen}
	nodeLabel={exploreDrilldownPromptLabel}
	onclose={() => (exploreDrilldownPromptOpen = false)}
/>

<style>
	.zui-canvas {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.zui-canvas :global(.svelte-flow) {
		background: var(--color-background-sidebar-icon);
	}

	.zui-canvas :global(.svelte-flow__minimap) {
		/* xyflow paints its own white minimap; follow the app theme instead */
		--xy-minimap-background-color: var(--color-background-surface);
		--xy-minimap-mask-background-color: color-mix(
			in srgb,
			var(--color-background-canvas) 60%,
			transparent
		);
		--xy-minimap-node-background-color: var(--color-neutral);
		--xy-minimap-node-stroke-color: transparent;
		background: var(--color-background-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-inner);
	}

	.zui-canvas :global(.svelte-flow__controls) {
		border: none;
		border-radius: var(--radius-inner);
		overflow: hidden;
		background: var(--color-background-surface);
	}

	.zui-canvas :global(.svelte-flow__controls button) {
		background: var(--color-background-surface);
		color: var(--color-text-primary);
		border-bottom: none;
	}

	.zui-canvas :global(.svelte-flow__controls button:hover) {
		background: var(--color-background-surface);
	}

	/* M3: 44px touch targets for SvelteFlow Controls on mobile (WCAG 2.5.5) */
	@media (max-width: 768px) {
		.zui-canvas :global(.svelte-flow__controls button) {
			width: 44px;
			height: 44px;
		}
		.zui-canvas :global(.svelte-flow__controls button svg) {
			width: 18px;
			height: 18px;
		}
	}

	/* Hide connection handles on semantic nodes */
	.zui-canvas :global(.svelte-flow__node-semanticNode .svelte-flow__handle) {
		width: 0;
		height: 0;
		min-width: 0;
		min-height: 0;
		border: none;
		background: transparent;
		opacity: 0;
		pointer-events: none;
	}

	/* Style edge labels for dark theme */
	.zui-canvas :global(.svelte-flow__edge-label) {
		background: var(--color-background-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 11px;
		font-weight: 500;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* U1-2: Hover relationship card */
	.hover-relation-card {
		position: absolute;
		z-index: 20;
		max-width: 260px;
		background: var(--color-background-popover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		box-shadow: var(--shadow-med);
		padding: var(--spacing-2) var(--spacing-3);
		pointer-events: none;
		animation: relationFadeIn var(--duration-fast) var(--ease-standard);
	}

	@keyframes relationFadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.hover-relation-header {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		margin-bottom: var(--spacing-0-5);
	}

	.hover-relation-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.4;
		margin-bottom: var(--spacing-1);
	}

	.hover-relation-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}

	.hover-relation-divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--spacing-2) 0;
	}

	.hover-relation-edge {
		display: flex;
		align-items: center;
		gap: var(--spacing-1-5);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-1);
	}

	.hover-edge-dot {
		width: 8px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.hover-edge-label strong {
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.hover-edge-label em {
		color: var(--color-text-tertiary);
		font-style: italic;
	}

	.hover-relation-none {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
		font-style: italic;
	}

	.hover-relation-shared {
		margin-top: var(--spacing-1-5);
	}

	.hover-shared-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-tertiary);
	}

	.hover-shared-file {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		font-family: 'SF Mono', 'Fira Code', monospace;
		padding-left: var(--spacing-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* U1-9: Diagram top toolbar */
	.diagram-toolbar {
		position: absolute;
		/* Pages that float a breadcrumb over the canvas push the toolbar below it */
		top: var(--canvas-toolbar-top, 12px);
		right: 12px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		background: var(--color-background-popover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		padding: var(--spacing-1);
		box-shadow: var(--shadow-med);
	}

	.toolbar-item {
		position: relative;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-element);
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.toolbar-btn:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.toolbar-btn.active {
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}

	.toolbar-dropdown {
		position: absolute;
		top: 40px;
		right: 0;
		background: var(--color-background-popover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-element);
		box-shadow: var(--shadow-med);
		animation: toolbarDropdown var(--duration-fast) var(--ease-standard);
	}

	@keyframes toolbarDropdown {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.export-menu {
		min-width: 80px;
		padding: var(--spacing-1) 0;
	}

	.export-menu-item {
		display: block;
		width: 100%;
		padding: var(--spacing-2) var(--spacing-4);
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		text-align: left;
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.export-menu-item:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	/* Legend panel (dropdown from toolbar) */
	.legend-panel {
		min-width: 160px;
		padding: var(--spacing-2) 0;
	}

	.legend-header {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-tertiary);
		padding: var(--spacing-1) var(--spacing-3) var(--spacing-2);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-1);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-1-5) var(--spacing-3);
		cursor: pointer;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.legend-item:hover {
		background: var(--color-background-muted);
	}

	.legend-item input[type='checkbox'] {
		width: 14px;
		height: 14px;
		cursor: pointer;
		accent-color: var(--color-accent);
	}

	.legend-color {
		width: 16px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.legend-label {
		flex: 1;
		min-width: 0;
	}

	.legend-note {
		cursor: default;
		border-top: 1px solid var(--color-border);
		margin-top: var(--spacing-1);
		padding-top: var(--spacing-2);
	}

	.legend-note:hover {
		background: none;
	}

	.legend-dashed {
		margin-left: 22px;
		height: 0;
		border-top: 2px dashed var(--color-text-tertiary);
		background: none;
	}

	/* U1-10: Toolbar separator & analysis requests */
	.toolbar-separator {
		width: 1px;
		height: 20px;
		background: var(--color-border);
		margin: 0 var(--spacing-0-5);
	}

	.toolbar-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 14px;
		height: 14px;
		border-radius: var(--radius-full);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.analysis-requests-panel {
		min-width: 220px;
		padding: var(--spacing-2) 0;
	}

	.analysis-request-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		transition: background-color var(--duration-fast) var(--ease-standard);
	}

	.analysis-request-item:hover {
		background: var(--color-background-muted);
	}

	:global(.analysis-request-item.pulse) {
		animation: requestPulse var(--duration-medium) var(--ease-standard);
	}

	@keyframes requestPulse {
		0% {
			background: transparent;
		}
		50% {
			background: var(--color-accent-muted);
		}
		100% {
			background: transparent;
		}
	}

	.analysis-request-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-0-5);
	}

	.analysis-request-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.analysis-request-progress {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.analysis-request-cancel {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-inner);
		border: none;
		background: transparent;
		color: var(--color-text-tertiary);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.analysis-request-cancel:hover {
		background: var(--color-error-muted);
		color: var(--color-on-error-muted);
	}
</style>
