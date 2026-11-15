import { i18nStore } from '$lib/stores/i18nStore.svelte';
import { MAX_FILE_SIZE } from '$lib/utils/filePriority';

export type SourceFileFailure =
	| {
			reason:
				| 'invalid-path'
				| 'not-found'
				| 'too-large'
				| 'binary'
				| 'rate-limited'
				| 'secret-file';
	  }
	| { reason: 'unavailable'; status?: number };

export type SourceFileResult = { ok: true; content: string } | ({ ok: false } & SourceFileFailure);

export type SourceRead = { ok: true; content: string } | { ok: false; message: string };

export type SourceOrigin = 'github' | 'folder';

export function pathSegments(path: string): string[] | null {
	const segments = path.split('/');
	return segments.some((seg) => seg === '' || seg === '.' || seg === '..') ? null : segments;
}

const BINARY_SNIFF_BYTES = 8000;

export function decodeSourceText(bytes: Uint8Array): SourceFileResult {
	if (bytes.length > MAX_FILE_SIZE) return { ok: false, reason: 'too-large' };
	if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { ok: false, reason: 'binary' };
	return { ok: true, content: new TextDecoder().decode(bytes) };
}

export function sourceFailureMessage(failure: SourceFileFailure, origin: SourceOrigin): string {
	const t = i18nStore.t;
	const github = origin === 'github';
	switch (failure.reason) {
		case 'invalid-path':
			return t('sourceFile.invalidPath');
		case 'not-found':
			return t(github ? 'sourceFile.notAtCommit' : 'sourceFile.notInFolder');
		case 'too-large':
			return t(github ? 'sourceFile.tooLargeGitHub' : 'sourceFile.tooLarge');
		case 'binary':
			return t(github ? 'sourceFile.binaryGitHub' : 'sourceFile.binary');
		case 'rate-limited':
			return t('sourceFile.rateLimited');
		case 'secret-file':
			return t('sourceFile.secretFile');
		case 'unavailable':
			return failure.status
				? t('codeViewer.loadFailed', { error: `HTTP ${failure.status}` })
				: t('codeViewer.notAccessible');
	}
}

export function toSourceRead(result: SourceFileResult, origin: SourceOrigin): SourceRead {
	return result.ok ? result : { ok: false, message: sourceFailureMessage(result, origin) };
}
