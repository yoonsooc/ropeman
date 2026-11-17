import { describe, expect, it } from 'vitest';
import { splitInlineCode } from './inlineCode';

describe('splitInlineCode', () => {
	it('returns plain copy as one text part', () => {
		expect(splitInlineCode('Stop serve with Ctrl+C.')).toEqual([
			{ text: 'Stop serve with Ctrl+C.', code: false }
		]);
	});

	it('marks each backtick pair as code', () => {
		expect(splitInlineCode('or gemini with `--cli gemini`, or `--out`.')).toEqual([
			{ text: 'or gemini with ', code: false },
			{ text: '--cli gemini', code: true },
			{ text: ', or ', code: false },
			{ text: '--out', code: true },
			{ text: '.', code: false }
		]);
	});

	it('keeps code at the start or end without empty text parts', () => {
		expect(splitInlineCode('`--root` is missing')).toEqual([
			{ text: '--root', code: true },
			{ text: ' is missing', code: false }
		]);
	});

	it('leaves an unpaired backtick as text', () => {
		expect(splitInlineCode('a `b` c `d')).toEqual([
			{ text: 'a ', code: false },
			{ text: 'b', code: true },
			{ text: ' c ', code: false },
			{ text: '`d', code: false }
		]);
	});
});
