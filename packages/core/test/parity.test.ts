import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDirectoryRecursive } from '$lib/services/fileSystemService';
import { parseAllFiles, destroy } from '$lib/services/parserService';
import { buildCodeMap } from '$lib/services/codeMapBuilder';
import type { FileNode } from '$lib/types/fileTree';
import { extractDirectory } from '../src/extract';
import { walkDirectory } from '../src/walk';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const wasmDir = join(repo, 'static');

// The worker fetches `/tree-sitter*.wasm` from the site root; in Node those are the files in static/
vi.mock('web-tree-sitter', async (importOriginal) => {
	const real = await importOriginal<typeof import('web-tree-sitter')>();
	const { join } = await import('node:path');
	const { fileURLToPath } = await import('node:url');
	const staticDir = fileURLToPath(new URL('../../../static', import.meta.url));
	const locate = (url: string) => (url.startsWith('/tree-sitter') ? join(staticDir, url) : url);
	class Parser extends real.Parser {
		static init() {
			return real.Parser.init({ locateFile: () => join(staticDir, 'tree-sitter.wasm') });
		}
	}
	const Language = { load: (url: string) => real.Language.load(locate(url)) };
	return { Parser, Language, Query: real.Query };
});

/**
 * A read-only FileSystemDirectoryHandle over a folder on disk, as showDirectoryPicker returns.
 * How Chrome's handles treat symbolic links is not known, so parity holds for trees without
 * them and a link fails the test; `extract.test.ts` covers the Node link rules.
 */
function directoryHandle(path: string): FileSystemDirectoryHandle {
	const handle = {
		kind: 'directory',
		name: basename(path),
		async *values() {
			for (const entry of await readdir(path, { withFileTypes: true })) {
				if (entry.isSymbolicLink())
					throw new Error(`parity covers trees without links: ${entry.name}`);
				if (entry.isDirectory()) yield directoryHandle(join(path, entry.name));
				else if (entry.isFile()) yield fileHandle(join(path, entry.name));
			}
		},
		async getFileHandle(name: string) {
			return fileHandle(join(path, name));
		}
	};
	return handle as unknown as FileSystemDirectoryHandle;
}

function fileHandle(path: string): FileSystemFileHandle {
	return {
		kind: 'file',
		name: basename(path),
		getFile: async () => new File([await readFile(path)], basename(path))
	} as unknown as FileSystemFileHandle;
}

/** Runs parserWorker.ts in this thread behind the Worker interface parserService talks to. */
class InProcessWorker {
	onmessage: ((e: MessageEvent) => void) | null = null;
	private listeners = new Set<(e: MessageEvent) => void>();
	private scope = {
		postMessage: (data: unknown) => this.deliver(data),
		onmessage: null as unknown
	};
	private ready: Promise<void>;

	constructor() {
		vi.stubGlobal('self', this.scope);
		this.ready = import('$lib/workers/parserWorker').then(() => undefined);
	}

	addEventListener(_type: string, listener: (e: MessageEvent) => void) {
		this.listeners.add(listener);
	}

	postMessage(data: unknown) {
		void this.ready.then(() =>
			(this.scope.onmessage as (e: { data: unknown }) => Promise<void>)({ data })
		);
	}

	terminate() {}

	private deliver(data: unknown) {
		const event = { data } as MessageEvent;
		this.onmessage?.(event);
		for (const listener of this.listeners) listener(event);
		this.listeners.clear();
	}
}

/** Every file in `node`, in tree order, with the language the parser will read it as. */
const files = (node: FileNode): { path: string; language?: string }[] =>
	node.kind === 'file'
		? [{ path: node.path, language: node.language }]
		: node.children!.flatMap(files);

/** The browser path, as Dropzone runs it on a picked folder. */
async function browserMap(root: string) {
	const { tree, cut, configs } = await readDirectoryRecursive(directoryHandle(root));
	const { astMap, refs, skipped } = await parseAllFiles(tree);
	const listed = [...files(tree).map((file) => file.path), ...cut.map((file) => file.path)];
	return { map: buildCodeMap(astMap, null, { refs, configs }), skipped, tree, cut, listed };
}

beforeAll(() => {
	vi.stubGlobal('Worker', InProcessWorker);
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
	destroy();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const ROOTS = [
	'tests/fixtures/graphs/py-shop',
	'tests/fixtures/graphs/svelte-app',
	'tests/fixtures/graphs/ts-monorepo',
	'src'
];

describe('Node extraction parity with the browser loader', () => {
	it.each(ROOTS)(
		'builds the same code map from %s',
		async (relative) => {
			// Arrange
			const root = join(repo, relative);
			const browser = await browserMap(root);

			// Act
			const node = await extractDirectory(root, { wasmDir });
			const walked = await walkDirectory(root);

			// Assert
			expect(browser.cut).toEqual([]);
			expect(walked.paths.toSorted()).toEqual(browser.listed.toSorted());
			expect(node.listed).toBe(browser.listed.length);
			expect(files(walked.tree)).toEqual(files(browser.tree));
			expect(node.map.files.size).toBeGreaterThan(0);
			expect([...node.map.files.entries()]).toEqual([...browser.map.files.entries()]);
			expect(node.map).toEqual(browser.map);
			expect(node.skipped).toEqual(browser.skipped);
		},
		60_000
	);
});
