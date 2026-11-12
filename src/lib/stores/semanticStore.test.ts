import { describe, it, expect, beforeEach } from 'vitest';
import { semanticStore } from './semanticStore.svelte';
import type { SemanticLevel, SemanticNode } from '$lib/types/semantic';

function makeSemanticNode(id: string, label: string, filePaths: string[] = []): SemanticNode {
	return {
		id,
		label,
		description: `${label} description`,
		filePaths,
		color: '#ff0000',
		keySymbols: [],
		parentId: null,
		depth: 0,
		fileCount: filePaths.length
	};
}

function makeSemanticLevel(nodes: SemanticNode[], parentId?: string): SemanticLevel {
	return {
		nodes,
		edges: [],
		parentId: parentId ?? null,
		breadcrumbLabel: 'Test Level'
	};
}

describe('semanticStore', () => {
	beforeEach(() => {
		semanticStore.clear();
	});

	describe('initial state', () => {
		it('currentLevel is null', () => {
			expect(semanticStore.currentLevel).toBeNull();
		});

		it('drilldownPath is empty array', () => {
			expect(semanticStore.drilldownPath).toEqual([]);
		});

		it('viewMode is code', () => {
			expect(semanticStore.viewMode).toBe('code');
		});

		it('isAnalyzing is false', () => {
			expect(semanticStore.isAnalyzing).toBe(false);
		});

		it('cache is empty Map', () => {
			expect(semanticStore.cache.size).toBe(0);
		});

		it('selectedSemanticNode is null', () => {
			expect(semanticStore.selectedSemanticNode).toBeNull();
		});
	});

	describe('setters', () => {
		it('sets currentLevel', () => {
			const level = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.currentLevel = level;
			expect(semanticStore.currentLevel).toEqual(level);
		});

		it('sets drilldownPath', () => {
			semanticStore.drilldownPath = [{ nodeId: 'n1', label: 'UI' }];
			expect(semanticStore.drilldownPath).toHaveLength(1);
		});

		it('sets viewMode', () => {
			semanticStore.viewMode = 'semantic';
			expect(semanticStore.viewMode).toBe('semantic');
		});

		it('isAnalyzing is derived from analysisRequests', () => {
			expect(semanticStore.isAnalyzing).toBe(false);
			const controller = semanticStore.addAnalysisRequest('test-node', 'Test');
			expect(semanticStore.isAnalyzing).toBe(true);
			semanticStore.removeAnalysisRequest('test-node');
			expect(semanticStore.isAnalyzing).toBe(false);
		});

		it('sets selectedSemanticNode', () => {
			const node = makeSemanticNode('n1', 'UI', ['src/ui.ts']);
			semanticStore.selectedSemanticNode = node;
			expect(semanticStore.selectedSemanticNode).toEqual(node);
		});
	});

	describe('highlightedFilePaths', () => {
		it('returns empty array when no node selected', () => {
			expect(semanticStore.highlightedFilePaths).toEqual([]);
		});

		it('returns file paths of selected semantic node', () => {
			semanticStore.selectedSemanticNode = makeSemanticNode('n1', 'UI', ['src/a.ts', 'src/b.ts']);
			expect(semanticStore.highlightedFilePaths).toEqual(['src/a.ts', 'src/b.ts']);
		});
	});

	describe('highlightedDirPaths', () => {
		it('returns empty array when no node selected', () => {
			expect(semanticStore.highlightedDirPaths).toEqual([]);
		});

		it('returns parent directory paths of selected node file paths', () => {
			semanticStore.selectedSemanticNode = makeSemanticNode('n1', 'UI', [
				'src/lib/components/Button.ts'
			]);
			const dirs = semanticStore.highlightedDirPaths;
			expect(dirs).toContain('src');
			expect(dirs).toContain('src/lib');
			expect(dirs).toContain('src/lib/components');
		});

		it('deduplicates shared parent directories', () => {
			semanticStore.selectedSemanticNode = makeSemanticNode('n1', 'UI', [
				'src/lib/a.ts',
				'src/lib/b.ts'
			]);
			const dirs = semanticStore.highlightedDirPaths;
			const srcLibCount = dirs.filter((d) => d === 'src/lib').length;
			expect(srcLibCount).toBe(1);
		});
	});

	describe('replaceLevels', () => {
		it('drops levels the new set does not hold, so a stale level cannot be drilled into', () => {
			// Arrange
			semanticStore.setCachedLevel('gone', makeSemanticLevel([], 'gone'));
			const fresh = makeSemanticLevel([makeSemanticNode('a', 'A')], 'kept');

			// Act
			semanticStore.replaceLevels(new Map([['kept', fresh]]));

			// Assert
			expect(semanticStore.hasCachedLevel('gone')).toBe(false);
			expect(semanticStore.getCachedLevel('kept')).toEqual(fresh);
		});
	});

	describe('setCachedLevel / getCachedLevel', () => {
		it('caches and retrieves a level', () => {
			const level = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.setCachedLevel('key1', level);
			expect(semanticStore.getCachedLevel('key1')).toEqual(level);
		});

		it('returns undefined for uncached key', () => {
			expect(semanticStore.getCachedLevel('nonexistent')).toBeUndefined();
		});
	});

	describe('hasCachedLevel', () => {
		it('returns true when level is cached', () => {
			const level = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.setCachedLevel('key1', level);
			expect(semanticStore.hasCachedLevel('key1')).toBe(true);
		});

		it('returns false when level is not cached', () => {
			expect(semanticStore.hasCachedLevel('nonexistent')).toBe(false);
		});
	});

	describe('invalidateCache', () => {
		it('removes a cached level', () => {
			const level = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.setCachedLevel('key1', level);
			expect(semanticStore.hasCachedLevel('key1')).toBe(true);

			semanticStore.invalidateCache('key1');
			expect(semanticStore.hasCachedLevel('key1')).toBe(false);
			expect(semanticStore.getCachedLevel('key1')).toBeUndefined();
		});

		it('does nothing when key does not exist', () => {
			semanticStore.invalidateCache('nonexistent');
			expect(semanticStore.cache.size).toBe(0);
		});

		it('does not affect other cached levels', () => {
			const level1 = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			const level2 = makeSemanticLevel([makeSemanticNode('n2', 'API')]);
			semanticStore.setCachedLevel('key1', level1);
			semanticStore.setCachedLevel('key2', level2);

			semanticStore.invalidateCache('key1');
			expect(semanticStore.hasCachedLevel('key1')).toBe(false);
			expect(semanticStore.hasCachedLevel('key2')).toBe(true);
		});
	});

	describe('drillDown', () => {
		it('adds node to drilldownPath', () => {
			const node = makeSemanticNode('n1', 'UI');
			semanticStore.drillDown(node);
			expect(semanticStore.drilldownPath).toHaveLength(1);
			expect(semanticStore.drilldownPath[0]).toEqual({ nodeId: 'n1', label: 'UI' });
		});

		it('returns false when no cached level exists (AI call needed)', () => {
			const node = makeSemanticNode('n1', 'UI');
			const result = semanticStore.drillDown(node);
			expect(result).toBe(false);
		});

		it('returns true and sets level when cached', () => {
			const node = makeSemanticNode('n1', 'UI');
			const level = makeSemanticLevel([makeSemanticNode('child1', 'Button')], 'n1');
			semanticStore.setCachedLevel('n1', level);

			const result = semanticStore.drillDown(node);
			expect(result).toBe(true);
			expect(semanticStore.currentLevel).toEqual(level);
		});

		it('caches current level before drilling down', () => {
			const rootLevel = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.currentLevel = rootLevel;

			const node = makeSemanticNode('n1', 'UI');
			semanticStore.drillDown(node);

			expect(semanticStore.getCachedLevel('__root__')).toEqual(rootLevel);
		});
	});

	describe('drillUp', () => {
		it('does nothing when at root', () => {
			semanticStore.drillUp();
			expect(semanticStore.drilldownPath).toEqual([]);
		});

		it('removes last entry from drilldownPath', () => {
			semanticStore.drilldownPath = [
				{ nodeId: 'n1', label: 'A' },
				{ nodeId: 'n2', label: 'B' }
			];

			semanticStore.drillUp();
			expect(semanticStore.drilldownPath).toHaveLength(1);
			expect(semanticStore.drilldownPath[0].nodeId).toBe('n1');
		});

		it('restores cached level when drilling up', () => {
			const parentLevel = makeSemanticLevel([makeSemanticNode('p1', 'Parent')], 'n1');
			semanticStore.setCachedLevel('n1', parentLevel);
			semanticStore.drilldownPath = [
				{ nodeId: 'n1', label: 'A' },
				{ nodeId: 'n2', label: 'B' }
			];

			semanticStore.drillUp();
			expect(semanticStore.currentLevel).toEqual(parentLevel);
		});

		it('restores root level when drilling up to root', () => {
			const rootLevel = makeSemanticLevel([makeSemanticNode('r1', 'Root')]);
			semanticStore.setCachedLevel('__root__', rootLevel);
			semanticStore.drilldownPath = [{ nodeId: 'n1', label: 'A' }];

			semanticStore.drillUp();
			expect(semanticStore.currentLevel).toEqual(rootLevel);
			expect(semanticStore.drilldownPath).toEqual([]);
		});
	});

	describe('goToLevel', () => {
		it('goes to root when index is negative', () => {
			const rootLevel = makeSemanticLevel([makeSemanticNode('r1', 'Root')]);
			semanticStore.setCachedLevel('__root__', rootLevel);
			semanticStore.drilldownPath = [
				{ nodeId: 'n1', label: 'A' },
				{ nodeId: 'n2', label: 'B' }
			];

			semanticStore.goToLevel(-1);
			expect(semanticStore.drilldownPath).toEqual([]);
			expect(semanticStore.currentLevel).toEqual(rootLevel);
		});

		it('goes to specific level index', () => {
			const levelA = makeSemanticLevel([makeSemanticNode('a1', 'A child')], 'n1');
			semanticStore.setCachedLevel('n1', levelA);
			semanticStore.drilldownPath = [
				{ nodeId: 'n1', label: 'A' },
				{ nodeId: 'n2', label: 'B' },
				{ nodeId: 'n3', label: 'C' }
			];

			semanticStore.goToLevel(0);
			expect(semanticStore.drilldownPath).toHaveLength(1);
			expect(semanticStore.drilldownPath[0].nodeId).toBe('n1');
			expect(semanticStore.currentLevel).toEqual(levelA);
		});
	});

	describe('findSemanticNodeForFile', () => {
		it('returns null when no currentLevel', () => {
			expect(semanticStore.findSemanticNodeForFile('any.ts')).toBeNull();
		});

		it('finds node containing the file path', () => {
			const node = makeSemanticNode('n1', 'UI', ['src/Button.ts', 'src/Input.ts']);
			semanticStore.currentLevel = makeSemanticLevel([node]);

			const found = semanticStore.findSemanticNodeForFile('src/Button.ts');
			expect(found).toEqual(node);
		});

		it('returns null when file not found in any node', () => {
			const node = makeSemanticNode('n1', 'UI', ['src/Button.ts']);
			semanticStore.currentLevel = makeSemanticLevel([node]);

			expect(semanticStore.findSemanticNodeForFile('src/Other.ts')).toBeNull();
		});
	});

	describe('clear', () => {
		it('resets all state to initial values', () => {
			semanticStore.currentLevel = makeSemanticLevel([makeSemanticNode('n1', 'UI')]);
			semanticStore.drilldownPath = [{ nodeId: 'n1', label: 'A' }];
			semanticStore.viewMode = 'semantic';
			semanticStore.isAnalyzing = true;
			semanticStore.setCachedLevel('key', makeSemanticLevel([]));
			semanticStore.selectedSemanticNode = makeSemanticNode('n1', 'UI');
			semanticStore.readOnlyMode = 'snapshot';
			semanticStore.snapshotMeta = { owner: 'facebook', repo: 'react' };

			semanticStore.clear();

			expect(semanticStore.currentLevel).toBeNull();
			expect(semanticStore.drilldownPath).toEqual([]);
			expect(semanticStore.viewMode).toBe('code');
			expect(semanticStore.isAnalyzing).toBe(false);
			expect(semanticStore.cache.size).toBe(0);
			expect(semanticStore.selectedSemanticNode).toBeNull();
			expect(semanticStore.readOnlyMode).toBe('none');
			expect(semanticStore.snapshotMeta).toBeNull();
		});
	});

	describe('readOnlyMode', () => {
		it("defaults to 'none'", () => {
			semanticStore.clear();
			expect(semanticStore.readOnlyMode).toBe('none');
		});

		it("can be set to 'snapshot' for share/explore viewers", () => {
			semanticStore.readOnlyMode = 'snapshot';
			expect(semanticStore.readOnlyMode).toBe('snapshot');
		});

		it('holds snapshotMeta alongside readOnlyMode', () => {
			semanticStore.snapshotMeta = {
				owner: 'facebook',
				repo: 'react',
				title: 'React'
			};
			expect(semanticStore.snapshotMeta?.owner).toBe('facebook');
			expect(semanticStore.snapshotMeta?.repo).toBe('react');
			expect(semanticStore.snapshotMeta?.title).toBe('React');
		});

		it('snapshotMeta defaults to null', () => {
			semanticStore.clear();
			expect(semanticStore.snapshotMeta).toBeNull();
		});
	});
});
