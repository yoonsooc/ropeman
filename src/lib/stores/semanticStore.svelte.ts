import type { SemanticLevel, SemanticNode } from '$lib/types/semantic';
import { tabStore } from './tabStore.svelte';
import { saveSemanticLevel, loadSemanticCache } from '$lib/services/semanticCacheService';

export type ViewMode = 'semantic' | 'code';

/**
 * Read-only viewing mode. `'snapshot'` is used by the `/share/[slug]` and
 * `/explore/[slug]` routes to signal that the loaded analysis is a frozen
 * snapshot — drilldowns into non-cached nodes should not trigger AI calls,
 * and the UI should guide visitors to the main app instead.
 */
export type ReadOnlyMode = 'none' | 'snapshot';

export interface SnapshotMeta {
	owner?: string;
	repo?: string;
	title?: string;
}

export interface AnalysisRequest {
	nodeId: string;
	nodeLabel: string;
	progress: string;
	abortController: AbortController;
}

export interface AnalysisCompletion {
	type: 'success' | 'error';
	nodeLabel: string;
	message?: string;
	at: number;
}

// Callback to get settings/project without circular imports
let _getSettingsAndProject: (() => { cacheEnabled: boolean; projectName: string }) | null = null;

export function setSemanticCacheDeps(fn: () => { cacheEnabled: boolean; projectName: string }) {
	_getSettingsAndProject = fn;
}

function createSemanticStore() {
	let currentLevel = $state<SemanticLevel | null>(null);
	let drilldownPath = $state<{ nodeId: string; label: string }[]>([]);
	let analysisError = $state<string | null>(null);
	let analysisRequests = $state<Map<string, AnalysisRequest>>(new Map());
	let cache = $state<Map<string, SemanticLevel>>(new Map());
	let selectedSemanticNode = $state<SemanticNode | null>(null);
	let panelDismissed = $state(false);
	let readOnlyMode = $state<ReadOnlyMode>('none');
	let snapshotMeta = $state<SnapshotMeta | null>(null);
	let lastCompletion = $state<AnalysisCompletion | null>(null);

	return {
		get currentLevel() {
			return currentLevel;
		},
		set currentLevel(v: SemanticLevel | null) {
			currentLevel = v;
		},

		get drilldownPath() {
			return drilldownPath;
		},
		set drilldownPath(v: { nodeId: string; label: string }[]) {
			drilldownPath = v;
		},

		get viewMode(): ViewMode {
			return tabStore.viewMode;
		},
		set viewMode(v: ViewMode) {
			// Backward compatibility: setting viewMode opens a tab of the appropriate type
			// For 'code', callers should use tabStore.openCodeTab() directly
			// For 'semantic', callers should use tabStore.openDiagramTab() directly
			if (v === 'semantic') {
				tabStore.openDiagramTab(
					drilldownPath,
					drilldownPath.length > 0 ? drilldownPath[drilldownPath.length - 1].label : 'Project'
				);
			}
			// For 'code', we don't auto-open a tab — the caller should specify which file
		},

		// Derived from analysisRequests for backward compatibility
		get isAnalyzing() {
			return analysisRequests.size > 0;
		},
		set isAnalyzing(_v: boolean) {
			/* no-op, managed via analysisRequests */
		},

		get analysisError() {
			return analysisError;
		},
		set analysisError(v: string | null) {
			analysisError = v;
		},

		// Latest request's progress for pill display
		get analysisProgress() {
			if (analysisRequests.size === 0) return '';
			const entries = [...analysisRequests.values()];
			const latest = entries[entries.length - 1];
			return latest.progress ? `[${latest.nodeLabel}] ${latest.progress}` : '';
		},
		set analysisProgress(_v: string) {
			/* no-op, managed via analysisRequests */
		},

		get analysisRequests() {
			return analysisRequests;
		},

		addAnalysisRequest(nodeId: string, nodeLabel: string): AbortController {
			const abortController = new AbortController();
			const next = new Map(analysisRequests);
			next.set(nodeId, { nodeId, nodeLabel, progress: '', abortController });
			analysisRequests = next;
			return abortController;
		},

		updateAnalysisProgress(nodeId: string, progress: string) {
			const req = analysisRequests.get(nodeId);
			if (req) {
				const next = new Map(analysisRequests);
				next.set(nodeId, { ...req, progress });
				analysisRequests = next;
			}
		},

		removeAnalysisRequest(nodeId: string) {
			const next = new Map(analysisRequests);
			next.delete(nodeId);
			analysisRequests = next;
		},

		cancelAnalysisRequest(nodeId: string) {
			const req = analysisRequests.get(nodeId);
			if (req) {
				req.abortController.abort();
				const next = new Map(analysisRequests);
				next.delete(nodeId);
				analysisRequests = next;
			}
		},

		isNodeAnalyzing(nodeId: string): boolean {
			return analysisRequests.has(nodeId);
		},

		get cache() {
			return cache;
		},

		get selectedSemanticNode() {
			return selectedSemanticNode;
		},
		set selectedSemanticNode(v: SemanticNode | null) {
			selectedSemanticNode = v;
			// Auto-reset panelDismissed when a new node is selected
			if (v !== null) {
				panelDismissed = false;
			}
		},

		get panelDismissed() {
			return panelDismissed;
		},
		set panelDismissed(v: boolean) {
			panelDismissed = v;
		},

		get readOnlyMode(): ReadOnlyMode {
			return readOnlyMode;
		},
		set readOnlyMode(v: ReadOnlyMode) {
			readOnlyMode = v;
		},

		get snapshotMeta(): SnapshotMeta | null {
			return snapshotMeta;
		},
		set snapshotMeta(v: SnapshotMeta | null) {
			snapshotMeta = v;
		},

		get lastCompletion(): AnalysisCompletion | null {
			return lastCompletion;
		},
		set lastCompletion(v: AnalysisCompletion | null) {
			lastCompletion = v;
		},

		get highlightedFilePaths(): string[] {
			return selectedSemanticNode?.filePaths ?? [];
		},

		get highlightedDirPaths(): string[] {
			const filePaths = selectedSemanticNode?.filePaths ?? [];
			if (filePaths.length === 0) return [];
			const dirs = new Set<string>();
			for (const fp of filePaths) {
				const parts = fp.split('/');
				for (let i = 1; i < parts.length; i++) {
					dirs.add(parts.slice(0, i).join('/'));
				}
			}
			return [...dirs];
		},

		cacheLevel(key: string, level: SemanticLevel) {
			const next = new Map(cache);
			next.set(key, level);
			cache = next;
			// Persist to IndexedDB if cache is enabled
			if (_getSettingsAndProject) {
				const { cacheEnabled, projectName } = _getSettingsAndProject();
				if (cacheEnabled && projectName) {
					saveSemanticLevel(projectName, key, level).catch(() => {});
				}
			}
		},

		getCachedLevel(key: string): SemanticLevel | undefined {
			return cache.get(key);
		},

		hasCachedLevel(key: string): boolean {
			return cache.has(key);
		},

		setCachedLevel(key: string, level: SemanticLevel) {
			cache = new Map(cache).set(key, level);
		},

		invalidateCache(key: string) {
			const next = new Map(cache);
			next.delete(key);
			cache = next;
		},

		async restoreCache(projectName: string) {
			if (_getSettingsAndProject && !_getSettingsAndProject().cacheEnabled) return;
			const restored = await loadSemanticCache(projectName);
			if (restored.size > 0) {
				cache = restored;
				// Restore root level if available
				const root = restored.get('__root__');
				if (root) {
					currentLevel = root;
				}
			}
		},

		drillDown(node: SemanticNode) {
			// Cache current level before drilling down
			const cacheKey = currentLevel?.parentId ?? '__root__';
			if (currentLevel) {
				const next = new Map(cache);
				next.set(cacheKey, currentLevel);
				cache = next;
				// Persist to IndexedDB
				if (_getSettingsAndProject) {
					const { cacheEnabled, projectName } = _getSettingsAndProject();
					if (cacheEnabled && projectName) {
						saveSemanticLevel(projectName, cacheKey, currentLevel).catch(() => {});
					}
				}
			}

			drilldownPath = [...drilldownPath, { nodeId: node.id, label: node.label }];

			// Check cache for drill-down level
			const cached = cache.get(node.id);
			if (cached) {
				currentLevel = cached;
				return true; // cached, no AI call needed
			}

			return false; // caller should trigger AI analysis
		},

		drillUp() {
			if (drilldownPath.length === 0) return;

			const newPath = drilldownPath.slice(0, -1);
			const parentKey = newPath.length > 0 ? newPath[newPath.length - 1].nodeId : '__root__';

			const cached = cache.get(parentKey);
			if (cached) {
				currentLevel = cached;
			}

			drilldownPath = newPath;
		},

		goToLevel(index: number) {
			if (index < 0) {
				// Go to root
				const cached = cache.get('__root__');
				if (cached) {
					currentLevel = cached;
				}
				drilldownPath = [];
				return;
			}

			const newPath = drilldownPath.slice(0, index + 1);
			const targetKey = newPath[newPath.length - 1].nodeId;
			const cached = cache.get(targetKey);
			if (cached) {
				currentLevel = cached;
			}

			drilldownPath = newPath;
		},

		findSemanticNodeForFile(filePath: string): SemanticNode | null {
			if (!currentLevel) return null;
			return currentLevel.nodes.find((n) => n.filePaths.includes(filePath)) ?? null;
		},

		clear() {
			// Cancel all pending analysis requests
			for (const req of analysisRequests.values()) {
				req.abortController.abort();
			}
			currentLevel = null;
			drilldownPath = [];
			analysisRequests = new Map();
			analysisError = null;
			cache = new Map();
			selectedSemanticNode = null;
			panelDismissed = false;
			readOnlyMode = 'none';
			snapshotMeta = null;
			lastCompletion = null;
			tabStore.clear();
		}
	};
}

export const semanticStore = createSemanticStore();

// Dev-only: expose for console testing
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
	(window as any).__semanticStore = semanticStore;
}
