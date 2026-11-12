/**
 * Single-file components (`.svelte`, `.vue`) keep their code in `<script>` blocks. This module
 * turns such a file into the TS/JS source the parser already reads: every character outside the
 * script bodies becomes a space, line breaks stay, so symbol lines match the original file.
 */

// A mixed file takes the widest grammar: TS reads JS, TSX reads both
const LANG_RANK = ['js', 'ts', 'tsx'] as const;
type ScriptLang = (typeof LANG_RANK)[number];

export interface ScriptSource {
	/** The component path plus the extension of its script language, for `getGrammarFile` */
	filePath: string;
	language: 'javascript' | 'typescript';
	content: string;
}

interface ScriptBlock {
	lang: ScriptLang;
	start: number;
	end: number;
}

const COMPONENT_LANGUAGES = new Set(['svelte', 'vue']);

// The JS grammar reads JSX, so `jsx` needs no grammar of its own
const LANG_ATTR: Record<string, ScriptLang> = {
	js: 'js',
	javascript: 'js',
	jsx: 'js',
	ts: 'ts',
	typescript: 'ts',
	tsx: 'tsx'
};

// Other types (`application/ld+json`, `importmap`, `text/template`) hold no component code
const TYPE_ATTR: Record<string, ScriptLang> = {
	module: 'js',
	'text/javascript': 'js',
	'application/javascript': 'js',
	'text/typescript': 'ts',
	'application/typescript': 'ts'
};

const SCRIPT_SOURCE: Record<ScriptLang, { language: ScriptSource['language']; extension: string }> =
	{
		js: { language: 'javascript', extension: '.js' },
		ts: { language: 'typescript', extension: '.ts' },
		tsx: { language: 'typescript', extension: '.tsx' }
	};

const TAG_START = /<!--|<script(?=[\s/>])/gi;
const CLOSE_TAG = /<\/script[\s/>]/gi;
const ATTRIBUTE = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function isComponentLanguage(language: string): boolean {
	return COMPONENT_LANGUAGES.has(language);
}

export function componentScriptSource(filePath: string, content: string): ScriptSource {
	const blocks = findScriptBlocks(content);
	const widest = LANG_RANK[Math.max(0, ...blocks.map((block) => LANG_RANK.indexOf(block.lang)))];
	const { language, extension } = SCRIPT_SOURCE[widest];
	return { filePath: filePath + extension, language, content: blankOutside(content, blocks) };
}

// A plain scan like Svelte's own preprocessor: it also finds a `<script>` nested in markup, but it
// cannot lose a top-level block to a misread template, and nested scripts are rare. It reads each
// character once, because a backtracking regex rescanned the rest of the file at every `<script`.
function findScriptBlocks(content: string): ScriptBlock[] {
	const blocks: ScriptBlock[] = [];
	let commentEndAhead = true;
	TAG_START.lastIndex = 0;
	for (let tag = TAG_START.exec(content); tag; tag = TAG_START.exec(content)) {
		if (tag[0] === '<!--') {
			const commentEnd = commentEndAhead ? content.indexOf('-->', TAG_START.lastIndex) : -1;
			if (commentEnd === -1) commentEndAhead = false;
			else TAG_START.lastIndex = commentEnd + 3;
			continue;
		}

		const attributesStart = TAG_START.lastIndex;
		const tagEnd = scanOpenTag(content, attributesStart);
		if (tagEnd === -1) break;
		if (content[tagEnd] !== '>') {
			TAG_START.lastIndex = tagEnd + 1;
			continue;
		}

		const attributes = content.slice(attributesStart, tagEnd);
		const bodyStart = tagEnd + 1;
		TAG_START.lastIndex = bodyStart;
		if (attributes.trimEnd().endsWith('/')) continue;

		CLOSE_TAG.lastIndex = bodyStart;
		const close = CLOSE_TAG.exec(content);
		// No later open tag can find a closing tag either
		if (!close) break;

		const lang = scriptLang(attributes);
		if (lang) blocks.push({ lang, start: bodyStart, end: close.index });
		TAG_START.lastIndex = close.index;
	}
	return blocks;
}

// The index of the `>` that ends the open tag, skipping quoted values, or of a quote that never
// closes, or -1 when the file ends first
function scanOpenTag(content: string, from: number): number {
	for (let i = from; i < content.length; i++) {
		const char = content[i];
		if (char === '>') return i;
		if (char === '"' || char === "'") {
			const quoteEnd = content.indexOf(char, i + 1);
			if (quoteEnd === -1) return i;
			i = quoteEnd;
		}
	}
	return -1;
}

function scriptLang(attributes: string): ScriptLang | null {
	const values = new Map<string, string>();
	for (const [, name, double, single, bare] of attributes.matchAll(ATTRIBUTE)) {
		values.set(name.toLowerCase(), (double ?? single ?? bare ?? '').trim().toLowerCase());
	}
	const type = values.get('type');
	const typeLang = type === undefined ? 'js' : TYPE_ATTR[type];
	if (!typeLang) return null;
	const lang = values.get('lang');
	return lang === undefined ? typeLang : (LANG_ATTR[lang] ?? null);
}

function blankOutside(content: string, blocks: ScriptBlock[]): string {
	let result = '';
	let position = 0;
	for (const { start, end } of blocks) {
		result += blank(content.slice(position, start)) + content.slice(start, end);
		position = end;
	}
	return result + blank(content.slice(position));
}

function blank(text: string): string {
	return text.replace(/[^\r\n]/g, ' ');
}
