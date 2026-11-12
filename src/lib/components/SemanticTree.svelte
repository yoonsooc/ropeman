<script lang="ts">
	import { i18nStore } from '$lib/stores/i18nStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { settingsStore } from '$lib/stores/settingsStore.svelte';
	import { analyzeDrilldown } from '$lib/services/semanticAnalysisService';
	import DrilldownConfirmModal from './DrilldownConfirmModal.svelte';
	import type { SemanticNode, SemanticLevel } from '$lib/types/semantic';

	let drilldownConfirmOpen = $state(false);
	let pendingDrilldownContext = $state<{
		semNode: SemanticNode;
		node: TreeNode;
		level: SemanticLevel | undefined;
		pathWithoutLast: Array<{ nodeId: string; label: string }>;
	} | null>(null);

	function executePendingDrilldown() {
		if (!pendingDrilldownContext) return;
		const { semNode, node, level, pathWithoutLast } = pendingDrilldownContext;

		if (level) {
			semanticStore.currentLevel = level;
			semanticStore.drilldownPath = pathWithoutLast;
		}

		const wasCached = semanticStore.drillDown(semNode);
		if (!wasCached) {
			analyzeDrilldown(semNode);
		}
		tabStore.openDiagramTab(semanticStore.drilldownPath, semNode.label);

		if (!expandedNodes.has(node.id)) {
			const next = new Set(expandedNodes);
			next.add(node.id);
			expandedNodes = next;
		}
		pendingDrilldownContext = null;
	}

	interface TreeNode {
		id: string;
		label: string;
		color: string;
		fileCount: number;
		status: 'cached' | 'analyzing' | 'unanalyzed';
		children: TreeNode[];
		drilldownPath: { nodeId: string; label: string }[];
	}

	let expandedNodes = $state<Set<string>>(new Set());

	function buildTree(): TreeNode[] {
		const rootLevel = semanticStore.getCachedLevel('__root__');
		if (!rootLevel) return [];
		return rootLevel.nodes.map((node) => buildTreeNode(node, []));
	}

	function buildTreeNode(
		node: SemanticNode,
		parentPath: { nodeId: string; label: string }[]
	): TreeNode {
		const path = [...parentPath, { nodeId: node.id, label: node.label }];
		const cachedLevel = semanticStore.getCachedLevel(node.id);
		const isAnalyzing = semanticStore.isNodeAnalyzing(node.id);

		let status: TreeNode['status'] = 'unanalyzed';
		if (cachedLevel) status = 'cached';
		else if (isAnalyzing) status = 'analyzing';

		const children: TreeNode[] = cachedLevel
			? cachedLevel.nodes.map((child) => buildTreeNode(child, path))
			: [];

		return {
			id: node.id,
			label: node.label,
			color: node.color,
			fileCount: node.fileCount,
			drilldownPath: path,
			status,
			children
		};
	}

	const tree = $derived(buildTree());

	function toggleExpand(nodeId: string) {
		const next = new Set(expandedNodes);
		if (next.has(nodeId)) {
			next.delete(nodeId);
		} else {
			next.add(nodeId);
		}
		expandedNodes = next;
	}

	function handleNodeClick(node: TreeNode) {
		// Navigate to the parent level containing this node
		const pathWithoutLast = node.drilldownPath.slice(0, -1);
		const parentKey =
			pathWithoutLast.length > 0 ? pathWithoutLast[pathWithoutLast.length - 1].nodeId : '__root__';
		const level = semanticStore.getCachedLevel(parentKey);
		if (level) {
			semanticStore.currentLevel = level;
			semanticStore.drilldownPath = pathWithoutLast;
		}

		// Select this node in the semantic store → highlights on diagram
		const semNode = level?.nodes.find((n) => n.id === node.id) ?? null;
		semanticStore.selectedSemanticNode = semNode;

		// Drill into this node if cached (adds to breadcrumb)
		if (semNode) {
			const wasCached = semanticStore.drillDown(semNode);
			if (wasCached) {
				tabStore.openDiagramTab(semanticStore.drilldownPath, semNode.label);
				return;
			}
		}

		// Fallback: just show parent level diagram
		const tabLabel =
			pathWithoutLast.length > 0 ? pathWithoutLast[pathWithoutLast.length - 1].label : 'Project';
		tabStore.openDiagramTab(pathWithoutLast, tabLabel);
	}

	function pulseElement(selector: string) {
		const el = document.querySelector(selector);
		if (el) {
			el.classList.remove('pulse');
			void (el as HTMLElement).offsetWidth;
			el.classList.add('pulse');
		}
	}

	function handleNodeDblClick(node: TreeNode) {
		// Resolve the SemanticNode from the parent level
		const pathWithoutLast = node.drilldownPath.slice(0, -1);
		const parentKey =
			pathWithoutLast.length > 0 ? pathWithoutLast[pathWithoutLast.length - 1].nodeId : '__root__';
		const level = semanticStore.getCachedLevel(parentKey);
		const semNode = level?.nodes.find((n) => n.id === node.id);
		if (!semNode) return;

		// Leaf node (1 file): open code tab
		if (semNode.fileCount === 1) {
			semanticStore.selectedSemanticNode = semNode;
			const filePath = semNode.filePaths[0];
			const fileName = filePath.split('/').pop() ?? filePath;
			tabStore.openCodeTab(filePath, fileName, false);
			return;
		}

		// Already analyzing → pulse pill
		if (semanticStore.isNodeAnalyzing(semNode.id)) {
			pulseElement('.analysis-progress-pill');
			return;
		}

		// U5-1: Cached nodes drill down immediately without confirmation
		pendingDrilldownContext = { semNode, node, level, pathWithoutLast };
		if (semanticStore.hasCachedLevel(semNode.id) || settingsStore.skipDrilldownConfirm) {
			executePendingDrilldown();
		} else {
			drilldownConfirmOpen = true;
		}
	}

	// Auto-expand nodes that have children
	$effect(() => {
		const next = new Set(expandedNodes);
		let changed = false;
		function autoExpand(nodes: TreeNode[]) {
			for (const node of nodes) {
				if (node.children.length > 0 && !next.has(node.id)) {
					next.add(node.id);
					changed = true;
				}
				autoExpand(node.children);
			}
		}
		autoExpand(tree);
		if (changed) expandedNodes = next;
	});

	// U5-3/U5-4: Re-analyze a tree node by invalidating cache and triggering new AI call
	function handleReanalyze(e: MouseEvent, node: TreeNode) {
		e.stopPropagation();
		const pathWithoutLast = node.drilldownPath.slice(0, -1);
		const parentKey =
			pathWithoutLast.length > 0 ? pathWithoutLast[pathWithoutLast.length - 1].nodeId : '__root__';
		const level = semanticStore.getCachedLevel(parentKey);
		const semNode = level?.nodes.find((n) => n.id === node.id);
		if (!semNode) return;
		if (semanticStore.isNodeAnalyzing(semNode.id)) {
			pulseElement('.analysis-progress-pill');
			return;
		}
		semanticStore.invalidateCache(node.id);
		analyzeDrilldown(semNode);
	}

	const statusIcons: Record<string, string> = {
		cached: '\u2713',
		analyzing: '\u23F3',
		unanalyzed: '\u2014'
	};
</script>

<div class="semantic-tree">
	{#if tree.length === 0}
		<div class="empty-state">
			<span class="empty-text">{i18nStore.t('sidebar.semanticEmpty')}</span>
		</div>
	{:else}
		{#each tree as node}
			{@render treeItem(node, 0)}
		{/each}
	{/if}
</div>

{#snippet treeItem(node: TreeNode, depth: number)}
	<div class="tree-row" style="padding-left: {12 + depth * 16}px;">
		{#if node.children.length > 0}
			<button
				class="tree-chevron"
				class:expanded={expandedNodes.has(node.id)}
				onclick={() => toggleExpand(node.id)}
			>
				&#9656;
			</button>
		{:else}
			<span class="tree-spacer"></span>
		{/if}
		<button
			class="tree-node"
			class:selected={semanticStore.selectedSemanticNode?.id === node.id}
			onclick={() => handleNodeClick(node)}
			ondblclick={() => handleNodeDblClick(node)}
		>
			<span class="node-color" style="background: {node.color};"></span>
			<span class="node-label">{node.label}</span>
			{#if node.status === 'cached' && node.fileCount > 1}
				<button
					class="tree-reanalyze-btn"
					title={i18nStore.t('node.reanalyze')}
					onclick={(e) => handleReanalyze(e, node)}
				>
					&#x21BB;
				</button>
			{/if}
			<span
				class="node-status"
				class:cached={node.status === 'cached'}
				class:analyzing={node.status === 'analyzing'}
			>
				{statusIcons[node.status]}
			</span>
			<span class="node-count">{node.fileCount}</span>
		</button>
	</div>
	{#if expandedNodes.has(node.id) && node.children.length > 0}
		{#each node.children as child}
			{@render treeItem(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

<DrilldownConfirmModal
	open={drilldownConfirmOpen}
	nodeLabel={pendingDrilldownContext?.semNode.label ?? ''}
	onconfirm={() => {
		drilldownConfirmOpen = false;
		executePendingDrilldown();
	}}
	oncancel={() => {
		drilldownConfirmOpen = false;
		pendingDrilldownContext = null;
	}}
/>

<style>
	.semantic-tree {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: var(--spacing-1) 0;
	}

	.semantic-tree::-webkit-scrollbar {
		width: 6px;
	}

	.semantic-tree::-webkit-scrollbar-track {
		background: transparent;
	}

	.semantic-tree::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: var(--radius-full);
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100px;
	}

	.empty-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-0-5);
	}

	.tree-chevron {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		color: var(--color-text-tertiary);
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-standard);
		padding: 0;
	}

	.tree-chevron.expanded {
		transform: rotate(90deg);
	}

	.tree-spacer {
		width: 16px;
		flex-shrink: 0;
	}

	.tree-node {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		flex: 1;
		min-width: 0;
		padding: var(--spacing-2) var(--spacing-3);
		border-radius: var(--radius-inner);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.tree-node:hover {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
	}

	.tree-node.selected {
		background: var(--color-background-muted);
		color: var(--color-text-primary);
		font-weight: var(--font-weight-medium);
	}

	.node-color {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.node-label {
		font-family: var(--font-display);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.node-status {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.node-status.cached {
		color: var(--color-text-success);
	}

	.node-status.analyzing {
		color: var(--color-text-warning);
	}

	.node-count {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.tree-reanalyze-btn {
		display: none;
		width: 16px;
		height: 16px;
		border: none;
		border-radius: var(--radius-inner);
		background: transparent;
		color: var(--color-text-tertiary);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		transition:
			background-color var(--duration-fast) var(--ease-standard),
			color var(--duration-fast) var(--ease-standard);
	}

	.tree-node:hover .tree-reanalyze-btn {
		display: flex;
	}

	.tree-reanalyze-btn:hover {
		background: var(--color-accent-muted);
		color: var(--color-accent);
	}
</style>
