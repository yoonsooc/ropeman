import type { ASTRef } from '$lib/types/ast';

/**
 * One tree-sitter query per grammar file. Capture names say what a match is:
 * - `callee`: a call; the node is the callee as written.
 * - `call` + `name`: a call whose grammar has no callee node (Java, Ruby, PHP members); the
 *   callee is the call's text up to the end of `name`.
 * - `jsx`: a JSX element; a call when the tag names a component (capitalized or dotted).
 * - `import`: the argument of `import(...)`.
 * - `inherits` / `implements` + `owner`: a base named in the heading of the class `owner`.
 */
const CALL = '(call_expression function: (_) @callee)';

const TS_HERITAGE = `
([(class_declaration (class_heritage (extends_clause value: (_) @inherits)))
  (abstract_class_declaration (class_heritage (extends_clause value: (_) @inherits)))] @owner)
([(class_declaration (class_heritage (implements_clause
    [(type_identifier) @implements (nested_type_identifier) @implements (generic_type name: (_) @implements)])))
  (abstract_class_declaration (class_heritage (implements_clause
    [(type_identifier) @implements (nested_type_identifier) @implements (generic_type name: (_) @implements)])))] @owner)`;

const ECMA_CALLS = `${CALL}
(new_expression constructor: (_) @callee)
(call_expression function: (import) arguments: (arguments . (_) @import))`;

const JSX = `
(jsx_opening_element name: (_) @jsx)
(jsx_self_closing_element name: (_) @jsx)`;

// A command or script path: letters, digits and `_./+-`, not starting with `-` (an option)
const BARE_WORD = '^[A-Za-z0-9_./+][A-Za-z0-9_./+-]*$';

const QUERIES: Record<string, string> = {
	'tree-sitter-typescript.wasm': ECMA_CALLS + TS_HERITAGE,
	'tree-sitter-tsx.wasm': ECMA_CALLS + JSX + TS_HERITAGE,
	'tree-sitter-javascript.wasm': `${ECMA_CALLS}${JSX}
((class_declaration (class_heritage . (_) @inherits)) @owner)`,
	'tree-sitter-python.wasm': `(call function: (_) @callee)
((class_definition superclasses: (argument_list (_) @inherits)) @owner)`,
	'tree-sitter-go.wasm': CALL,
	'tree-sitter-rust.wasm': CALL,
	'tree-sitter-c.wasm': CALL,
	'tree-sitter-cpp.wasm': `${CALL}
(new_expression type: (_) @callee)`,
	'tree-sitter-java.wasm': `((method_invocation name: (_) @name) @call)
(object_creation_expression type: (_) @callee)
(explicit_constructor_invocation constructor: (_) @callee)`,
	'tree-sitter-ruby.wasm': '((call method: (_) @name) @call)',
	'tree-sitter-php.wasm': `(function_call_expression function: (_) @callee)
((member_call_expression name: (_) @name) @call)
((nullsafe_member_call_expression name: (_) @name) @call)
((scoped_call_expression name: (_) @name) @call)
(object_creation_expression [(name) (qualified_name)] @callee)`,
	'tree-sitter-swift.wasm': '(call_expression . (_) @callee (call_suffix))',
	'tree-sitter-kotlin.wasm': '(call_expression . (_) @callee (call_suffix))',
	'tree-sitter-c_sharp.wasm': `(invocation_expression function: (_) @callee)
(object_creation_expression type: (_) @callee)`,
	'tree-sitter-scala.wasm': CALL,
	// Every command, and the script a shell runs (`bash deploy.sh`); `source` is an import. Only
	// bare words: a quoted, `$`-expanded or `KEY=value` word is an argument's text, not a name
	'tree-sitter-bash.wasm': `(command name: (command_name) @callee
  (#match? @callee "${BARE_WORD}")
  (#not-match? @callee "^(source|[.]|(ba|da|z)?sh|exec)$"))
(command name: (command_name) @runner . argument: (word) @callee
  (#match? @runner "^((ba|da|z)?sh|exec)$") (#match? @callee "${BARE_WORD}"))`
};

// Python `class A(B, metaclass=M)`: only positional bases are inherited
const NOT_A_BASE = new Set(['keyword_argument', 'list_splat', 'dictionary_splat', 'comment']);

const MAX_WRITTEN = 200;

interface QueryLike {
	matches(node: unknown): { captures: { name: string; node: SyntaxNode }[] }[];
}

interface SyntaxNode {
	type: string;
	startIndex: number;
	endIndex: number;
	startPosition: { row: number };
}

type QueryFactory = (source: string) => QueryLike;

/** A grammar's compiled query, or `null` when it has none or its query failed to compile. */
const compiled = new Map<string, QueryLike | null>();
const warned = new Set<string>();

/**
 * Calls, dynamic imports and class bases written in a parsed file, in source order. Deterministic:
 * only what the syntax tree says, no name lookup. `compile` builds a query for this grammar and
 * is called once per grammar. A query that fails to compile or run yields no refs, never an
 * error: refs are an addition to the symbols, and losing them must not lose the file.
 */
export function extractRefs(
	root: unknown,
	source: string,
	grammarFile: string,
	compile: QueryFactory
): ASTRef[] {
	try {
		const query = queryFor(grammarFile, compile);
		if (!query) return [];
		const refs: ASTRef[] = [];
		for (const match of query.matches(root)) {
			const ref = toRef(match.captures, source);
			if (ref) refs.push(ref);
		}
		return refs.sort((a, b) => a.line - b.line);
	} catch (err) {
		warnOnce(grammarFile, err);
		return [];
	}
}

function queryFor(grammarFile: string, compile: QueryFactory): QueryLike | null {
	const cached = compiled.get(grammarFile);
	if (cached !== undefined) return cached;
	// Set first, so a query that throws stays `null` and is not compiled again for every file
	compiled.set(grammarFile, null);
	const querySource = QUERIES[grammarFile];
	const query = querySource ? compile(querySource) : null;
	compiled.set(grammarFile, query);
	return query;
}

function warnOnce(grammarFile: string, err: unknown): void {
	if (warned.has(grammarFile)) return;
	warned.add(grammarFile);
	console.warn(`[refQueries] reading refs failed for ${grammarFile}; its files get none`, err);
}

function toRef(captures: { name: string; node: SyntaxNode }[], source: string): ASTRef | null {
	const by = (name: string) => captures.find((c) => c.name === name)?.node;
	const callee = by('callee');
	if (callee) {
		if (callee.type === 'import') return null;
		return call(textOf(source, callee.startIndex, callee.endIndex), callee.startPosition.row);
	}
	const name = by('name');
	const whole = by('call');
	if (name && whole)
		return call(textOf(source, whole.startIndex, name.endIndex), whole.startPosition.row);
	const jsx = by('jsx');
	if (jsx) {
		const tag = textOf(source, jsx.startIndex, jsx.endIndex);
		return /^[A-Z]|\./.test(tag) ? call(tag, jsx.startPosition.row) : null;
	}
	const arg = by('import');
	if (arg) {
		return {
			kind: 'dynamic_import',
			line: arg.startPosition.row + 1,
			written: unquote(source.slice(arg.startIndex, arg.endIndex))
		};
	}
	const owner = by('owner');
	for (const kind of ['inherits', 'implements'] as const) {
		const base = by(kind);
		if (!base || !owner || NOT_A_BASE.has(base.type)) continue;
		return {
			kind,
			line: base.startPosition.row + 1,
			written: textOf(source, base.startIndex, base.endIndex),
			ownerLine: owner.startPosition.row + 1
		};
	}
	return null;
}

function call(written: string, row: number): ASTRef | null {
	return written ? { kind: 'calls', line: row + 1, written } : null;
}

/** The source between two offsets, with whitespace dropped and bracket contents emptied. */
function textOf(source: string, start: number, end: number): string {
	return simplifyCallee(source.slice(start, end));
}

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const QUOTES = new Set(['"', "'", '`']);
const WHITESPACE = /\s/;
const WORD = /[\w$]/;

/**
 * `z.object({ a: 1 }).strict` becomes `z.object().strict`: arguments and subscripts say nothing
 * about which function is called, and a builder chain would otherwise carry its whole body.
 */
export function simplifyCallee(text: string): string {
	let out = '';
	let space = false;
	const closers: string[] = [];
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (closers.length > 0) {
			if (QUOTES.has(ch)) {
				i = skipString(text, i);
			} else if (ch in OPEN) {
				closers.push(OPEN[ch]);
			} else if (ch === closers[closers.length - 1]) {
				closers.pop();
				if (closers.length === 0) out += ch;
			}
			continue;
		}
		if (WHITESPACE.test(ch)) {
			space = out.length > 0;
			continue;
		}
		// A space survives only between two words, as in `new Store`
		if (space && WORD.test(ch) && WORD.test(out[out.length - 1])) out += ' ';
		space = false;
		out += ch;
		if (ch in OPEN) closers.push(OPEN[ch]);
	}
	return out.length > MAX_WRITTEN ? `${out.slice(0, MAX_WRITTEN)}…` : out;
}

function skipString(text: string, open: number): number {
	const quote = text[open];
	for (let i = open + 1; i < text.length; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === quote) return i;
	}
	return text.length;
}

function unquote(text: string): string {
	const first = text[0];
	return QUOTES.has(first) && text.length >= 2 && text.endsWith(first) ? text.slice(1, -1) : text;
}
