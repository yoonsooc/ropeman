import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, symlinkSync } from 'node:fs';
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

	it('follows a file link inside the root, never one out of it, and no folder link', async () => {
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

	it('refuses a link whose target the loader would refuse by its own name', async () => {
		// Arrange
		const root = await project('link-targets', {
			'.env': 'export const SECRET = "sk-live-secret";\n',
			'.ENV.prod': 'export const SECRET = "sk-live-upper";\n',
			'node_modules/dep/index.ts': 'export function dep() {}\n',
			'.secrets/key.ts': 'export const KEY = "sk-live-hidden";\n',
			'app.ts': 'export const a = 1;\n'
		});
		await symlink(join(root, '.env'), join(root, 'notes.ts'));
		await symlink(join(root, '.ENV.prod'), join(root, 'prod.ts'));
		await symlink(join(root, 'node_modules/dep/index.ts'), join(root, 'dep.ts'));
		await symlink(join(root, '.secrets'), join(root, 'conf'));

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['app.ts']);
		expect(JSON.stringify([...extraction.map.files.values()])).not.toMatch(/sk-live|dep/);
	});

	it('names a folder reached through a link by its real path, whatever the readdir order', async () => {
		// Arrange
		const root = await project('dir-links', {
			'm1/one.ts': 'export function one() {}\n',
			'm2/two.ts': 'export function two() {}\n'
		});
		await symlink(join(root, 'm1'), join(root, 'a'));
		await symlink(join(root, 'm2'), join(root, 'z'));

		// Act
		const extraction = await extractDirectory(root, { wasmDir });

		// Assert
		expect(paths(extraction)).toEqual(['m1/one.ts', 'm2/two.ts']);
	});

	it('does not follow a file swapped for a link out of the root after the walk', async () => {
		// Arrange
		const outside = await project('swap-outside', { 'secret.ts': 'export function leaked() {}\n' });
		const root = await project('swap', {
			'a.ts': 'export function kept() {}\n',
			'b.ts': 'export function swapped() {}\n'
		});
		const swap = ({ done }: { done: number }) => {
			if (done !== 0) return;
			rmSync(join(root, 'b.ts'));
			symlinkSync(join(outside, 'secret.ts'), join(root, 'b.ts'));
		};

		// Act
		const extraction = await extractDirectory(root, { wasmDir, onProgress: swap });

		// Assert
		expect(paths(extraction)).toEqual(['a.ts']);
		expect(extraction.skipped).toEqual([{ path: 'b.ts', reason: 'unreadable' }]);
		expect(JSON.stringify([...extraction.map.files.values()])).not.toMatch(/leaked/);
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
