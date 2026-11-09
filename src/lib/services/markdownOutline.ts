import type { ASTSymbol } from '$lib/types/ast';

/**
 * Outline a Markdown file as symbols so instruction files (SKILL.md, AGENTS.md, rules)
 * reach the skeleton without tree-sitter. Only structure leaves the browser:
 * frontmatter `name` and `description`, H1–H6 headings nested by level, and links to
 * other files in the repository (as imports). Paragraphs, fenced code and HTML comments
 * are never read. Runs on the main thread, so every pattern here is linear per line.
 */

const FRONTMATTER_KEYS = new Set(['name', 'description']);
const MAX_FRONTMATTER_VALUE = 500;
// Longer lines are prose or generated content; skipping them also bounds the regex cost
const MAX_LINE = 2000;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const LINK = /(!?)\[[^\][]*\]\(\s*<?([^)\s>]+)/g;
const INLINE_COMMENT = /<!--.*?-->/g;

export function extractMarkdownSymbols(content: string): ASTSymbol[] {
	const lines = content.split(/\r?\n/);
	const symbols: ASTSymbol[] = [];
	let i = 0;

	if (lines[0]?.trim() === '---') {
		const end = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
		if (end > 0) {
			symbols.push(...readFrontmatter(lines.slice(1, end), 2));
			i = end + 1;
		}
	}

	const roots: ASTSymbol[] = [];
	const stack: { level: number; symbol: ASTSymbol }[] = [];
	const links = new Set<string>();
	let fence: string | null = null;
	let inComment = false;

	for (; i < lines.length; i++) {
		let line = lines[i];
		const lineNo = i + 1;
		if (line.length > MAX_LINE) continue;

		if (fence) {
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		if (inComment) {
			const end = line.indexOf('-->');
			if (end === -1) continue;
			inComment = false;
			line = line.slice(end + 3);
		}
		line = line.replace(INLINE_COMMENT, '');
		const commentStart = line.indexOf('<!--');
		if (commentStart !== -1) {
			inComment = true;
			line = line.slice(0, commentStart);
		}

		const open = line.match(FENCE_OPEN);
		if (open) {
			fence = open[1];
			continue;
		}

		const heading = line.match(ATX_HEADING);
		if (heading) {
			const level = heading[1].length;
			const name = stripClosingHashes(heading[2] ?? '');
			// A section ends where the next heading of the same or higher level starts
			while (stack.length > 0 && stack[stack.length - 1].level >= level) {
				stack.pop()!.symbol.lineEnd = lineNo - 1;
			}
			if (name) {
				const symbol: ASTSymbol = {
					name,
					kind: 'heading',
					lineStart: lineNo,
					lineEnd: lines.length
				};
				const parent = stack[stack.length - 1];
				if (parent) {
					symbol.parentName = parent.symbol.name;
					(parent.symbol.children ??= []).push(symbol);
				} else {
					roots.push(symbol);
				}
				stack.push({ level, symbol });
			}
		}

		for (const match of line.matchAll(LINK)) {
			if (match[1]) continue; // images
			const target = toRepoLink(match[2]);
			if (target) links.add(target);
		}
	}

	symbols.push(...roots);
	for (const target of links) {
		symbols.push({ name: target, kind: 'import', lineStart: 1, lineEnd: 1 });
	}
	return symbols;
}

/** CommonMark: a closing fence uses the same character, is at least as long and has no info string. */
function closesFence(line: string, fence: string): boolean {
	const close = line.match(FENCE_CLOSE);
	return !!close && close[1][0] === fence[0] && close[1].length >= fence.length;
}

/** Drop an ATX heading's optional closing `#` run (`## Title ##` → `Title`). */
function stripClosingHashes(text: string): string {
	const trimmed = text.trimEnd();
	let end = trimmed.length;
	while (end > 0 && trimmed[end - 1] === '#') end--;
	if (end === 0) return '';
	if (end < trimmed.length && (trimmed[end - 1] === ' ' || trimmed[end - 1] === '\t')) {
		return trimmed.slice(0, end).trim();
	}
	return trimmed.trim();
}

function readFrontmatter(lines: string[], firstLineNo: number): ASTSymbol[] {
	const symbols: ASTSymbol[] = [];
	for (let j = 0; j < lines.length; j++) {
		const match = lines[j].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
		if (!match || !FRONTMATTER_KEYS.has(match[1])) continue;

		let value = match[2].trim();
		// Folded or literal block (`description: >` / `|`): join the indented lines below
		if (/^[>|][+-]?$/.test(value)) {
			const parts: string[] = [];
			while (j + 1 < lines.length && (/^\s+\S/.test(lines[j + 1]) || lines[j + 1].trim() === '')) {
				j++;
				if (lines[j].trim()) parts.push(lines[j].trim());
			}
			value = parts.join(' ');
		}
		value = value.replace(/^(["'])(.*)\1$/, '$2');
		if (!value) continue;
		if (value.length > MAX_FRONTMATTER_VALUE) value = value.slice(0, MAX_FRONTMATTER_VALUE) + '…';

		const lineNo = firstLineNo + j;
		symbols.push({
			name: `${match[1]}: ${value}`,
			kind: 'frontmatter',
			lineStart: lineNo,
			lineEnd: lineNo
		});
	}
	return symbols;
}

/** Keep relative links to repository files; drop URLs, mail links and in-page anchors. */
function toRepoLink(raw: string): string | null {
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#') || raw.startsWith('//')) return null;
	const target = raw.split('#')[0].split('?')[0];
	return target || null;
}
