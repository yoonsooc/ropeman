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

/** `class A extends B with C`: the class's base, then the traits it mixes in */
function scalaBases(type: string): string {
	return `([(class_definition extend: (extends_clause type: ${type}))
  (object_definition extend: (extends_clause type: ${type}))
  (trait_definition extend: (extends_clause type: ${type}))] @owner)`;
}

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
	// `impl Trait for Type` implements the trait; `trait A: B` inherits B
	'tree-sitter-rust.wasm': `${CALL}
((impl_item trait: (_) @implements) @owner)
((trait_item bounds: (trait_bounds (_) @inherits)) @owner)`,
	'tree-sitter-c.wasm': CALL,
	'tree-sitter-cpp.wasm': `${CALL}
(new_expression type: (_) @callee)
([(class_specifier (base_class_clause (_) @inherits)) (struct_specifier (base_class_clause (_) @inherits))] @owner)`,
	'tree-sitter-java.wasm': `((method_invocation name: (_) @name) @call)
(object_creation_expression type: (_) @callee)
(explicit_constructor_invocation constructor: (_) @callee)
((class_declaration superclass: (superclass (_) @inherits)) @owner)
([(class_declaration interfaces: (super_interfaces (type_list (_) @implements)))
  (enum_declaration interfaces: (super_interfaces (type_list (_) @implements)))] @owner)
((interface_declaration (extends_interfaces (type_list (_) @inherits))) @owner)`,
	'tree-sitter-ruby.wasm': `((call method: (_) @name) @call)
((class superclass: (superclass (_) @inherits)) @owner)`,
	'tree-sitter-php.wasm': `(function_call_expression function: (_) @callee)
((member_call_expression name: (_) @name) @call)
((nullsafe_member_call_expression name: (_) @name) @call)
((scoped_call_expression name: (_) @name) @call)
(object_creation_expression [(name) (qualified_name)] @callee)
([(class_declaration (base_clause (_) @inherits)) (interface_declaration (base_clause (_) @inherits))] @owner)
((class_declaration (class_interface_clause (_) @implements)) @owner)`,
	// A class names its superclass and its protocols in one list, so all of them are bases; a
	// struct, enum or extension can only conform
	'tree-sitter-swift.wasm': `(call_expression . (_) @callee (call_suffix))
([(class_declaration declaration_kind: "class" (inheritance_specifier inherits_from: (_) @inherits))
  (protocol_declaration (inheritance_specifier inherits_from: (_) @inherits))] @owner)
((class_declaration declaration_kind: ["struct" "enum" "extension" "actor"]
  (inheritance_specifier inherits_from: (_) @implements)) @owner)`,
	// A superclass is called (`Base()`), an interface is not
	'tree-sitter-kotlin.wasm': `(call_expression . (_) @callee (call_suffix))
([(class_declaration (delegation_specifier (constructor_invocation (user_type) @inherits)))
  (object_declaration (delegation_specifier (constructor_invocation (user_type) @inherits)))] @owner)
([(class_declaration (delegation_specifier (user_type) @implements))
  (object_declaration (delegation_specifier (user_type) @implements))] @owner)`,
	// As in Swift, a class's base list holds its base class and its interfaces alike
	'tree-sitter-c_sharp.wasm': `(invocation_expression function: (_) @callee)
(object_creation_expression type: (_) @callee)
([(class_declaration (base_list (_) @inherits)) (interface_declaration (base_list (_) @inherits))] @owner)
([(struct_declaration (base_list (_) @implements)) (record_declaration (base_list (_) @inherits))] @owner)`,
	'tree-sitter-scala.wasm': `${CALL}
${scalaBases('[(type_identifier) (stable_type_identifier) (generic_type)] @inherits')}
${scalaBases('(compound_type base: (_) @inherits)')}
${scalaBases('(compound_type extra: (_) @implements)')}`,
	// Every command, and the script a shell runs (`bash deploy.sh`); `source` is an import. Only
	// bare words: a quoted, `$`-expanded or `KEY=value` word is an argument's text, not a name
	'tree-sitter-bash.wasm': `(command name: (command_name) @callee
  (#match? @callee "${BARE_WORD}")
  (#not-match? @callee "^(source|[.]|(ba|da|z)?sh|exec)$"))
(command name: (command_name) @runner . argument: (word) @callee
  (#match? @runner "^((ba|da|z)?sh|exec)$") (#match? @callee "${BARE_WORD}"))`
};

const JS_LOCALS = `
(formal_parameters (identifier) @local)
(formal_parameters (assignment_pattern left: (identifier) @local))
(formal_parameters (rest_pattern (identifier) @local))
(arrow_function parameter: (identifier) @local)`;

const TS_LOCALS = `
(required_parameter pattern: (identifier) @local)
(optional_parameter pattern: (identifier) @local)
(required_parameter pattern: (rest_pattern (identifier) @local))
(arrow_function parameter: (identifier) @local)`;

const ECMA_LOCALS = `
(variable_declarator name: (identifier) @local)
(object_pattern (shorthand_property_identifier_pattern) @local)
(pair_pattern value: (identifier) @local)
(array_pattern (identifier) @local)
(catch_clause parameter: (identifier) @local)
(for_in_statement left: (identifier) @local)`;

const ECMA_SCOPES = [
	'function_declaration',
	'function_expression',
	'generator_function_declaration',
	'generator_function',
	'arrow_function',
	'method_definition'
];

interface LocalRules {
	query: string;
	/** Node types that make a scope */
	scopes: readonly string[];
	/**
	 * For a language where a local is seen only after it is declared (Go, Rust, Java, C#,
	 * Kotlin): the declarations it starts after, so `model := model.Price()` still calls the
	 * package. Without it the whole function sees the name, as in Python, where assigning a name
	 * anywhere makes it local, and in JS, where a closure written earlier calls it later.
	 */
	after?: readonly string[];
}

/**
 * Names a function binds for itself: parameters and the plain local declarations of each
 * grammar, with the node types that make a scope. A call whose first name one of these binds
 * around it (`next()` in `function f(next)`) gets `local`, so the resolver does not take an
 * import or a declaration of that name for it. Grammars left out bind nothing here.
 */
const LOCALS: Record<string, LocalRules> = {
	'tree-sitter-javascript.wasm': { query: JS_LOCALS + ECMA_LOCALS, scopes: ECMA_SCOPES },
	'tree-sitter-typescript.wasm': { query: TS_LOCALS + ECMA_LOCALS, scopes: ECMA_SCOPES },
	'tree-sitter-tsx.wasm': { query: TS_LOCALS + ECMA_LOCALS, scopes: ECMA_SCOPES },
	'tree-sitter-python.wasm': {
		query: `
(parameters (identifier) @local)
(default_parameter name: (identifier) @local)
(typed_parameter (identifier) @local)
(typed_default_parameter name: (identifier) @local)
(list_splat_pattern (identifier) @local)
(dictionary_splat_pattern (identifier) @local)
(lambda_parameters (identifier) @local)
(assignment left: (identifier) @local)
(assignment left: (pattern_list (identifier) @local))
(assignment left: (tuple_pattern (identifier) @local))
(augmented_assignment left: (identifier) @local)
(for_statement left: (identifier) @local)
(for_statement left: (pattern_list (identifier) @local))
(for_in_clause left: (identifier) @local)
(as_pattern alias: (as_pattern_target (identifier) @local))
(named_expression name: (identifier) @local)`,
		scopes: ['function_definition', 'lambda']
	},
	'tree-sitter-go.wasm': {
		query: `
(parameter_declaration name: (identifier) @local)
(variadic_parameter_declaration name: (identifier) @local)
(short_var_declaration left: (expression_list (identifier) @local))
(var_spec name: (identifier) @local)
(range_clause left: (expression_list (identifier) @local))`,
		scopes: ['function_declaration', 'method_declaration', 'func_literal'],
		after: ['short_var_declaration', 'var_spec', 'range_clause']
	},
	'tree-sitter-rust.wasm': {
		query: `
(parameter pattern: (identifier) @local)
(let_declaration pattern: (identifier) @local)
(tuple_pattern (identifier) @local)
(closure_parameters (identifier) @local)
(for_expression pattern: (identifier) @local)`,
		scopes: ['function_item', 'closure_expression'],
		after: ['let_declaration']
	},
	'tree-sitter-java.wasm': {
		query: `
(formal_parameter name: (identifier) @local)
(local_variable_declaration declarator: (variable_declarator name: (identifier) @local))
(enhanced_for_statement name: (identifier) @local)
(catch_formal_parameter name: (identifier) @local)
(lambda_expression parameters: (identifier) @local)
(inferred_parameters (identifier) @local)`,
		scopes: ['method_declaration', 'constructor_declaration', 'lambda_expression'],
		after: ['local_variable_declaration']
	},
	'tree-sitter-c_sharp.wasm': {
		query: `
(parameter name: (identifier) @local)
(local_declaration_statement (variable_declaration (variable_declarator (identifier) @local)))
(for_each_statement left: (identifier) @local)
(catch_declaration name: (identifier) @local)`,
		scopes: [
			'method_declaration',
			'constructor_declaration',
			'local_function_statement',
			'lambda_expression',
			'anonymous_method_expression'
		],
		after: ['local_declaration_statement']
	},
	'tree-sitter-kotlin.wasm': {
		query: `
(parameter (simple_identifier) @local)
(property_declaration (variable_declaration (simple_identifier) @local))
(lambda_parameters (variable_declaration (simple_identifier) @local))
(for_statement (variable_declaration (simple_identifier) @local))`,
		scopes: ['function_declaration', 'lambda_literal', 'anonymous_function'],
		after: ['property_declaration']
	}
};

// Python `class A(B, metaclass=M)`: only positional bases are inherited. A C++ `public`, a C#
// record's constructor arguments and a Rust lifetime or `?Sized` bound name no base
const NOT_A_BASE = new Set([
	'keyword_argument',
	'list_splat',
	'dictionary_splat',
	'comment',
	'access_specifier',
	'argument_list',
	'lifetime',
	'removed_trait_bound'
]);

const MAX_WRITTEN = 200;

interface QueryLike {
	matches(node: unknown): { captures: { name: string; node: SyntaxNode }[] }[];
}

interface SyntaxNode {
	type: string;
	startIndex: number;
	endIndex: number;
	startPosition: { row: number };
	parent: SyntaxNode | null;
	childForFieldName(name: string): SyntaxNode | null;
}

type QueryFactory = (source: string) => QueryLike;

/** A grammar's compiled query, or `null` when it has none or its query failed to compile. */
const compiled = new Map<string, QueryLike | null>();
const compiledLocals = new Map<string, QueryLike | null>();
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
		const bindings = localBindings(root, source, grammarFile, compile);
		const refs: ASTRef[] = [];
		for (const match of query.matches(root)) {
			const ref = toRef(match.captures, source);
			if (!ref) continue;
			if (ref.kind === 'calls' && bindings && isLocal(ref.written, match.captures, bindings)) {
				ref.local = true;
			}
			refs.push(ref);
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

/** Each name the file's functions bind, with the spans (`[start, end)`) of code that sees it. */
type Bindings = Map<string, [number, number][]>;

/**
 * The parameters and locals of every function in the tree. A query that fails here costs only
 * the `local` marks, never the refs, so it warns once and is not tried again.
 */
function localBindings(
	root: unknown,
	source: string,
	grammarFile: string,
	compile: QueryFactory
): Bindings | null {
	const locals = LOCALS[grammarFile];
	if (!locals) return null;
	let query = compiledLocals.get(grammarFile);
	if (query === undefined) {
		compiledLocals.set(grammarFile, null);
		try {
			query = compile(locals.query);
		} catch (err) {
			warnOnce(`${grammarFile} locals`, err, 'its calls are not checked for locals');
			query = null;
		}
		compiledLocals.set(grammarFile, query);
	}
	if (!query) return null;
	const scopes = new Set(locals.scopes);
	const after = locals.after ? new Set(locals.after) : null;
	const bindings: Bindings = new Map();
	for (const match of query.matches(root)) {
		for (const { node } of match.captures) {
			let scope = node.parent;
			let declaration: SyntaxNode | null = null;
			while (scope && !scopes.has(scope.type)) {
				if (after?.has(scope.type)) declaration ??= scope;
				scope = scope.parent;
			}
			if (!scope) continue;
			// Defaults and annotations run outside the function (`def f(deprecated=deprecated())`)
			const body = scope.childForFieldName('body')?.startIndex ?? scope.startIndex;
			const start = Math.max(body, after ? (declaration ?? node).endIndex : body);
			const name = source.slice(node.startIndex, node.endIndex);
			const spans = bindings.get(name) ?? [];
			spans.push([start, scope.endIndex]);
			bindings.set(name, spans);
		}
	}
	return bindings;
}

/** Whether a call's first name is bound by a function around the call. */
function isLocal(
	written: string,
	captures: { name: string; node: SyntaxNode }[],
	bindings: Bindings
): boolean {
	const head = written.replace(/^new\s+/, '').match(/^[$@]?[A-Za-z_][\w$]*/)?.[0];
	const spans = head ? bindings.get(head) : undefined;
	if (!spans) return false;
	const at = Math.min(...captures.map((c) => c.node.startIndex));
	return spans.some(([start, end]) => start <= at && at < end);
}

function warnOnce(grammarFile: string, err: unknown, effect = 'its files get none'): void {
	if (warned.has(grammarFile)) return;
	warned.add(grammarFile);
	console.warn(`[refQueries] reading refs failed for ${grammarFile}; ${effect}`, err);
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
