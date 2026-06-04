<script lang="ts">
	import { SvelteFlow, MiniMap, Controls, Background, type Node, type Edge } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { toSemanticFlowNodes, toSemanticFlowEdges } from '$lib/services/semanticGraphBuilder';
	import { analyzeDrilldown } from '$lib/services/semanticAnalysisService';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import ExportController from './ExportController.svelte';
	import SemanticNodeComponent from './nodes/SemanticNode.svelte';
	import DrilldownConfirmModal from './DrilldownConfirmModal.svelte';
	import ExploreDrilldownPromptDialog from './ExploreDrilldownPromptDialog.svelte';
	import { useBreakpoint } from '$lib/utils/responsive.svelte';
	import type { SemanticNode } from '$lib/types/semantic';

	const breakpoint = useBreakpoint();
	const isCompact = $derived(breakpoint.isMobile || breakpoint.isTablet);

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

	const EDGE_TYPE_INFO: { type: string; i18nKey: string; color: string }[] = [
		{ type: 'depends_on', i18nKey: 'legend.depends_on', color: '#94a3b8' },
		{ type: 'calls', i18nKey: 'legend.calls', color: '#53ddfc' },
		{ type: 'extends', i18nKey: 'legend.extends', color: '#ac8aff' },
		{ type: 'uses', i18nKey: 'legend.uses', color: '#7ad4a0' }
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

	// Clear userPositions when drill-down/drill-up changes the level
	$effect(() => {
		const currentParentId = semanticStore.currentLevel?.parentId ?? null;
		if (prevLevelParentId !== undefined && currentParentId !== prevLevelParentId) {
			userPositions = new Map();
		}
		prevLevelParentId = currentParentId;
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

	const EDGE_TYPE_LABELS: Record<string, string> = {
		depends_on: 'depends on',
		calls: 'calls',
		extends: 'extends',
		uses: 'uses'
	};

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
		const nodes = toSemanticFlowNodes(level);
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
			const snapshotUnavailable = semanticStore.readOnlyMode === 'snapshot' && !isCached;

			// Always render as the standard SemanticNode — selection state is
			// communicated via `highlighted` / `dimmed` / `selected` flags so
			// node geometry stays constant and edges stay visually connected.
			n.type = 'semanticNode';
			if (highlightedNodeId) {
				const isSelected = n.id === highlightedNodeId;
				n.data = {
					...n.data,
					highlighted: isSelected,
					dimmed: !isSelected,
					selected: isSelected,
					isCached,
					snapshotUnavailable,
					nodeId: n.id,
					onReanalyze: handleReanalyze
				};
			} else {
				n.data = {
					...n.data,
					highlighted: false,
					dimmed: false,
					selected: false,
					isCached,
					snapshotUnavailable,
					nodeId: n.id,
					onReanalyze: handleReanalyze
				};
			}
		}

		flowNodes = nodes;
		allEdges = toSemanticFlowEdges(level);
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
			lastClickId = '';
			lastClickTime = 0;
			handleNodeDblClick(node);
			return;
		}

		lastClickId = node.id;
		lastClickTime = now;

		// Semantic node click → select in semanticStore, clear direct file selection (S7)
		if (node.type === 'semanticNode') {
			const semNode = semanticStore.currentLevel?.nodes.find((n) => n.id === node.id) ?? null;
			semanticStore.selectedSemanticNode = semNode;
			selectionStore.selectedNode = null;
			// Switch to diagram tab so breadcrumb shows semantic mode
			const path = semanticStore.drilldownPath;
			const label = path.length > 0 ? path[path.length - 1].label : 'Project';
			tabStore.openDiagramTab(path, label);
			return;
		}
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

<div class="zui-canvas" data-tour-step="5">
	<SvelteFlow
		nodes={flowNodes}
		edges={flowEdges}
		{nodeTypes}
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
	>
		<Controls />
		{#if showMinimap && !isCompact}
			<MiniMap />
		{/if}
		<Background gap={24} size={1} />
		<ExportController onready={(fns) => (exportFns = fns)} />
	</SvelteFlow>

	<!-- U1-2: Node hover relationship preview -->
	{#if hoverRelation}
		<div class="hover-relation-card" style="left: {hoverRelation.x}px; top: {hoverRelation.y}px;">
			<div class="hover-relation-header">{hoverRelation.hoveredLabel}</div>
			<div class="hover-relation-desc">{hoverRelation.hoveredDescription}</div>
			<div class="hover-relation-meta">{hoverRelation.hoveredFileCount} files</div>

			{#if semanticStore.selectedSemanticNode}
				<div class="hover-relation-divider"></div>
				{#if hoverRelation.directEdges.length > 0}
					{#each hoverRelation.directEdges as edge}
						<div class="hover-relation-edge">
							<span
								class="hover-edge-dot"
								style="background: {EDGE_TYPE_INFO.find((e) => e.type === edge.type)?.color ??
									'#94a3b8'};"
							></span>
							{#if edge.direction === 'outgoing'}
								<span class="hover-edge-label">
									<strong>{semanticStore.selectedSemanticNode.label}</strong>
									→ {EDGE_TYPE_LABELS[edge.type] ?? edge.type}
									{#if edge.label}<em>({edge.label})</em>{/if}
								</span>
							{:else}
								<span class="hover-edge-label">
									<strong>{hoverRelation.hoveredLabel}</strong>
									→ {EDGE_TYPE_LABELS[edge.type] ?? edge.type}
									{#if edge.label}<em>({edge.label})</em>{/if}
								</span>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="hover-relation-none">No direct connection</div>
				{/if}

				{#if hoverRelation.sharedFiles.length > 0}
					<div class="hover-relation-shared">
						<span class="hover-shared-label"
							>Shared files ({hoverRelation.sharedFiles.length}):</span
						>
						{#each hoverRelation.sharedFiles.slice(0, 5) as fp}
							<div class="hover-shared-file">{fp}</div>
						{/each}
						{#if hoverRelation.sharedFiles.length > 5}
							<div class="hover-shared-file">... +{hoverRelation.sharedFiles.length - 5} more</div>
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
					</div>
				{/if}
			</div>

			<!-- Minimap toggle -->
			<button
				class="toolbar-btn"
				class:active={showMinimap}
				onclick={() => (showMinimap = !showMinimap)}
				title="Minimap"
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
						title="Analysis Requests"
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
							<div class="legend-header">Analysis Requests</div>
							{#each [...semanticStore.analysisRequests.values()] as req (req.nodeId)}
								<div class="analysis-request-item" data-node-id={req.nodeId}>
									<div class="analysis-request-info">
										<span class="analysis-request-name">{req.nodeLabel}</span>
										<span class="analysis-request-progress">{req.progress}</span>
									</div>
									<button
										class="analysis-request-cancel"
										onclick={() => semanticStore.cancelAnalysisRequest(req.nodeId)}
										title="Cancel"
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
		background: var(--sidebar-icon-bg, #0f141a);
	}

	.zui-canvas :global(.svelte-flow__minimap) {
		background: var(--bg-secondary);
		border: none;
		border-radius: 4px;
	}

	.zui-canvas :global(.svelte-flow__controls) {
		border: none;
		border-radius: 4px;
		overflow: hidden;
		background: var(--bg-secondary);
	}

	.zui-canvas :global(.svelte-flow__controls button) {
		background: var(--bg-secondary);
		color: var(--text-primary);
		border-bottom: none;
	}

	.zui-canvas :global(.svelte-flow__controls button:hover) {
		background: var(--bg-secondary);
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
		background: var(--bg-secondary);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 9px;
		font-weight: 500;
	}

	/* U1-2: Hover relationship card */
	.hover-relation-card {
		position: absolute;
		z-index: 20;
		max-width: 320px;
		background: var(--surface-elevated, var(--bg-secondary));
		border: 1px solid rgba(68, 72, 79, 0.15);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		padding: 10px 12px;
		pointer-events: none;
		animation: relationFadeIn 0.15s ease;
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
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 2px;
	}

	.hover-relation-desc {
		font-size: 11px;
		color: var(--text-secondary);
		line-height: 1.4;
		margin-bottom: 4px;
	}

	.hover-relation-meta {
		font-size: 10px;
		color: var(--text-muted);
	}

	.hover-relation-divider {
		height: 1px;
		background: var(--border);
		margin: 8px 0;
	}

	.hover-relation-edge {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 4px;
	}

	.hover-edge-dot {
		width: 8px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.hover-edge-label strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.hover-edge-label em {
		color: var(--text-muted);
		font-style: italic;
	}

	.hover-relation-none {
		font-size: 11px;
		color: var(--text-muted);
		font-style: italic;
	}

	.hover-relation-shared {
		margin-top: 6px;
	}

	.hover-shared-label {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.hover-shared-file {
		font-size: 10px;
		color: var(--text-secondary);
		font-family: 'SF Mono', 'Fira Code', monospace;
		padding-left: 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* U1-9: Diagram top toolbar */
	.diagram-toolbar {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--surface-elevated, var(--bg-secondary));
		border: 1px solid rgba(68, 72, 79, 0.15);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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
		border-radius: 6px;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.toolbar-btn:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.toolbar-btn.active {
		background: var(--accent-bg, rgba(59, 130, 246, 0.12));
		color: var(--accent, #3b82f6);
	}

	.toolbar-dropdown {
		position: absolute;
		top: 40px;
		right: 0;
		background: var(--surface-elevated, var(--bg-secondary));
		border: 1px solid rgba(68, 72, 79, 0.15);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		animation: toolbarDropdown 0.15s ease;
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
		padding: 4px 0;
	}

	.export-menu-item {
		display: block;
		width: 100%;
		padding: 8px 16px;
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.1s ease;
	}

	.export-menu-item:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	/* Legend panel (dropdown from toolbar) */
	.legend-panel {
		min-width: 160px;
		padding: 8px 0;
	}

	.legend-header {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		padding: 4px 12px 8px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-secondary);
		transition: background-color 0.1s ease;
	}

	.legend-item:hover {
		background: var(--bg-tertiary);
	}

	.legend-item input[type='checkbox'] {
		width: 14px;
		height: 14px;
		cursor: pointer;
		accent-color: var(--accent, #3b82f6);
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

	/* U1-10: Toolbar separator & analysis requests */
	.toolbar-separator {
		width: 1px;
		height: 20px;
		background: var(--border);
		margin: 0 2px;
	}

	.toolbar-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 14px;
		height: 14px;
		border-radius: 7px;
		background: var(--accent, #3b82f6);
		color: #fff;
		font-size: 9px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.analysis-requests-panel {
		min-width: 220px;
		padding: 8px 0;
	}

	.analysis-request-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		transition: background-color 0.1s ease;
	}

	.analysis-request-item:hover {
		background: var(--bg-tertiary);
	}

	:global(.analysis-request-item.pulse) {
		animation: requestPulse 0.4s ease;
	}

	@keyframes requestPulse {
		0% {
			background: transparent;
		}
		50% {
			background: rgba(59, 130, 246, 0.15);
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
		gap: 2px;
	}

	.analysis-request-name {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.analysis-request-progress {
		font-size: 10px;
		color: var(--text-muted);
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
		border-radius: 4px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background-color 0.1s ease,
			color 0.1s ease;
	}

	.analysis-request-cancel:hover {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}
</style>
