import { describe, expect, it } from 'vitest';
import { KEEP_CLASS, rehypeInlineCode } from './rehype-inline-code.mjs';

const text = (value: string) => ({ type: 'text', value });
const el = (tagName: string, children: unknown[]) => ({
	type: 'element',
	tagName,
	properties: {},
	children
});
const kept = (value: string) => ({
	type: 'element',
	tagName: 'span',
	properties: { className: [KEEP_CLASS] },
	children: [text(value)]
});

describe('rehypeInlineCode', () => {
	it('keeps each short hyphenated word of inline code on one line, splitting at spaces', () => {
		const code = el('code', [text('ropeman serve --detach')]);
		const tree = { type: 'root', children: [el('p', [code])] };

		rehypeInlineCode()(tree);

		expect(code.children).toEqual([
			text('ropeman'),
			text(' '),
			text('serve'),
			text(' '),
			kept('--detach')
		]);
	});

	it('leaves code blocks and long words such as URLs free to wrap', () => {
		const url = 'https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.6.0/skill';
		const block = el('code', [text('npm install --global')]);
		const inline = el('code', [text(url)]);
		const tree = { type: 'root', children: [el('pre', [block]), el('p', [inline])] };

		rehypeInlineCode()(tree);

		expect(block.children).toEqual([text('npm install --global')]);
		expect(inline.children).toEqual([text(url)]);
	});
});
