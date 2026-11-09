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

export function detectLanguage(filename: string): string | null {
	const ext = filename.substring(filename.lastIndexOf('.'));
	return EXTENSION_MAP[ext] ?? null;
}

export function isSupported(language: string): boolean {
	return SUPPORTED_LANGUAGES.has(language);
}

export function getGrammarFile(language: string): string | null {
	const grammarMap: Record<string, string> = {
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
	return grammarMap[language] ?? null;
}
