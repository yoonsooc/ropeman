const EXTENSION_MAP: Record<string, string> = {
	'.py': 'python',
	'.js': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.jsx': 'javascript',
	'.ts': 'typescript',
	'.mts': 'typescript',
	'.cts': 'typescript',
	'.tsx': 'typescript',
	'.go': 'go',
	'.rs': 'rust',
	'.java': 'java',
	'.c': 'c',
	'.cpp': 'cpp',
	'.h': 'c',
	'.hpp': 'cpp',
	'.rb': 'ruby',
	'.php': 'php',
	'.swift': 'swift',
	'.kt': 'kotlin',
	'.kts': 'kotlin',
	'.scala': 'scala',
	'.sc': 'scala',
	'.cs': 'csharp',
	// Read through their <script> blocks with the TS/JS grammars (sfcScripts.ts)
	'.svelte': 'svelte',
	'.vue': 'vue',
	// Outlined without tree-sitter (markdownOutline.ts); `.mdc` is Cursor's rule format
	'.md': 'markdown',
	'.mdc': 'markdown'
};

/** Configuration formats read by line parsers (configParsers.ts) instead of a grammar. */
export const CONFIG_LANGUAGES = ['dockerfile', 'terraform', 'dotenv', 'makefile'] as const;

export type ConfigLanguage = (typeof CONFIG_LANGUAGES)[number];

// `.env` files hold real values, which are secrets; only templates of them, named by their last
// suffix (`.env.example`, `.env.local.sample`), are read, for the keys a service expects
const ENV_FILE = /^\.env(?:\..+)?$/;
const ENV_TEMPLATE = /^\.env(?:\.[^.]+)*\.(?:example|sample|template|dist|defaults)$/;

const fileName = (filePath: string) => filePath.substring(filePath.lastIndexOf('/') + 1);

/** `.env` or a variant of it (`.env.local`, `.env.example`): hidden, but kept on the map. */
export function isEnvFile(filePath: string): boolean {
	return ENV_FILE.test(fileName(filePath));
}

/** An env file with real values, which nothing reads: `.env` but not `.env.example`. */
export function isEnvValueFile(filePath: string): boolean {
	const name = fileName(filePath);
	return ENV_FILE.test(name) && !ENV_TEMPLATE.test(name);
}

// Matched against the file name, after EXTENSION_MAP, so `Dockerfile.ts` stays TypeScript.
// `.tfvars` is left out: it holds values, which may be secrets, and declares no structure.
const CONFIG_FILE_NAMES: readonly [RegExp, ConfigLanguage][] = [
	[/^(?:dockerfile|containerfile)(?:\..+)?$|\.dockerfile$/i, 'dockerfile'],
	[/\.tf$/, 'terraform'],
	[ENV_TEMPLATE, 'dotenv'],
	[/^(?:gnu)?makefile$|\.mk$/i, 'makefile']
];

/** The configuration format a file name declares, or null. */
export function detectConfigLanguage(filePath: string): ConfigLanguage | null {
	const name = fileName(filePath);
	return CONFIG_FILE_NAMES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

const SUPPORTED_LANGUAGES = new Set([
	'python',
	'javascript',
	'typescript',
	'go',
	'rust',
	'java',
	'c',
	'cpp',
	'ruby',
	'php',
	'swift',
	'kotlin',
	'csharp',
	'scala',
	'markdown',
	'svelte',
	'vue',
	...CONFIG_LANGUAGES
]);

const GRAMMAR_FILES: Record<string, string> = {
	python: 'tree-sitter-python.wasm',
	javascript: 'tree-sitter-javascript.wasm',
	typescript: 'tree-sitter-typescript.wasm',
	go: 'tree-sitter-go.wasm',
	rust: 'tree-sitter-rust.wasm',
	java: 'tree-sitter-java.wasm',
	c: 'tree-sitter-c.wasm',
	cpp: 'tree-sitter-cpp.wasm',
	ruby: 'tree-sitter-ruby.wasm',
	php: 'tree-sitter-php.wasm',
	swift: 'tree-sitter-swift.wasm',
	kotlin: 'tree-sitter-kotlin.wasm',
	csharp: 'tree-sitter-c_sharp.wasm',
	scala: 'tree-sitter-scala.wasm'
};

function extensionOf(filePath: string): string {
	return filePath.substring(filePath.lastIndexOf('.'));
}

export function detectLanguage(filename: string): string | null {
	return EXTENSION_MAP[extensionOf(filename)] ?? detectConfigLanguage(filename);
}

export function isSupported(language: string): boolean {
	return SUPPORTED_LANGUAGES.has(language);
}

// `.tsx` stays the typescript language, but only the tsx grammar reads JSX.
// `.ts` keeps the typescript grammar because tsx misreads `<T>value` casts as JSX.
export function getGrammarFile(language: string, filePath: string): string | null {
	if (language === 'typescript' && extensionOf(filePath) === '.tsx') return 'tree-sitter-tsx.wasm';
	return GRAMMAR_FILES[language] ?? null;
}
