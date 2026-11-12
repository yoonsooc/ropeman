// Writes static/ copies of tree-sitter-wasms grammars whose imports web-tree-sitter 0.25 does not
// export. A missing import fails only when the parser first calls it, so the grammar loads and
// then throws "resolved is not a function" mid-parse. The YAML scanner is C++ and imports
// `operator new`, `operator delete` and a vector length error; the Bash scanner imports
// `isalpha`. Renaming them to `malloc`, `free`, `abort` and `iswalpha` links them to the
// runtime's own functions, which take the same arguments.
// Run: node scripts/alias-grammar-imports.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @type {Record<string, Record<string, string>>} */
export const GRAMMAR_IMPORT_ALIASES = {
	'tree-sitter-yaml.wasm': {
		_Znwm: 'malloc',
		_ZdlPv: 'free',
		_ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv: 'abort'
	},
	'tree-sitter-bash.wasm': { isalpha: 'iswalpha' }
};

const IMPORT_SECTION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The module with each `env` import named in `aliases` renamed; all other bytes are kept.
 * @param {Uint8Array} bytes
 * @param {Record<string, string>} aliases
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function aliasImports(bytes, aliases) {
	const parts = [bytes.subarray(0, 8)];
	let at = 8;
	const readU32 = () => {
		let value = 0;
		let shift = 0;
		let byte;
		do {
			byte = bytes[at++];
			value |= (byte & 0x7f) << shift;
			shift += 7;
		} while (byte & 0x80);
		return value >>> 0;
	};
	const readName = () => {
		const length = readU32();
		const name = decoder.decode(bytes.subarray(at, at + length));
		at += length;
		return name;
	};
	const skipLimits = () => {
		const flags = bytes[at++];
		readU32();
		if (flags & 1) readU32();
	};

	while (at < bytes.length) {
		const id = bytes[at++];
		const size = readU32();
		const end = at + size;
		if (id !== IMPORT_SECTION) {
			parts.push(Uint8Array.of(id, ...u32(size)), bytes.subarray(at, end));
			at = end;
			continue;
		}
		const count = readU32();
		const body = [...u32(count)];
		for (let i = 0; i < count; i++) {
			const module = readName();
			const field = readName();
			const renamed = module === 'env' ? (aliases[field] ?? field) : field;
			body.push(...name(module), ...name(renamed));
			const descriptor = at;
			const kind = bytes[at++];
			if (kind === 0) {
				readU32();
			} else if (kind === 1) {
				at++;
				skipLimits();
			} else if (kind === 2) {
				skipLimits();
			} else if (kind === 3) {
				at += 2;
			} else {
				throw new Error(`unknown import kind ${kind}`);
			}
			body.push(...bytes.subarray(descriptor, at));
		}
		if (at !== end) throw new Error('import section length does not match its entries');
		parts.push(Uint8Array.of(id, ...u32(body.length)), Uint8Array.from(body));
	}

	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** @param {number} value */
function u32(value) {
	const out = [];
	do {
		let byte = value & 0x7f;
		value >>>= 7;
		if (value) byte |= 0x80;
		out.push(byte);
	} while (value);
	return out;
}

/** @param {string} text */
function name(text) {
	const bytes = encoder.encode(text);
	return [...u32(bytes.length), ...bytes];
}

const root = fileURLToPath(new URL('..', import.meta.url));
/** @param {string} file */
export const upstreamGrammar = (file) => `${root}node_modules/tree-sitter-wasms/out/${file}`;
/** @param {string} file */
export const servedGrammar = (file) => `${root}static/${file}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	for (const [file, aliases] of Object.entries(GRAMMAR_IMPORT_ALIASES)) {
		fs.writeFileSync(
			servedGrammar(file),
			aliasImports(fs.readFileSync(upstreamGrammar(file)), aliases)
		);
	}
}
