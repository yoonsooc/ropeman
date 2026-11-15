import { describe, it, expect, beforeEach } from 'vitest';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import {
	decodeSourceText,
	pathSegments,
	sourceFailureMessage,
	toSourceRead,
	type SourceFileFailure
} from './sourceFile';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('pathSegments', () => {
	it('splits a relative path', () => {
		expect(pathSegments('src/api/routes.ts')).toEqual(['src', 'api', 'routes.ts']);
		expect(pathSegments('..x/.env.example')).toEqual(['..x', '.env.example']);
	});

	it('refuses a path that would leave the root', () => {
		for (const path of ['../x', 'a/../../x', './a', 'a//b', '/abs', 'a/', '', '..']) {
			expect(pathSegments(path), path).toBeNull();
		}
	});
});

describe('decodeSourceText', () => {
	it('decodes UTF-8 text', () => {
		expect(decodeSourceText(bytes('// 한글 é'))).toEqual({ ok: true, content: '// 한글 é' });
	});

	it('refuses text over 500 KB and a NUL byte near the start', () => {
		expect(decodeSourceText(new Uint8Array(500_001).fill(97))).toEqual({
			ok: false,
			reason: 'too-large'
		});
		expect(decodeSourceText(new Uint8Array([0x89, 0x50, 0x00]))).toEqual({
			ok: false,
			reason: 'binary'
		});
	});

	it('keeps a NUL byte past the first 8000 bytes as text', () => {
		const late = new Uint8Array(8001).fill(97);
		late[8000] = 0;

		expect(decodeSourceText(late)).toMatchObject({ ok: true });
	});
});

describe('sourceFailureMessage', () => {
	beforeEach(() => {
		settingsStore.language = 'en';
	});

	it('words a missing file by where it was read from', () => {
		const failure: SourceFileFailure = { reason: 'not-found' };

		expect(sourceFailureMessage(failure, 'github')).toBe(
			'This file is not in the repository at the analyzed commit.'
		);
		expect(sourceFailureMessage(failure, 'folder')).toMatch(/isn't in the connected folder/);
	});

	it('points to GitHub only for a file read from GitHub', () => {
		expect(sourceFailureMessage({ reason: 'too-large' }, 'github')).toMatch(/Open it on GitHub/);
		expect(sourceFailureMessage({ reason: 'too-large' }, 'folder')).not.toMatch(/GitHub/);
		expect(sourceFailureMessage({ reason: 'binary' }, 'folder')).not.toMatch(/GitHub/);
	});

	it('names the HTTP status when there is one', () => {
		expect(sourceFailureMessage({ reason: 'unavailable', status: 502 }, 'github')).toBe(
			"Couldn't load the file: HTTP 502"
		);
		expect(sourceFailureMessage({ reason: 'unavailable' }, 'folder')).toBe("Can't read this file");
	});

	it('speaks Korean', () => {
		settingsStore.language = 'ko';

		expect(sourceFailureMessage({ reason: 'secret-file' }, 'folder')).toBe(
			'키나 환경 변수 값 같은 비밀이 들어 있을 수 있는 파일이라 보여 주지 않습니다.'
		);
	});
});

describe('toSourceRead', () => {
	it('passes the text through and words a refusal', () => {
		settingsStore.language = 'en';

		expect(toSourceRead({ ok: true, content: 'x' }, 'folder')).toEqual({ ok: true, content: 'x' });
		expect(toSourceRead({ ok: false, reason: 'invalid-path' }, 'folder')).toEqual({
			ok: false,
			message: 'This file path is not valid, so it cannot be opened.'
		});
	});
});
