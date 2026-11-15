// Rebuilds the tree-sitter .wasm files in static/ from scripts/grammars/manifest.json: each grammar
// is the .wasm its upstream repository attaches to the release named in the manifest, checked
// against the recorded sha256, and the engine is the one in node_modules/web-tree-sitter.
// Files in static/ the manifest does not name are removed, so a run always ends in the same state.
//
//   node scripts/grammars/fetch.mjs            download and verify (fails on a changed hash)
//   node scripts/grammars/fetch.mjs --update   after editing a version: record its commit, hash and ABI
//
// ADR-0027 explains the sourcing and how to roll back.
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = `${root}scripts/grammars/manifest.json`;
const staticDir = `${root}static/`;
const engineDir = `${root}node_modules/web-tree-sitter/`;
export const ENGINE_FILE = 'web-tree-sitter.wasm';

export const releaseUrl = ({ repo, version, file }) =>
	`https://github.com/${repo}/releases/download/${version}/${file}`;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function readManifest() {
	return JSON.parse(await readFile(manifestPath, 'utf8'));
}

async function download(grammar) {
	const url = releaseUrl(grammar);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

async function tagCommit({ repo, version }) {
	const response = await fetch(`https://api.github.com/repos/${repo}/commits/${version}`);
	if (!response.ok) throw new Error(`${repo}@${version}: HTTP ${response.status}`);
	return (await response.json()).sha;
}

async function abiVersions(files) {
	const { Language, Parser } = await import('web-tree-sitter');
	await Parser.init({ locateFile: () => `${engineDir}${ENGINE_FILE}` });
	const versions = new Map();
	for (const file of files)
		versions.set(file, (await Language.load(`${staticDir}${file}`)).abiVersion);
	return versions;
}

async function main() {
	const update = process.argv.includes('--update');
	const manifest = await readManifest();
	const wanted = new Set(manifest.grammars.map((g) => g.file));
	// Every download is checked before static/ changes, so a failed run leaves it as it was
	const downloads = [];
	for (const grammar of manifest.grammars) {
		const bytes = await download(grammar);
		const hash = sha256(bytes);
		if (!update && hash !== grammar.sha256) {
			throw new Error(
				`${grammar.file}: ${releaseUrl(grammar)} has sha256 ${hash}, the manifest says ${grammar.sha256}`
			);
		}
		grammar.sha256 = hash;
		downloads.push([grammar, bytes]);
	}

	for (const file of await readdir(staticDir)) {
		if (/^tree-sitter.*\.wasm$/.test(file) && !wanted.has(file)) await rm(`${staticDir}${file}`);
	}
	await copyFile(`${engineDir}${ENGINE_FILE}`, `${staticDir}${ENGINE_FILE}`);
	for (const [grammar, bytes] of downloads) {
		await writeFile(`${staticDir}${grammar.file}`, bytes);
		process.stdout.write(`${grammar.file} ${grammar.repo}@${grammar.version}\n`);
	}

	if (update) {
		const abi = await abiVersions([...wanted]);
		for (const grammar of manifest.grammars) {
			grammar.abi = abi.get(grammar.file);
			grammar.commit = await tagCommit(grammar);
		}
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
