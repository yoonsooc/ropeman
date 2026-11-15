import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Language, LANGUAGE_VERSION, MIN_COMPATIBLE_VERSION, Parser } from 'web-tree-sitter';
import { ALL_GRAMMAR_FILES } from '$lib/utils/languageDetector';
import { ENGINE_FILE, readManifest, sha256 } from './fetch.mjs';

interface Grammar {
	file: string;
	repo: string;
	version: string;
	commit: string;
	obtained: string;
	abi: number;
	license: string;
	sha256: string;
}

const staticDir = fileURLToPath(new URL('../../static/', import.meta.url));
const engineDir = fileURLToPath(new URL('../../node_modules/web-tree-sitter/', import.meta.url));
let grammars: Grammar[];

beforeAll(async () => {
	grammars = (await readManifest()).grammars;
});

// static/ is what the browser, the Node extractor and the bridge tarball load. A file changed by
// hand, or a web-tree-sitter bump without `node scripts/grammars/fetch.mjs`, fails here.
describe('static/ against scripts/grammars/manifest.json', () => {
	it('holds exactly the grammars the manifest lists, and those cover every language', () => {
		const files = readdirSync(staticDir).filter((f) => /^tree-sitter-.+\.wasm$/.test(f));

		expect(files.sort()).toEqual(grammars.map((g) => g.file).sort());
		expect(ALL_GRAMMAR_FILES.filter((f) => !files.includes(f))).toEqual([]);
	});

	it('serves the engine .wasm of the installed web-tree-sitter', () => {
		const served = readFileSync(`${staticDir}${ENGINE_FILE}`);
		const installed = readFileSync(`${engineDir}${ENGINE_FILE}`);

		expect(sha256(served), 'run node scripts/grammars/fetch.mjs').toBe(sha256(installed));
	});

	it('records each grammar file byte for byte', () => {
		const changed = grammars.filter(
			(g) => sha256(readFileSync(`${staticDir}${g.file}`)) !== g.sha256
		);

		expect(changed.map((g) => g.file)).toEqual([]);
	});

	it('records an ABI version the engine accepts', async () => {
		await Parser.init({ locateFile: () => `${staticDir}${ENGINE_FILE}` });
		const abi: Record<string, number> = {};
		for (const { file } of grammars)
			abi[file] = (await Language.load(`${staticDir}${file}`)).abiVersion;

		expect(abi).toEqual(Object.fromEntries(grammars.map((g) => [g.file, g.abi])));
		for (const version of Object.values(abi)) {
			expect(version).toBeGreaterThanOrEqual(MIN_COMPATIBLE_VERSION);
			expect(version).toBeLessThanOrEqual(LANGUAGE_VERSION);
		}
	});
});
