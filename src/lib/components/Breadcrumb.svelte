<script lang="ts">
	import { selectionStore } from '$lib/stores/selectionStore.svelte';
	import { semanticStore } from '$lib/stores/semanticStore.svelte';
	import { tabStore } from '$lib/stores/tabStore.svelte';
	import { projectStore } from '$lib/stores/projectStore.svelte';
	import type { FileNode } from '$lib/types/fileTree';
	import type { SemanticNode } from '$lib/types/semantic';
	import { getFileIcon, getFolderIcon } from '$lib/utils/fileIcons';

	const activeTab = $derived(tabStore.activeTab);
	const semanticPath = $derived(semanticStore.drilldownPath);
	const hasDiagramTab = $derived(tabStore.tabs.some((t) => t.type === 'diagram'));

	// Dropdown state
	let openDropdownIndex = $state<number | null>(null);

	function closeDropdown() {
		openDropdownIndex = null;
	}

	// Close dropdown on outside click
	function handleWindowClick(e: MouseEvent) {
		if (openDropdownIndex !== null) {
			const target = e.target as HTMLElement;
			if (!target.closest('.crumb-dropdown-wrapper')) {
				closeDropdown();
			}
		}
	}

	// --- Semantic breadcrumb helpers ---
	function handleSemanticRootNavigate() {
		semanticStore.goToLevel(-1);
		tabStore.openDiagramTab([], 'Project');
		closeDropdown();
	}

	function handleSemanticCrumbClick(index: number) {
		semanticStore.goToLevel(index);
		const path = semanticStore.drilldownPath;
		const label = path.length > 0 ? path[path.length - 1].label : 'Project';
		tabStore.openDiagramTab(path, label);
		closeDropdown();
	}

	/** Get the children of the node at this crumb level (what's displayed in its diagram) */
	function getSemanticChildren(index: number): SemanticNode[] {
		let key: string;
		if (index === -1) {
			// Root level: show root diagram's nodes
			key = '__root__';
		} else {
			key = semanticPath[index].nodeId;
		}
		const level = semanticStore.getCachedLevel(key);
		return level?.nodes ?? [];
	}

	function handleSemanticDropdownItem(node: SemanticNode, index: number) {
		// Highlight the node first
		semanticStore.selectedSemanticNode = node;

		// Navigate to the parent level, then drill into the node
		if (index === -1) {
			semanticStore.goToLevel(-1);
		} else {
			semanticStore.goToLevel(index);
		}

		const wasCached = semanticStore.drillDown(node);
		if (wasCached) {
			tabStore.openDiagramTab(semanticStore.drilldownPath, node.label);
		}
		closeDropdown();
	}

	// --- Code breadcrumb helpers ---
	const codeFilePath = $derived.by(() => {
		if (activeTab?.type !== 'code') return '';
		return activeTab.filePath ?? selectionStore.selectedNode?.filePath ?? '';
	});

	const codePathSegments = $derived.by(() => {
		if (!codeFilePath) return [];
		return codeFilePath.split('/');
	});

	function getDirectoryContents(dirPath: string): FileNode[] {
		const tree = projectStore.fileTree;
		if (!tree) return [];

		if (dirPath === tree.name || dirPath === tree.path) {
			return tree.children ?? [];
		}

		// Navigate to the directory
		const parts = dirPath.split('/');
		let current: FileNode | undefined = tree;
		// Skip root if it matches
		const startIdx = parts[0] === tree.name ? 1 : 0;
		for (let i = startIdx; i < parts.length; i++) {
			if (!current?.children) return [];
			current = current.children.find((c) => c.name === parts[i]);
		}
		return current?.children ?? [];
	}

	function handleCodeSegmentClick(segmentIndex: number) {
		// Last segment = filename, no dropdown
		if (segmentIndex === codePathSegments.length - 1) return;
		openDropdownIndex = openDropdownIndex === segmentIndex ? null : segmentIndex;
	}

	function handleCodeDropdownItem(item: FileNode) {
		if (item.kind === 'file') {
			tabStore.openCodeTab(item.path, item.name, true);
			const syntheticNode = {
				id: `file:${item.path}`,
				kind: 'file' as const,
				label: item.name,
				filePath: item.path,
				parentId: null,
				childCount: 0,
				isExpanded: false
			};
			selectionStore.selectedNode = syntheticNode;
			selectionStore.breadcrumb = [syntheticNode];
		}
		closeDropdown();
	}
</script>

<svelte:window
	onclick={handleWindowClick}
	onkeydown={(e) => {
		if (e.key === 'Escape') closeDropdown();
	}}
/>

{#if (activeTab?.type !== 'code' || (hasDiagramTab && semanticStore.selectedSemanticNode)) && semanticStore.currentLevel !== null}
	<!-- Semantic diagram breadcrumb -->
	<nav class="breadcrumb-bar" data-tour-step="6">
		<div class="crumb-dropdown-wrapper">
			<button
				class="crumb group-crumb"
				class:active={semanticPath.length === 0}
				onclick={() => {
					if (semanticPath.length === 0) {
						// Already at root — toggle dropdown to show root's nodes
						openDropdownIndex = openDropdownIndex === -1 ? null : -1;
					} else {
						// Navigate back to root
						handleSemanticRootNavigate();
					}
				}}
			>
				<span class="crumb-icon">&#9673;</span>
				<span class="crumb-label">Project</span>
				{#if semanticPath.length === 0}
					<span class="crumb-chevron">&#9662;</span>
				{/if}
			</button>
			{#if openDropdownIndex === -1}
				{@const rootChildren = getSemanticChildren(-1)}
				{#if rootChildren.length > 0}
					<div class="crumb-dropdown">
						{#each rootChildren as child}
							<button class="dropdown-item" onclick={() => handleSemanticDropdownItem(child, -1)}>
								<span class="dropdown-color" style="background: {child.color};"></span>
								<span class="dropdown-label">{child.label}</span>
								<span class="dropdown-count">{child.fileCount}</span>
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		{#each semanticPath as crumb, i}
			<span class="separator">&rsaquo;</span>
			<div class="crumb-dropdown-wrapper">
				<button
					class="crumb"
					class:active={i === semanticPath.length - 1}
					onclick={() => {
						if (i === semanticPath.length - 1) {
							// Active crumb — show its children (current diagram's nodes)
							const children = getSemanticChildren(i);
							if (children.length > 0) {
								openDropdownIndex = openDropdownIndex === i ? null : i;
							}
						} else {
							handleSemanticCrumbClick(i);
						}
					}}
				>
					<span class="crumb-label">{crumb.label}</span>
					{#if i === semanticPath.length - 1 && getSemanticChildren(i).length > 0}
						<span class="crumb-chevron">&#9662;</span>
					{/if}
				</button>
				{#if openDropdownIndex === i}
					{@const children = getSemanticChildren(i)}
					<div class="crumb-dropdown">
						{#each children as child}
							<button class="dropdown-item" onclick={() => handleSemanticDropdownItem(child, i)}>
								<span class="dropdown-color" style="background: {child.color};"></span>
								<span class="dropdown-label">{child.label}</span>
								<span class="dropdown-count">{child.fileCount}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</nav>
{:else if activeTab?.type === 'code' && codePathSegments.length > 0}
	<!-- Code file path breadcrumb -->
	<nav class="breadcrumb-bar">
		{#each codePathSegments as segment, i}
			{#if i > 0}
				<span class="separator">&rsaquo;</span>
			{/if}
			{#if i === codePathSegments.length - 1}
				<!-- Filename (last segment, no dropdown) -->
				{@const fIcon = getFileIcon(segment)}
				<span class="crumb active">
					<span
						class="crumb-icon material-symbols-outlined"
						style={fIcon.color ? `color:${fIcon.color}` : ''}>{fIcon.icon}</span
					>
					<span class="crumb-label">{segment}</span>
				</span>
			{:else}
				<!-- Directory segment with dropdown -->
				<div class="crumb-dropdown-wrapper">
					<button class="crumb" onclick={() => handleCodeSegmentClick(i)}>
						{#if i === 0}
							{@const dIcon = getFolderIcon(true)}
							<span
								class="crumb-icon material-symbols-outlined"
								style={dIcon.color ? `color:${dIcon.color}` : ''}>{dIcon.icon}</span
							>
						{/if}
						<span class="crumb-label">{segment}</span>
						<span class="crumb-chevron">&#9662;</span>
					</button>
					{#if openDropdownIndex === i}
						{@const dirPath = codePathSegments.slice(0, i + 1).join('/')}
						<div class="crumb-dropdown">
							{#each getDirectoryContents(dirPath).sort((a, b) => {
								if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
								return a.name.localeCompare(b.name);
							}) as item}
								{@const itemIcon =
									item.kind === 'directory' ? getFolderIcon(false) : getFileIcon(item.name)}
								<button
									class="dropdown-item"
									class:current={i + 1 < codePathSegments.length &&
										item.name === codePathSegments[i + 1]}
									onclick={() => handleCodeDropdownItem(item)}
								>
									<span
										class="dropdown-icon material-symbols-outlined"
										style={itemIcon.color ? `color:${itemIcon.color}` : ''}>{itemIcon.icon}</span
									>
									<span class="dropdown-label">{item.name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	</nav>
{/if}

<style>
	.breadcrumb-bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 6px 20px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		overflow: visible;
		flex-shrink: 0;
		min-height: 32px;
	}

	.separator {
		color: var(--text-muted);
		font-size: 14px;
		margin: 0 2px;
		user-select: none;
	}

	.crumb {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;
		background: none;
		border: none;
		cursor: pointer;
		transition:
			background-color var(--transition),
			color var(--transition);
	}

	.crumb:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.crumb.active {
		color: var(--accent);
		font-weight: 600;
	}

	.group-crumb {
		font-weight: 600;
		font-size: 12px;
	}

	.crumb-icon {
		font-size: 14px;
	}

	.crumb-label {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.crumb-chevron {
		font-size: 8px;
		color: var(--text-muted);
		margin-left: 2px;
	}

	.crumb-dropdown-wrapper {
		position: relative;
	}

	.crumb-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 100;
		min-width: 180px;
		max-width: 300px;
		max-height: 280px;
		overflow-y: auto;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		padding: 4px;
		margin-top: 4px;
	}

	.crumb-dropdown::-webkit-scrollbar {
		width: 4px;
	}

	.crumb-dropdown::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 2px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border-radius: 4px;
		font-size: 12px;
		color: var(--text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
		transition: background-color 0.1s ease;
	}

	.dropdown-item:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.dropdown-item.current {
		color: var(--accent, #3b82f6);
		font-weight: 600;
	}

	.dropdown-color {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.dropdown-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	.dropdown-label {
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.dropdown-count {
		font-size: 10px;
		color: var(--text-muted);
		flex-shrink: 0;
	}
</style>
