import { describe, expect, it } from 'vitest';
import {
	modulePath,
	readCargoPackages,
	readUse,
	resolveUsePath,
	rustCrates,
	type RustCrates
} from './rustImports';

describe('readCargoPackages', () => {
	it('reads the library name and path and the target roots, and skips a virtual manifest', () => {
		// Arrange
		const texts = new Map([
			['ws/Cargo.toml', '[workspace]\nmembers = ["crates/*"]\n'],
			['ws/crates/shop-core/Cargo.toml', '[package]\nname = "shop-core"\nversion = "0.1.0"\n'],
			[
				'ws/crates/shop-cli/Cargo.toml',
				[
					'[package]',
					"name = 'shop-cli' # comment",
					'',
					'[lib]',
					'name = "cli_kit"',
					'path = "src/kit.rs"',
					'',
					'[[bin]]',
					'name = "admin"',
					'path = "tools/admin.rs"',
					'',
					'[dependencies]',
					'path = "not-a-target.rs"'
				].join('\n')
			]
		]);

		// Act
		const packages = readCargoPackages(texts);

		// Assert
		expect(packages).toEqual([
			{
				dir: 'ws/crates/shop-core',
				name: 'shop-core',
				libName: 'shop_core',
				libPath: 'ws/crates/shop-core/src/lib.rs',
				roots: [],
				renames: new Map(),
				edition2015: true
			},
			{
				dir: 'ws/crates/shop-cli',
				name: 'shop-cli',
				libName: 'cli_kit',
				libPath: 'ws/crates/shop-cli/src/kit.rs',
				roots: ['ws/crates/shop-cli/tools/admin.rs'],
				renames: new Map(),
				edition2015: true
			}
		]);
	});

	it('reads dependency renames from every dependency table form, and quoted table headers', () => {
		// Arrange
		const manifest = [
			'[package]',
			'name = "app"',
			'edition.workspace = true',
			'',
			'[dependencies]',
			'core-lib = { version = "1", package = "shop-core" }',
			'plain = "1"',
			'',
			"[target.'cfg(unix)'.dependencies]",
			'unix-io = { package = "io-unix" }',
			'',
			'[target."cfg(windows)".dev-dependencies.win]',
			'package = "io-win"',
			'',
			'[build-dependencies]',
			'gen.package = "codegen"',
			'',
			'[lib]',
			'path = "src/app.rs"'
		].join('\n');
		const texts = new Map([
			[
				'ws/Cargo.toml',
				'[workspace]\n[workspace.package]\nedition = "2021"\n[workspace.dependencies]\nlog2 = { package = "logger" }\n'
			],
			['ws/app/Cargo.toml', manifest],
			['ws/vendor/dep/Cargo.toml', '[package]\nname = "dep"\n'],
			['ws/target/debug/x/Cargo.toml', '[package]\nname = "x"\n']
		]);

		// Act
		const packages = readCargoPackages(texts);

		// Assert
		expect(packages).toHaveLength(1);
		expect(packages[0]).toMatchObject({ libPath: 'ws/app/src/app.rs', edition2015: false });
		expect(packages[0].renames).toEqual(
			new Map([
				['log2', 'logger'],
				['core_lib', 'shop-core'],
				['unix_io', 'io-unix'],
				['win', 'io-win'],
				['gen', 'codegen']
			])
		);
	});
});

describe('readUse', () => {
	it('splits a use tree into its leaves and the path before the group', () => {
		// Act & Assert
		expect(readUse('use crate::a::B;')).toEqual({
			group: null,
			leaves: [{ path: ['crate', 'a', 'B'], alias: null, glob: false }]
		});
		expect(readUse('pub(crate) use super::{self as up, c::{D, e::*}, F as G};')).toEqual({
			group: ['super'],
			leaves: [
				{ path: ['super', 'self'], alias: 'up', glob: false },
				{ path: ['super', 'c', 'D'], alias: null, glob: false },
				{ path: ['super', 'c', 'e'], alias: null, glob: true },
				{ path: ['super', 'F'], alias: 'G', glob: false }
			]
		});
		expect(readUse('use ::std::io /* stdio */;')).toEqual({
			group: null,
			leaves: [{ path: ['std', 'io'], alias: null, glob: false }]
		});
		expect(readUse('pub use self::r#type::*;')).toEqual({
			group: ['self', 'type'],
			leaves: [{ path: ['self', 'type'], alias: null, glob: true }]
		});
		expect(readUse('use std::{\n    fmt, // formatting\n    io,\n};')?.leaves).toHaveLength(2);
	});

	it('reads nothing from a statement that is not a whole use tree', () => {
		// Act & Assert
		expect(readUse('mod args;')).toBeNull();
		expect(readUse('use a::{b, c')).toBeNull();
		expect(readUse('use a::{};')).toBeNull();
	});
});

describe('Rust crates and module paths', () => {
	const files = new Set([
		'ws/crates/shop-core/src/lib.rs',
		'ws/crates/shop-core/src/model.rs',
		'ws/crates/shop-core/src/util.rs',
		'ws/crates/shop-core/src/store/mod.rs',
		'ws/crates/shop-core/src/store/memory.rs',
		'ws/crates/shop-core/src/bin/admin.rs',
		'ws/crates/shop-cli/src/kit.rs',
		'ws/crates/shop-cli/src/main.rs',
		'ws/crates/shop-cli/src/args.rs',
		'ws/crates/shop-cli/src/help.rs'
	]);
	const packages = readCargoPackages(
		new Map([
			['ws/crates/shop-core/Cargo.toml', '[package]\nname = "shop-core"\nedition = "2021"'],
			[
				'ws/crates/shop-cli/Cargo.toml',
				'[package]\nname = "shop-cli"\nedition = "2021"\n[lib]\nname = "cli_kit"\npath = "src/kit.rs"'
			]
		])
	);
	// What the parser lists at the top of each root: `mod args;` in main.rs, `mod help;` in kit.rs
	const items: Record<string, string[]> = {
		'ws/crates/shop-cli/src/main.rs': ['args', 'VERSION'],
		'ws/crates/shop-cli/src/kit.rs': ['help'],
		'ws/crates/shop-core/src/model.rs': ['Item']
	};
	const declares = (file: string, name: string) => items[file]?.includes(name) ?? false;
	const crates: RustCrates = rustCrates(packages, files, declares);
	const walk = (path: string, from: string) =>
		resolveUsePath(path.split('::'), from, crates, files, declares);

	it('gives a file the root that declares its module when roots share a folder', () => {
		// Act & Assert
		expect(crates.rootOf('ws/crates/shop-cli/src/args.rs')).toBe('ws/crates/shop-cli/src/main.rs');
		expect(crates.rootOf('ws/crates/shop-cli/src/help.rs')).toBe('ws/crates/shop-cli/src/kit.rs');
		expect(crates.rootOf('ws/crates/shop-core/src/store/memory.rs')).toBe(
			'ws/crates/shop-core/src/lib.rs'
		);
		expect(crates.rootOf('ws/crates/shop-core/src/bin/admin.rs')).toBe(
			'ws/crates/shop-core/src/bin/admin.rs'
		);
		expect(crates.rootOf('elsewhere/a.rs')).toBeNull();
		expect([...crates.libs.keys()]).toEqual(['shop_core', 'cli_kit']);
	});

	it('resolves a renamed dependency to its package, and a shared library name to the shallowest package', () => {
		// Arrange
		const tree = new Set([
			'ws/app/src/main.rs',
			'ws/core/src/lib.rs',
			'ws/examples/copy/core/src/lib.rs'
		]);
		const manifests = readCargoPackages(
			new Map([
				[
					'ws/app/Cargo.toml',
					'[package]\nname = "app"\nedition = "2021"\n[dependencies]\nengine = { package = "core" }'
				],
				['ws/core/Cargo.toml', '[package]\nname = "core"'],
				['ws/examples/copy/core/Cargo.toml', '[package]\nname = "core"']
			])
		);
		const found = rustCrates(manifests, tree, () => false);

		// Act & Assert
		expect(found.libFor('ws/app/src/main.rs', 'engine')).toBe('ws/core/src/lib.rs');
		expect(found.libFor('ws/app/src/main.rs', 'core')).toBe('ws/core/src/lib.rs');
		expect(found.libFor('ws/core/src/lib.rs', 'engine')).toBeNull();
	});

	it('reads a plain path from the crate root in edition 2015 and from the current module after', () => {
		// Arrange
		const tree = new Set([
			'old/src/lib.rs',
			'old/src/a.rs',
			'old/src/b.rs',
			'new/src/lib.rs',
			'new/src/a.rs',
			'new/src/b.rs'
		]);
		const manifests = readCargoPackages(
			new Map([
				['old/Cargo.toml', '[package]\nname = "old"'],
				['new/Cargo.toml', '[package]\nname = "new"\nedition = "2018"']
			])
		);
		const found = rustCrates(manifests, tree, () => false);
		const walkFrom = (from: string) => resolveUsePath(['b', 'X'], from, found, tree, () => false);

		// Act & Assert
		expect(walkFrom('old/src/a.rs')).toMatchObject({ kind: 'local', file: 'old/src/b.rs' });
		expect(walkFrom('new/src/a.rs')).toEqual({ kind: 'external', crate: 'b' });
	});

	it('names a file by its path from the root, a mod.rs by its folder', () => {
		// Act & Assert
		const root = 'ws/crates/shop-core/src/lib.rs';
		expect(modulePath('ws/crates/shop-core/src/store/memory.rs', root)).toEqual([
			'store',
			'memory'
		]);
		expect(modulePath('ws/crates/shop-core/src/store/mod.rs', root)).toEqual(['store']);
		expect(modulePath(root, root)).toEqual([]);
	});

	it('walks crate, self, super, uniform and workspace paths to the deepest module file', () => {
		// Arrange
		const memory = 'ws/crates/shop-core/src/store/memory.rs';
		const main = 'ws/crates/shop-cli/src/main.rs';

		// Act & Assert
		expect(walk('crate::model::Item', memory)).toEqual({
			kind: 'local',
			rule: 'rust-module',
			file: 'ws/crates/shop-core/src/model.rs',
			rest: ['model', 'Item'],
			modules: 1
		});
		expect(walk('super::super::util', memory)).toMatchObject({
			file: 'ws/crates/shop-core/src/util.rs',
			modules: 1
		});
		expect(walk('super::memory', memory)).toMatchObject({ file: memory });
		expect(walk('self::args::Args', main)).toMatchObject({
			file: 'ws/crates/shop-cli/src/args.rs',
			modules: 1
		});
		expect(walk('args::Args', main)).toMatchObject({ file: 'ws/crates/shop-cli/src/args.rs' });
		expect(walk('shop_core::store::memory::MemoryStore', main)).toEqual({
			kind: 'local',
			rule: 'rust-crate',
			file: memory,
			rest: ['store', 'memory', 'MemoryStore'],
			modules: 2
		});
		expect(walk('crate::VERSION', 'ws/crates/shop-cli/src/args.rs')).toMatchObject({
			file: main,
			modules: 0
		});
	});

	it('calls an unknown first segment an external crate, and super past the root a miss', () => {
		// Act & Assert
		expect(walk('std::fmt', 'ws/crates/shop-core/src/model.rs')).toEqual({
			kind: 'external',
			crate: 'std'
		});
		// `shop_cli` is not a name `use` can write: the package renamed its library to cli_kit
		expect(walk('shop_cli::Args', 'ws/crates/shop-core/src/lib.rs')).toEqual({
			kind: 'external',
			crate: 'shop_cli'
		});
		expect(walk('super::x', 'ws/crates/shop-core/src/lib.rs')).toMatchObject({
			kind: 'unresolved',
			reason: 'outside-root'
		});
		expect(walk('crate::x', 'elsewhere/a.rs')).toMatchObject({
			kind: 'unresolved',
			reason: 'no-file'
		});
	});
});
