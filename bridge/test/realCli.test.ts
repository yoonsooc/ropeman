import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { CliRunner, detectCLI } from '../src/cli';
import { resolveRoot } from '../src/fileRead';
import { MapSession, type Subscriber } from '../src/mapSession';
import { buildNamingPrompt } from '../src/naming';
import { verifyMap } from '../../src/lib/services/mapVerifier';
import { extractDirectory } from '../../packages/core/src/extract';
import type { RpcPush } from '../../src/lib/types/ropemanMap';

const WASM_DIR = fileURLToPath(new URL('../../static', import.meta.url));

/**
 * One naming with the real CLI, for the numbers in docs/ARCH.md. It calls a model up to twice:
 *   ROPEMAN_SERVE_DIR=<folder> ROPEMAN_SERVE_NODE=dir:packages npx vitest run bridge/test/realCli.test.ts
 */
describe.runIf(process.env.ROPEMAN_SERVE_DIR)('serve naming with the real CLI', () => {
	it('names one node and the map passes the verifier', { timeout: 400_000 }, async () => {
		// Arrange
		const root = resolveRoot(process.env.ROPEMAN_SERVE_DIR!);
		const nodeId = process.env.ROPEMAN_SERVE_NODE ?? 'dir:packages';
		const cli = await detectCLI();
		if (!cli) throw new Error('no CLI found');
		const logs: string[] = [];
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-naming-'));
		const session = new MapSession({
			root,
			wasmDir: WASM_DIR,
			naming: {
				cli,
				command: cli,
				timeoutMs: 180_000,
				maxOutputBytes: 1_000_000,
				runner: new CliRunner(1, cwd)
			},
			server: { name: '@ropeman/bridge', version: 'measure' },
			debounceMs: 300,
			log: (msg) => logs.push(msg)
		});
		const pushes: RpcPush[] = [];
		const subscriber: Subscriber = { push: (m) => pushes.push(m) };
		session.join(subscriber);

		// Act
		const t0 = performance.now();
		await session.map();
		const t1 = performance.now();
		const expanded = await session.expand(nodeId);
		const t2 = performance.now();
		if (!expanded.ok) throw new Error(expanded.error);
		session.name(nodeId, subscriber);
		while (!pushes.some((m) => m.type === 'node.named'))
			await new Promise((r) => setTimeout(r, 100));
		const t3 = performance.now();
		const map = await session.map();
		session.close();
		fs.rmSync(cwd, { recursive: true, force: true });

		// Assert, then report
		const named = pushes.find((m) => m.type === 'node.named')!;
		const extraction = await extractDirectory(root, { wasmDir: WASM_DIR });
		const check = verifyMap(map, extraction.map);
		const prompt = buildNamingPrompt(
			{ project: path.basename(root), nodeId, folder: nodeId.slice(4), level: expanded.level },
			extraction.map
		)!;
		const report = {
			cli,
			nodeId,
			parts: expanded.level.nodes.length,
			promptBytes: Buffer.byteLength(prompt),
			ms: {
				firstMap: Math.round(t1 - t0),
				groupedReply: Math.round(t2 - t1),
				namedAfterReply: Math.round(t3 - t2)
			},
			outcome: 'level' in named ? 'named' : named.code,
			labels: 'level' in named ? named.level.nodes.map((n) => `${n.id} = ${n.label}`) : named.error,
			verifier: check.parsed
				? {
						violations: check.violations.length,
						unverified: check.unverified.length,
						checked: check.checked
					}
				: check.failure,
			log: logs.filter((l) => l.startsWith('node.named') || l.startsWith('Extracted'))
		};
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		expect(check.parsed && check.violations).toEqual([]);
	});
});
