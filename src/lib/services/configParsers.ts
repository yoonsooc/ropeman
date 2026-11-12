import type { ASTSymbol } from '$lib/types/ast';
import type { ConfigLanguage } from '$lib/utils/languageDetector';

/**
 * Line parsers for the configuration files that say how a system runs: Dockerfile, Terraform,
 * `.env` and Makefile. None has a grammar in `tree-sitter-wasms`, so each is a short scan in the
 * style of Understand-Anything's non-code parsers. They return structure only: block names with
 * line ranges, and what a file points at (images, copied paths, module sources, includes,
 * prerequisites) as `import` symbols. A value is never copied into a symbol, so a `.env` secret
 * cannot reach the code map, the skeleton or the AI. Every pattern is linear per line, because
 * these run on the main thread.
 */
export const CONFIG_PARSERS: Record<ConfigLanguage, (content: string) => ASTSymbol[]> = {
	dockerfile: parseDockerfile,
	terraform: parseTerraform,
	dotenv: parseDotenv,
	makefile: parseMakefile
};

// Commands are shown as written; past this they are long inline scripts
const MAX_COMMAND = 200;

const lineSymbol = (name: string, kind: ASTSymbol['kind'], line: number): ASTSymbol => ({
	name,
	kind,
	lineStart: line,
	lineEnd: line
});

/** One instruction or rule after joining continuation lines, with its 1-based line range. */
interface LogicalLine {
	text: string;
	start: number;
	end: number;
}

/**
 * Join lines ending in `escape` with the next. Comment and blank lines inside a continuation
 * are dropped, as Docker does, when `skipInner` is set.
 */
function joinContinuation(
	lines: string[],
	from: number,
	escape: string,
	skipInner: boolean
): LogicalLine {
	let text = lines[from];
	let i = from;
	while (text.trimEnd().endsWith(escape) && i + 1 < lines.length) {
		text = text.trimEnd().slice(0, -escape.length);
		i++;
		while (skipInner && i + 1 < lines.length && /^\s*(#|$)/.test(lines[i])) i++;
		text += ' ' + lines[i].trim();
	}
	return { text, start: from + 1, end: i + 1 };
}

const DOCKER_INSTRUCTION = /^\s*([A-Za-z]+)(?:\s+(.*))?$/;
const DOCKER_ESCAPE = /^#\s*escape\s*=\s*([\\`])\s*$/i;
const HEREDOC_MARKER = /<<(-?)(["']?)([A-Za-z_][\w-]*)\2/g;

/**
 * Stages from FROM to the next FROM, each with its EXPOSE ports and ENTRYPOINT/CMD. The base
 * images and the paths COPY and ADD take from the build context are imports. `COPY --from` reads
 * another stage and FROM may name an earlier stage, so neither is an import.
 */
export function parseDockerfile(content: string): ASTSymbol[] {
	const lines = content.split(/\r?\n/);
	const symbols: ASTSymbol[] = [];
	const imported = new Set<string>();
	const stageAliases = new Set<string>();
	let stage: ASTSymbol | null = null;
	let escape = '\\';
	let seenInstruction = false;

	const addImport = (text: string, line: number) => {
		if (imported.has(text)) return;
		imported.add(text);
		symbols.push(lineSymbol(text, 'import', line));
	};

	for (let i = 0; i < lines.length; i++) {
		// A parser directive (`# escape=`) counts only above the first instruction
		const directive = seenInstruction ? null : lines[i].match(DOCKER_ESCAPE);
		if (directive) escape = directive[1];
		if (/^\s*(#|$)/.test(lines[i])) continue;
		seenInstruction = true;

		const logical = joinContinuation(lines, i, escape, true);
		i = logical.end - 1;
		const match = logical.text.match(DOCKER_INSTRUCTION);
		if (!match) continue;
		const op = match[1].toUpperCase();
		const args = (match[2] ?? '').trim();
		i = skipHeredocs(lines, i, args);

		if (op === 'FROM') {
			const words = args.split(/\s+/).filter((word) => !word.startsWith('--'));
			const image = words[0];
			if (!image) continue;
			const alias = words[1]?.toUpperCase() === 'AS' ? words[2] : undefined;
			if (image.toLowerCase() !== 'scratch' && !stageAliases.has(image.toLowerCase())) {
				addImport(image, logical.start);
			}
			if (alias) stageAliases.add(alias.toLowerCase());
			stage = { name: alias ?? image, kind: 'stage', lineStart: logical.start, lineEnd: i + 1 };
			stage.children = [];
			symbols.push(stage);
			continue;
		}
		if (!stage) continue;
		stage.lineEnd = i + 1;

		if (op === 'EXPOSE') {
			for (const port of args.split(/\s+/).filter(Boolean)) {
				stage.children!.push(lineSymbol(port, 'port', logical.start));
			}
		} else if (op === 'CMD' || op === 'ENTRYPOINT') {
			const command = `${op} ${args.replace(/\s+/g, ' ')}`;
			stage.children!.push({
				...lineSymbol(command.slice(0, MAX_COMMAND), 'command', logical.start),
				lineEnd: logical.end
			});
		} else if (op === 'COPY' || op === 'ADD') {
			for (const source of copySources(args)) addImport(source, logical.start);
		}
	}
	return symbols;
}

function copySources(args: string): string[] {
	const words = args.split(/\s+/).filter(Boolean);
	if (words.some((word) => word.toLowerCase().startsWith('--from='))) return [];
	const rest = words.filter((word) => !word.startsWith('--')).join(' ');
	let paths: string[];
	if (rest.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(rest);
			paths = Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
		} catch {
			paths = rest.split(/\s+/);
		}
	} else {
		paths = rest.split(/\s+/);
	}
	// The last path is the destination in the image; a heredoc source is inline content
	return paths.slice(0, -1).filter((path) => path && !path.startsWith('<<'));
}

/** Skip the bodies of `RUN <<EOF` style heredocs, so their lines are not read as instructions. */
function skipHeredocs(lines: string[], at: number, args: string): number {
	let i = at;
	for (const [, dash, , word] of args.matchAll(HEREDOC_MARKER)) {
		while (i + 1 < lines.length) {
			i++;
			const line = dash ? lines[i].replace(/^\t+/, '') : lines[i];
			if (line.trimEnd() === word) break;
		}
	}
	return i;
}

const TF_BLOCK =
	/^\s*(resource|data|module|variable|output)((?:\s+(?:"[^"]*"|[A-Za-z_][\w-]*))+)\s*\{/;
const TF_LABEL = /"([^"]*)"|([A-Za-z_][\w-]*)/g;
const TF_MODULE_SOURCE = /^\s*source\s*=\s*"([^"]*)"/;
const TF_HEREDOC = /<<-?([A-Za-z_][\w-]*)\s*$/;

const TF_BLOCKS: Record<string, { kind: ASTSymbol['kind']; name: (labels: string[]) => string }> = {
	resource: { kind: 'resource', name: ([type, name]) => `${type}.${name}` },
	data: { kind: 'resource', name: ([type, name]) => `data.${type}.${name}` },
	module: { kind: 'resource', name: ([name]) => `module.${name}` },
	variable: { kind: 'input', name: ([name]) => name },
	output: { kind: 'output', name: ([name]) => name }
};

/** Scanner state carried across lines: brace depth and whether a comment or heredoc is open. */
interface HclScan {
	depth: number;
	inComment: boolean;
	heredoc: string | null;
}

/**
 * Top-level resource, data, module, variable and output blocks, each running to its matching
 * brace. Resource, data and module blocks share the `resource` kind and are named by their
 * Terraform address (`aws_s3_bucket.logs`, `data.aws_ami.ubuntu`, `module.vpc`). A module's
 * `source` is an import. Braces inside strings, comments and heredocs do not count.
 */
export function parseTerraform(content: string): ASTSymbol[] {
	const lines = content.split(/\r?\n/);
	const symbols: ASTSymbol[] = [];
	const scan: HclScan = { depth: 0, inComment: false, heredoc: null };
	let open: { symbol: ASTSymbol; isModule: boolean } | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (scan.heredoc) {
			if (line.trim() === scan.heredoc) scan.heredoc = null;
			continue;
		}
		if (scan.depth === 0 && !scan.inComment) {
			const header = line.match(TF_BLOCK);
			const block = header && TF_BLOCKS[header[1]];
			if (header && block) {
				const labels = [...header[2].matchAll(TF_LABEL)].map((m) => m[1] ?? m[2]);
				const symbol: ASTSymbol = {
					name: block.name(labels),
					kind: block.kind,
					lineStart: i + 1,
					lineEnd: lines.length
				};
				symbols.push(symbol);
				open = { symbol, isModule: header[1] === 'module' };
			}
		}
		if (open?.isModule && scan.depth === 1 && !scan.inComment) {
			const source = line.match(TF_MODULE_SOURCE);
			if (source) symbols.push(lineSymbol(source[1], 'import', i + 1));
		}
		scanHclLine(line, scan);
		if (open && scan.depth === 0) {
			open.symbol.lineEnd = i + 1;
			open = null;
		}
	}
	return symbols;
}

function scanHclLine(line: string, scan: HclScan): void {
	let inString = false;
	// The depth each open `${` or `%{` returns to; its closing brace resumes the string around it
	const templates: number[] = [];
	for (let c = 0; c < line.length; c++) {
		const ch = line[c];
		if (scan.inComment) {
			if (ch === '*' && line[c + 1] === '/') {
				scan.inComment = false;
				c++;
			}
		} else if (inString) {
			const next = line[c + 1];
			if (ch === '\\' || ((ch === '$' || ch === '%') && next === ch)) {
				c++;
			} else if (ch === '"') {
				inString = false;
			} else if ((ch === '$' || ch === '%') && next === '{') {
				templates.push(scan.depth);
				scan.depth++;
				inString = false;
				c++;
			}
		} else if (ch === '"') {
			inString = true;
		} else if (ch === '#' || (ch === '/' && line[c + 1] === '/')) {
			return;
		} else if (ch === '/' && line[c + 1] === '*') {
			scan.inComment = true;
			c++;
		} else if (ch === '<' && line[c + 1] === '<') {
			const heredoc = line.slice(c).match(TF_HEREDOC);
			if (heredoc) {
				scan.heredoc = heredoc[1];
				return;
			}
		} else if (ch === '{') {
			scan.depth++;
		} else if (ch === '}') {
			scan.depth = Math.max(0, scan.depth - 1);
			if (templates.at(-1) === scan.depth) {
				templates.pop();
				inString = true;
			}
		}
	}
}

const DOTENV_ASSIGNMENT = /^(\s*)(?:export\s+)?([A-Za-z_][\w.-]*)\s*=(?!=)/;
const DOTENV_SEPARATOR = /^\s*(?:#|$)/;

/**
 * One `env` symbol per key, out of the keys dotenv reads. The value is scanned only for an
 * unclosed quote, so a quoted multi-line value (a PEM key) is skipped whole.
 *
 * An unquoted value ends at its newline, so a pasted multi-line value spills onto lines dotenv
 * reads as keys (`Xk3jQ9Zz==` becomes key `Xk3jQ9Zz`). Once a key is followed by a line that is
 * no assignment, or by one indented deeper than the key, every line up to the next blank line or
 * comment is taken as that key's value. This can drop a real key, never make one from value text.
 * A value starting with `=` is base64 padding, not a key.
 */
export function parseDotenv(content: string): ASTSymbol[] {
	const lines = content.split(/\r?\n/);
	const symbols: ASTSymbol[] = [];
	let open: { symbol: ASTSymbol; indent: number } | null = null;
	let spilled = false;
	for (let i = 0; i < lines.length; i++) {
		if (DOTENV_SEPARATOR.test(lines[i])) {
			open = null;
			spilled = false;
			continue;
		}
		const match = lines[i].match(DOTENV_ASSIGNMENT);
		if (!match || spilled || (open && match[1].length > open.indent)) {
			if (open) {
				spilled = true;
				open.symbol.lineEnd = i + 1;
			}
			continue;
		}
		const symbol: ASTSymbol = { name: match[2], kind: 'env', lineStart: i + 1, lineEnd: i + 1 };
		const value = lines[i].slice(match[0].length).trimStart();
		const quote = value[0];
		if ((quote === '"' || quote === "'" || quote === '`') && !closesQuote(value.slice(1), quote)) {
			// Linear: a found close moves i past the scan, and after a failed scan no later key opens this quote
			let close = i + 1;
			while (close < lines.length && !closesQuote(lines[close], quote)) close++;
			// A quote never closed is a one-line value, as dotenv reads it
			if (close < lines.length) i = close;
		}
		symbol.lineEnd = i + 1;
		symbols.push(symbol);
		open = { symbol, indent: match[1].length };
	}
	return symbols;
}

function closesQuote(text: string, quote: string): boolean {
	for (let c = 0; c < text.length; c++) {
		if (text[c] === '\\') c++;
		else if (text[c] === quote) return true;
	}
	return false;
}

const MAKE_INCLUDE = /^\s*-?s?include\s+(.+)$/;
const MAKE_DEFINE = /^\s*(?:(?:export|override)\s+)?define\b/;
const MAKE_ENDEF = /^\s*endef\b/;
const MAKE_DIRECTIVE =
	/^\s*(?:ifeq|ifneq|ifdef|ifndef|else|endif|export|unexport|override|vpath|undefine)(?:\s|$)/;
// .PHONY, .SUFFIXES, .DEFAULT and the other special targets configure make itself
const MAKE_SPECIAL_TARGET = /^\.[A-Z_]+$/;
const MAKE_TARGET_VARIABLE = /^\s*(?:(?:export|override|private)\s+)*[^\s=:#]+\s*(?:[+?!]|::?)?=/;

/**
 * One `target` per rule target, running to its last recipe line, with each prerequisite as a
 * child `import`. Pattern rules (`%.o: %.c`) are targets like any other; a static pattern rule
 * keeps the prerequisites after its second colon. `include` lines are file imports. Variable
 * assignments, `define` bodies and special targets such as `.PHONY` are not rules.
 */
export function parseMakefile(content: string): ASTSymbol[] {
	const lines = content.split(/\r?\n/);
	const symbols: ASTSymbol[] = [];
	let rule: ASTSymbol[] = [];
	let inDefine = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (inDefine) {
			if (MAKE_ENDEF.test(line)) inDefine = false;
			continue;
		}
		// A tab line outside a rule is an ordinary line to make, so only a rule's tab lines are its recipe
		if (line.startsWith('\t') && rule.length > 0) {
			const logical = joinContinuation(lines, i, '\\', false);
			i = logical.end - 1;
			for (const target of rule) target.lineEnd = logical.end;
			continue;
		}
		if (/^\s*(#|$)/.test(line)) continue;
		rule = [];
		if (MAKE_DEFINE.test(line)) {
			inDefine = true;
			continue;
		}
		const logical = joinContinuation(lines, i, '\\', false);
		i = logical.end - 1;
		const text = stripMakeComment(logical.text);

		const include = text.match(MAKE_INCLUDE);
		if (include) {
			for (const path of include[1].split(/\s+/).filter(Boolean)) {
				symbols.push(lineSymbol(path, 'import', logical.start));
			}
			continue;
		}
		if (MAKE_DIRECTIVE.test(text)) continue;
		rule = readRule(text, logical);
		symbols.push(...rule);
	}
	return symbols;
}

function readRule(text: string, at: LogicalLine): ASTSymbol[] {
	const colon = indexOutsideVariables(text, ':');
	if (colon === -1) return [];
	const equals = indexOutsideVariables(text, '=');
	if (equals !== -1 && equals < colon) return [];
	if (/^:*=/.test(text.slice(colon + 1))) return [];

	const doubleColon = text[colon + 1] === ':';
	let rest = text.slice(colon + (doubleColon ? 2 : 1));
	if (MAKE_TARGET_VARIABLE.test(rest)) return [];
	const recipe = indexOutsideVariables(rest, ';');
	if (recipe !== -1) rest = rest.slice(0, recipe);
	const patternColon = indexOutsideVariables(rest, ':');
	if (patternColon !== -1) rest = rest.slice(patternColon + 1);

	const prerequisites = rest.split(/\s+/).filter((word) => word && word !== '|');
	return text
		.slice(0, colon)
		.split(/\s+/)
		.filter((name) => name && !MAKE_SPECIAL_TARGET.test(name))
		.map((name) => ({
			name,
			kind: 'target',
			lineStart: at.start,
			lineEnd: at.end,
			children: prerequisites.map((prerequisite) => lineSymbol(prerequisite, 'import', at.start))
		}));
}

/** First `char` outside `$(…)` and `${…}`, so `$(SRC:.c=.o)` is not read as a rule colon. */
function indexOutsideVariables(text: string, char: string): number {
	let depth = 0;
	for (let c = 0; c < text.length; c++) {
		const ch = text[c];
		if (ch === '$' && (text[c + 1] === '(' || text[c + 1] === '{')) {
			depth++;
			c++;
		} else if (depth > 0 && (ch === ')' || ch === '}')) {
			depth--;
		} else if (depth === 0 && ch === char) {
			return c;
		}
	}
	return -1;
}

function stripMakeComment(text: string): string {
	const hash = text.search(/(^|[^\\])#/);
	return hash === -1 ? text : text.slice(0, hash + (text[hash] === '#' ? 0 : 1));
}
