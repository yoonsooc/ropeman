import { describe, it, expect } from 'vitest';
import {
	detectLanguage,
	isSupported,
	getGrammarFile,
	isEnvFile,
	isEnvValueFile
} from './languageDetector';

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
		expect(getGrammarFile('markdown', 'SKILL.md')).toBeNull();
	});

	it('detects Svelte and Vue components as supported languages read through their scripts', () => {
		// Regression: .svelte had no language, so Ropeman could not read its own components
		expect(detectLanguage('src/lib/components/Header.svelte')).toBe('svelte');
		expect(detectLanguage('src/components/App.vue')).toBe('vue');
		expect(isSupported('svelte')).toBe(true);
		expect(isSupported('vue')).toBe(true);
		expect(getGrammarFile('svelte', 'Header.svelte')).toBeNull();
	});

	it('detects Dockerfile, Terraform, env templates and Makefile by name as supported languages without a grammar', () => {
		const names: [string, string][] = [
			['Dockerfile', 'dockerfile'],
			['docker/Dockerfile.agents.example', 'dockerfile'],
			['services/api.Dockerfile', 'dockerfile'],
			['Containerfile', 'dockerfile'],
			['infra/main.tf', 'terraform'],
			['packages/server/.env.example', 'dotenv'],
			['.env.sample', 'dotenv'],
			['.env.template', 'dotenv'],
			['.env.dist', 'dotenv'],
			['.env.defaults', 'dotenv'],
			['.env.local.example', 'dotenv'],
			['Makefile', 'makefile'],
			['GNUmakefile', 'makefile'],
			['build/rules.mk', 'makefile']
		];
		for (const [path, language] of names) {
			expect(detectLanguage(path)).toBe(language);
			expect(isSupported(language)).toBe(true);
			expect(getGrammarFile(language, path)).toBeNull();
		}
	});

	it('keeps code extensions ahead of config names and leaves value files out', () => {
		expect(detectLanguage('Dockerfile.ts')).toBe('typescript');
		expect(detectLanguage('src/makefile.py')).toBe('python');
		// .tfvars and *.env hold values, which may be secrets, and declare no structure
		expect(detectLanguage('prod.tfvars')).toBeNull();
		expect(detectLanguage('prod.env')).toBeNull();
		expect(detectLanguage('Makefile.in')).toBeNull();
		expect(detectLanguage('.envrc')).toBeNull();
	});

	it('reads no env file with real values, only templates of one', () => {
		// Regression: pasted secret values in a real .env were read into key names
		const real = ['.env', '.env.local', '.env.production', 'api/.env.staging', '.env.example.bak'];
		const templates = ['.env.example', 'api/.env.sample', '.env.production.template'];

		expect(real.map(detectLanguage)).toEqual(real.map(() => null));
		expect(real.every(isEnvValueFile)).toBe(true);
		expect(templates.map(detectLanguage)).toEqual(templates.map(() => 'dotenv'));
		expect(templates.some(isEnvValueFile)).toBe(false);
		expect([...real, ...templates].every(isEnvFile)).toBe(true);
		expect(['.envrc', 'prod.env', 'src/env.ts'].some(isEnvFile)).toBe(false);
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
		expect(detectLanguage('LICENSE')).toBeNull();
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
		expect(getGrammarFile('python', 'main.py')).toBe('tree-sitter-python.wasm');
		expect(getGrammarFile('javascript', 'index.js')).toBe('tree-sitter-javascript.wasm');
		expect(getGrammarFile('typescript', 'service.ts')).toBe('tree-sitter-typescript.wasm');
		expect(getGrammarFile('go', 'main.go')).toBe('tree-sitter-go.wasm');
		expect(getGrammarFile('rust', 'lib.rs')).toBe('tree-sitter-rust.wasm');
		expect(getGrammarFile('java', 'Main.java')).toBe('tree-sitter-java.wasm');
		expect(getGrammarFile('c', 'main.c')).toBe('tree-sitter-c.wasm');
		expect(getGrammarFile('cpp', 'main.cpp')).toBe('tree-sitter-cpp.wasm');
	});

	it('returns WASM file path for Tier 2 languages', () => {
		expect(getGrammarFile('ruby', 'app.rb')).toBe('tree-sitter-ruby.wasm');
		expect(getGrammarFile('php', 'index.php')).toBe('tree-sitter-php.wasm');
		expect(getGrammarFile('swift', 'App.swift')).toBe('tree-sitter-swift.wasm');
		expect(getGrammarFile('kotlin', 'Main.kt')).toBe('tree-sitter-kotlin.wasm');
		expect(getGrammarFile('csharp', 'Program.cs')).toBe('tree-sitter-c_sharp.wasm');
		expect(getGrammarFile('scala', 'App.scala')).toBe('tree-sitter-scala.wasm');
	});

	it('picks the tsx grammar for .tsx and keeps .ts on the typescript grammar', () => {
		expect(getGrammarFile('typescript', 'src/App.tsx')).toBe('tree-sitter-tsx.wasm');
		expect(getGrammarFile('typescript', 'src/app.ts')).toBe('tree-sitter-typescript.wasm');
		expect(getGrammarFile('typescript', 'src/tool.mts')).toBe('tree-sitter-typescript.wasm');
	});

	it('returns null for unsupported languages', () => {
		expect(getGrammarFile('', 'file')).toBeNull();
		expect(getGrammarFile('brainfuck', 'prog.bf')).toBeNull();
	});
});
