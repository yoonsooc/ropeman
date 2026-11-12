import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$lib/services/parserService', () => ({
	parseFile: vi.fn(async (path: string) => {
		if (path.includes('broken')) throw new Error('Parse failed');
		return [{ name: 'main', kind: 'function', lineStart: 1, lineEnd: 1 }];
	})
}));

import { loadTestProject } from './testLoader';
import { projectStore } from '$lib/stores/projectStore.svelte';

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
});
