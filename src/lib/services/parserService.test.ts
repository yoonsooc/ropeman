import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Worker
let workerMessageHandler: ((e: MessageEvent) => void) | null = null;

class MockWorker {
	static created = 0;
	constructor() {
		MockWorker.created++;
	}
	onmessage: ((e: MessageEvent) => void) | null = null;
	postMessage = vi.fn((data: any) => {
		// Simulate async worker response
		if (data.type === 'init') {
			setTimeout(() => {
				this.onmessage?.({ data: { type: 'init-done' } } as MessageEvent);
				// Also trigger addEventListener handler
				workerMessageHandler?.({ data: { type: 'init-done' } } as MessageEvent);
			}, 0);
		}
		if (data.type === 'parse' && data.filePath.includes('broken')) {
			setTimeout(() => {
				this.onmessage?.({
					data: { type: 'error', filePath: data.filePath, error: 'Parse failed: grammar' }
				} as MessageEvent);
			}, 0);
		} else if (data.type === 'parse') {
			setTimeout(() => {
				this.onmessage?.({
					data: {
						type: 'parse-result',
						filePath: data.filePath,
						symbols: [
							{
								name: 'testFunction',
								kind: 'function',
								lineStart: 1,
								lineEnd: 5,
								children: []
							}
						],
						refs: [{ kind: 'calls', line: 2, written: 'save' }]
					}
				} as MessageEvent);
			}, 0);
		}
	});
	terminate = vi.fn();
	addEventListener = vi.fn((event: string, handler: any, _opts?: any) => {
		if (event === 'message') {
			workerMessageHandler = handler;
		}
	});
	removeEventListener = vi.fn();
}

// Mock import.meta.url Worker construction
vi.stubGlobal('Worker', MockWorker);

vi.mock('$lib/utils/languageDetector', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/languageDetector')>()),
	isSupported: vi.fn((lang: string) =>
		['typescript', 'javascript', 'python', 'dotenv'].includes(lang)
	)
}));

import { parseFile, parseAllFiles, destroy } from './parserService';
import type { FileNode } from '$lib/types/fileTree';
import { detectLanguage } from '$lib/utils/languageDetector';

function fileNode(path: string, size: number, readable = true): FileNode {
	return {
		name: path.split('/').pop()!,
		path,
		kind: 'file',
		language: 'typescript',
		handle: readable
			? ({
					kind: 'file',
					getFile: async () => ({ size, text: async () => 'function f() {}' })
				} as unknown as FileSystemFileHandle)
			: undefined
	};
}

describe('parserService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		workerMessageHandler = null;
		destroy(); // Reset module state
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('parseFile', () => {
		it('initializes worker and returns parsed symbols', async () => {
			const promise = parseFile('src/main.ts', 'function test() {}', 'typescript');

			// Advance timers to trigger init-done and parse-result
			await vi.advanceTimersByTimeAsync(10);

			const { symbols, refs } = await promise;

			expect(refs).toEqual([{ kind: 'calls', line: 2, written: 'save' }]);
			expect(symbols).toHaveLength(1);
			expect(symbols[0].name).toBe('testFunction');
			expect(symbols[0].kind).toBe('function');
		});

		it('outlines markdown on the main thread without starting the worker', async () => {
			const before = MockWorker.created;

			const { symbols, refs } = await parseFile('SKILL.md', '# Review\n## Steps', 'markdown');

			expect(refs).toEqual([]);
			expect(symbols[0]).toMatchObject({ name: 'Review', kind: 'heading' });
			expect(MockWorker.created).toBe(before);
		});

		it('reads config files with their line parsers without starting the worker', async () => {
			const before = MockWorker.created;

			const { symbols: docker } = await parseFile(
				'Dockerfile',
				'FROM node:20 AS app',
				'dockerfile'
			);
			const { symbols: terraform } = await parseFile('main.tf', 'module "vpc" {\n}', 'terraform');
			const { symbols: env } = await parseFile('.env.example', 'TOKEN=hunter2', 'dotenv');
			const { symbols: make } = await parseFile('Makefile', 'all: build', 'makefile');

			expect(docker).toContainEqual(expect.objectContaining({ name: 'app', kind: 'stage' }));
			expect(terraform[0]).toMatchObject({ name: 'module.vpc', kind: 'resource' });
			expect(env).toEqual([{ name: 'TOKEN', kind: 'env', lineStart: 1, lineEnd: 1 }]);
			expect(make[0]).toMatchObject({ name: 'all', kind: 'target' });
			expect(MockWorker.created).toBe(before);
		});
	});

	describe('destroy', () => {
		it('terminates worker and clears state', async () => {
			// First init the worker
			const promise = parseFile('file.ts', 'code', 'typescript');
			await vi.advanceTimersByTimeAsync(10);
			await promise;

			destroy();

			// After destroy, a new parseFile should create a new worker
			const promise2 = parseFile('file2.ts', 'code2', 'typescript');
			await vi.advanceTimersByTimeAsync(10);
			const { symbols } = await promise2;

			expect(symbols).toHaveLength(1);
		});
	});

	describe('parseAllFiles', () => {
		it('never opens a real env file, and reads env templates', async () => {
			const envFile = (path: string) => {
				const getFile = vi.fn(async () => ({ size: 20, text: async () => 'API_TOKEN=sk-live-x' }));
				const node: FileNode = {
					name: path,
					path,
					kind: 'file',
					language: detectLanguage(path) ?? undefined,
					handle: { kind: 'file', getFile } as unknown as FileSystemFileHandle
				};
				return { node, getFile };
			};
			const real = ['.env', '.env.local', '.env.production'].map(envFile);
			const template = envFile('.env.example');
			const tree: FileNode = {
				name: 'repo',
				path: '',
				kind: 'directory',
				children: [...real, template].map((file) => file.node)
			};

			const { astMap, skipped } = await parseAllFiles(tree);

			for (const file of real) expect(file.getFile).not.toHaveBeenCalled();
			expect([...astMap]).toEqual([
				['.env.example', [{ name: 'API_TOKEN', kind: 'env', lineStart: 1, lineEnd: 1 }]]
			]);
			expect(skipped).toEqual([]);
		});

		it('reports each file it read nothing from, with the reason', async () => {
			vi.spyOn(console, 'warn').mockImplementation(() => {});
			const tree: FileNode = {
				name: 'repo',
				path: '',
				kind: 'directory',
				children: [
					fileNode('src/ok.ts', 100),
					fileNode('src/huge.ts', 600_000),
					fileNode('src/broken.ts', 100),
					fileNode('src/gone.ts', 100, false)
				]
			};

			const promise = parseAllFiles(tree);
			await vi.advanceTimersByTimeAsync(50);
			const { astMap, refs, skipped } = await promise;

			expect([...astMap.keys()]).toEqual(['src/ok.ts']);
			expect([...refs]).toEqual([['src/ok.ts', [{ kind: 'calls', line: 2, written: 'save' }]]]);
			expect(skipped).toEqual(
				expect.arrayContaining([
					{ path: 'src/huge.ts', reason: 'file-size' },
					{ path: 'src/broken.ts', reason: 'parse-failed' },
					{ path: 'src/gone.ts', reason: 'unreadable' }
				])
			);
			expect(skipped).toHaveLength(3);
		});

		it('counts every file in the progress, including the ones it could not read', async () => {
			// Regression: a file without a handle was skipped without advancing the progress
			const tree: FileNode = {
				name: 'repo',
				path: '',
				kind: 'directory',
				children: [fileNode('src/gone.ts', 100, false)]
			};
			const progress: number[] = [];

			await parseAllFiles(tree, (p) => progress.push(p.done));

			expect(progress.at(-1)).toBe(1);
		});
	});
});
