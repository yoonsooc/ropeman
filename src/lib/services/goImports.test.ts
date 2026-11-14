import { describe, expect, it } from 'vitest';
import {
	goPackages,
	isGoPackageClause,
	readGoImport,
	readGoModules,
	resolveGoImport
} from './goImports';

describe('readGoModules', () => {
	it('reads each go.mod module path, longest first, and skips a go.mod without one', () => {
		// Arrange
		const texts = new Map([
			['app/go.mod', '// root module\nmodule example.com/shop\n\ngo 1.22\n'],
			['app/tooling/go.mod', 'module "example.com/shop/tools" // nested\n'],
			['app/broken/go.mod', 'go 1.22\n'],
			['app/go.sum', 'module example.com/not-a-mod-file\n']
		]);

		// Act
		const modules = readGoModules(texts);

		// Assert
		expect(modules).toEqual([
			{ path: 'example.com/shop/tools', dir: 'app/tooling' },
			{ path: 'example.com/shop', dir: 'app' }
		]);
	});
});

describe('readGoModules duplicates', () => {
	it('skips go.mod copies under testdata and vendor, and keeps the shallowest of one module path', () => {
		// Arrange
		const texts = new Map([
			['a/b/go.mod', 'module example.com/x'],
			['a/go.mod', 'module example.com/x'],
			['a/testdata/mod/go.mod', 'module example.com/fixture'],
			['a/vendor/example.com/y/go.mod', 'module example.com/y']
		]);

		// Act & Assert
		expect(readGoModules(texts)).toEqual([{ path: 'example.com/x', dir: 'a' }]);
	});
});

describe('readGoImport', () => {
	it('reads the path of a single import and of each spec form in a group', () => {
		// Act
		const paths = [
			'import "fmt"',
			'"net/http"',
			'api "example.com/shop/web/api"',
			'_ "example.com/shop/plugins/audit"',
			'. "example.com/shop/model"',
			'"example.com/x" // trailing comment',
			'import raw `example.com/raw`'
		].map(readGoImport);

		// Assert
		expect(paths).toEqual([
			'fmt',
			'net/http',
			'example.com/shop/web/api',
			'example.com/shop/plugins/audit',
			'example.com/shop/model',
			'example.com/x',
			'example.com/raw'
		]);
	});

	it('reads nothing from the package clause or an empty group', () => {
		// Act & Assert
		expect(readGoImport('package store')).toBeNull();
		expect(readGoImport('import ()')).toBeNull();
		expect(isGoPackageClause('package store')).toBe(true);
		expect(isGoPackageClause('import "fmt"')).toBe(false);
	});
});

describe('resolveGoImport', () => {
	const files = [
		'app/main.go',
		'app/store/memory.go',
		'app/store/store.go',
		'app/store/store_test.go',
		'app/web/api/doc.go',
		'app/web/api/handlers.go',
		'app/only/only_test.go',
		'app/codec/v2/codec.go',
		'app/tooling/rules/rules.go',
		'app/gen/_draft.go',
		'app/gen/api.pb.go',
		'app/gen/zz_generated.deepcopy.go',
		'app/gen/types.go',
		'app/plugin/sub/sub.go'
	];
	const modules = readGoModules(
		new Map([
			['app/go.mod', 'module example.com/shop'],
			['app/tooling/go.mod', 'module example.com/shop/tools'],
			['app/plugin/go.mod', 'module other.org/plugin']
		])
	);
	const packages = goPackages(files);
	const resolve = (path: string) => resolveGoImport(path, modules, packages);

	it('points a package at the file named after it, else its first file other than doc.go', () => {
		// Act & Assert
		expect(resolve('example.com/shop/store')).toEqual({
			status: 'file',
			rule: 'go-module',
			paths: ['app/store/store.go']
		});
		expect(resolve('example.com/shop/web/api')).toMatchObject({
			paths: ['app/web/api/handlers.go']
		});
		expect(resolve('example.com/shop/codec/v2')).toMatchObject({
			paths: ['app/codec/v2/codec.go']
		});
		expect(resolve('example.com/shop')).toMatchObject({ paths: ['app/main.go'] });
	});

	it('lets a nested module own the paths under it, whatever its module path', () => {
		// Act & Assert
		expect(resolve('example.com/shop/tools/rules')).toMatchObject({
			paths: ['app/tooling/rules/rules.go']
		});
		expect(resolve('example.com/shop/tooling/rules')).toMatchObject({ status: 'unresolved' });
		expect(resolve('example.com/shop/plugin/sub')).toMatchObject({ status: 'unresolved' });
		expect(resolve('other.org/plugin/sub')).toMatchObject({ paths: ['app/plugin/sub/sub.go'] });
	});

	it('passes over files the go tool ignores and generated files when it picks a file', () => {
		// Act & Assert
		expect(resolve('example.com/shop/gen')).toMatchObject({ paths: ['app/gen/types.go'] });
		expect(packages.get('app/gen')).not.toContain('app/gen/_draft.go');
	});

	it('calls the standard library and other modules external, and a folder with no package a miss', () => {
		// Act & Assert
		expect(resolve('net/http')).toEqual({ status: 'external', module: 'net/http' });
		expect(resolve('github.com/google/uuid')).toEqual({
			status: 'external',
			module: 'github.com/google/uuid'
		});
		expect(resolve('example.com/shopping/x')).toEqual({
			status: 'external',
			module: 'example.com/shopping/x'
		});
		expect(resolve('example.com/shop/legacy')).toEqual({
			status: 'unresolved',
			rule: 'go-module',
			reason: 'no-file'
		});
		// A folder with only tests holds no package another file can import
		expect(resolve('example.com/shop/only')).toMatchObject({ status: 'unresolved' });
	});
});
