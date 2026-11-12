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

const OPEN_TAG = /<!--[\s\S]*?-->|<script(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
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
// cannot lose a top-level block to a misread template, and nested scripts are rare
function findScriptBlocks(content: string): ScriptBlock[] {
	const blocks: ScriptBlock[] = [];
	OPEN_TAG.lastIndex = 0;
	for (let open = OPEN_TAG.exec(content); open; open = OPEN_TAG.exec(content)) {
		const attributes = open[1];
		if (attributes === undefined || attributes.trimEnd().endsWith('/')) continue;

		CLOSE_TAG.lastIndex = OPEN_TAG.lastIndex;
		const close = CLOSE_TAG.exec(content);
		if (!close) continue;

		const lang = scriptLang(attributes);
		if (lang) blocks.push({ lang, start: OPEN_TAG.lastIndex, end: close.index });
		OPEN_TAG.lastIndex = close.index;
	}
	return blocks;
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
