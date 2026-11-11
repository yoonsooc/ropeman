import { semanticStore } from '$lib/stores/semanticStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { i18nStore } from '$lib/stores/i18nStore.svelte';
import { authStore } from '$lib/stores/authStore.svelte';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { webgpuStore } from '$lib/stores/webgpuStore.svelte';
import { extractSkeleton, formatPayloadPreview } from './skeletonExtractor';
import { extractSubSkeleton } from './skeletonExtractor';
import { callAI } from './aiAdapter';
import {
	loadCachedResponse,
	saveCachedResponse,
	type SemanticRequest
} from './semanticCacheService';
import type {
	AssignmentCounts,
	SemanticLevel,
	SemanticNode,
	SemanticEdge
} from '$lib/types/semantic';
import type { SkeletonPayload } from '$lib/types/skeleton';

const SEMANTIC_COLORS = [
	'#89b4fa',
	'#a6e3a1',
	'#f9e2af',
	'#f38ba8',
	'#cba6f7',
	'#94e2d5',
	'#fab387',
	'#74c7ec'
];

const UNCLASSIFIED_COLOR = '#9399b2';

// Markdown entries carry an outline instead of code symbols (markdownOutline.ts)
const MARKDOWN_RULE = `- Files with language "markdown" list frontmatter (name, description) and headings instead of code symbols; their imports are links to other files. In agent skill or instruction repositories, treat a SKILL.md with its references and scripts as one unit, and use headings as keySymbols`;

const TOP_LEVEL_SYSTEM_PROMPT = `You are a code architecture analyzer. Given a project skeleton, identify the high-level semantic roles/domains in the codebase.

Return ONLY valid JSON with this format:
{
  "roles": [
    {
      "id": "unique-slug",
      "label": "Human-Readable Name",
      "description": "1-2 sentence description of this domain's responsibility",
      "filePaths": ["path/to/file1.ts", "path/to/file2.ts"],
      "keySymbols": ["functionName", "ClassName"]
    }
  ],
  "edges": [
    {
      "source": "role-id-1",
      "target": "role-id-2",
      "label": "short relationship description",
      "type": "depends_on"
    }
  ]
}

Rules:
- Create 3-7 roles based on semantic meaning (not file structure)
- Role names should describe purpose (e.g., "Authentication System", "Data Layer", "UI Components")
- filePaths should use the exact paths from the skeleton
- keySymbols should list 2-5 most important functions/classes
- Edge types: depends_on, calls, extends, uses
- Every file should belong to exactly one role
- Focus on architecture, not implementation details
${MARKDOWN_RULE}`;

const DRILLDOWN_SYSTEM_PROMPT = `You are a code architecture analyzer. Given a subset of files belonging to a specific domain, identify the internal sub-roles within this domain.

Return ONLY valid JSON with this format:
{
  "roles": [
    {
      "id": "unique-slug",
      "label": "Human-Readable Name",
      "description": "1-2 sentence description",
      "filePaths": ["path/to/file1.ts"],
      "keySymbols": ["functionName", "ClassName"]
    }
  ],
  "edges": [
    {
      "source": "role-id-1",
      "target": "role-id-2",
      "label": "relationship",
      "type": "depends_on"
    }
  ]
}

Rules:
- Create 2-5 sub-roles within this domain
- Be more granular than top-level analysis
- Focus on internal structure and responsibilities
- Every provided file should belong to exactly one sub-role
- Edge types: depends_on, calls, extends, uses
${MARKDOWN_RULE}`;

function getLocaleInstruction(): string {
	const lang = i18nStore.locale;
	const langName = lang === 'ko' ? 'Korean' : 'English';
	return `\n\nIMPORTANT: All labels and descriptions in your response MUST be written in ${langName}.`;
}

function activeModelId(): string {
	const track = authStore.activeTrack;
	switch (track) {
		case 'byok':
			return `byok:${settingsStore.aiProvider}:${settingsStore.aiModel}`;
		case 'webgpu':
			return `webgpu:${webgpuStore.selectedModelId}`;
		case 'bridge':
			return `bridge:${settingsStore.bridgeCli}`;
		case 'edge':
		case 'none':
			return track;
	}
}

// generatedAt is a wall-clock stamp. Sent as is, it makes every request unique and the cache never hits.
function payloadAsSent(skeleton: SkeletonPayload): string {
	return formatPayloadPreview({ ...skeleton, generatedAt: '' });
}

/** A request plus the files its answer must assign, which the cache key leaves out. */
interface LevelRequest extends SemanticRequest {
	inputPaths: readonly string[];
}

function topLevelRequest(): LevelRequest | null {
	const skeleton = extractSkeleton(
		projectStore.projectName,
		projectStore.fileTree,
		projectStore.astMap
	);
	if (skeleton.files.length === 0) return null;
	return {
		model: activeModelId(),
		system: TOP_LEVEL_SYSTEM_PROMPT + getLocaleInstruction(),
		user: `Analyze the semantic architecture of this project:\n\n${payloadAsSent(skeleton)}`,
		inputPaths: skeleton.files.map((f) => f.path)
	};
}

function drilldownRequest(parentNode: SemanticNode): LevelRequest | null {
	const subSkeleton = extractSubSkeleton(
		parentNode.filePaths,
		projectStore.fileTree,
		projectStore.astMap
	);
	if (subSkeleton.files.length === 0) return null;
	return {
		model: activeModelId(),
		system: DRILLDOWN_SYSTEM_PROMPT + getLocaleInstruction(),
		user: `Analyze the internal structure of the "${parentNode.label}" domain:\n\n${payloadAsSent(subSkeleton)}`,
		inputPaths: parentNode.filePaths
	};
}

function isSameRequest(a: SemanticRequest, b: SemanticRequest | null): boolean {
	return b !== null && a.model === b.model && a.system === b.system && a.user === b.user;
}

async function loadCachedLevel(
	request: LevelRequest,
	parentId: string | null,
	depth: number
): Promise<SemanticLevel | null> {
	const text = await loadCachedResponse(request);
	if (text === null) return null;
	try {
		return parseSemanticLevel(text, parentId, depth, request.inputPaths);
	} catch {
		return null;
	}
}

/**
 * Loads the cached root level for `request` and every cached drill-down below it, keyed
 * like the store's level cache. Each drill-down is looked up by the request it would
 * send now, so only answers to the same input come back.
 */
async function loadCachedTree(request: LevelRequest): Promise<Map<string, SemanticLevel> | null> {
	const root = await loadCachedLevel(request, null, 0);
	if (!root) return null;

	const restored = new Map<string, SemanticLevel>([['__root__', root]]);
	const pending = [...root.nodes];
	for (let node = pending.shift(); node; node = pending.shift()) {
		if (restored.has(node.id)) continue;
		const childRequest = drilldownRequest(node);
		const child = childRequest && (await loadCachedLevel(childRequest, node.id, node.depth + 1));
		if (!child) continue;
		restored.set(node.id, child);
		pending.push(...child.nodes);
	}

	return restored;
}

/**
 * Restores the persisted analysis of the loaded project. The model is read before the
 * first await, so a calling effect reruns once an AI track becomes active.
 */
export async function restoreCachedAnalysis(): Promise<void> {
	if (!settingsStore.cacheEnabled) return;
	const request = topLevelRequest();
	if (!request) return;
	const tree = await loadCachedTree(request);
	// Another project, track or locale may have taken over while the cache was read
	if (!tree || !isSameRequest(request, topLevelRequest())) return;
	// Keep what the user already has open or analyzed in this session
	for (const [key, level] of tree) {
		if (!semanticStore.hasCachedLevel(key)) semanticStore.setCachedLevel(key, level);
	}
	semanticStore.currentLevel ??= tree.get('__root__')!;
}

function waitForParsing(timeoutMs = 60000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			if (!projectStore.isLoading && projectStore.astMap.size > 0) {
				resolve();
			} else if (!projectStore.isLoading && !projectStore.fileTree) {
				reject(new Error('No project loaded'));
			} else if (Date.now() - start > timeoutMs) {
				// Resolve anyway so caller can check astMap and give a better error
				resolve();
			} else {
				setTimeout(check, 200);
			}
		};
		check();
	});
}

/** `force` skips the cached answer, for when the user explicitly asks to analyze again. */
export async function analyzeTopLevel({ force = false }: { force?: boolean } = {}): Promise<void> {
	if (semanticStore.isAnalyzing) return;

	const nodeId = '__top_level__';
	const nodeLabel = 'Top Level';
	const abortController = semanticStore.addAnalysisRequest(nodeId, nodeLabel);
	semanticStore.analysisError = null;
	requestNotificationPermission();

	try {
		// Always wait for parsing to produce results
		if (projectStore.isLoading || projectStore.astMap.size === 0) {
			semanticStore.updateAnalysisProgress(nodeId, i18nStore.getProgressMessage('waitingParse'));
			await waitForParsing();
		}

		throwIfAborted(abortController);

		semanticStore.updateAnalysisProgress(
			nodeId,
			i18nStore.getProgressMessage('extractingSkeleton')
		);
		const request = topLevelRequest();
		if (!request) {
			throw new Error(
				'No files to analyze — AST parsing may have failed. Check browser console for details.'
			);
		}

		// The track is often chosen only now (Edge is not remembered across reloads), so the
		// load-time restore could not match yet. Reuse the answer to this exact request.
		const tree = settingsStore.cacheEnabled && !force ? await loadCachedTree(request) : null;
		throwIfAborted(abortController);
		for (const [key, cached] of tree ?? []) semanticStore.setCachedLevel(key, cached);
		let level = tree?.get('__root__');
		if (!level) {
			semanticStore.updateAnalysisProgress(nodeId, i18nStore.getProgressMessage('requestingAI'));
			const responseText = await callAI({
				system: request.system,
				user: request.user,
				signal: abortController.signal
			});

			throwIfAborted(abortController);
			semanticStore.updateAnalysisProgress(
				nodeId,
				i18nStore.getProgressMessage('generatingDiagram')
			);
			level = parseSemanticLevel(responseText, null, 0, request.inputPaths);
			semanticStore.setCachedLevel('__root__', level);
			if (settingsStore.cacheEnabled) void saveCachedResponse(request, responseText);
		}

		semanticStore.currentLevel = level;
		semanticStore.drilldownPath = [];
		semanticStore.viewMode = 'semantic';
		semanticStore.lastCompletion = { type: 'success', nodeLabel, at: Date.now() };
	} catch (error) {
		if (isAbortError(error)) return;
		console.error('Semantic analysis failed:', error);
		const message = error instanceof Error ? error.message : String(error);
		semanticStore.analysisError = message;
		semanticStore.lastCompletion = { type: 'error', nodeLabel, message, at: Date.now() };
	} finally {
		semanticStore.removeAnalysisRequest(nodeId);
	}
}

export async function analyzeDrilldown(parentNode: SemanticNode): Promise<void> {
	// Allow concurrent requests for different nodes; block duplicate for same node
	if (semanticStore.isNodeAnalyzing(parentNode.id)) return;

	const abortController = semanticStore.addAnalysisRequest(parentNode.id, parentNode.label);
	semanticStore.analysisError = null;
	requestNotificationPermission();

	// Snapshot current drilldownPath to detect stale results
	const pathSnapshot = [...semanticStore.drilldownPath];

	try {
		semanticStore.updateAnalysisProgress(
			parentNode.id,
			i18nStore.getProgressMessage('extractingSkeleton')
		);
		const request = drilldownRequest(parentNode);
		if (!request) {
			throw new Error('No files in this domain');
		}

		throwIfAborted(abortController);
		semanticStore.updateAnalysisProgress(
			parentNode.id,
			i18nStore.getProgressMessage('requestingAI')
		);
		const responseText = await callAI({
			system: request.system,
			user: request.user,
			signal: abortController.signal
		});

		throwIfAborted(abortController);
		semanticStore.updateAnalysisProgress(
			parentNode.id,
			i18nStore.getProgressMessage('generatingDiagram')
		);
		const level = parseSemanticLevel(
			responseText,
			parentNode.id,
			parentNode.depth + 1,
			parentNode.filePaths
		);

		// Always cache the result
		semanticStore.setCachedLevel(parentNode.id, level);
		if (settingsStore.cacheEnabled) void saveCachedResponse(request, responseText);

		// Stale check: only apply to diagram if user hasn't navigated away
		const currentPath = semanticStore.drilldownPath;
		const isStale =
			pathSnapshot.length !== currentPath.length ||
			pathSnapshot.some((p, i) => p.nodeId !== currentPath[i]?.nodeId);

		if (!isStale) {
			semanticStore.currentLevel = level;
		}
		semanticStore.lastCompletion = {
			type: 'success',
			nodeLabel: parentNode.label,
			at: Date.now()
		};
	} catch (error) {
		if (isAbortError(error)) return;
		console.error('Drilldown analysis failed:', error);
		const message = error instanceof Error ? error.message : String(error);
		semanticStore.analysisError = message;
		semanticStore.lastCompletion = {
			type: 'error',
			nodeLabel: parentNode.label,
			message,
			at: Date.now()
		};
	} finally {
		semanticStore.removeAnalysisRequest(parentNode.id);
	}
}

function requestNotificationPermission() {
	if (typeof Notification === 'undefined') return;
	if (Notification.permission === 'default') {
		Notification.requestPermission().catch(() => {});
	}
}

function throwIfAborted(controller: AbortController) {
	if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

export function repairJSON(text: string): string {
	// Escape control characters only inside JSON string values
	let fixed = escapeControlCharsInStrings(text);

	// Remove trailing commas before ] or }
	fixed = fixed.replace(/,\s*([\]}])/g, '$1');

	// Try parsing as-is first
	try {
		JSON.parse(fixed);
		return fixed;
	} catch {
		// Continue with repair
	}

	// Progressive truncation: try cutting back to each previous complete role object
	// Find all positions where a role object ends: '},\n    {' or similar
	const cutPoints: number[] = [];
	// Match '},' that likely ends a role object in the roles array
	const roleBoundary = /\}\s*,\s*\{/g;
	let m;
	while ((m = roleBoundary.exec(fixed)) !== null) {
		cutPoints.push(m.index + 1); // position after '}'
	}

	// Also try the last '},' as a cut point
	let lastObjEnd = fixed.lastIndexOf('},');
	while (lastObjEnd > 0) {
		if (!cutPoints.includes(lastObjEnd + 1)) {
			cutPoints.push(lastObjEnd + 1);
		}
		lastObjEnd = fixed.lastIndexOf('},', lastObjEnd - 1);
		if (cutPoints.length > 20) break; // limit search
	}

	// Sort cut points descending (try longest valid prefix first)
	cutPoints.sort((a, b) => b - a);

	// Try closeBrackets on the full text first
	const repaired = closeBrackets(fixed);
	try {
		JSON.parse(repaired);
		return repaired;
	} catch {
		// fall through to progressive cuts
	}

	// Try each cut point
	for (const pos of cutPoints) {
		const candidate = closeBrackets(fixed.substring(0, pos));
		try {
			JSON.parse(candidate);
			return candidate;
		} catch {
			continue;
		}
	}

	// Return best effort
	return repaired;
}

/** Escape unescaped control characters only inside JSON string values */
export function escapeControlCharsInStrings(text: string): string {
	let result = '';
	let inString = false;
	let escape = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (escape) {
			escape = false;
			result += ch;
			continue;
		}
		if (ch === '\\' && inString) {
			escape = true;
			result += ch;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			result += ch;
			continue;
		}
		if (inString) {
			const code = ch.charCodeAt(0);
			if (code < 0x20) {
				// Escape control characters inside strings
				if (ch === '\n') {
					result += '\\n';
					continue;
				}
				if (ch === '\r') {
					result += '\\r';
					continue;
				}
				if (ch === '\t') {
					result += '\\t';
					continue;
				}
				// Skip other control chars
				continue;
			}
		}
		result += ch;
	}

	return result;
}

export function closeBrackets(text: string): string {
	let fixed = text;

	// Track open bracket/brace stack to close in correct order
	const stack: string[] = [];
	let inString = false;
	let escape = false;

	for (const ch of fixed) {
		if (escape) {
			escape = false;
			continue;
		}
		if (ch === '\\' && inString) {
			escape = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === '{') stack.push('}');
		else if (ch === '[') stack.push(']');
		else if (ch === '}' || ch === ']') stack.pop();
	}

	// If we're inside a string, close it
	if (inString) fixed += '"';

	// Remove trailing partial value — trim back to last structural char
	if (stack.length > 0) {
		const lastValid = Math.max(
			fixed.lastIndexOf(','),
			fixed.lastIndexOf('}'),
			fixed.lastIndexOf(']'),
			fixed.lastIndexOf('"')
		);
		if (lastValid > 0) {
			fixed = fixed.substring(0, lastValid + 1);
			fixed = fixed.replace(/,\s*$/, '');

			// Rebuild stack from trimmed text
			stack.length = 0;
			inString = false;
			escape = false;
			for (const ch of fixed) {
				if (escape) {
					escape = false;
					continue;
				}
				if (ch === '\\' && inString) {
					escape = true;
					continue;
				}
				if (ch === '"') {
					inString = !inString;
					continue;
				}
				if (inString) continue;
				if (ch === '{') stack.push('}');
				else if (ch === '[') stack.push(']');
				else if (ch === '}' || ch === ']') stack.pop();
			}
		}
	}

	// Close in reverse order (correct nesting)
	while (stack.length > 0) {
		fixed += stack.pop();
	}

	return fixed;
}

export function parseSemanticLevel(
	text: string,
	parentId: string | null,
	depth: number,
	inputPaths: readonly string[]
): SemanticLevel {
	// Extract JSON from response (may be wrapped in markdown code block)
	// First try complete JSON object, then fall back to truncated (opening { without closing })
	let jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		// Truncated response: find the first { and take everything after it
		const firstBrace = text.indexOf('{');
		if (firstBrace === -1) throw new Error('No JSON found in response');
		jsonMatch = [text.substring(firstBrace)];
	}

	const repaired = repairJSON(jsonMatch[0]);
	let raw: {
		roles: Array<{
			id: string;
			label: string;
			description: string;
			filePaths: string[];
			keySymbols: string[];
		}>;
		edges?: Array<{
			source: string;
			target: string;
			label?: string;
			type: string;
		}>;
	};

	try {
		raw = JSON.parse(repaired);
	} catch (e) {
		console.error(
			'[parseSemanticLevel] JSON parse failed after repair. First 500 chars:',
			repaired.substring(0, 500)
		);
		throw e;
	}

	// Accept alternative key names from AI response
	const roles =
		raw.roles ||
		(raw as any).nodes ||
		(raw as any).groups ||
		(raw as any).components ||
		(raw as any).modules;

	if (!roles || !Array.isArray(roles)) {
		console.error('[parseSemanticLevel] Missing roles. Keys found:', Object.keys(raw));
		throw new Error(
			`Invalid response format: missing roles (found keys: ${Object.keys(raw).join(', ')})`
		);
	}

	raw.roles = roles;

	const { assigned, leftOut, counts } = assignFiles(
		raw.roles.map((role) => role.filePaths),
		inputPaths
	);

	// A role with no files left has nothing to show or drill into, so it leaves the diagram
	const kept = raw.roles.flatMap((role, i) =>
		assigned[i].length > 0 ? [{ role, files: assigned[i] }] : []
	);
	const roleIds = new Set(kept.map(({ role }) => role.id));

	const nodes: SemanticNode[] = kept.map(({ role, files }, i) => ({
		id: `sem:${role.id}`,
		label: role.label,
		description: role.description || '',
		color: SEMANTIC_COLORS[i % SEMANTIC_COLORS.length],
		filePaths: files,
		keySymbols: role.keySymbols || [],
		parentId,
		depth,
		fileCount: files.length
	}));

	if (leftOut.length > 0) {
		nodes.push({
			id: `sem:unclassified:${parentId ?? 'root'}`,
			label: i18nStore.t('node.unclassified'),
			description: i18nStore.t('node.unclassifiedDesc'),
			color: UNCLASSIFIED_COLOR,
			filePaths: leftOut,
			keySymbols: [],
			parentId,
			depth,
			fileCount: leftOut.length
		});
	}

	const edges: SemanticEdge[] = (raw.edges || [])
		.filter((e) => roleIds.has(e.source) && roleIds.has(e.target))
		.map((e, i) => ({
			id: `sem-edge:${i}:${e.source}->${e.target}`,
			source: `sem:${e.source}`,
			target: `sem:${e.target}`,
			label: e.label,
			type: validateEdgeType(e.type)
		}));

	const parentLabel = parentId ? (nodes[0]?.label ?? 'Unknown') : 'Project';

	return {
		parentId,
		nodes,
		edges,
		breadcrumbLabel: parentLabel,
		assignment: { ...counts, emptied: raw.roles.length - kept.length }
	};
}

/**
 * Give each input file exactly one owner. The first role that lists a file keeps it,
 * listed paths that match no input file are dropped, and unlisted files come back as `leftOut`.
 */
function assignFiles(
	listedPerRole: readonly unknown[],
	inputPaths: readonly string[]
): {
	assigned: string[][];
	leftOut: string[];
	counts: Omit<AssignmentCounts, 'emptied'>;
} {
	const resolve = createPathResolver(inputPaths);
	const owned = new Set<string>();
	let duplicated = 0;
	let invented = 0;

	const assigned = listedPerRole.map((listed) => {
		const files: string[] = [];
		for (const path of Array.isArray(listed) ? listed : []) {
			const file = typeof path === 'string' ? resolve(path) : undefined;
			if (file === undefined) invented++;
			else if (owned.has(file)) duplicated++;
			else {
				owned.add(file);
				files.push(file);
			}
		}
		return files;
	});

	const leftOut = [...new Set(inputPaths)].filter((path) => !owned.has(path));
	return { assigned, leftOut, counts: { leftOut: leftOut.length, duplicated, invented } };
}

/**
 * Map a path the model wrote back to the input path it means. Local folder paths share the
 * project folder name as a root ("ropeman/src/a.ts"), and models often drop it or add "./".
 */
function createPathResolver(inputPaths: readonly string[]): (path: string) => string | undefined {
	const byKey = new Map<string, string>(inputPaths.map((path) => [path, path]));
	const root = sharedRoot(inputPaths);
	if (root) {
		for (const path of inputPaths) {
			const withoutRoot = path.substring(root.length);
			if (!byKey.has(withoutRoot)) byKey.set(withoutRoot, path);
		}
	}
	return (path) => byKey.get(path) ?? byKey.get(path.replace(/^\.?\//, ''));
}

function sharedRoot(paths: readonly string[]): string | null {
	const slash = paths[0]?.indexOf('/') ?? -1;
	if (slash === -1) return null;
	const root = paths[0].substring(0, slash + 1);
	return paths.every((path) => path.startsWith(root)) ? root : null;
}

function validateEdgeType(type: string): SemanticEdge['type'] {
	const valid: SemanticEdge['type'][] = ['depends_on', 'calls', 'extends', 'uses'];
	return valid.includes(type as SemanticEdge['type']) ? (type as SemanticEdge['type']) : 'uses';
}
