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
		if (data.type === 'parse') {
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
						]
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

vi.mock('$lib/utils/languageDetector', () => ({
	isSupported: vi.fn((lang: string) => ['typescript', 'javascript', 'python'].includes(lang))
}));

import { parseFile, destroy } from './parserService';

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

			const symbols = await promise;

			expect(symbols).toHaveLength(1);
			expect(symbols[0].name).toBe('testFunction');
			expect(symbols[0].kind).toBe('function');
		});

		it('outlines markdown on the main thread without starting the worker', async () => {
			const before = MockWorker.created;

			const symbols = await parseFile('SKILL.md', '# Review\n## Steps', 'markdown');

			expect(symbols[0]).toMatchObject({ name: 'Review', kind: 'heading' });
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
			const result = await promise2;

			expect(result).toHaveLength(1);
		});
	});
});
