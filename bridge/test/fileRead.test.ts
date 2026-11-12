import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isEnvValueFile as appIsEnvValueFile } from '../../src/lib/utils/languageDetector';
import { MAX_FILE_SIZE, isEnvValueFile, readRootedFile, resolveRoot } from '../src/fileRead';

describe('bridge file.read', () => {
	let base: string;
	let root: string;

	beforeAll(() => {
		// Under os.tmpdir(), which on macOS is itself behind a symlink (/var -> /private/var)
		base = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-fileread-'));
		const dir = path.join(base, 'project');
		fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'a.txt'), 'hello bridge\n');
		fs.writeFileSync(path.join(dir, 'sub', 'b.ts'), 'export const b = 1;\n');
		fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1\n');
		fs.writeFileSync(path.join(dir, 'sub', '.env.local'), 'SECRET=2\n');
		fs.writeFileSync(path.join(dir, '.env.example'), 'SECRET=\n');
		fs.writeFileSync(path.join(dir, 'max.txt'), 'x'.repeat(MAX_FILE_SIZE));
		fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(MAX_FILE_SIZE + 1));
		fs.writeFileSync(path.join(base, 'outside.txt'), 'outside\n');
		fs.symlinkSync(path.join(base, 'outside.txt'), path.join(dir, 'link-out.txt'));
		fs.symlinkSync(base, path.join(dir, 'link-dir'));
		fs.symlinkSync(path.join(dir, 'a.txt'), path.join(dir, 'link-in.txt'));
		fs.symlinkSync(path.join(dir, '.env'), path.join(dir, 'config.txt'));
		fs.writeFileSync(path.join(dir, '..x'), 'dots in a name\n');
		fs.writeFileSync(path.join(dir, 'image.bin'), Buffer.from([0x89, 0x50, 0x00, 0x47]));
		fs.mkdirSync(path.join(dir, 'race'));
		fs.writeFileSync(path.join(dir, 'race', 'f.txt'), 'inside\n');
		fs.mkdirSync(path.join(base, 'elsewhere'));
		fs.writeFileSync(path.join(base, 'elsewhere', 'f.txt'), 'outside\n');
		if (process.platform !== 'win32') execFileSync('mkfifo', [path.join(dir, 'pipe')]);
		root = resolveRoot(dir);
	});

	afterAll(() => {
		fs.rmSync(base, { recursive: true, force: true });
	});

	it('returns the content, its sha-256 and its byte size', async () => {
		// Act
		const read = await readRootedFile(root, 'sub/b.ts');

		// Assert
		const bytes = Buffer.from('export const b = 1;\n');
		expect(read).toEqual({
			ok: true,
			file: {
				path: 'sub/b.ts',
				content: bytes.toString(),
				sha256: createHash('sha256').update(bytes).digest('hex'),
				size: bytes.length
			}
		});
	});

	it('reads a symlink that stays inside the root', async () => {
		const read = await readRootedFile(root, 'link-in.txt');
		expect(read.ok && read.file.content).toBe('hello bridge\n');
	});

	it.each([
		['', 'invalid-path'],
		['a.txt\0', 'invalid-path'],
		['/etc/hosts', 'absolute-path'],
		['C:\\Windows\\win.ini', 'absolute-path'],
		['\\\\server\\share\\x', 'absolute-path'],
		['../outside.txt', 'outside-root'],
		['sub/../../outside.txt', 'outside-root'],
		['link-out.txt', 'symlink-outside-root'],
		['link-dir/outside.txt', 'symlink-outside-root'],
		['.env', 'env-file'],
		['sub/.env.local', 'env-file'],
		['.ENV', 'env-file'],
		['config.txt', 'env-file'],
		['big.txt', 'too-large'],
		['image.bin', 'binary'],
		['missing.txt', 'not-found'],
		['sub', 'not-a-file']
	])('refuses %j as %s', async (requested, reason) => {
		const read = await readRootedFile(root, requested);
		expect(read.ok ? 'ok' : read.reason).toBe(reason);
	});

	it('reads a file whose name starts with two dots', async () => {
		const read = await readRootedFile(root, '..x');
		expect(read.ok && read.file.content).toBe('dots in a name\n');
	});

	it.skipIf(process.platform === 'win32')(
		'refuses a FIFO without waiting for a writer',
		async () => {
			// A blocking open of a FIFO never returns; four of them used to stall every libuv thread
			const reads = await Promise.all(
				Array.from({ length: 5 }, () => readRootedFile(root, 'pipe'))
			);
			expect(reads.map((read) => (read.ok ? 'ok' : read.reason))).toEqual(
				Array(5).fill('not-a-file')
			);
		},
		2000
	);

	it.each([
		['kept swapped', false],
		['swapped back after open', true]
	])(
		'refuses a parent directory swapped for an outside symlink during the read (%s)',
		async (_label, swapBack) => {
			// Arrange: swap `race/` for a link to a directory outside the root right before open
			const dir = path.join(root, 'race');
			const parked = path.join(root, 'race-parked');
			const open = fs.promises.open.bind(fs.promises);
			vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
				fs.renameSync(dir, parked);
				fs.symlinkSync(path.join(base, 'elsewhere'), dir);
				try {
					return await open(...args);
				} finally {
					if (swapBack) {
						fs.unlinkSync(dir);
						fs.renameSync(parked, dir);
					}
				}
			});

			try {
				// Act
				const read = await readRootedFile(root, 'race/f.txt');

				// Assert
				expect(read.ok ? read.file.content : read.reason).toBe('changed');
			} finally {
				vi.restoreAllMocks();
				if (fs.existsSync(parked)) {
					fs.unlinkSync(dir);
					fs.renameSync(parked, dir);
				}
			}
		}
	);

	it('refuses a path that is not a string', async () => {
		const read = await readRootedFile(root, { path: 'a.txt' });
		expect(read.ok ? 'ok' : read.reason).toBe('invalid-path');
	});

	it('reads an env template and a file of exactly MAX_FILE_SIZE bytes', async () => {
		const template = await readRootedFile(root, '.env.example');
		const max = await readRootedFile(root, 'max.txt');
		expect(template.ok && template.file.content).toBe('SECRET=\n');
		expect(max.ok && max.file.size).toBe(MAX_FILE_SIZE);
	});

	it('calls the same files env files as the app does', () => {
		const names = [
			'.env',
			'.env.local',
			'.env.production.local',
			'.env.example',
			'.env.local.sample',
			'.env.template',
			'.env.dist',
			'.env.defaults',
			'.env.example.bak',
			'.envrc',
			'env.example',
			'sub/.env.test'
		];
		for (const name of names) {
			expect([name, isEnvValueFile(name)]).toEqual([name, appIsEnvValueFile(name)]);
		}
	});
});
