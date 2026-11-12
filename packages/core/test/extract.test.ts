import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_FILES, MAX_FILE_SIZE } from '$lib/utils/filePriority';
import { extractDirectory, NODE_MAX_FILE_SIZE } from '../src/extract';

const wasmDir = fileURLToPath(new URL('../../../static', import.meta.url));

let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), 'ropeman-core-'));
});

afterAll(async () => {
	await rm(scratch, { recursive: true, force: true });
});

/** Write `files` (path → contents) under a new folder and return its path. */
async function project(name: string, files: Record<string, string>): Promise<string> {
	const root = join(scratch, name);
	for (const [path, text] of Object.entries(files)) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), text);
	}
	return root;
}

const paths = (extraction: { map: { files: ReadonlyMap<string, unknown> } }) =>
	[...extraction.map.files.keys()].sort();

describe('extractDirectory', () => {
	it('reads every file, past the browser cap of MAX_FILES', async () => {
		// Arrange
		const files: Record<string, string> = {};
		for (let i = 0; i <= MAX_FILES; i++) files[`src/m${i}.ts`] = `export function f${i}() {}\n`;
		const root = await project('many', files);

		// Act
		const { map, listed, skipped } = await extractDirectory(root, { wasmDir });

		// Assert
		expect(listed).toBe(MAX_FILES + 1);
		expect(map.files.size).toBe(MAX_FILES + 1);
		expect(skipped).toEqual([]);
	}, 60_000);

	it('never reads a real env file, and reads env templates', async () => {
		// Arrange
		const root = await project('env', {
			'.env': 'API_TOKEN=sk-live-secret\n',
			'.env.local': 'API_TOKEN=sk-live-local\n',
			'.env.example': 'API_TOKEN=\n',
			'app.ts': 'export const a = 1;\n'
		});

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['.env.example', 'app.ts']);
		expect(JSON.stringify([...extraction.map.files.values()])).not.toMatch(/sk-live/);
	});

	it('skips hidden folders and node_modules unless an include entry covers them', async () => {
		// Arrange
		const root = await project('skips', {
			'src/main.ts': 'export function main() {}\n',
			'node_modules/dep/index.js': 'export function dep() {}\n',
			'.cache/build.ts': 'export function cached() {}\n',
			'.github/workflows/ci.yml': 'name: CI\n'
		});

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['.github/workflows/ci.yml', 'src/main.ts']);
	});

	it('follows a link inside the root, never one out of it, and reads a linked folder once', async () => {
		// Arrange
		const outside = await project('outside', { 'secret.ts': 'export function leaked() {}\n' });
		const root = await project('links', { 'src/real.ts': 'export function real() {}\n' });
		await symlink(join(root, 'src/real.ts'), join(root, 'src/alias.ts'));
		await symlink(join(outside, 'secret.ts'), join(root, 'src/out.ts'));
		await symlink(outside, join(root, 'out-dir'));
		await symlink(join(root, 'src'), join(root, 'src/loop'));

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['src/alias.ts', 'src/real.ts']);
	});

	it('reads files over the browser size limit and skips ones over the Node guard', async () => {
		// Arrange
		const body = (bytes: number) => `export const big = "${'x'.repeat(bytes)}";\n`;
		const root = await project('sizes', {
			'mid.ts': body(MAX_FILE_SIZE + 1000),
			'huge.ts': body(NODE_MAX_FILE_SIZE + 1000)
		});

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['mid.ts']);
		expect(extraction.skipped).toEqual([{ path: 'huge.ts', reason: 'file-size' }]);
	});

	it('reads a file with a byte order mark the way the browser decodes it', async () => {
		// Arrange
		const root = await project('bom', { 'a.ts': '﻿export function first() {}\n' });

		// Act
		const { map } = await extractDirectory(root, { wasmDir });

		// Assert
		expect(map.files.get('a.ts' as never)?.symbols.map((s) => s.name)).toEqual(['first']);
	});

	it('binds imports through the tsconfig paths the walk found', async () => {
		// Arrange
		const root = await project('alias', {
			'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
			'src/util.ts': 'export function util() {}\n',
			'src/main.ts': "import { util } from '@/util';\nutil();\n"
		});

		// Act
		const { map, hierarchy } = await extractDirectory(root, { wasmDir });

		// Assert
		const [site] = map.files.get('src/main.ts' as never)!.imports;
		expect(site.module).toMatchObject({
			state: 'bound',
			candidates: [{ to: { kind: 'file', path: 'src/util.ts' } }]
		});
		expect(hierarchy).toMatchObject({ path: '', files: 3, ownFiles: 1 });
	});
});
