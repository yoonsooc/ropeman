import { describe, it, expect } from 'vitest';
import {
	checkFolder,
	folderMatches,
	isSecretFile,
	readFolderFile,
	samplePaths
} from './folderSource';

type Tree = { [name: string]: string | Uint8Array | Tree };

const fail = (name: string) => Object.assign(new Error(name), { name });

/** Behaves like Chromium's handles: `..` and `/` are refused names, a missing entry is NotFoundError. */
function directory(name: string, tree: Tree): FileSystemDirectoryHandle {
	const entry = (child: string) => {
		if (child === '..' || child === '.' || child.includes('/'))
			throw new TypeError('Name is not allowed.');
		if (!(child in tree)) throw fail('NotFoundError');
		return tree[child];
	};
	return {
		kind: 'directory',
		name,
		async getDirectoryHandle(child: string) {
			const value = entry(child);
			if (typeof value === 'string' || value instanceof Uint8Array) throw fail('TypeMismatchError');
			return directory(child, value);
		},
		async getFileHandle(child: string) {
			const value = entry(child);
			if (typeof value !== 'string' && !(value instanceof Uint8Array))
				throw fail('TypeMismatchError');
			return {
				kind: 'file',
				name: child,
				getFile: async () => new File([value as BlobPart], child)
			};
		}
	} as unknown as FileSystemDirectoryHandle;
}

const shop = directory('shop', {
	'.env': 'SECRET=1',
	'.env.example': 'SECRET=',
	src: {
		api: { 'routes.ts': 'export const routes = [];' },
		'logo.png': new Uint8Array([0x89, 0x50, 0x00, 0x00])
	},
	'big.ts': 'a'.repeat(500_001)
});

describe('readFolderFile', () => {
	it('reads a file by its path in the map', async () => {
		expect(await readFolderFile(shop, 'src/api/routes.ts')).toEqual({
			ok: true,
			content: 'export const routes = [];'
		});
		expect(await readFolderFile(shop, '.env.example')).toEqual({ ok: true, content: 'SECRET=' });
	});

	it('refuses a path that leaves the folder before touching it', async () => {
		for (const path of ['../secrets.txt', 'src/../../x', '/etc/passwd', 'src//api', './src']) {
			expect(await readFolderFile(shop, path), path).toEqual({ ok: false, reason: 'invalid-path' });
		}
	});

	it('refuses a name the platform refuses', async () => {
		const windows = directory('shop', {});
		windows.getFileHandle = async () => {
			throw new TypeError('Name is not allowed.');
		};

		expect(await readFolderFile(windows, 'a\\b.ts')).toEqual({ ok: false, reason: 'invalid-path' });
	});

	it('refuses an env file that holds values, a private key or a token file, in any case', async () => {
		for (const path of [
			'.env',
			'.ENV',
			'deploy/.env.Production',
			'certs/server.pem',
			'certs/TLS.KEY',
			'.ssh/id_rsa',
			'.ssh/id_ed25519.pub',
			'.npmrc',
			'home/.NETRC'
		]) {
			expect(await readFolderFile(shop, path), path).toEqual({ ok: false, reason: 'secret-file' });
		}
	});

	it('keeps reading files that only look close to a secret', () => {
		for (const path of [
			'.env.example',
			'.ENV.SAMPLE',
			'src/keys.ts',
			'src/monkey.ts',
			'id_card.ts'
		]) {
			expect(isSecretFile(path), path).toBe(false);
		}
	});

	it('reports a missing file, and a folder where the map has a file', async () => {
		expect(await readFolderFile(shop, 'src/gone.ts')).toEqual({ ok: false, reason: 'not-found' });
		expect(await readFolderFile(shop, 'lib/gone.ts')).toEqual({ ok: false, reason: 'not-found' });
		expect(await readFolderFile(shop, 'src/api')).toEqual({ ok: false, reason: 'not-found' });
	});

	it('refuses a file over 500 KB and a binary file', async () => {
		expect(await readFolderFile(shop, 'big.ts')).toEqual({ ok: false, reason: 'too-large' });
		expect(await readFolderFile(shop, 'src/logo.png')).toEqual({ ok: false, reason: 'binary' });
	});

	it('reports a read the browser refused, such as a revoked permission', async () => {
		const revoked = directory('shop', {});
		revoked.getFileHandle = async () => {
			throw fail('NotAllowedError');
		};

		expect(await readFolderFile(revoked, 'a.ts')).toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('samplePaths', () => {
	it('keeps every path of a small map, sorted, once', () => {
		expect(samplePaths(['b.ts', 'a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts']);
	});

	it('spreads the sample over a large map', () => {
		const paths = [
			...Array.from({ length: 90 }, (_, i) => `vendor/${String(i).padStart(2, '0')}.ts`),
			...Array.from({ length: 10 }, (_, i) => `app/${i}.ts`)
		];

		const sample = samplePaths(paths, 10);

		expect(sample).toHaveLength(10);
		expect(sample[0]).toBe('app/0.ts');
		expect(sample.filter((p) => p.startsWith('vendor/')).length).toBeGreaterThan(0);
	});

	it('leaves out paths it would not read', () => {
		expect(samplePaths(['.env', '../x', 'id_rsa', 'src/a.ts'])).toEqual(['src/a.ts']);
	});
});

describe('checkFolder', () => {
	const mapPaths = ['src/api/routes.ts', 'src/logo.png', 'big.ts', 'src/db/client.ts'];

	it('matches the folder the map was made from', async () => {
		const match = await checkFolder(shop, mapPaths);

		expect(match).toEqual({ checked: 4, found: 3, expectedPath: 'big.ts' });
		expect(folderMatches(match)).toBe(true);
	});

	it('does not match the parent of the project folder', async () => {
		const parent = directory('projects', { shop: {} });

		const match = await checkFolder(parent, mapPaths);

		expect(match).toEqual({ checked: 4, found: 0, expectedPath: 'big.ts' });
		expect(folderMatches(match)).toBe(false);
	});

	it('does not match when fewer than half of the files are there', async () => {
		expect(folderMatches({ checked: 8, found: 3, expectedPath: 'a' })).toBe(false);
		expect(folderMatches({ checked: 8, found: 4, expectedPath: 'a' })).toBe(true);
	});
});
