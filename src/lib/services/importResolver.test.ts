import { describe, it, expect } from 'vitest';
import {
	collectResolverConfigs,
	isResolverConfig,
	namedConfigs,
	readResolverConfig,
	resolveImports
} from './importResolver';
import { buildCodeMap, fileFromAst } from './codeMapBuilder';
import { toWireFile } from './skeletonExtractor';
import type { ASTSymbol } from '$lib/types/ast';
import type { CodeMap, FilePath, FileRecord, ModuleSite } from '$lib/types/codeMap';

const ROOT = 'app';

type Source = { imports?: string[]; symbols?: ASTSymbol[] };

function astOf({ imports = [], symbols = [] }: Source): ASTSymbol[] {
	return [
		...imports.map((name, i) => ({
			name,
			kind: 'import' as const,
			lineStart: i + 1,
			lineEnd: i + 1
		})),
		...symbols
	];
}

const fn = (name: string, extra: Partial<ASTSymbol> = {}): ASTSymbol => ({
	name,
	kind: 'function',
	lineStart: 10,
	lineEnd: 12,
	...extra
});

/** Parse `files` the way the loader keys them (`app/...`) and resolve with `configs`. */
function resolve(files: Record<string, Source>, configs: Record<string, string> = {}) {
	const map: CodeMap = {
		version: 2,
		root: ROOT,
		files: new Map(
			Object.entries(files).map(([path, source]) => {
				const record = fileFromAst(`${ROOT}/${path}`, astOf(source));
				return [record.path, record];
			})
		)
	};
	const texts = new Map(Object.entries(configs).map(([path, text]) => [`${ROOT}/${path}`, text]));
	return resolveImports(map, readResolverConfig(texts));
}

function site(result: ReturnType<typeof resolve>, path: string, index = 0): ModuleSite {
	return result.map.files.get(`${ROOT}/${path}` as FilePath)!.imports[index];
}

/** The file a site's module binding points at, or its state when it points at no file. */
function target(result: ReturnType<typeof resolve>, path: string, index = 0): string {
	const { module } = site(result, path, index);
	if (module.state !== 'bound') return module.state;
	const [first] = module.candidates;
	return first.to.kind === 'file' ? first.to.path : `external:${first.to.module}`;
}

function outcome(result: ReturnType<typeof resolve>, path: string, index = 0) {
	return result.outcomes.filter((o) => o.path === `${ROOT}/${path}`)[index].resolution;
}

const json = (value: unknown) => JSON.stringify(value);

describe('relative imports', () => {
	it('adds the extension, falls back to index, and maps a written .js to its .ts source', () => {
		// Arrange
		const files = {
			'src/a.ts': {
				imports: [
					"import { b } from './b'",
					"import c from './c'",
					"import { d } from '../lib/d.js'",
					"import Card from './Card.svelte'",
					"import { e } from './e'"
				]
			},
			'src/b.ts': {},
			'src/b.js': {},
			'src/c/index.tsx': {},
			'lib/d.ts': {},
			'src/Card.svelte': {},
			'src/e.jsx': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect([0, 1, 2, 3, 4].map((i) => target(result, 'src/a.ts', i))).toEqual([
			'app/src/b.ts',
			'app/src/c/index.tsx',
			'app/lib/d.ts',
			'app/src/Card.svelte',
			'app/src/e.jsx'
		]);
		expect(outcome(result, 'src/a.ts')).toEqual({
			status: 'file',
			rule: 'relative',
			paths: ['app/src/b.ts']
		});
	});

	it('falls back to a declaration file and drops a bundler query (PASEO platform files)', () => {
		// Arrange
		const files = {
			'input.tsx': {
				imports: [
					"import { measure } from './height'",
					"import { connect } from './msp.js'",
					"import log from './CHANGELOG.md?raw'"
				]
			},
			'height.d.ts': {},
			'height.native.ts': {},
			'height.web.ts': {},
			'msp.d.ts': {},
			'CHANGELOG.md': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect([0, 1, 2].map((i) => target(result, 'input.tsx', i))).toEqual([
			'app/height.d.ts',
			'app/msp.d.ts',
			'app/CHANGELOG.md'
		]);
	});

	it('reports a missing file and a path that climbs out of the project as unresolved', () => {
		// Arrange
		const files = {
			'a.ts': { imports: ["import x from './missing'", "import y from '../../outside'"] }
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(site(result, 'a.ts', 0).module).toEqual({ state: 'unresolved' });
		expect(outcome(result, 'a.ts', 0)).toEqual({
			status: 'unresolved',
			rule: 'relative',
			reason: 'no-file'
		});
		expect(outcome(result, 'a.ts', 1)).toMatchObject({ reason: 'outside-root' });
	});
});

describe('specifiers', () => {
	it('binds default, named and namespace names to the symbols and file they load', () => {
		// Arrange
		const files = {
			'main.ts': {
				imports: [
					`import Store, {\n  save as persist, // keep\n  type Draft,\n} from './store'`,
					"import * as store from './store'",
					"import type { Schema } from './store'",
					"import './polyfill'"
				]
			},
			'store.ts': {
				symbols: [fn('Store', { kind: 'class', badges: ['export_default'] }), fn('save')]
			},
			'polyfill.ts': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		const evidence = { source: 'resolver', confidence: 'EXTRACTED' };
		expect(site(result, 'main.ts', 0).specifiers).toEqual([
			{
				local: 'Store',
				typeOnly: false,
				kind: 'default',
				target: {
					state: 'bound',
					candidates: [{ to: { kind: 'symbol', id: 'app/store.ts#Store' }, provenance: evidence }]
				}
			},
			{
				local: 'persist',
				typeOnly: false,
				kind: 'named',
				name: 'save',
				target: {
					state: 'bound',
					candidates: [{ to: { kind: 'symbol', id: 'app/store.ts#save' }, provenance: evidence }]
				}
			},
			{
				local: 'Draft',
				typeOnly: true,
				kind: 'named',
				name: 'Draft',
				target: { state: 'unresolved' }
			}
		]);
		expect(site(result, 'main.ts', 1).specifiers).toEqual([
			{
				local: 'store',
				typeOnly: false,
				kind: 'namespace',
				target: {
					state: 'bound',
					candidates: [{ to: { kind: 'file', path: 'app/store.ts' }, provenance: evidence }]
				}
			}
		]);
		expect(site(result, 'main.ts', 2).specifiers).toMatchObject([
			{ local: 'Schema', typeOnly: true, kind: 'named' }
		]);
		expect(site(result, 'main.ts', 3).specifiers).toEqual([]);
		expect(target(result, 'main.ts', 3)).toBe('app/polyfill.ts');
	});

	it('points package imports at the package and the member they name', () => {
		// Arrange
		const files = {
			'a.ts': {
				imports: [
					"import React, { useState } from 'react'",
					"import { z } from '@scope/kit/sub'",
					"import fs from 'node:fs'"
				]
			}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(site(result, 'a.ts', 0).module).toEqual({
			state: 'bound',
			candidates: [
				{
					to: { kind: 'external', module: 'react', name: null },
					provenance: { source: 'resolver', confidence: 'EXTRACTED' }
				}
			]
		});
		expect(
			site(result, 'a.ts', 0).specifiers!.map(
				(s) => s.target.state === 'bound' && s.target.candidates[0].to
			)
		).toEqual([
			{ kind: 'external', module: 'react', name: 'default' },
			{ kind: 'external', module: 'react', name: 'useState' }
		]);
		expect(target(result, 'a.ts', 1)).toBe('external:@scope/kit');
		expect(target(result, 'a.ts', 2)).toBe('external:node:fs');
	});
});

describe('re-exports', () => {
	it('follows names through a barrel to the file that declares them', () => {
		// Arrange: re-export sites as the parser would report them
		const files = {
			'main.ts': {
				imports: ["import { formatDate, Logger, createId, Missing } from './core'"]
			},
			'core/index.ts': {
				imports: [
					"export * from './format'",
					"export { Logger } from './logger'",
					"export { default as createId } from './id'"
				]
			},
			'core/format.ts': { symbols: [fn('formatDate')] },
			'core/logger.ts': { symbols: [fn('Logger', { kind: 'class' })] },
			'core/id.ts': { symbols: [fn('makeId', { badges: ['export_default'] })] }
		};

		// Act
		const result = resolve(files);

		// Assert
		const ids = site(result, 'main.ts').specifiers!.map((s) =>
			s.target.state === 'bound' ? s.target.candidates[0].to : s.target.state
		);
		expect(ids).toEqual([
			{ kind: 'symbol', id: 'app/core/format.ts#formatDate' },
			{ kind: 'symbol', id: 'app/core/logger.ts#Logger' },
			{ kind: 'symbol', id: 'app/core/id.ts#makeId' },
			'unresolved'
		]);
		const barrel = result.map.files.get('app/core/index.ts' as FilePath)!;
		expect(barrel.imports).toEqual([]);
		expect(barrel.reexports.map((r) => r.module.state)).toEqual(['bound', 'bound', 'bound']);
	});

	it('follows a name an __init__.py imports, and stops on a re-export cycle', () => {
		// Arrange
		const files = {
			'cli.py': { imports: ['from shop import OrderService', 'from loop import thing'] },
			'shop/__init__.py': { imports: ['from .service import OrderService'] },
			'shop/service.py': { symbols: [fn('OrderService', { kind: 'class' })] },
			'loop/__init__.py': { imports: ['from .a import thing'] },
			'loop/a.py': { imports: ['from . import thing'] }
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(site(result, 'cli.py', 0).specifiers![0].target).toMatchObject({
			state: 'bound',
			candidates: [{ to: { kind: 'symbol', id: 'app/shop/service.py#OrderService' } }]
		});
		expect(site(result, 'cli.py', 1).specifiers![0].target).toEqual({ state: 'unresolved' });
	});
});

describe('tsconfig paths', () => {
	it('reads paths and baseUrl through extends, with comments and trailing commas', () => {
		// Arrange
		const configs = {
			'tsconfig.base.json': `{
				// shared by every package
				"compilerOptions": {
					"baseUrl": ".",
					"paths": { "@shared/*": ["shared/*"], "@shared/special": ["special/index.ts"], },
				},
			}`,
			'packages/web/tsconfig.json': json({ extends: '../../tsconfig.base.json' })
		};
		const files = {
			'packages/web/src/a.ts': {
				imports: [
					"import { x } from '@shared/x'",
					"import s from '@shared/special'",
					"import { y } from 'utils/y'"
				]
			},
			'shared/x.ts': {},
			'special/index.ts': {},
			'utils/y.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(outcome(result, 'packages/web/src/a.ts', 0)).toEqual({
			status: 'file',
			rule: 'tsconfig-paths',
			paths: ['app/shared/x.ts']
		});
		expect(target(result, 'packages/web/src/a.ts', 1)).toBe('app/special/index.ts');
		expect(outcome(result, 'packages/web/src/a.ts', 2)).toMatchObject({
			rule: 'base-url',
			paths: ['app/utils/y.ts']
		});
	});

	it('resolves paths against the config that wrote them when there is no baseUrl', () => {
		// Arrange
		const configs = {
			'packages/app/tsconfig.json': json({
				extends: 'expo/tsconfig.base',
				compilerOptions: { paths: { '@/*': ['./src/*'] } }
			})
		};
		const files = {
			'packages/app/src/screens/home.tsx': { imports: ["import { Button } from '@/ui/button'"] },
			'packages/app/src/ui/button.tsx': { symbols: [fn('Button')] }
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'packages/app/src/screens/home.tsx')).toBe(
			'app/packages/app/src/ui/button.tsx'
		);
		expect(site(result, 'packages/app/src/screens/home.tsx').specifiers![0].target).toMatchObject({
			state: 'bound',
			candidates: [{ to: { kind: 'symbol', id: 'app/packages/app/src/ui/button.tsx#Button' } }]
		});
	});

	it('uses tsconfig.*.json when a folder has no tsconfig.json (PASEO packages/server)', () => {
		// Arrange
		const configs = {
			'packages/server/tsconfig.server.json': json({
				compilerOptions: { paths: { '@server/*': ['./src/*'] }, outDir: './dist', rootDir: './src' }
			})
		};
		const files = {
			'packages/server/src/utils/git.test.ts': {
				imports: ["import { run } from '@server/utils/spawn.js'"]
			},
			'packages/server/src/utils/spawn.ts': { symbols: [fn('run')] }
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'packages/server/src/utils/git.test.ts')).toBe(
			'app/packages/server/src/utils/spawn.ts'
		);
	});

	it('reports an alias whose target is missing as unresolved, not as a package', () => {
		// Arrange
		const configs = {
			'tsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
		};
		const files = { 'src/a.ts': { imports: ["import x from '@/gone'"] } };

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(outcome(result, 'src/a.ts')).toEqual({
			status: 'unresolved',
			rule: 'tsconfig-paths',
			reason: 'no-file'
		});
	});
});

describe('workspace packages', () => {
	const workspace = {
		'package.json': json({ name: 'root', workspaces: ['packages/*'] }),
		'packages/ui/package.json': json({
			name: '@acme/ui',
			exports: {
				'.': { types: './dist/index.d.ts', default: './dist/index.js' },
				'./button': { source: './src/button.ts', default: './dist/button.js' },
				'./icons/*': './dist/icons/*.js'
			}
		}),
		'packages/ui/tsconfig.json': json({ compilerOptions: { outDir: './dist', rootDir: './src' } }),
		'packages/legacy/package.json': json({ name: 'legacy', main: 'build/index.js' }),
		'packages/srv/package.json': json({
			name: '@acme/srv',
			types: './dist/server/server/exports.d.ts'
		}),
		'packages/srv/tsconfig.server.json': json({
			compilerOptions: { outDir: './dist/server', rootDir: './src' }
		}),
		'packages/broken/package.json': json({ name: 'broken', main: './dist/index.js' }),
		'tools/package.json': json({ name: 'not-a-workspace' })
	};
	const files = {
		'packages/web/src/a.ts': {
			imports: [
				"import { Ui } from '@acme/ui'",
				"import { Button } from '@acme/ui/button'",
				"import Star from '@acme/ui/icons/star'",
				"import old from 'legacy'",
				"import b from 'broken'",
				"import t from 'not-a-workspace'",
				"import { serve } from '@acme/srv'"
			]
		},
		'packages/ui/src/index.ts': { symbols: [fn('Ui')] },
		'packages/ui/src/button.ts': { symbols: [fn('Button')] },
		'packages/ui/src/icons/star.tsx': {},
		'packages/legacy/src/index.js': {},
		'packages/srv/src/server/exports.ts': {},
		'tools/index.ts': {}
	};

	it('maps exports, main and wildcard entries from the build folder back to source', () => {
		// Act
		const result = resolve(files, workspace);

		// Assert
		expect([0, 1, 2, 3].map((i) => target(result, 'packages/web/src/a.ts', i))).toEqual([
			'app/packages/ui/src/index.ts',
			'app/packages/ui/src/button.ts',
			'app/packages/ui/src/icons/star.tsx',
			'app/packages/legacy/src/index.js'
		]);
		expect(target(result, 'packages/web/src/a.ts', 6)).toBe(
			'app/packages/srv/src/server/exports.ts'
		);
		expect(outcome(result, 'packages/web/src/a.ts', 0)).toMatchObject({ rule: 'workspace' });
		expect(site(result, 'packages/web/src/a.ts', 0).specifiers![0].target).toMatchObject({
			state: 'bound',
			candidates: [{ to: { kind: 'symbol', id: 'app/packages/ui/src/index.ts#Ui' } }]
		});
	});

	it('says which package has no entry, and treats a package outside the workspaces as external', () => {
		// Act
		const result = resolve(files, workspace);

		// Assert
		expect(outcome(result, 'packages/web/src/a.ts', 4)).toEqual({
			status: 'unresolved',
			rule: 'workspace',
			reason: 'no-entry'
		});
		expect(target(result, 'packages/web/src/a.ts', 5)).toBe('external:not-a-workspace');
	});

	it('reads the package list of pnpm-workspace.yaml', () => {
		// Arrange
		const configs = {
			'pnpm-workspace.yaml': 'packages:\n  - \'libs/*\' # shared\n  - "!libs/skip"\nother: true\n',
			'libs/core/package.json': json({ name: '@x/core', main: 'src/index.ts' }),
			'libs/skip/package.json': json({ name: '@x/skip', main: 'index.ts' })
		};
		const pnpmFiles = {
			'apps/a.ts': { imports: ["import c from '@x/core'", "import s from '@x/skip'"] },
			'libs/core/src/index.ts': {},
			'libs/skip/index.ts': {}
		};

		// Act
		const result = resolve(pnpmFiles, configs);

		// Assert
		expect(target(result, 'apps/a.ts', 0)).toBe('app/libs/core/src/index.ts');
		expect(target(result, 'apps/a.ts', 1)).toBe('external:@x/skip');
	});
});

describe('SvelteKit aliases', () => {
	it('resolves $lib to src/lib when there is no svelte.config', () => {
		// Arrange
		const files = {
			'src/routes/+page.svelte': {
				imports: ["import { store } from '$lib/stores/store.svelte'", "import { a } from '$lib'"]
			},
			'src/lib/stores/store.svelte.ts': { symbols: [fn('store')] },
			'src/lib/index.ts': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(outcome(result, 'src/routes/+page.svelte')).toEqual({
			status: 'file',
			rule: 'sveltekit-alias',
			paths: ['app/src/lib/stores/store.svelte.ts']
		});
		expect(target(result, 'src/routes/+page.svelte', 1)).toBe('app/src/lib/index.ts');
	});

	it('reads files.lib and kit.alias from svelte.config', () => {
		// Arrange
		const configs = {
			'web/svelte.config.js': `const config = {
				kit: {
					files: { lib: 'source/library' },
					alias: { $components: 'source/components', '$utils/*': 'source/utils/*' }
				}
			};
			export default config;`
		};
		const files = {
			'web/source/routes/a.ts': {
				imports: [
					"import x from '$lib/x'",
					"import Card from '$components/Card.svelte'",
					"import { f } from '$utils/f'"
				]
			},
			'web/source/library/x.ts': {},
			'web/source/components/Card.svelte': {},
			'web/source/utils/f.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect([0, 1, 2].map((i) => target(result, 'web/source/routes/a.ts', i))).toEqual([
			'app/web/source/library/x.ts',
			'app/web/source/components/Card.svelte',
			'app/web/source/utils/f.ts'
		]);
	});
});

describe('Python imports', () => {
	it('resolves relative imports, submodules and package modules, and leaves the rest external', () => {
		// Arrange
		const files = {
			'svc/api/views.py': {
				imports: [
					'from .models import User, Missing',
					'from . import helpers as h',
					'from ..core import (\n    settings,\n)',
					'import svc.core.db',
					'import os',
					'from typing import *'
				]
			},
			'svc/__init__.py': {},
			'svc/api/__init__.py': {},
			'svc/api/models.py': { symbols: [fn('User', { kind: 'class' })] },
			'svc/api/helpers.py': {},
			'svc/core/__init__.py': { symbols: [fn('settings')] },
			'svc/core/db.py': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		const views = 'svc/api/views.py';
		expect([0, 1, 2, 3, 4, 5].map((i) => target(result, views, i))).toEqual([
			'app/svc/api/models.py',
			'app/svc/api/__init__.py',
			'app/svc/core/__init__.py',
			'app/svc/core/db.py',
			'external:os',
			'external:typing'
		]);
		expect(site(result, views, 0).specifiers!.map((s) => [s.local, s.target.state])).toEqual([
			['User', 'bound'],
			['Missing', 'unresolved']
		]);
		expect(site(result, views, 1).specifiers).toMatchObject([
			{
				local: 'h',
				kind: 'namespace',
				target: { candidates: [{ to: { kind: 'file', path: 'app/svc/api/helpers.py' } }] }
			}
		]);
		expect(site(result, views, 2).specifiers).toMatchObject([
			{ local: 'settings', kind: 'named', target: { state: 'bound' } }
		]);
		expect(site(result, views, 3).specifiers).toEqual([]);
		expect(site(result, views, 5).specifiers).toEqual([]);
		expect(outcome(result, views, 3)).toMatchObject({ rule: 'python-package' });
	});
});

describe('Go imports', () => {
	it('binds each import spec to its package and keeps the package clause pending', () => {
		// Arrange
		const files = {
			'cmd/main.go': {
				imports: [
					'package main',
					'"fmt"',
					'store "example.com/shop/store"',
					'_ "example.com/shop/legacy"'
				]
			},
			'store/store.go': { imports: ['package store'] },
			'store/store_test.go': { imports: ['package store_test', 'import "example.com/shop/store"'] }
		};
		const configs = { 'go.mod': 'module example.com/shop\n' };

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(site(result, 'cmd/main.go', 0)).toMatchObject({ module: { state: 'pending' } });
		expect(target(result, 'cmd/main.go', 1)).toBe('external:fmt');
		expect(target(result, 'cmd/main.go', 2)).toBe('app/store/store.go');
		expect(site(result, 'cmd/main.go', 2).specifiers).toEqual([]);
		expect(target(result, 'cmd/main.go', 3)).toBe('unresolved');
		// The package clause has no outcome, so the store import is the second
		expect(outcome(result, 'cmd/main.go', 1)).toEqual({
			status: 'file',
			rule: 'go-module',
			paths: ['app/store/store.go']
		});
		expect(target(result, 'store/store_test.go', 1)).toBe('app/store/store.go');
		expect(result.outcomes.map((o) => o.written)).not.toContain('package main');
	});
});

describe('Rust imports', () => {
	const cls = (name: string) => fn(name, { kind: 'class' });
	const files = {
		'core/src/lib.rs': {
			imports: ['pub use model::Item;', 'pub use store::*;'],
			symbols: [fn('model'), fn('store')]
		},
		'core/src/model.rs': { imports: ['use std::fmt;'], symbols: [cls('Item')] },
		'core/src/store/mod.rs': { symbols: [fn('memory'), cls('Store')] },
		'core/src/store/memory.rs': {
			imports: ['use super::{self as store, Store};', 'use crate::model::Item as Thing;'],
			symbols: [cls('Memory')]
		},
		'cli/src/main.rs': {
			imports: [
				'use shop_core::{Item, Store, store::memory};',
				'use shop_core::Missing;',
				'use serde::Serialize;'
			]
		}
	};
	const configs = {
		'core/Cargo.toml': '[package]\nname = "shop-core"\n',
		'cli/Cargo.toml': '[package]\nname = "shop-cli"\n'
	};
	const names = (result: ReturnType<typeof resolve>, path: string, index: number) =>
		site(result, path, index).specifiers!.map((spec) => {
			const bound = spec.target.state === 'bound' ? spec.target.candidates[0].to : null;
			const to = !bound
				? spec.target.state
				: bound.kind === 'file'
					? bound.path
					: bound.kind === 'symbol'
						? bound.id
						: `external:${bound.module}#${bound.name}`;
			return `${spec.kind} ${spec.local} -> ${to}`;
		});

	it('binds a use to the module its path names and each name to the file that declares it', () => {
		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'core/src/store/memory.rs', 0)).toBe('app/core/src/store/mod.rs');
		expect(names(result, 'core/src/store/memory.rs', 0)).toEqual([
			'namespace store -> app/core/src/store/mod.rs',
			'named Store -> app/core/src/store/mod.rs#Store'
		]);
		expect(names(result, 'core/src/store/memory.rs', 1)).toEqual([
			'named Thing -> app/core/src/model.rs#Item'
		]);
		expect(target(result, 'core/src/model.rs')).toBe('external:std');
		expect(names(result, 'core/src/model.rs', 0)).toEqual(['named fmt -> external:std#fmt']);
		expect(outcome(result, 'core/src/model.rs')).toEqual({ status: 'external', module: 'std' });
	});

	it('follows pub use and glob re-exports from another crate of the workspace', () => {
		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'cli/src/main.rs', 0)).toBe('app/core/src/lib.rs');
		expect(outcome(result, 'cli/src/main.rs', 0)).toMatchObject({ rule: 'rust-crate' });
		expect(names(result, 'cli/src/main.rs', 0)).toEqual([
			'named Item -> app/core/src/model.rs#Item',
			'named Store -> app/core/src/store/mod.rs#Store',
			'namespace memory -> app/core/src/store/memory.rs'
		]);
		expect(names(result, 'cli/src/main.rs', 1)).toEqual(['named Missing -> unresolved']);
		expect(target(result, 'cli/src/main.rs', 2)).toBe('external:serde');
	});
});

describe('resolveImports', () => {
	it('leaves imports of languages it does not resolve pending', () => {
		// Arrange
		const files = { 'Main.java': { imports: ['import java.util.List;'] } };

		// Act
		const result = resolve(files);

		// Assert
		expect(site(result, 'Main.java')).toEqual({
			line: 1,
			text: 'import java.util.List;',
			module: { state: 'pending' },
			specifiers: null
		});
		expect(result.outcomes).toEqual([]);
	});

	it('marks a statement it cannot read as unresolved and leaves it unsplit', () => {
		// Arrange
		const files = { 'a.ts': { imports: ['import Foo = Bar.Baz'] } };

		// Act
		const result = resolve(files);

		// Assert
		expect(site(result, 'a.ts')).toMatchObject({
			module: { state: 'unresolved' },
			specifiers: null
		});
		expect(result.outcomes[0]).toMatchObject({ written: null, resolution: { reason: 'unparsed' } });
	});

	it('skips a config file that does not parse and keeps the others', () => {
		// Arrange
		const configs = {
			'tsconfig.json': '{ "compilerOptions": ',
			'packages/a/tsconfig.json': json({ compilerOptions: { paths: { '~/*': ['./src/*'] } } })
		};
		const files = {
			'packages/a/src/x.ts': { imports: ["import y from '~/y'"] },
			'packages/a/src/y.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'packages/a/src/x.ts')).toBe('app/packages/a/src/y.ts');
	});
});

describe('buildCodeMap with the resolver', () => {
	it('binds imports from config files while the wire files stay byte-identical', () => {
		// Arrange
		const astMap = new Map<string, ASTSymbol[]>([
			[
				'app/src/routes/page.ts',
				astOf({ imports: ["import { f } from '$lib/f'", "import x from 'x'"] })
			],
			['app/src/lib/f.ts', astOf({ symbols: [fn('f')] })]
		]);
		const configs = new Map([
			['app/svelte.config.js', "export default { kit: { alias: { $lib: 'src/lib' } } }"]
		]);

		// Act
		const map = buildCodeMap(astMap, ROOT, { configs });

		// Assert
		const page = map.files.get('app/src/routes/page.ts' as FilePath) as FileRecord;
		expect(page.imports[0].module).toMatchObject({
			state: 'bound',
			candidates: [{ to: { kind: 'file', path: 'app/src/lib/f.ts' } }]
		});
		for (const [key, symbols] of astMap) {
			const resolved = map.files.get(key as FilePath)!;
			expect(JSON.stringify(toWireFile(key, resolved))).toBe(
				JSON.stringify(toWireFile(key, fileFromAst(key, symbols)))
			);
		}
	});
});

describe('isResolverConfig', () => {
	it('names the config files the resolver reads', () => {
		// Arrange
		const paths = [
			'app/tsconfig.json',
			'app/packages/server/tsconfig.server.json',
			'app/jsconfig.json',
			'app/package.json',
			'app/pnpm-workspace.yaml',
			'app/svelte.config.js',
			'app/go.mod',
			'app/crates/core/Cargo.toml',
			'app/src/config.json',
			'app/package-lock.json',
			'app/go.sum',
			'app/Cargo.lock'
		];

		// Act
		const picked = paths.filter(isResolverConfig);

		// Assert
		expect(picked).toEqual(paths.slice(0, 8));
	});
});

describe('tsconfig project selection', () => {
	it('follows references and gives each file the project whose include and exclude take it', () => {
		// Arrange: the Vite template, where tsconfig.json holds only `references`
		const configs = {
			'tsconfig.json': json({
				files: [],
				references: [
					{ path: './tsconfig.app.json' },
					{ path: './tsconfig.node.json' },
					{ path: './tsconfig.test.json' }
				]
			}),
			'tsconfig.app.json': json({
				compilerOptions: { paths: { '@/*': ['./src/*'] } },
				include: ['src'],
				exclude: ['src/**/*.test.ts']
			}),
			'tsconfig.node.json': json({
				compilerOptions: { paths: { '@/*': ['./config/*'] } },
				include: ['vite.config.ts']
			}),
			'tsconfig.test.json': json({
				compilerOptions: { paths: { '@/*': ['./test/*'] } },
				include: ['src/**/*.test.ts']
			})
		};
		const files = {
			'src/main.ts': { imports: ["import { util } from '@/util'"] },
			'src/deep/view.ts': { imports: ["import { util } from '@/util'"] },
			'src/main.test.ts': { imports: ["import { util } from '@/util'"] },
			'vite.config.ts': { imports: ["import { util } from '@/util'"] },
			'scripts/seed.ts': { imports: ["import { util } from '@/util'"] },
			'src/util.ts': {},
			'config/util.ts': {},
			'test/util.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'src/main.ts')).toBe('app/src/util.ts');
		expect(target(result, 'src/deep/view.ts')).toBe('app/src/util.ts');
		expect(target(result, 'src/main.test.ts')).toBe('app/test/util.ts');
		expect(target(result, 'vite.config.ts')).toBe('app/config/util.ts');
		// No project lists it, so the first one with `paths` applies
		expect(target(result, 'scripts/seed.ts')).toBe('app/src/util.ts');
	});

	it('gives no file to a solution config that has references and no files or include', () => {
		// Arrange
		const configs = {
			'tsconfig.json': json({ references: [{ path: './tsconfig.app.json' }] }),
			'tsconfig.app.json': json({
				compilerOptions: { paths: { '@/*': ['./src/*'] } },
				include: ['src']
			})
		};
		const files = { 'src/main.ts': { imports: ["import { a } from '@/a'"] }, 'src/a.ts': {} };

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'src/main.ts')).toBe('app/src/a.ts');
	});

	it('leaves node_modules and outDir out, and takes only TS/JS files, when a config sets neither list', () => {
		// Arrange: no tsconfig.json, so both configs apply in name order
		const configs = {
			'tsconfig.a.json': json({ compilerOptions: { outDir: 'dist', paths: { '@/*': ['./a/*'] } } }),
			'tsconfig.b.json': json({
				compilerOptions: { paths: { '@/*': ['./b/*'] } },
				include: ['dist', 'node_modules', '**/*.svelte'],
				exclude: []
			})
		};
		const files = {
			'src/main.ts': { imports: ["import { u } from '@/u'"] },
			'dist/main.ts': { imports: ["import { u } from '@/u'"] },
			'node_modules/lib/index.ts': { imports: ["import { u } from '@/u'"] },
			'src/App.svelte': { imports: ["import { u } from '@/u'"] },
			'a/u.ts': {},
			'b/u.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'src/main.ts')).toBe('app/a/u.ts');
		expect(target(result, 'dist/main.ts')).toBe('app/b/u.ts');
		expect(target(result, 'node_modules/lib/index.ts')).toBe('app/b/u.ts');
		expect(target(result, 'src/App.svelte')).toBe('app/b/u.ts');
	});

	it('names the custom config files a reference or extends points at, so a caller can read them', () => {
		// Arrange
		const texts = new Map([
			[
				'app/tsconfig.json',
				json({ files: [], references: [{ path: './configs/web.json' }, { path: './api' }] })
			],
			['app/api/tsconfig.json', json({ extends: '../configs/base' })]
		]);
		const web = json({
			compilerOptions: { paths: { '~/*': ['../web/*'] } },
			include: ['../web']
		});

		// Act
		const named = namedConfigs(texts);
		const after = namedConfigs(new Map([...texts, ['app/configs/web.json', web]]));

		// Assert
		expect(named.sort()).toEqual([
			'app/configs/base',
			'app/configs/base.json',
			'app/configs/web.json'
		]);
		expect(after.sort()).toEqual(['app/configs/base', 'app/configs/base.json']);
	});

	it('follows a reference to a config file with a custom name', () => {
		// Arrange
		const configs = {
			'tsconfig.json': json({ files: [], references: [{ path: './configs/web.json' }] }),
			'configs/web.json': json({
				compilerOptions: { paths: { '~/*': ['../web/lib/*'] } },
				include: ['../web']
			})
		};
		const files = { 'web/main.ts': { imports: ["import { b } from '~/b'"] }, 'web/lib/b.ts': {} };

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'web/main.ts')).toBe('app/web/lib/b.ts');
	});

	it('reads a referenced folder as its tsconfig.json', () => {
		// Arrange
		const configs = {
			'tsconfig.json': json({ files: [], references: [{ path: './web' }] }),
			'web/tsconfig.json': json({
				compilerOptions: { paths: { '~/*': ['./lib/*'] } },
				include: ['../shared/**/*.ts']
			})
		};
		const files = {
			'shared/a.ts': { imports: ["import { b } from '~/b'"] },
			'web/lib/b.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'shared/a.ts')).toBe('app/web/lib/b.ts');
	});

	it('reads a tsconfig that starts with a byte order mark', () => {
		// Arrange
		const configs = {
			'tsconfig.json': `\uFEFF${json({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })}`
		};
		const files = { 'main.ts': { imports: ["import { a } from '@/a'"] }, 'src/a.ts': {} };

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'main.ts')).toBe('app/src/a.ts');
	});
});

describe('tsconfig extends chains', () => {
	it('reads a shared base through both sides of a diamond, the later parent winning', () => {
		// Arrange: tsconfig extends [a, b], and a and b both extend base
		const configs = {
			'base.json': json({ compilerOptions: { paths: { '@x': ['./base/x.ts'] } } }),
			'a.json': json({
				extends: './base.json',
				compilerOptions: { paths: { '@x': ['./a/x.ts'] } }
			}),
			'b.json': json({ extends: './base.json' }),
			'tsconfig.json': json({ extends: ['./a.json', './b.json'] }),
			'one.json': json({ compilerOptions: { baseUrl: './one' } }),
			'two.json': json({ compilerOptions: { baseUrl: './two' } }),
			'pkg/tsconfig.json': json({ extends: ['../one.json', '../two.json'] })
		};
		const files = {
			'main.ts': { imports: ["import { x } from '@x'"] },
			'pkg/main.ts': { imports: ["import { y } from 'lib/y'"] },
			'base/x.ts': {},
			'a/x.ts': {},
			'one/lib/y.ts': {},
			'two/lib/y.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'main.ts')).toBe('app/base/x.ts');
		expect(target(result, 'pkg/main.ts')).toBe('app/two/lib/y.ts');
	});

	it('extends a config shipped by a workspace package, by file or by package name', () => {
		// Arrange
		const configs = {
			'package.json': json({ name: 'root', workspaces: ['packages/*', 'apps/*'] }),
			'packages/tsconfig/package.json': json({ name: '@repo/tsconfig' }),
			'packages/tsconfig/base.json': json({
				compilerOptions: { paths: { '@shared/*': ['../../shared/*'] } }
			}),
			'packages/tsconfig/tsconfig.json': json({
				compilerOptions: { paths: { '@root/*': ['../../*'] } }
			}),
			'apps/web/tsconfig.json': json({ extends: '@repo/tsconfig/base.json' }),
			'apps/api/tsconfig.json': json({ extends: '@repo/tsconfig' })
		};
		const files = {
			'apps/web/src/a.ts': { imports: ["import { x } from '@shared/x'"] },
			'apps/api/src/a.ts': { imports: ["import { x } from '@root/shared/x'"] },
			'shared/x.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'apps/web/src/a.ts')).toBe('app/shared/x.ts');
		expect(target(result, 'apps/api/src/a.ts')).toBe('app/shared/x.ts');
	});
});

describe('package conditions and #imports', () => {
	const configs = {
		'package.json': json({
			name: 'root',
			workspaces: ['packages/*'],
			imports: {
				'#lib/*': './src/lib/*.js',
				'#cfg': { node: './src/node-config.ts', import: './src/config.ts' },
				'#dep': 'lodash-es',
				'#gone': './src/gone.js'
			}
		}),
		'packages/ui/package.json': json({
			name: '@acme/ui',
			exports: {
				'.': { worker: './w.js', default: './a.js', types: './b.d.ts' },
				'./*': './src/*.js'
			}
		})
	};
	const files = {
		'src/main.ts': {
			imports: [
				"import { a } from '#lib/a'",
				"import { cfg } from '#cfg'",
				"import { debounce } from '#dep'",
				"import { gone } from '#gone'",
				"import { none } from '#none'",
				"import { ui } from '@acme/ui'",
				"import { odd } from '@acme/ui/x$$y'"
			]
		},
		'src/lib/a.ts': {},
		'src/config.ts': {},
		'src/node-config.ts': {},
		'packages/ui/w.js': {},
		'packages/ui/a.js': {},
		'packages/ui/b.d.ts': {},
		'packages/ui/src/x$$y.ts': {}
	};

	it('resolves #imports from the nearest package.json and never calls a miss external', () => {
		// Act
		const result = resolve(files, configs);

		// Assert
		const main = 'src/main.ts';
		expect(outcome(result, main, 0)).toEqual({
			status: 'file',
			rule: 'package-imports',
			paths: ['app/src/lib/a.ts']
		});
		expect(target(result, main, 1)).toBe('app/src/config.ts');
		expect(target(result, main, 2)).toBe('external:lodash-es');
		for (const index of [3, 4]) {
			expect(outcome(result, main, index)).toEqual({
				status: 'unresolved',
				rule: 'package-imports',
				reason: 'no-entry'
			});
		}
	});

	it('walks export conditions in the order the package wrote them', () => {
		// Act
		const result = resolve(files, configs);

		// Assert: `worker` is not followed, and `default` is written before `types`
		expect(target(result, 'src/main.ts', 5)).toBe('app/packages/ui/a.js');
		expect(target(result, 'src/main.ts', 6)).toBe('app/packages/ui/src/x$$y.ts');
	});
});

describe('Python namespace packages and source roots', () => {
	it('resolves imports into a folder with no __init__.py through its submodules', () => {
		// Arrange
		const files = {
			'svc/api/views.py': {
				imports: [
					'from . import helpers',
					'from .tools import fmt, missing',
					'from svc.api.tools import fmt',
					'from .tools import *'
				]
			},
			'svc/api/helpers.py': {},
			'svc/api/tools/fmt.py': { symbols: [fn('missing')] }
		};

		// Act
		const result = resolve(files);

		// Assert
		const views = 'svc/api/views.py';
		expect(target(result, views, 0)).toBe('app/svc/api/helpers.py');
		expect(site(result, views, 0).specifiers).toMatchObject([
			{ kind: 'namespace', target: { candidates: [{ to: { path: 'app/svc/api/helpers.py' } }] } }
		]);
		expect(target(result, views, 1)).toBe('app/svc/api/tools/fmt.py');
		// `missing` is not a submodule, and a namespace package has no module to declare it
		expect(site(result, views, 1).specifiers!.map((s) => [s.kind, s.target.state])).toEqual([
			['namespace', 'bound'],
			['named', 'unresolved']
		]);
		expect(outcome(result, views, 2)).toEqual({
			status: 'file',
			rule: 'python-package',
			paths: ['app/svc/api/tools/fmt.py']
		});
		expect(outcome(result, views, 3)).toEqual({
			status: 'unresolved',
			rule: 'python-relative',
			reason: 'no-file'
		});
	});

	it('does not read an absolute import as a sibling module, since Python 3 has no implicit relative import', () => {
		// Arrange
		const files = {
			'pkg/__init__.py': {},
			'pkg/a.py': { imports: ['import b', 'from pkg import b'] },
			'pkg/b.py': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'pkg/a.py', 0)).toBe('external:b');
		expect(target(result, 'pkg/a.py', 1)).toBe('app/pkg/__init__.py');
	});

	it('reads an absolute import in a script or test folder as its sibling, after the source roots', () => {
		// Arrange: `python scripts/a.py` and rootdir-less pytest put the file's folder on sys.path
		const files = {
			'svc/__init__.py': {},
			'svc/db.py': {},
			'scripts/a.py': { imports: ['import b', 'from b import run'] },
			'scripts/b.py': { symbols: [fn('run')] },
			'tests/test_db.py': { imports: ['import helpers', 'import svc.db'] },
			'tests/helpers.py': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'scripts/a.py', 0)).toBe('app/scripts/b.py');
		expect(site(result, 'scripts/a.py', 1).specifiers).toMatchObject([
			{ local: 'run', target: { state: 'bound' } }
		]);
		expect(target(result, 'tests/test_db.py', 0)).toBe('app/tests/helpers.py');
		expect(target(result, 'tests/test_db.py', 1)).toBe('app/svc/db.py');
	});

	it('lets a source root beat a sibling of the same name, and a sibling file beat a namespace package', () => {
		// Arrange
		const files = {
			'config/__init__.py': {},
			'utils/fmt.py': {},
			'scripts/run.py': { imports: ['import config', 'import json', 'import utils'] },
			'scripts/config.py': {},
			'scripts/json.py': {},
			'scripts/utils.py': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		// Python run as a script would load scripts/config.py; imported as a module, the root wins
		expect(target(result, 'scripts/run.py', 0)).toBe('app/config/__init__.py');
		// No root has `json`, so the sibling shadows the standard library as it does at runtime
		expect(target(result, 'scripts/run.py', 1)).toBe('app/scripts/json.py');
		// Python's path finder keeps a regular module over a namespace portion from any entry
		expect(target(result, 'scripts/run.py', 2)).toBe('app/scripts/utils.py');
	});
});

describe('specifier edge cases', () => {
	it('loads the .ts source a written .js names even when the .js exists too', () => {
		// Arrange
		const files = {
			'main.ts': { imports: ["import { a } from './a.js'"] },
			'a.ts': {},
			'a.js': {}
		};

		// Act
		const result = resolve(files);

		// Assert
		expect(target(result, 'main.ts')).toBe('app/a.ts');
	});

	it('keeps a $ in the part a tsconfig * matched', () => {
		// Arrange
		const configs = {
			'tsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
		};
		const files = {
			'main.ts': { imports: ["import a from '@/a$&b'", "import c from '@/c$$d'"] },
			'src/a$&b.ts': {},
			'src/c$$d.ts': {}
		};

		// Act
		const result = resolve(files, configs);

		// Assert
		expect(target(result, 'main.ts', 0)).toBe('app/src/a$&b.ts');
		expect(target(result, 'main.ts', 1)).toBe('app/src/c$$d.ts');
	});
});

describe('collectResolverConfigs', () => {
	const reader = (files: Record<string, string | null>) => {
		const asked: string[] = [];
		const read = async (path: string) => {
			asked.push(path);
			return files[path] ?? null;
		};
		return { read, asked };
	};

	it('reads the configs a loader listed and the files they extend, and nothing else', async () => {
		const files = {
			'app/tsconfig.json': '{ "extends": "./configs/base.json" }',
			'app/configs/base.json': '{ "extends": "./strict.json", "compilerOptions": {} }',
			'app/configs/strict.json': '{}',
			'app/packages/a/package.json': '{ "name": "a" }',
			'app/src/index.ts': 'export {}'
		};
		const { read, asked } = reader(files);

		const texts = await collectResolverConfigs(Object.keys(files), read);

		expect([...texts.keys()].sort()).toEqual([
			'app/configs/base.json',
			'app/configs/strict.json',
			'app/packages/a/package.json',
			'app/tsconfig.json'
		]);
		expect(asked).not.toContain('app/src/index.ts');
	});

	it('keeps at most batchSize reads in flight', async () => {
		const listed = Array.from({ length: 45 }, (_, i) => `app/packages/p${i}/package.json`);
		let inFlight = 0;
		let peak = 0;
		const read = async () => {
			peak = Math.max(peak, ++inFlight);
			await new Promise((resolve) => setTimeout(resolve, 0));
			inFlight--;
			return '{}';
		};

		const texts = await collectResolverConfigs(listed, read, 20);

		expect(texts.size).toBe(45);
		expect(peak).toBe(20);
	});

	it('never asks for a named config the listing does not have', async () => {
		const { read, asked } = reader({ 'app/tsconfig.json': '{ "extends": "./missing.json" }' });

		const texts = await collectResolverConfigs(['app/tsconfig.json'], read);

		expect([...texts.keys()]).toEqual(['app/tsconfig.json']);
		expect(asked).toEqual(['app/tsconfig.json']);
	});

	it('leaves out a file the reader skips, such as one over the size limit', async () => {
		const { read } = reader({ 'app/package.json': null, 'app/tsconfig.json': '{}' });

		const texts = await collectResolverConfigs(['app/package.json', 'app/tsconfig.json'], read);

		expect([...texts.keys()]).toEqual(['app/tsconfig.json']);
	});
});
