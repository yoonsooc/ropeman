import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectCLI } from '../src/cli';

const pathBefore = process.env.PATH;
let bin: string;

/** A PATH with only stand-ins that answer `--version`, so no real CLI is found or run. */
function onPath(...clis: string[]) {
	bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-detect-'));
	for (const cli of clis) {
		fs.writeFileSync(path.join(bin, cli), '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });
	}
	process.env.PATH = bin;
}

afterEach(() => {
	process.env.PATH = pathBefore;
	fs.rmSync(bin, { recursive: true, force: true });
});

describe.runIf(process.platform !== 'win32')('detectCLI', () => {
	it('never picks gemini on its own', async () => {
		onPath('gemini');

		const cli = await detectCLI();

		expect(cli).toBeNull();
	});

	it('picks claude when it runs, even with gemini beside it', async () => {
		onPath('claude', 'gemini');

		const cli = await detectCLI();

		expect(cli).toBe('claude');
	});
});
