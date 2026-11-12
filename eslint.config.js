import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default ts.config(
	// Global ignores
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'**/dist/',
			'node_modules/',
			'static/',
			'*.config.js',
			'*.config.ts',
			'src/lib/workers/**',
			// Fixture sources: `--fix` would move the lines their truth files and graph.json cite
			'tests/fixtures/graphs/*/',
			'tests/fixtures/graphify/ids/'
		]
	},

	// Base JS/TS rules
	js.configs.recommended,
	...ts.configs.recommended,

	// TypeScript files
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: ts.parser,
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-empty-object-type': 'off',
			'no-console': 'warn'
		}
	},

	// Svelte files
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: ts.parser
			},
			globals: {
				...globals.browser
			}
		},
		rules: {
			// Svelte 5 runes are global — don't flag as undefined
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_|^\\$\\$(Props|Events|Slots)',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			// Allow reactive statements and runes
			'svelte/valid-compile': 'off',
			'svelte/no-at-html-tags': 'warn',
			// Too strict for existing codebase
			'svelte/require-each-key': 'warn',
			'svelte/no-unused-svelte-ignore': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},

	// .svelte.ts rune files — override Svelte parser with TS parser
	{
		files: ['**/*.svelte.ts'],
		languageOptions: {
			parser: ts.parser,
			globals: {
				...globals.browser
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-empty-object-type': 'off',
			'no-console': 'warn',
			// Svelte reactivity rules — warn only for existing code
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},

	// Scripts and test files (mjs)
	{
		files: ['scripts/**', 'tests/**', '**/*.mjs'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			'no-console': 'off',
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-require-imports': 'off'
		}
	},

	// JS config files
	{
		files: ['**/*.js'],
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off'
		}
	}
);
