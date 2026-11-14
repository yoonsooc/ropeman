/**
 * Binds the reference sites of a code map (calls, class bases, dynamic imports) to the symbols
 * they name. Pure, and run after `resolveImports`, so a file's bound imports say what each name
 * in it means. A target the code decides is EXTRACTED; one picked because a name has a single
 * definition is INFERRED; a name with several definitions stays unresolved, never a guess.
 */
import type { SymbolKind } from '$lib/types/ast';
import type {
	Binding,
	CodeMap,
	Confidence,
	Endpoint,
	ExternalEnd,
	FilePath,
	FileRecord,
	ModuleSite,
	RefSite,
	SymbolEnd,
	SymbolId,
	SymbolRecord
} from '$lib/types/codeMap';
import { goPackages, isGoPackageClause, readGoImport } from './goImports';
import { scriptModuleBinder, type ResolverConfig } from './importResolver';
import { readUse, resolveUsePath, rustCrates, type RustCrates } from './rustImports';

/** How a bound site was decided, most certain first. */
export type RefRule =
	/** The file imports the name, or a module or package it is reached through */
	| 'import'
	/** `this.m`, `self.m`, or a bare name in a language where it means the enclosing class's member */
	| 'own-member'
	/** A member of a class the base list names */
	| 'base-member'
	/** A name declared at the top of the same file */
	| 'same-file'
	/** Go's package, a Java `package`, or the folder that stands in for a package or module */
	| 'same-package'
	/** A member of a type the call names (`Foo.of`, `Foo::new`) */
	| 'type-member'
	/** The only definition of the name in the language's files */
	| 'unique-name';

/**
 * Why a site stays unresolved. `not-in-scope`: a language where every name is declared or
 * imported, and this one is neither, so it is a local, a parameter or a builtin. `ambiguous`:
 * several definitions fit. `no-definition`: none does. `shadowed`: the name is a parameter or a
 * local of the enclosing function, so no declaration elsewhere is it. `unread`: the callee is an expression,
 * not a name (`(a || b)()`, `<T as Trait>::f`, a template import).
 */
export type RefUnresolvedReason =
	| 'not-in-scope'
	| 'shadowed'
	| 'ambiguous'
	| 'no-definition'
	| 'unread';

export interface RefOutcome {
	path: FilePath;
	line: number;
	kind: RefSite['kind'];
	written: string | null;
	resolution:
		| { status: 'bound'; rule: RefRule; confidence: Confidence }
		| { status: 'external'; rule: RefRule }
		| { status: 'unresolved'; reason: RefUnresolvedReason };
}

/** Languages whose files can name each other's declarations. */
type Family =
	| 'script'
	| 'python'
	| 'go'
	| 'rust'
	| 'jvm'
	| 'c'
	| 'csharp'
	| 'ruby'
	| 'php'
	| 'swift'
	| 'bash';

/**
 * What a language's scoping says about a name, as a table so one resolver reads all of them.
 * `closed`: every name a file uses is declared in it or imported, so a bare name found in
 * neither is a local or a builtin and never another file's declaration. `implicitSelf`: inside
 * a class a bare name means the class's own member first (Java, not Python).
 */
interface FamilyRules {
	closed: boolean;
	implicitSelf: boolean;
	self: readonly string[];
	base: readonly string[];
	/** Where a declaration is visible without an import */
	package: 'go' | 'java' | 'folder' | null;
}

const FAMILY_RULES: Record<Family, FamilyRules> = {
	script: { closed: true, implicitSelf: false, self: ['this'], base: ['super'], package: null },
	python: { closed: true, implicitSelf: false, self: ['self', 'cls'], base: [], package: null },
	go: { closed: true, implicitSelf: false, self: [], base: [], package: 'go' },
	rust: { closed: true, implicitSelf: false, self: ['self', 'Self'], base: [], package: null },
	jvm: { closed: false, implicitSelf: true, self: ['this'], base: ['super'], package: 'java' },
	c: { closed: false, implicitSelf: true, self: ['this'], base: [], package: null },
	csharp: { closed: false, implicitSelf: true, self: ['this'], base: ['base'], package: 'folder' },
	ruby: { closed: false, implicitSelf: true, self: ['self'], base: ['super'], package: null },
	php: {
		closed: false,
		implicitSelf: true,
		self: ['$this', 'self', 'static'],
		base: ['parent'],
		package: null
	},
	swift: { closed: false, implicitSelf: true, self: ['self'], base: ['super'], package: 'folder' },
	bash: { closed: true, implicitSelf: false, self: [], base: [], package: null }
};

const FAMILY_OF: Record<string, Family> = {
	typescript: 'script',
	javascript: 'script',
	tsx: 'script',
	jsx: 'script',
	svelte: 'script',
	vue: 'script',
	python: 'python',
	go: 'go',
	rust: 'rust',
	java: 'jvm',
	kotlin: 'jvm',
	scala: 'jvm',
	c: 'c',
	cpp: 'c',
	csharp: 'csharp',
	ruby: 'ruby',
	php: 'php',
	swift: 'swift',
	bash: 'bash'
};

/**
 * Members the language's own types declare (`dict.get`, `http.Header.Set`, `Vec::push`). A call
 * on a value of unknown type with one of these names is as likely the library's as the repo's,
 * so a single repo definition by that name is no evidence. Most wrong inferences in samples
 * from FastAPI and gin were one of these (`child_scope.get`, `req.Header.Set`).
 */
const LIBRARY_MEMBERS: Partial<Record<Family, ReadonlySet<string>>> = {
	script: new Set(
		'get set has add delete clear push pop shift unshift map filter forEach reduce find findIndex some every includes indexOf join slice splice concat keys values entries then catch finally toString valueOf split replace trim startsWith endsWith match test call apply bind sort reverse fill flat flatMap at next emit on off once write end close read json text append remove'.split(
			' '
		)
	),
	python: new Set(
		'get set keys values items append extend insert pop remove clear copy update add discard index count sort reverse join split strip lstrip rstrip replace format startswith endswith lower upper encode decode read write close open readline readlines seek flush send next wait put run start stop cancel result done'.split(
			' '
		)
	),
	go: new Set(
		'Error String Set Get Add Del Write Read Close Len Type Value Lock Unlock RLock RUnlock Wait Done Err Bytes Header WriteHeader WriteString Flush Encode Decode Load Store Swap Reset Run Start Stop Do Copy Kind Elem Field Interface Int Float Bool Index Seek Sum Name'.split(
			' '
		)
	),
	rust: new Set(
		'unwrap expect clone iter iter_mut into_iter map and_then ok err is_some is_none is_ok is_err unwrap_or unwrap_or_else unwrap_or_default len is_empty push pop insert remove get get_mut contains as_ref as_mut to_string to_owned lock read write borrow borrow_mut take replace send recv try_recv poll wake as_ptr as_str split join extend drain clear first last entry keys values next fmt eq cmp hash deref drop from into'.split(
			' '
		)
	),
	jvm: new Set(
		'equals hashCode toString get set add remove put contains size isEmpty iterator stream map filter forEach collect length charAt substring append close read write run start apply invoke'.split(
			' '
		)
	),
	csharp: new Set(
		'Equals GetHashCode ToString Add Remove Contains Clear Dispose Get Set Select Where First Any ToList Invoke Write Read Close'.split(
			' '
		)
	)
};

/** Objects a script reaches without declaring them; a member of one is the platform's. */
const SCRIPT_GLOBALS: ReadonlySet<string> = new Set(
	'console Math JSON Object Array Promise Number String Boolean Date Reflect Symbol Intl Error window document globalThis process navigator location history localStorage sessionStorage crypto performance Buffer URL'.split(
		' '
	)
);

const TYPE_KINDS: ReadonlySet<SymbolKind> = new Set(['class', 'interface', 'type']);
const CALLABLE_KINDS: ReadonlySet<SymbolKind> = new Set([
	'function',
	'class',
	'method',
	'interface',
	'type'
]);

/** One declaration a reference can name. */
interface Def {
	id: SymbolId;
	path: FilePath;
	name: string;
	kind: SymbolKind;
	family: Family;
	/**
	 * The `typeKey` of the type it is declared on (class, interface, Rust impl type, Go
	 * receiver); null at the top of a file and inside a function
	 */
	owner: string | null;
	/**
	 * For a type, what its members' `owner` says: the dotted path in the file (`Outer.Inner`), so
	 * two `Inner` classes of one file stay apart. A Rust or Go type is its bare name, since its
	 * impls and methods sit apart from it
	 */
	typeKey: string | null;
	parent: Def | null;
}

/** A type as a member lookup needs it: its `typeKey` and the file that declares or extends it. */
interface TypeRef {
	key: string;
	path: FilePath;
	confidence: Confidence;
}

/** What a name means in one file. */
type Meaning =
	| { kind: 'def'; def: Def; confidence: Confidence; rule: RefRule }
	| { kind: 'module'; files: readonly FilePath[] }
	| { kind: 'external'; module: string; name: string | null };

interface FileScope {
	names: Map<string, Meaning>;
	/** Modules whose every top-level name the file sees: `from x import *`, `use a::*`, Go `.` */
	stars: FilePath[][];
}

type Found =
	| { ok: true; to: SymbolEnd | ExternalEnd; confidence: Confidence; rule: RefRule }
	| { ok: false; reason: RefUnresolvedReason };

const EXTRACTED: Confidence = 'EXTRACTED';
const INFERRED: Confidence = 'INFERRED';
const least = (a: Confidence, b: Confidence): Confidence => (a === INFERRED ? a : b);
const miss = (reason: RefUnresolvedReason): Found => ({ ok: false, reason });
const MAX_BASE_DEPTH = 8;

/**
 * Bind every reference site whose language the table knows; others stay `pending`. Class bases
 * are bound first, so a call can find a member a base class declares.
 */
export function resolveRefs(
	map: CodeMap,
	config: ResolverConfig
): { map: CodeMap; outcomes: RefOutcome[] } {
	const ctx = createContext(map, config);
	const outcomes: RefOutcome[] = [];
	const bound = new Map<FilePath, RefSite[]>();

	const visit = (pass: 'bases' | 'rest') => {
		for (const [path, record] of map.files) {
			const family = familyOf(record);
			if (!family || record.refs.length === 0) continue;
			const refs = bound.get(path) ?? [...record.refs];
			refs.forEach((ref, i) => {
				const isBase = ref.kind === 'inherits' || ref.kind === 'implements';
				if (isBase !== (pass === 'bases')) return;
				const { site, outcome } = bindRef(ref, record, family, ctx);
				refs[i] = site;
				if (outcome) outcomes.push(outcome);
				if (isBase && site.target.state === 'bound') addBase(ctx, ref, record, family, site);
			});
			bound.set(path, refs);
		}
	};
	visit('bases');
	visit('rest');

	const files = new Map<FilePath, FileRecord>();
	for (const [path, record] of map.files) {
		const refs = bound.get(path);
		files.set(path, refs ? { ...record, refs } : record);
	}
	return { map: { ...map, files }, outcomes };
}

interface Context {
	map: CodeMap;
	defs: ReadonlyMap<SymbolId, Def>;
	/** `${family}\0${name}`: top-level declarations */
	top: ReadonlyMap<string, Def[]>;
	/** `${family}\0${name}`: members of any type */
	members: ReadonlyMap<string, Def[]>;
	/** `${family}\0${owner}\0${name}`: members by the type they are declared on */
	byOwner: ReadonlyMap<string, Def[]>;
	/** `${path}\0${name}`: top-level declarations of one file */
	fileTop: ReadonlyMap<string, Def[]>;
	/** `${family}\0${folder}\0${name}`: top-level declarations of one folder */
	dirTop: ReadonlyMap<string, Def[]>;
	/** Bases of a type, by `typeKey` */
	bases: Map<string, TypeRef[]>;
	scopes: Map<FilePath, FileScope>;
	/** Built on first use, so a repo without that language pays nothing */
	rust: () => RustCrates;
	files: ReadonlySet<string>;
	dynamicImport: () => ReturnType<typeof scriptModuleBinder>;
	/** Go folders' package files, test files left out */
	goPackages: () => ReadonlyMap<string, readonly string[]>;
	/** `${package clause}\0${name}`: top-level declarations of each Java package */
	javaPackages: () => ReadonlyMap<string, Def[]>;
	/** `${path}\0${typeKey}`: the type declarations of each file */
	types: ReadonlyMap<string, Def>;
	/** Files of the folders a star import names, by the folder suffix */
	packageFiles: Map<string, FilePath[]>;
}

function createContext(map: CodeMap, config: ResolverConfig): Context {
	const defs = new Map<SymbolId, Def>();
	const top = new Map<string, Def[]>();
	const members = new Map<string, Def[]>();
	const byOwner = new Map<string, Def[]>();
	const fileTop = new Map<string, Def[]>();
	const dirTop = new Map<string, Def[]>();
	const types = new Map<string, Def>();
	const add = (index: Map<string, Def[]>, key: string, def: Def) => {
		const list = index.get(key);
		if (list) list.push(def);
		else index.set(key, [def]);
	};

	for (const [path, record] of map.files) {
		const family = familyOf(record);
		if (!family) continue;
		const walk = (sym: SymbolRecord, parent: Def | null) => {
			const qualified = qualifiedName(sym, path);
			const { owner, name } = splitOwner(qualified, sym, parent, family);
			const impl = isImplBlock(sym, family);
			const typeKey =
				TYPE_KINDS.has(sym.kind) || impl
					? family === 'rust' || family === 'go'
						? typeName(sym.name)
						: qualified
					: null;
			const def: Def = { id: sym.id, path, name, kind: sym.kind, family, owner, typeKey, parent };
			defs.set(sym.id, def);
			if (typeKey !== null && !types.has(`${path}\0${typeKey}`))
				types.set(`${path}\0${typeKey}`, def);
			const callable = CALLABLE_KINDS.has(sym.kind) && name !== '<anonymous>';
			// A function inside a function is a local, which no other file can name
			const local = parent !== null && parent.typeKey === null;
			if (callable && !impl && !local) {
				if (owner === null) {
					add(top, `${family}\0${name}`, def);
					add(fileTop, `${path}\0${name}`, def);
					add(dirTop, `${family}\0${dirOf(path)}\0${name}`, def);
				} else {
					add(members, `${family}\0${name}`, def);
					add(byOwner, `${family}\0${owner}\0${name}`, def);
				}
			}
			for (const child of sym.children) walk(child, def);
		};
		for (const sym of record.symbols) walk(sym, null);
	}

	const files = new Set<string>(map.files.keys());
	const declares = (file: string, name: string) =>
		map.files.get(file as FilePath)?.symbols.some((sym) => sym.name === name) ?? false;
	return {
		map,
		defs,
		top,
		members,
		byOwner,
		fileTop,
		dirTop,
		types,
		bases: new Map(),
		scopes: new Map(),
		rust: once(() => rustCrates(config.cargoPackages, files, declares)),
		files,
		dynamicImport: once(() => scriptModuleBinder(map, config)),
		goPackages: once(() => goPackages(files)),
		javaPackages: once(() => {
			const byClause = new Map<string, Def[]>();
			for (const list of fileTop.values()) {
				for (const def of list) {
					const record = map.files.get(def.path);
					const clause = record?.language === 'java' ? packageClause(record) : null;
					if (clause !== null) add(byClause, `${clause}\0${def.name}`, def);
				}
			}
			return byClause;
		}),
		packageFiles: new Map()
	};
}

function once<T>(make: () => T): () => T {
	let made: { value: T } | null = null;
	return () => (made ??= { value: make() }).value;
}

function familyOf(record: FileRecord): Family | null {
	return record.language ? (FAMILY_OF[record.language] ?? null) : null;
}

/** The symbol's id after the file, without the `~n` of a repeated name. */
function qualifiedName(sym: SymbolRecord, path: FilePath): string {
	return sym.id.slice(path.length + 1).replace(/~\d+$/, '');
}

/**
 * A member's name and the type it belongs to. A child's type is its parent when the parent is a
 * type, and a function's children belong to no type; a Go method sits at
 * the top as `Engine.Run`; a C++ definition outside its class is `Store::flush`. A Rust impl's
 * methods belong to the implementing type (`impl fmt::Display for Foo<T>` is `Foo`).
 */
function splitOwner(
	qualified: string,
	sym: SymbolRecord,
	parent: Def | null,
	family: Family
): { owner: string | null; name: string } {
	const name = cleanName(sym.name);
	if (parent) return { owner: parent.typeKey, name };
	if (family === 'go' && qualified.includes('.')) {
		return { owner: qualified.slice(0, qualified.lastIndexOf('.')), name };
	}
	if (family === 'c' && sym.name.includes('::')) {
		const parts = sym.name.split('(')[0].split('::');
		return { owner: parts.at(-2)!, name: parts.at(-1)! };
	}
	return { owner: null, name };
}

/** `save()` and `save(int x) const` (C++ outline names) are `save`. */
function cleanName(name: string): string {
	return name.split('(')[0].trim();
}

/** The type an impl or class heading names: `fmt::Display for Foo<T>` and `&'a Foo<T>` are `Foo`. */
function typeName(heading: string): string {
	const forIndex = heading.lastIndexOf(' for ');
	const subject = forIndex === -1 ? heading : heading.slice(forIndex + 5);
	const bare = stripGenerics(subject)
		.replace(/^(?:&\s*(?:'\w+\s+)?|mut\s+|dyn\s+)+/, '')
		.trim();
	return bare.split('::').at(-1)!.split('.').at(-1)!;
}

/**
 * A Rust impl block is a `class` in the outline, named after its type. It declares no type of
 * its own, so it is not indexed as one; its methods are. A struct or enum has no children and a
 * plain name, so a child, a ` for ` or a `<` marks the impl.
 */
function isImplBlock(sym: SymbolRecord, family: Family): boolean {
	return (
		family === 'rust' &&
		sym.kind === 'class' &&
		(sym.children.length > 0 || sym.name.includes(' for ') || sym.name.includes('<'))
	);
}

/** `Foo<T>` is `Foo`; a `<` that opens no type arguments (`a < b`) never reaches a callee. */
function stripAngles(text: string): string {
	let out = '';
	let depth = 0;
	for (const ch of text) {
		if (ch === '<') depth++;
		else if (ch === '>' && depth > 0) depth--;
		else if (depth === 0) out += ch;
	}
	return out;
}

function stripGenerics(text: string): string {
	let out = '';
	let depth = 0;
	for (const ch of text) {
		if (ch === '<' || ch === '[') depth++;
		else if ((ch === '>' || ch === ']') && depth > 0) depth--;
		else if (depth === 0) out += ch;
	}
	return out;
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

/** The bases of a type are keyed by where its declarations meet: its file, or a Rust crate. */
function basesKey(ctx: Context, family: Family, key: string, path: FilePath): string {
	const scope = family === 'rust' ? (ctx.rust().rootOf(path) ?? path) : path;
	return `${family}\0${key}\0${scope}`;
}

function addBase(ctx: Context, ref: RefSite, record: FileRecord, family: Family, site: RefSite) {
	if (site.target.state !== 'bound' || ref.from === null) return;
	const [{ to, provenance }] = site.target.candidates;
	if (to.kind !== 'symbol') return;
	const base = ctx.defs.get(to.id);
	const owner = ctx.defs.get(ref.from);
	if (!base?.typeKey || !owner?.typeKey) return;
	const key = basesKey(ctx, family, owner.typeKey, record.path);
	const list = ctx.bases.get(key) ?? [];
	list.push({ key: base.typeKey, path: base.path, confidence: provenance.confidence });
	ctx.bases.set(key, list);
}

function bindRef(
	ref: RefSite,
	record: FileRecord,
	family: Family,
	ctx: Context
): { site: RefSite; outcome: RefOutcome | null } {
	const report = (resolution: RefOutcome['resolution']): RefOutcome => ({
		path: record.path,
		line: ref.line,
		kind: ref.kind,
		written: ref.written,
		resolution
	});
	if (ref.kind === 'dynamic_import') {
		if (ref.written === null || family !== 'script') return { site: ref, outcome: null };
		return {
			site: { ...ref, target: ctx.dynamicImport()(ref.written, record.path) },
			outcome: null
		};
	}
	if (ref.kind === 'indirect_call' || ref.kind === 'references')
		return { site: ref, outcome: null };
	if (ref.written === null) return { site: ref, outcome: null };

	const found = resolveWritten(ref, record, family, ctx);
	if (!found.ok) {
		return {
			site: { ...ref, target: { state: 'unresolved' } },
			outcome: report({ status: 'unresolved', reason: found.reason })
		};
	}
	const target: Binding<SymbolEnd | ExternalEnd> = {
		state: 'bound',
		candidates: [{ to: found.to, provenance: { source: 'resolver', confidence: found.confidence } }]
	};
	return {
		site: { ...ref, target },
		outcome: report(
			found.to.kind === 'external'
				? { status: 'external', rule: found.rule }
				: { status: 'bound', rule: found.rule, confidence: found.confidence }
		)
	};
}

/**
 * A callee or base as written, split into names: `a.b.c`, `a::b`, `$this->save` and `\App\Foo`
 * become segments; `sep` is the last separator. A callee that calls or indexes on the way
 * (`z.object().strict`) has an expression as its receiver, so only its last name is kept.
 */
interface Written {
	segments: string[];
	/** The receiver is an expression, not a name */
	open: boolean;
	sep: '.' | '::' | null;
}

const NAME = /^[$@]?[A-Za-z_À-￿][\w$À-￿]*[?!]?$/;

export function readWritten(text: string, type: boolean): Written | null {
	let source = text.replace(/^new\s+/, '').replace(/::<[^]*?>(?=::|$)/g, '');
	if (source.startsWith('<')) return null;
	source = source.replace(/^\\/, '').replace(/\\/g, '::');
	// In a base `[…]` holds type arguments (`Generic[T]`); in a callee it indexes (`handlers[i]()`)
	source = type ? stripGenerics(source) : stripAngles(source);
	let open = false;
	const lastClose = Math.max(
		source.lastIndexOf(')'),
		source.lastIndexOf('}'),
		source.lastIndexOf(']')
	);
	let sep: Written['sep'] = null;
	if (lastClose !== -1) {
		open = true;
		const after = source.slice(lastClose + 1);
		source = after.replace(/^(?:\?|!)?(?:\.|->|::)/, '');
		if (source !== after) sep = after.includes('::') ? '::' : '.';
		if (!source) return null;
	}
	const parts = source.split(/(::|\?->|->|\?\.|!\.|\.)/);
	const segments: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		if (i % 2 === 1) {
			sep = parts[i] === '::' ? '::' : '.';
			continue;
		}
		segments.push(parts[i].replace(/[?!]$/, (m) => (i === parts.length - 1 ? m : '')));
	}
	const last = segments.at(-1)!;
	if (!NAME.test(last)) return null;
	// `self.0.ready`, `(*node).next`: a receiver that is no name is an expression
	if (!segments.every((part) => NAME.test(part))) return { segments: [last], open: true, sep };
	return { segments, open, sep };
}

function resolveWritten(ref: RefSite, record: FileRecord, family: Family, ctx: Context): Found {
	const types = ref.kind === 'inherits' || ref.kind === 'implements';
	const written = readWritten(ref.written!, types);
	if (!written) return miss('unread');
	const rules = FAMILY_RULES[family];
	const scope = scopeOf(record, family, ctx);
	const from = ref.from === null ? null : (ctx.defs.get(ref.from) ?? null);
	const { segments } = written;
	const last = segments.at(-1)!;
	const at: At = { family, from };

	if (written.open) {
		if (/^super\(\)/.test(ref.written!)) return baseMember(enclosingType(from), last, family, ctx);
		return uniqueMember(last, at, ctx);
	}
	if (segments.length === 1) {
		if (rules.base.includes(last)) return baseType(enclosingType(from), family, ctx);
		if (rules.self.includes(last)) return ownType(from, family, ctx);
		// A parameter or local of the enclosing function holds whatever it was given
		if (ref.kind === 'calls' && ref.local) return miss('shadowed');
		return bareName(last, { record, family, scope, from, types }, ctx);
	}

	const [head, ...rest] = segments;
	// Rust `self::f()` walks the module tree; only `self.f()` calls a method
	const isSelf =
		rules.self.includes(head) && !(family === 'rust' && head === 'self' && written.sep === '::');
	if (isSelf && rest.length === 1) {
		return ownMember(enclosingType(from), last, family, ctx);
	}
	if (rules.base.includes(head) && rest.length === 1) {
		return baseMember(enclosingType(from), last, family, ctx);
	}
	if (isSelf) return uniqueMember(last, at, ctx);
	// `utils.get()` with `utils` a parameter: a value of unknown type, whatever the file imports
	if (ref.kind === 'calls' && ref.local) return uniqueMember(last, at, ctx);
	if (family === 'script' && SCRIPT_GLOBALS.has(head) && !scope.names.has(head)) {
		return miss('not-in-scope');
	}

	const meaning = qualifierMeaning(
		segments,
		written.sep,
		{ record, family, scope, from, types },
		ctx
	);
	if (meaning) return meaningTarget(meaning.meaning, meaning.rest, at, ctx);
	if (types) {
		// `pkg.Base` with `pkg` unknown: a type, not a member, and in a closed language not ours
		return rules.closed
			? miss('not-in-scope')
			: bareName(last, { record, family, scope, from, types }, ctx);
	}
	if (written.sep === '::') {
		// `ns::f` in C++ or `\App\f` in PHP: a namespace the outline does not record. In Rust
		// `AtomicPtr::new` names a type the map lacks, so no member by that name is evidence
		if (family === 'rust') return miss('not-in-scope');
		return bareName(last, { record, family, scope, from, types }, ctx);
	}
	return uniqueMember(last, at, ctx);
}

/** Where a lookup starts: the language and the symbol a site is written in. */
interface At {
	family: Family;
	from: Def | null;
}

interface Site {
	record: FileRecord;
	family: Family;
	scope: FileScope;
	from: Def | null;
	/** A class base: only types count */
	types: boolean;
}

/** A bare name: imported, the enclosing class's, the file's, the package's, then the repo's. */
function bareName(name: string, site: Site, ctx: Context): Found {
	const { record, family, scope, from, types } = site;
	const rules = FAMILY_RULES[family];
	const imported = scope.names.get(name);
	if (imported) return meaningTarget(imported, null, { family, from }, ctx);

	if (rules.implicitSelf && !types) {
		const own = enclosingType(from);
		if (own) {
			const found = ownMember(own, name, family, ctx);
			if (found.ok || found.reason === 'ambiguous') return found;
		}
	}

	const fit = (defs: readonly Def[] | undefined) =>
		(defs ?? []).filter((def) => !types || TYPE_KINDS.has(def.kind));
	const local = fit(ctx.fileTop.get(`${record.path}\0${name}`));
	if (local.length > 0) return pick(local, 'same-file', EXTRACTED);

	const inPackage = packageDefs(name, record, family, ctx);
	const visible = inPackage.defs.filter((def) => !types || TYPE_KINDS.has(def.kind));
	if (visible.length > 0) {
		return visible.length === 1
			? hit(visible[0], 'same-package', inPackage.confidence)
			: miss('ambiguous');
	}

	for (const files of scope.stars) {
		const defs = files.flatMap((file) => fit(ctx.fileTop.get(`${file}\0${name}`)));
		if (defs.length > 0) return pick(defs, 'import', EXTRACTED);
	}

	if (rules.closed) return miss('not-in-scope');
	const anywhere = fit(ctx.top.get(`${family}\0${name}`));
	if (anywhere.length === 1) return hit(anywhere[0], 'unique-name', INFERRED);
	return miss(anywhere.length > 1 ? 'ambiguous' : 'no-definition');
}

/** The definitions of one name in one file: a redefinition or overloads, one relation to that file. */
function pick(defs: readonly Def[], rule: RefRule, confidence: Confidence): Found {
	if (defs.length === 1) return hit(defs[0], rule, confidence);
	const [first] = defs;
	if (defs.every((def) => def.path === first.path)) return hit(defs.at(-1)!, rule, INFERRED);
	return miss('ambiguous');
}

const hit = (def: Def, rule: RefRule, confidence: Confidence): Found => ({
	ok: true,
	to: { kind: 'symbol', id: def.id },
	confidence,
	rule
});

/**
 * Top-level declarations a name reaches without an import. Go: the other files of the folder's
 * package (a `_test.go` file sees them, not the reverse; an external `x_test` package sees none).
 * Java: files of the same `package` clause in the folder. Kotlin, Scala, C# and Swift have no
 * package the outline records, so the folder stands in, and only inferably.
 */
function packageDefs(
	name: string,
	record: FileRecord,
	family: Family,
	ctx: Context
): { defs: Def[]; confidence: Confidence } {
	const kind = FAMILY_RULES[family].package;
	if (!kind) return { defs: [], confidence: INFERRED };
	const dir = dirOf(record.path);
	const defs = (ctx.dirTop.get(`${family}\0${dir}\0${name}`) ?? []).filter(
		(def) => def.path !== record.path
	);
	const clause = packageClause(record);
	const sameClause = (def: Def) => packageClause(ctx.map.files.get(def.path)) === clause;
	if (kind === 'go') {
		if (clause?.endsWith('_test')) return { defs: [], confidence: EXTRACTED };
		const test = record.path.endsWith('_test.go');
		const seen = defs.filter((def) => (test || !def.path.endsWith('_test.go')) && sameClause(def));
		return { defs: seen, confidence: EXTRACTED };
	}
	if (kind === 'java' && record.language === 'java' && clause !== null) {
		// A package spans source roots (`src/main/java` and `src/test/java`), so the clause decides
		const inPackage = (ctx.javaPackages().get(`${clause}\0${name}`) ?? []).filter(
			(def) => def.path !== record.path
		);
		return { defs: inPackage, confidence: EXTRACTED };
	}
	return { defs, confidence: INFERRED };
}

function packageClause(record: FileRecord | undefined): string | null {
	const site = record?.imports.find((s) => isGoPackageClause(s.text));
	return site ? site.text.replace(/^package\s+/, '').replace(/[;\s]+$/, '') : null;
}

/** What the leading segments of a qualified name mean, and the names left after them. */
function qualifierMeaning(
	segments: readonly string[],
	sep: Written['sep'],
	site: Site,
	ctx: Context
): { meaning: Meaning; rest: string[] } | null {
	const { record, family, scope } = site;
	// Python `import a.b.c` binds the dotted name; the longest bound prefix wins
	for (let n = segments.length - 1; n >= 1; n--) {
		const meaning = scope.names.get(segments.slice(0, n).join('.'));
		if (meaning) return { meaning, rest: segments.slice(n) };
	}
	const [head, ...rest] = segments;
	const asType = bareName(head, { ...site, types: true }, ctx);
	if (asType.ok && asType.to.kind === 'symbol') {
		const def = ctx.defs.get(asType.to.id)!;
		return {
			meaning: { kind: 'def', def, confidence: asType.confidence, rule: asType.rule },
			rest
		};
	}
	if (family === 'rust' && sep === '::') {
		const walk = (path: readonly string[], file: string) =>
			resolveUsePath(path, file, ctx.rust(), ctx.files, () => false);
		const end = walk(segments.slice(0, -1), record.path);
		if (end.kind === 'local' && end.modules === end.rest.length) {
			return {
				meaning: { kind: 'module', files: [end.file as FilePath] },
				rest: segments.slice(-1)
			};
		}
		// `shop_core::pricing::Cart::new()`: the path walks to a module, then names an item in it
		if (end.kind === 'local' && end.modules === end.rest.length - 1 && end.modules > 0) {
			return {
				meaning: { kind: 'module', files: [end.file as FilePath] },
				rest: segments.slice(-2)
			};
		}
		// `use super::*` brings in the parent's submodules too (`cancellation_queue::new()`)
		for (const [file] of scope.stars) {
			const sub = walk(['self', head], file);
			if (sub.kind === 'local' && sub.modules === 1) {
				return { meaning: { kind: 'module', files: [sub.file as FilePath] }, rest };
			}
		}
		// A type a macro declares (`pin_project! { struct Foo }`) has no outline entry, its impls do
		if (rest.length === 1) {
			const root = ctx.rust().rootOf(record.path);
			const impls = (ctx.byOwner.get(`rust\0${head}\0${rest[0]}`) ?? []).filter(
				(def) => ctx.rust().rootOf(def.path) === root
			);
			const here = impls.filter((def) => def.path === record.path);
			if (here.length > 0 || impls.length === 1) {
				const def = (here[0] ?? impls[0]).parent!;
				const confidence = here.length > 0 ? EXTRACTED : INFERRED;
				return { meaning: { kind: 'def', def, confidence, rule: 'type-member' }, rest };
			}
		}
		// A lowercase first segment is a crate (`serde_json::to_string`); `Box::new` is the prelude
		if (end.kind === 'external' && /^[a-z]/.test(head)) {
			return { meaning: { kind: 'external', module: end.crate, name: null }, rest };
		}
	}
	return null;
}

/** What a name means as a target, or with `rest`, the member reached through it. */
function meaningTarget(
	meaning: Meaning,
	rest: readonly string[] | null,
	at: At,
	ctx: Context
): Found {
	if (meaning.kind === 'external') {
		const sep = at.family === 'rust' || at.family === 'c' || at.family === 'php' ? '::' : '.';
		const name = [meaning.name, ...(rest ?? [])].filter(Boolean).join(sep);
		return {
			ok: true,
			to: { kind: 'external', module: meaning.module, name: name || null },
			confidence: EXTRACTED,
			rule: 'import'
		};
	}
	if (meaning.kind === 'module') {
		if (!rest || rest.length === 0) return miss('no-definition');
		if (at.family === 'rust' && rest.length > 1) {
			// `util::time_alt::f()` through an imported `util`: walk its submodules first
			const end = resolveUsePath(
				['self', ...rest.slice(0, -1)],
				meaning.files[0],
				ctx.rust(),
				ctx.files,
				() => false
			);
			if (end.kind === 'local' && end.modules === rest.length - 1 && end.modules > 0) {
				return meaningTarget(
					{ kind: 'module', files: [end.file as FilePath] },
					rest.slice(-1),
					at,
					ctx
				);
			}
		}
		const [name, ...more] = rest;
		const defs = meaning.files.flatMap((file) => ctx.fileTop.get(`${file}\0${name}`) ?? []);
		if (defs.length === 0) return reexported(meaning.files, name, more, at, ctx);
		const found = pick(defs, 'import', EXTRACTED);
		if (!found.ok || more.length === 0) return found;
		const def = ctx.defs.get((found.to as SymbolEnd).id)!;
		return throughDef(def, found.confidence, more, at, ctx);
	}
	if (!rest || rest.length === 0) return hit(meaning.def, meaning.rule, meaning.confidence);
	return throughDef(meaning.def, meaning.confidence, rest, at, ctx);
}

/** A name a module brings in from elsewhere: a barrel's import, an `__init__.py`, a `pub use`. */
function reexported(
	files: readonly FilePath[],
	name: string,
	rest: readonly string[],
	at: At,
	ctx: Context
): Found {
	for (const file of files) {
		const record = ctx.map.files.get(file);
		if (!record) continue;
		const meaning = scopeOf(record, at.family, ctx).names.get(name);
		if (meaning) return meaningTarget(meaning, rest.length > 0 ? rest : null, at, ctx);
	}
	return miss('no-definition');
}

/** `Foo.of`, `Foo::new`, `pkg.Type.Method`: a member of a declaration the call names. */
function throughDef(
	def: Def,
	confidence: Confidence,
	rest: readonly string[],
	at: At,
	ctx: Context
): Found {
	const { family } = at;
	if (def.typeKey === null) return uniqueMember(rest.at(-1)!, at, ctx);
	const type: TypeRef = { key: def.typeKey, path: def.path, confidence };
	const [member, ...more] = rest;
	const found = ownMember(type, member, family, ctx);
	if (found.ok) {
		const rule: RefRule = found.rule === 'base-member' ? found.rule : 'type-member';
		if (more.length === 0) return { ...found, rule };
		// `Outer.Inner.make()`: a nested type, then its member
		const inner = found.to.kind === 'symbol' ? ctx.defs.get(found.to.id) : undefined;
		if (inner?.typeKey) return throughDef(inner, found.confidence, more, at, ctx);
		return uniqueMember(rest.at(-1)!, at, ctx);
	}
	// `Foo.new` in Ruby builds a Foo; a Rust `Enum::Variant(x)` or derived `Foo::default()` names the type
	if (rest.length === 1 && ((family === 'ruby' && member === 'new') || family === 'rust')) {
		return hit(def, 'type-member', family === 'ruby' ? confidence : INFERRED);
	}
	return found;
}

/**
 * The type a member's code runs in: its class, a Rust impl's type, a Go method's receiver. A
 * function nested in a method runs in the method's type.
 */
function enclosingType(from: Def | null): TypeRef | null {
	for (let def = from; def; def = def.parent) {
		if (def.typeKey !== null) return { key: def.typeKey, path: def.path, confidence: EXTRACTED };
		if (def.owner !== null) return { key: def.owner, path: def.path, confidence: EXTRACTED };
	}
	return null;
}

/** `this(…)` or Rust `Self(…)`: the enclosing type itself. */
function ownType(from: Def | null, family: Family, ctx: Context): Found {
	const own = enclosingType(from);
	if (!own) return miss('no-definition');
	const def = typeDef(own, family, ctx);
	return def ? hit(def, 'own-member', own.confidence) : miss('no-definition');
}

/** `super(…)`: the base class the enclosing class names. */
function baseType(own: TypeRef | null, family: Family, ctx: Context): Found {
	if (!own) return miss('no-definition');
	const bases = ctx.bases.get(basesKey(ctx, family, own.key, own.path)) ?? [];
	if (bases.length === 0) return miss('no-definition');
	const def = typeDef(bases[0], family, ctx);
	return def ? hit(def, 'base-member', bases[0].confidence) : miss('no-definition');
}

/** The type declaration a TypeRef names, in its file first. */
function typeDef(type: TypeRef, family: Family, ctx: Context): Def | null {
	const here = ctx.types.get(`${type.path}\0${type.key}`);
	if (here && TYPE_KINDS.has(here.kind)) return here;
	const anywhere = (ctx.top.get(`${family}\0${type.key}`) ?? []).filter((d) =>
		TYPE_KINDS.has(d.kind)
	);
	return anywhere.length === 1 ? anywhere[0] : null;
}

/**
 * A member of `type` or of a base it names, nearest first. Members a type declares sit in its
 * file, except a Go method (any file of the package, so EXTRACTED) and a Rust impl or C++
 * definition in another file (INFERRED by the type name within the crate or repo).
 */
function ownMember(
	type: TypeRef | null,
	name: string,
	family: Family,
	ctx: Context,
	depth = 0,
	seen = new Set<string>()
): Found {
	if (!type) return miss('no-definition');
	const key = basesKey(ctx, family, type.key, type.path);
	if (seen.has(key) || depth > MAX_BASE_DEPTH) return miss('no-definition');
	seen.add(key);
	const all = ctx.byOwner.get(`${family}\0${type.key}\0${name}`) ?? [];
	const sameFile = all.filter((def) => def.path === type.path);
	const rule: RefRule = depth === 0 ? 'own-member' : 'base-member';
	if (sameFile.length > 0) return pick(sameFile, rule, type.confidence);
	if (family === 'go') {
		const dir = dirOf(type.path);
		const inPackage = all.filter((def) => dirOf(def.path) === dir);
		if (inPackage.length > 0) return pick(inPackage, rule, type.confidence);
	}
	if (family === 'rust' || family === 'c') {
		const root = family === 'rust' ? ctx.rust().rootOf(type.path) : null;
		const near = all.filter((def) => family === 'c' || ctx.rust().rootOf(def.path) === root);
		if (near.length === 1) return hit(near[0], rule, INFERRED);
		if (near.length > 1) return miss('ambiguous');
	}
	for (const base of ctx.bases.get(key) ?? []) {
		const found = ownMember(
			{ ...base, confidence: least(type.confidence, base.confidence) },
			name,
			family,
			ctx,
			depth + 1,
			seen
		);
		if (found.ok || found.reason === 'ambiguous') return found;
	}
	return miss('no-definition');
}

function baseMember(own: TypeRef | null, name: string, family: Family, ctx: Context): Found {
	if (!own) return miss('no-definition');
	const key = basesKey(ctx, family, own.key, own.path);
	for (const base of ctx.bases.get(key) ?? []) {
		const found = ownMember(
			{ ...base, confidence: least(own.confidence, base.confidence) },
			name,
			family,
			ctx,
			1,
			new Set([key])
		);
		if (found.ok || found.reason === 'ambiguous') return found;
	}
	return miss('no-definition');
}

/**
 * A member called on a value whose type the map cannot see (`user.save()`, `c.JSON()`): the one
 * member by that name in the language's files, INFERRED. Of several the site stays unresolved,
 * as it does for a name the language's library types use. A Rust trait method (`impl Clone for
 * X`'s `clone`) dispatches on a type the map cannot see, and a std type may be it, so it never
 * counts.
 */
function uniqueMember(name: string, { family, from }: At, ctx: Context): Found {
	// Python's `__enter__` and the like are protocol methods every library type may define
	if (LIBRARY_MEMBERS[family]?.has(name) || (family === 'python' && /^__\w+__$/.test(name))) {
		return miss('ambiguous');
	}
	const own = family === 'go' ? null : enclosingType(from);
	// Only Go names its receiver like any variable. Elsewhere a call on the own type says
	// `this`, so `self.router.add_route()` inside `add_route` delegates to another type
	const defs = (ctx.members.get(`${family}\0${name}`) ?? []).filter(
		(def) =>
			!(def.family === 'rust' && def.parent?.name.includes(' for ')) &&
			!(own && def.owner === own.key && def.path === own.path)
	);
	if (defs.length === 1) return hit(defs[0], 'unique-name', INFERRED);
	if (defs.length === 0) return miss('no-definition');
	return miss('ambiguous');
}

/** What each imported name means in a file, read once per file from its bound import sites. */
function scopeOf(record: FileRecord, family: Family, ctx: Context): FileScope {
	const cached = ctx.scopes.get(record.path);
	if (cached) return cached;
	const scope: FileScope = { names: new Map(), stars: [] };
	ctx.scopes.set(record.path, scope);
	for (const site of record.imports) readImport(site, record, family, scope, ctx);
	return scope;
}

function readImport(
	site: ModuleSite,
	record: FileRecord,
	family: Family,
	scope: FileScope,
	ctx: Context
) {
	const module = moduleMeaning(site.module, family, ctx);
	for (const spec of site.specifiers ?? []) {
		const meaning = bindingMeaning(spec.target, family, ctx);
		if (meaning) scope.names.set(spec.local, meaning);
	}
	// The import resolver leaves these languages pending; their imports name the declaration
	if (family === 'jvm' || family === 'php') {
		readQualifiedImport(site.text, family, scope, ctx);
		return;
	}
	if (!module) return;
	switch (family) {
		case 'python': {
			const plain = site.text.match(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
			if (plain) scope.names.set(plain[2] ?? plain[1], module);
			else if (/\bimport\s*\*/.test(site.text) && module.kind === 'module')
				scope.stars.push([...module.files]);
			return;
		}
		case 'go': {
			const path = readGoImport(site.text);
			if (path === null || isGoPackageClause(site.text)) return;
			const alias = site.text.replace(/^\s*import\s+/, '').match(/^\s*([\w.]+)\s+"/)?.[1];
			if (alias === '_') return;
			if (alias === '.') {
				if (module.kind === 'module') scope.stars.push([...module.files]);
				return;
			}
			for (const name of alias ? [alias] : goPackageNames(path, module, ctx)) {
				scope.names.set(name, module);
			}
			return;
		}
		case 'rust': {
			const tree = readUse(site.text);
			for (const leaf of tree?.leaves ?? []) {
				if (!leaf.glob) continue;
				const end = resolveUsePath(leaf.path, record.path, ctx.rust(), ctx.files, () => false);
				if (end.kind === 'local' && end.modules === end.rest.length)
					scope.stars.push([end.file as FilePath]);
			}
			return;
		}
		default:
			return;
	}
}

/**
 * Java, Kotlin and Scala import a type by package (`import com.shop.model.Item;`), and the
 * package is the folder by convention, so the type is the one by that name in a folder ending in
 * `com/shop/model`. PHP imports by namespace, and PSR-4 puts `App\Models\User` in a file
 * `…/Models/User.php`. Only a single match binds; a star (`.*`, `._`) sees the folder's files.
 */
function readQualifiedImport(text: string, family: Family, scope: FileScope, ctx: Context) {
	const written =
		family === 'php'
			? text.match(/^\s*use\s+\\?([\w\\]+?)(?:\s+as\s+(\w+))?\s*;/)
			: text.match(/^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*|\._)?(?:\s+as\s+(\w+))?\s*;?\s*$/);
	if (!written) return;
	const parts = written[1].split(family === 'php' ? '\\' : '.');
	const star = family !== 'php' && Boolean(written[2]);
	const alias = family === 'php' ? written[2] : written[3];
	if (star) {
		scope.stars.push(packageFiles(parts.join('/'), ctx));
		return;
	}
	const name = parts.at(-1)!;
	const folder = parts.slice(family === 'php' ? -2 : 0, -1).join('/');
	const defs = (ctx.top.get(`${family}\0${name}`) ?? []).filter((def) => {
		if (!TYPE_KINDS.has(def.kind)) return false;
		const dir = dirOf(def.path);
		const inFolder = folder === '' || dir === folder || dir.endsWith(`/${folder}`);
		return inFolder && (family !== 'php' || def.path.endsWith(`/${name}.php`));
	});
	if (defs.length === 1) {
		scope.names.set(alias ?? name, {
			kind: 'def',
			def: defs[0],
			confidence: EXTRACTED,
			rule: 'import'
		});
	}
}

/** The files of every folder whose path ends in `folder`, memoized per folder. */
function packageFiles(folder: string, ctx: Context): FilePath[] {
	const cached = ctx.packageFiles.get(folder);
	if (cached) return cached;
	const files = [...ctx.map.files.keys()].filter((path) => {
		const dir = dirOf(path);
		return dir === folder || dir.endsWith(`/${folder}`);
	});
	ctx.packageFiles.set(folder, files);
	return files;
}

/**
 * The names a Go import is used by: the target package's `package` clause, or for a package
 * outside the map the path's last element (`yaml` for `gopkg.in/yaml.v3`, `isatty` for
 * `go-isatty`, `v2` skipped), every spelling kept since nothing in the map says which.
 */
function goPackageNames(path: string, module: Meaning, ctx: Context): string[] {
	if (module.kind === 'module') {
		const clause = packageClause(ctx.map.files.get(module.files[0]));
		if (clause) return [clause];
	}
	const parts = path.split('/');
	const last = parts.length > 1 && /^v\d+$/.test(parts.at(-1)!) ? parts.at(-2)! : parts.at(-1)!;
	const bare = last.replace(/\.v\d+$/, '');
	return [...new Set([bare, bare.replace(/^go-|-go$/g, ''), bare.split(/[-.]/).at(-1)!])];
}

/** A module binding as a meaning: a Go import names the whole package folder. */
function moduleMeaning(
	binding: ModuleSite['module'],
	family: Family,
	ctx: Context
): Meaning | null {
	if (binding.state !== 'bound' || binding.candidates.length !== 1) return null;
	const [{ to }] = binding.candidates;
	if (to.kind === 'external') return { kind: 'external', module: to.module, name: to.name };
	if (family === 'go') {
		const files = ctx.goPackages().get(dirOf(to.path));
		return { kind: 'module', files: (files as FilePath[] | undefined) ?? [to.path] };
	}
	return { kind: 'module', files: [to.path] };
}

function bindingMeaning(binding: Binding<Endpoint>, family: Family, ctx: Context): Meaning | null {
	if (binding.state !== 'bound' || binding.candidates.length !== 1) return null;
	const [{ to, provenance }] = binding.candidates;
	if (to.kind === 'external') return { kind: 'external', module: to.module, name: to.name };
	if (to.kind === 'file') {
		if (family !== 'go') return { kind: 'module', files: [to.path] };
		return moduleMeaning({ state: 'bound', candidates: [{ to, provenance }] }, family, ctx);
	}
	const def = ctx.defs.get(to.id);
	return def ? { kind: 'def', def, confidence: provenance.confidence, rule: 'import' } : null;
}
