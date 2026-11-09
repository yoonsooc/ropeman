import { describe, it, expect } from 'vitest';
import { detectLanguage, isSupported, getGrammarFile } from './languageDetector';

describe('detectLanguage', () => {
	it('detects Python from .py extension', () => {
		expect(detectLanguage('main.py')).toBe('python');
	});

	it('detects JavaScript from .js extension', () => {
		expect(detectLanguage('index.js')).toBe('javascript');
	});

	it('detects JavaScript from .jsx extension', () => {
		expect(detectLanguage('App.jsx')).toBe('javascript');
	});

	it('detects TypeScript from .ts extension', () => {
		expect(detectLanguage('service.ts')).toBe('typescript');
	});

	it('detects ES module and CommonJS extensions', () => {
		// Regression: .mjs/.cjs were unknown, so Node repositories such as archify sent almost no code
		expect(detectLanguage('render.mjs')).toBe('javascript');
		expect(detectLanguage('config.cjs')).toBe('javascript');
		expect(detectLanguage('tool.mts')).toBe('typescript');
		expect(detectLanguage('tool.cts')).toBe('typescript');
	});

	it('detects markdown, including Cursor .mdc rules, as a supported language without a grammar', () => {
		expect(detectLanguage('SKILL.md')).toBe('markdown');
		expect(detectLanguage('style.mdc')).toBe('markdown');
		expect(isSupported('markdown')).toBe(true);
		expect(getGrammarFile('markdown')).toBeNull();
	});

	it('detects TypeScript from .tsx extension', () => {
		expect(detectLanguage('Component.tsx')).toBe('typescript');
	});

	it('detects Go from .go extension', () => {
		expect(detectLanguage('main.go')).toBe('go');
	});

	it('detects Rust from .rs extension', () => {
		expect(detectLanguage('lib.rs')).toBe('rust');
	});

	it('detects Java from .java extension', () => {
		expect(detectLanguage('Main.java')).toBe('java');
	});

	it('detects C from .c extension', () => {
		expect(detectLanguage('main.c')).toBe('c');
	});

	it('detects C from .h extension', () => {
		expect(detectLanguage('header.h')).toBe('c');
	});

	it('detects C++ from .cpp extension', () => {
		expect(detectLanguage('main.cpp')).toBe('cpp');
	});

	it('detects C++ from .hpp extension', () => {
		expect(detectLanguage('header.hpp')).toBe('cpp');
	});

	it('detects Ruby from .rb extension', () => {
		expect(detectLanguage('app.rb')).toBe('ruby');
	});

	it('detects PHP from .php extension', () => {
		expect(detectLanguage('index.php')).toBe('php');
	});

	it('detects Swift from .swift extension', () => {
		expect(detectLanguage('ViewController.swift')).toBe('swift');
	});

	it('detects Kotlin from .kt extension', () => {
		expect(detectLanguage('Main.kt')).toBe('kotlin');
	});

	it('detects Kotlin from .kts extension', () => {
		expect(detectLanguage('build.gradle.kts')).toBe('kotlin');
	});

	it('detects Scala from .scala extension', () => {
		expect(detectLanguage('App.scala')).toBe('scala');
	});

	it('detects Scala from .sc extension', () => {
		expect(detectLanguage('script.sc')).toBe('scala');
	});

	it('detects C# from .cs extension', () => {
		expect(detectLanguage('Program.cs')).toBe('csharp');
	});

	it('returns null for unknown extensions', () => {
		expect(detectLanguage('file.xyz')).toBeNull();
		expect(detectLanguage('file.txt')).toBeNull();
		expect(detectLanguage('Makefile')).toBeNull();
	});

	it('handles files in nested paths', () => {
		expect(detectLanguage('src/lib/utils/helper.ts')).toBe('typescript');
		expect(detectLanguage('pkg/main.go')).toBe('go');
	});
});

describe('isSupported', () => {
	it('returns true for WASM-supported languages', () => {
		const supported = [
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
			'scala'
		];
		for (const lang of supported) {
			expect(isSupported(lang)).toBe(true);
		}
	});

	it('returns false for empty/unknown strings', () => {
		expect(isSupported('')).toBe(false);
		expect(isSupported('brainfuck')).toBe(false);
	});
});

describe('getGrammarFile', () => {
	it('returns WASM file path for supported languages', () => {
		expect(getGrammarFile('python')).toBe('tree-sitter-python.wasm');
		expect(getGrammarFile('javascript')).toBe('tree-sitter-javascript.wasm');
		expect(getGrammarFile('typescript')).toBe('tree-sitter-typescript.wasm');
		expect(getGrammarFile('go')).toBe('tree-sitter-go.wasm');
		expect(getGrammarFile('rust')).toBe('tree-sitter-rust.wasm');
		expect(getGrammarFile('java')).toBe('tree-sitter-java.wasm');
		expect(getGrammarFile('c')).toBe('tree-sitter-c.wasm');
		expect(getGrammarFile('cpp')).toBe('tree-sitter-cpp.wasm');
	});

	it('returns WASM file path for Tier 2 languages', () => {
		expect(getGrammarFile('ruby')).toBe('tree-sitter-ruby.wasm');
		expect(getGrammarFile('php')).toBe('tree-sitter-php.wasm');
		expect(getGrammarFile('swift')).toBe('tree-sitter-swift.wasm');
		expect(getGrammarFile('kotlin')).toBe('tree-sitter-kotlin.wasm');
		expect(getGrammarFile('csharp')).toBe('tree-sitter-c_sharp.wasm');
		expect(getGrammarFile('scala')).toBe('tree-sitter-scala.wasm');
	});

	it('returns null for unsupported languages', () => {
		expect(getGrammarFile('')).toBeNull();
		expect(getGrammarFile('brainfuck')).toBeNull();
	});
});
