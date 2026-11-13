import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { changedSince } from '../src/watch';

const { stamps } = vi.hoisted(() => ({ stamps: new Map<string, number>() }));

// Real entries, with the change time a test gives each file, as the file system would store it
vi.mock('fs/promises', async (importOriginal) => {
	const real = await importOriginal<typeof import('fs/promises')>();
	return {
		...real,
		lstat: async (file: string) => {
			const stat = await real.lstat(file);
			const ctimeMs = stamps.get(file);
			return ctimeMs === undefined ? stat : Object.assign(stat, { ctimeMs });
		}
	};
});

describe('changedSince', () => {
	const SINCE = 1_700_000_000_000;
	const NOW = SINCE + 5_000;
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-watch-'));
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		stamps.clear();
		fs.rmSync(root, { recursive: true, force: true });
	});

	const stamp = (name: string, ctimeMs: number) => {
		fs.writeFileSync(path.join(root, name), '');
		stamps.set(path.join(root, name), ctimeMs);
	};

	it('reports a change made in the same millisecond as the scan', async () => {
		// Arrange
		stamp('same-ms.ts', NOW + 0.4);

		// Act, Assert
		expect(await changedSince(root, [''], [], SINCE)).toEqual(['same-ms.ts']);
	});

	it('reports a change a whole-second file system stamped before the walk started', async () => {
		// Arrange: changed 300 ms after the walk started, stored as the start of that second
		stamp('coarse.ts', SINCE);

		// Act, Assert
		expect(await changedSince(root, [''], [], SINCE + 700)).toEqual(['coarse.ts']);
	});

	it('reports a change a lagging kernel clock stamped just before the walk started', async () => {
		// Arrange
		stamp('lagging.ts', SINCE - 4.25);

		// Act, Assert
		expect(await changedSince(root, [''], [], SINCE)).toEqual(['lagging.ts']);
	});

	it('does not report what changed before the walk', async () => {
		// Arrange
		stamp('old.ts', SINCE - 30.5);
		stamp('old-coarse.ts', SINCE - 3_000);

		// Act, Assert
		expect(await changedSince(root, [''], ['old.ts', 'old-coarse.ts'], SINCE)).toEqual([]);
	});

	it('does not report a change time past the scan, as after the clock was set back', async () => {
		// Arrange
		stamp('future.ts', NOW + 1.5);

		// Act, Assert
		expect(await changedSince(root, [''], ['future.ts'], SINCE)).toEqual([]);
	});
});
