import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$lib/services/parserService', () => ({
	parseFile: vi.fn(async (path: string) => {
		if (path.includes('broken')) throw new Error('Parse failed');
		return {
			symbols: [{ name: 'main', kind: 'function', lineStart: 1, lineEnd: 1 }],
			refs: [{ kind: 'calls', line: 1, written: 'print' }]
		};
	})
}));

import { loadTestProject } from './testLoader';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { codeMapStore } from '$lib/stores/codeMapStore.svelte';

const scanTree = {
	name: 'demo',
	path: 'demo',
	kind: 'directory',
	children: [
		{
			name: 'ok.py',
			path: 'demo/ok.py',
			kind: 'file',
			language: 'python',
			_absolutePath: '/d/ok.py'
		},
		{
			name: 'broken.py',
			path: 'demo/broken.py',
			kind: 'file',
			language: 'python',
			_absolutePath: '/d/broken.py'
		},
		{
			name: 'big.py',
			path: 'demo/big.py',
			kind: 'file',
			language: 'python',
			_absolutePath: '/d/big.py'
		}
	]
};

describe('loadTestProject', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		projectStore.reset();
	});

	it('records the files it read nothing from, with the reason', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.startsWith('/__dev/scan')) return new Response(JSON.stringify(scanTree));
				// The dev server answers an oversized file with an empty body
				return new Response(url.includes('big') ? '' : 'def main(): pass');
			})
		);

		await loadTestProject('/d');

		expect([...projectStore.astMap.keys()]).toEqual(['demo/ok.py']);
		expect(projectStore.parseSkips).toHaveLength(2);
		expect(projectStore.parseSkips).toEqual(
			expect.arrayContaining([
				{ path: 'demo/broken.py', reason: 'parse-failed' },
				{ path: 'demo/big.py', reason: 'unreadable' }
			])
		);
	});

	it('builds the code map from the parsed refs and the configs in the scanned tree', async () => {
		const tree = {
			...scanTree,
			children: [
				scanTree.children[0],
				{
					name: 'package.json',
					path: 'demo/package.json',
					kind: 'file',
					_absolutePath: '/d/package.json'
				}
			]
		};
		const fetchMock = vi.fn(async (url: string) =>
			url.startsWith('/__dev/scan')
				? new Response(JSON.stringify(tree))
				: new Response(url.includes('package.json') ? '{ "name": "demo" }' : 'def main(): pass')
		);
		vi.stubGlobal('fetch', fetchMock);

		await loadTestProject('/d');

		expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
			`/__dev/read?file=${encodeURIComponent('/d/package.json')}`
		);
		expect(codeMapStore.map!.root).toBe('demo');
		expect(codeMapStore.map!.files.get('demo/ok.py' as never)!.refs).toEqual([
			expect.objectContaining({ kind: 'calls', line: 1, written: 'print' })
		]);
	});

	it("leaves the next project's map alone when its config reads finish after it opened", async () => {
		const tree = {
			...scanTree,
			children: [
				scanTree.children[0],
				{
					name: 'package.json',
					path: 'demo/package.json',
					kind: 'file',
					_absolutePath: '/d/package.json'
				}
			]
		};
		let releaseConfig!: () => void;
		const configHeld = new Promise<void>((resolve) => (releaseConfig = resolve));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.startsWith('/__dev/scan')) return new Response(JSON.stringify(tree));
				if (url.includes('package.json')) await configHeld;
				return new Response(url.includes('package.json') ? '{}' : 'def main(): pass');
			})
		);
		const load = loadTestProject('/d');
		await vi.waitFor(() => expect(projectStore.parsingProgress).toEqual({ done: 1, total: 1 }));

		const next = new Map([
			['next/lib.ts', [{ name: 'f', kind: 'function' as const, lineStart: 1, lineEnd: 1 }]]
		]);
		projectStore.astMap = next;
		codeMapStore.build({ astMap: next, root: 'next', refs: new Map(), configs: new Map() });
		releaseConfig();
		await load;

		expect(codeMapStore.map!.root).toBe('next');
	});
});
