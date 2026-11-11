import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';

// In-memory CacheStorage: named caches holding URL -> body
const storage = new Map<string, Map<string, string>>();
vi.stubGlobal('caches', {
	open: async (name: string) => {
		if (!storage.has(name)) storage.set(name, new Map());
		const entries = storage.get(name)!;
		return {
			put: async (req: Request, resp: Response) => {
				entries.set(req.url, await resp.text());
			},
			match: async (req: Request) => {
				const body = entries.get(req.url);
				return body === undefined ? undefined : new Response(body);
			},
			keys: async () => [...entries.keys()].map((url) => new Request(url))
		};
	},
	delete: async (name: string) => storage.delete(name)
});
vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn() });

const callAI = vi.fn<(opts: { system: string; user: string }) => Promise<string>>();
vi.mock('./aiAdapter', () => ({
	callAI: (opts: { system: string; user: string }) => callAI(opts)
}));

const { analyzeTopLevel, analyzeDrilldown, restoreCachedAnalysis } =
	await import('./semanticAnalysisService');
const { clearSemanticCache, getSemanticCacheSize } = await import('./semanticCacheService');
const { semanticStore } = await import('$lib/stores/semanticStore.svelte');
const { projectStore } = await import('$lib/stores/projectStore.svelte');
const { settingsStore } = await import('$lib/stores/settingsStore.svelte');
const { authStore } = await import('$lib/stores/authStore.svelte');

function role(id: string, label: string, filePaths: string[]) {
	return { id, label, description: `${label} role`, filePaths, keySymbols: [] };
}

const ROOT_RESPONSE = JSON.stringify({
	roles: [role('core', 'Core', ['src/a.ts', 'src/b.ts'])],
	edges: []
});
const DRILL_RESPONSE = JSON.stringify({
	roles: [role('core-a', 'Core A', ['src/a.ts']), role('core-b', 'Core B', ['src/b.ts'])],
	edges: []
});

function loadProject(name: string, paths: string[]) {
	const fileTree: FileNode = {
		name,
		path: name,
		kind: 'directory',
		children: paths.map((p) => ({ name: p.split('/').pop()!, path: p, kind: 'file' }))
	};
	const astMap = new Map<string, ASTSymbol[]>(
		paths.map((p) => [p, [{ name: `fn_${p}`, kind: 'function', lineStart: 1, lineEnd: 2 }]])
	);
	projectStore.projectName = name;
	projectStore.fileTree = fileTree;
	projectStore.astMap = astMap;
	projectStore.isLoading = false;
}

/** Analyzes root and the Core drill-down, then forgets the in-memory state like a page reload. */
async function analyzeAndReload() {
	callAI.mockResolvedValueOnce(ROOT_RESPONSE).mockResolvedValueOnce(DRILL_RESPONSE);
	await analyzeTopLevel();
	await analyzeDrilldown(semanticStore.currentLevel!.nodes[0]);
	await vi.waitFor(async () => expect(await getSemanticCacheSize()).toBe(2));
	semanticStore.clear();
	callAI.mockClear();
}

describe('semantic analysis cache', () => {
	beforeEach(async () => {
		await clearSemanticCache();
		semanticStore.clear();
		callAI.mockReset();
		settingsStore.cacheEnabled = true;
		settingsStore.aiProvider = 'google';
		settingsStore.aiModel = 'gemini-flash-lite-latest';
		settingsStore.geminiApiKey = 'test-key';
		authStore.edgeEnabled = false;
		loadProject('paseo', ['src/a.ts', 'src/b.ts']);
	});

	it('restores root and drill-down levels for the same input without calling AI', async () => {
		await analyzeAndReload();

		await restoreCachedAnalysis();

		expect(callAI).not.toHaveBeenCalled();
		expect(semanticStore.currentLevel?.nodes.map((n) => n.label)).toContain('Core');
		expect(semanticStore.getCachedLevel('sem:core')?.nodes.map((n) => n.label)).toEqual(
			expect.arrayContaining(['Core A', 'Core B'])
		);
	});

	it('restores the same file assignment the fresh analysis showed', async () => {
		callAI.mockResolvedValueOnce(
			JSON.stringify({
				roles: [role('core', 'Core', ['src/a.ts']), role('ghost', 'Ghost', ['src/missing.ts'])],
				edges: []
			})
		);
		await analyzeTopLevel();
		const fresh = semanticStore.currentLevel;
		await vi.waitFor(async () => expect(await getSemanticCacheSize()).toBe(1));
		semanticStore.clear();

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toEqual(fresh);
		expect(semanticStore.currentLevel?.nodes.map((n) => n.filePaths)).toEqual([
			['src/a.ts'],
			['src/b.ts']
		]);
	});

	// Regression: the PASEO demo showed another folder's 3-file diagram because both were named "paseo"
	it('does not restore another skeleton analyzed under the same project name', async () => {
		await analyzeAndReload();
		loadProject('paseo', ['docs/one.md', 'docs/two.md', 'docs/three.md', 'src/main.py']);

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toBeNull();
		expect(semanticStore.cache.size).toBe(0);
	});

	it('misses when the model changes', async () => {
		await analyzeAndReload();
		settingsStore.aiModel = 'gemini-2.5-pro';

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toBeNull();
	});

	it('misses when the track changes', async () => {
		await analyzeAndReload();
		authStore.edgeEnabled = true;

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toBeNull();
	});

	it('sends a payload without the generation timestamp', async () => {
		callAI.mockResolvedValueOnce(ROOT_RESPONSE);

		await analyzeTopLevel();

		expect(callAI.mock.calls[0][0].user).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
	});

	it('ignores a legacy entry keyed by project name', async () => {
		storage.set(
			'ropeman/semantic',
			new Map([['https://ropeman.local/semantic/paseo/__root__', JSON.stringify({ nodes: [] })]])
		);

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toBeNull();
	});

	it('neither saves nor restores when the cache setting is off', async () => {
		settingsStore.cacheEnabled = false;
		callAI.mockResolvedValueOnce(ROOT_RESPONSE);
		await analyzeTopLevel();
		semanticStore.clear();

		await restoreCachedAnalysis();

		expect(await getSemanticCacheSize()).toBe(0);
		expect(semanticStore.currentLevel).toBeNull();
	});

	// Edge is not remembered across reloads, so the load-time restore misses until a track is picked
	it('reuses the cached answer when analysis starts after a reload', async () => {
		await analyzeAndReload();

		await analyzeTopLevel();

		expect(callAI).not.toHaveBeenCalled();
		expect(semanticStore.currentLevel?.nodes.map((n) => n.label)).toContain('Core');
		expect(semanticStore.hasCachedLevel('sem:core')).toBe(true);
	});

	it('calls AI and replaces the cached answer when the top level is forced', async () => {
		await analyzeAndReload();
		const NEW_ROOT = JSON.stringify({
			roles: [role('fresh', 'Fresh', ['src/a.ts', 'src/b.ts'])],
			edges: []
		});
		callAI.mockResolvedValueOnce(NEW_ROOT);

		await analyzeTopLevel({ force: true });

		expect(callAI).toHaveBeenCalledTimes(1);
		expect(semanticStore.currentLevel?.nodes.map((n) => n.label)).toEqual(['Fresh']);
		await vi.waitFor(() =>
			expect([...storage.get('ropeman/semantic-v2')!.values()]).toContain(NEW_ROOT)
		);
		semanticStore.clear();
		await restoreCachedAnalysis();
		expect(semanticStore.currentLevel?.nodes.map((n) => n.label)).toEqual(['Fresh']);
	});

	// Regression: opening project B while A's cache was still being read put A's levels into B
	it('drops a restore that finishes after another project opened', async () => {
		await analyzeAndReload();

		const restoring = restoreCachedAnalysis();
		semanticStore.clear();
		loadProject('other', ['lib/x.ts', 'lib/y.ts']);
		await restoring;

		expect(semanticStore.currentLevel).toBeNull();
		expect(semanticStore.cache.size).toBe(0);
	});

	it('writes nothing when the project is closed while analysis reads the cache', async () => {
		await analyzeAndReload();

		const analyzing = analyzeTopLevel();
		semanticStore.clear();
		await analyzing;

		expect(semanticStore.currentLevel).toBeNull();
		expect(semanticStore.cache.size).toBe(0);
		expect(callAI).not.toHaveBeenCalled();
	});

	it('calls AI again when a drill-down is re-analyzed', async () => {
		await analyzeAndReload();
		await restoreCachedAnalysis();
		const core = semanticStore.currentLevel!.nodes[0];
		semanticStore.invalidateCache(core.id);
		callAI.mockResolvedValueOnce(DRILL_RESPONSE);

		await analyzeDrilldown(core);

		expect(callAI).toHaveBeenCalledTimes(1);
	});

	it('does not pull the user back to the root when restore runs again', async () => {
		await analyzeAndReload();
		await restoreCachedAnalysis();
		semanticStore.drillDown(semanticStore.currentLevel!.nodes[0]);
		const open = semanticStore.currentLevel;

		await restoreCachedAnalysis();

		expect(semanticStore.currentLevel).toBe(open);
		expect(open?.parentId).toBe('sem:core');
	});
});
