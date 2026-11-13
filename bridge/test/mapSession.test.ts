import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRoot } from '../src/fileRead';
import { MapSession } from '../src/mapSession';
import type { RopemanMap, RpcPush } from '../../src/lib/types/ropemanMap';

const WASM_DIR = fileURLToPath(new URL('../../static', import.meta.url));
const DEBOUNCE_MS = 150;
const realWatch = fs.watch;

const until = async (check: () => boolean, ms = 4_000) => {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error('timed out waiting');
		await new Promise((r) => setTimeout(r, 20));
	}
};

describe.skipIf(process.platform === 'win32')('MapSession catching up after the walk', () => {
	let sessions: MapSession[] = [];
	let bases: string[] = [];

	afterEach(() => {
		vi.restoreAllMocks();
		for (const session of sessions) session.close();
		for (const base of bases) fs.rmSync(base, { recursive: true, force: true });
		sessions = [];
		bases = [];
	});

	/**
	 * A session over a small project. `beforeWatch` runs once, after the first extraction walked
	 * the files and before its first watcher opens. `deaf` opens watchers that never report.
	 */
	async function start(options: { beforeWatch?: (root: string) => void; deaf?: boolean } = {}) {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-session-'));
		bases.push(base);
		fs.mkdirSync(path.join(base, 'project'));
		const root = resolveRoot(path.join(base, 'project'));
		const write = (rel: string, text: string) => {
			fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			fs.writeFileSync(path.join(root, rel), text);
		};
		write('src/lib/math.ts', 'export function add(a: number, b: number) {\n\treturn a + b;\n}\n');
		write('src/index.ts', `import { add } from './lib/math';\nadd(1, 2);\n`);
		write('tools/build.ts', 'export function build() {}\n');
		write('tools/old.ts', 'export function old() {}\n');
		// Every file is older than the walk, as in a project opened some time after its last edit
		await new Promise((r) => setTimeout(r, 50));

		let hooked = false;
		vi.spyOn(fs, 'watch').mockImplementation(((...args: Parameters<typeof fs.watch>) => {
			if (!hooked) {
				hooked = true;
				options.beforeWatch?.(root);
				// The window lasts seconds on a big project; macOS still reports a change made 0 ms
				// before a watch opens, but none made 50 ms before (measured)
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
			}
			return options.deaf ? realWatch(args[0] as string, () => {}) : realWatch(...args);
		}) as typeof fs.watch);

		const logs: string[] = [];
		const pushes: RpcPush[] = [];
		const session = new MapSession({
			root,
			wasmDir: WASM_DIR,
			naming: null,
			server: { name: '@ropeman/bridge', version: 'test' },
			debounceMs: DEBOUNCE_MS,
			log: (msg) => logs.push(msg)
		});
		sessions.push(session);
		session.join({ push: (message) => pushes.push(message) });
		const first = await session.map();
		return {
			root,
			first,
			pushes,
			extractions: () => logs.filter((l) => l.startsWith('Extracted ')).length,
			session
		};
	}

	const topEdges = (map: RopemanMap) =>
		map.levels[0].edges.map((e) => `${e.source}->${e.target}`).sort();
	const filePaths = (map: RopemanMap) => map.files.map((f) => f.path).sort();

	it('picks up an edit made after the walk read the file and before its watcher opened', async () => {
		// Arrange, Act: tools/build.ts starts importing src once the walk is done
		const { first, pushes, session } = await start({
			beforeWatch: (root) =>
				fs.writeFileSync(
					path.join(root, 'tools/build.ts'),
					`import { add } from '../src/lib/math';\nexport function build() {\n\treturn add(1, 1);\n}\n`
				)
		});
		await until(() => pushes.length > 0);
		const after = await session.map();

		// Assert
		expect(topEdges(first)).toEqual([]);
		expect(pushes).toEqual([{ type: 'map.changed', paths: ['tools/build.ts'] }]);
		expect(topEdges(after)).toEqual(['dir:tools->dir:src']);
	});

	it('picks up a new folder and a removed file from before the watchers opened', async () => {
		// Arrange, Act
		const { first, pushes, session } = await start({
			beforeWatch: (root) => {
				fs.mkdirSync(path.join(root, 'src/extra'));
				fs.writeFileSync(path.join(root, 'src/extra/new.ts'), 'export const fresh = 1;\n');
				fs.rmSync(path.join(root, 'tools/old.ts'));
			}
		});
		await until(() => pushes.length > 0);
		const after = await session.map();

		// Assert
		expect(filePaths(first)).toContain('tools/old.ts');
		expect(pushes).toEqual([{ type: 'map.changed', paths: ['src/extra', 'tools/old.ts'] }]);
		expect(filePaths(after)).toContain('src/extra/new.ts');
		expect(filePaths(after)).not.toContain('tools/old.ts');
	});

	it('picks up an edit a watcher drops just after it opens', async () => {
		// Arrange: watchers that report nothing, as macOS can for a change made as a watch opens
		const { pushes, root, extractions } = await start({ deaf: true });

		// Act: after the check made as the watchers opened, before the one that follows
		await new Promise((r) => setTimeout(r, 60));
		fs.appendFileSync(path.join(root, 'src/lib/math.ts'), 'export const zero = 0;\n');
		await until(() => pushes.length > 0);
		// Past both checks of the extraction that push followed, and a debounce after them
		await new Promise((r) => setTimeout(r, 200 + DEBOUNCE_MS + 150));

		// Assert: that extraction's own checks do not find the edit again
		expect(pushes).toEqual([{ type: 'map.changed', paths: ['src/lib/math.ts'] }]);
		expect(extractions()).toBe(2);
	});

	it('leaves no timer running once closed', async () => {
		// Arrange: past the check made as the watchers opened, while the next one waits
		const { session } = await start({ deaf: true });
		await new Promise((r) => setTimeout(r, 100));
		const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
		const before = timers();

		// Act
		session.close();

		// Assert
		expect(timers()).toBe(before - 1);
	});

	it('neither pushes nor extracts again when nothing changed', async () => {
		// Arrange
		const { pushes, extractions } = await start();

		// Act: past both checks and the debounce that would follow them
		await new Promise((r) => setTimeout(r, 200 + DEBOUNCE_MS + 400));

		// Assert
		expect(pushes).toEqual([]);
		expect(extractions()).toBe(1);
	});
});
