import { describe, it, expect } from 'vitest';
import golden from './__fixtures__/skeletonWire.golden.json';
import { wireScenarios } from './__fixtures__/skeletonWire';

describe('skeleton wire bytes', () => {
	it('sends the same strings as the wire captured before skeleton v2', async () => {
		// The golden was written by the extractor at main 94ab765, before the v2 code map existed.
		// The analysis cache keys on these strings, so any change here invalidates every user's cache.
		const scenarios = await wireScenarios();

		expect(scenarios).toEqual(golden);
	});
});
