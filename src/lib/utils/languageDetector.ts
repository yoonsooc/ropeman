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
	// Outlined without tree-sitter (markdownOutline.ts); `.mdc` is Cursor's rule format
	'.md': 'markdown',
	'.mdc': 'markdown'
};

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
	'markdown'
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
	return EXTENSION_MAP[extensionOf(filename)] ?? null;
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
