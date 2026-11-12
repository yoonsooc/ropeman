import { describe, it, expect, afterEach } from 'vitest';
import golden from './__fixtures__/skeletonWire.golden.json';
import { FIXTURE_AST, wireScenarios } from './__fixtures__/skeletonWire';
import { CONFIG_PARSERS } from './configParsers';
import { formatPayloadPreview, selectSkeleton } from './skeletonExtractor';
import type { ASTSymbol } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import type { SkeletonFile } from '$lib/types/skeleton';
import { settingsStore } from '$lib/stores/settingsStore.svelte';

describe('skeleton wire bytes', () => {
	it('sends the same strings as the wire captured before skeleton v2', async () => {
		// The golden was written by the extractor at main 94ab765, before the v2 code map existed.
		// The analysis cache keys on these strings, so any change here invalidates every user's cache.
		const scenarios = await wireScenarios();

		expect(scenarios).toEqual(golden);
	});
});

describe('config files on the wire', () => {
	const unlimited = settingsStore.skeletonUnlimited;
	afterEach(() => {
		settingsStore.skeletonUnlimited = unlimited;
	});

	const CONFIG_FILES: [string, ASTSymbol[]][] = [
		['fixture/Dockerfile', CONFIG_PARSERS.dockerfile('FROM node:20 AS app\nEXPOSE 3000')],
		['fixture/infra/main.tf', CONFIG_PARSERS.terraform('resource "aws_s3_bucket" "logs" {\n}')],
		['fixture/.env.example', CONFIG_PARSERS.dotenv('DATABASE_URL=postgres://x')],
		['fixture/Makefile', CONFIG_PARSERS.makefile('build: deps\n\tnpm run build')],
		['fixture/.env.sample', CONFIG_PARSERS.dotenv('# nothing but a comment')]
	];

	function treeOf(paths: string[]): FileNode {
		return {
			name: 'fixture',
			path: 'fixture',
			kind: 'directory',
			children: paths.map((path) => ({ name: path.split('/').pop()!, path, kind: 'file' as const }))
		};
	}

	it('keeps every code file byte for byte, and adds config files only when they carry symbols', () => {
		settingsStore.skeletonUnlimited = true;
		const astMap = new Map([...FIXTURE_AST, ...CONFIG_FILES]);

		const selection = selectSkeleton('fixture', treeOf([...astMap.keys()]), astMap);

		const before: SkeletonFile[] = JSON.parse(golden['top/shapes'].wire!).files;
		const after = new Map(selection.payload.files.map((file) => [file.path, JSON.stringify(file)]));
		for (const file of before) expect(after.get(file.path)).toBe(JSON.stringify(file));
		expect(selection.payload.files.length).toBe(before.length + 4);
		expect(selection.omitted).toContainEqual({ path: 'fixture/.env.sample', reason: 'no-symbols' });
		expect(formatPayloadPreview(selection.payload)).toContain(
			'{"path":"fixture/Dockerfile","language":"dockerfile","symbols":[{"name":"app","kind":"stage","children":[{"name":"3000","kind":"port"}]}],"imports":[{"source":"node:20","specifiers":[]}]}'
		);
		expect(after.get('fixture/.env.example')).toBe(
			'{"path":"fixture/.env.example","language":"dotenv","symbols":[{"name":"DATABASE_URL","kind":"env"}],"imports":[]}'
		);
		expect(after.get('fixture/infra/main.tf')).toContain('"language":"terraform"');
		expect(after.get('fixture/Makefile')).toBe(
			'{"path":"fixture/Makefile","language":"makefile","symbols":[{"name":"build","kind":"target","children":[{"name":"deps","kind":"import"}]}],"imports":[]}'
		);
	});
});
