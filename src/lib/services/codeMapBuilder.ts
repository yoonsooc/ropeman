import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type {
	CodeMap,
	FilePath,
	FileRecord,
	ModuleSite,
	RefSite,
	SymbolId,
	SymbolRecord
} from '$lib/types/codeMap';
import { detectConfigLanguage } from '$lib/utils/languageDetector';
import { readResolverConfig, resolveImports } from './importResolver';
import { resolveRefs } from './refResolver';

/**
 * Skeleton v2 for every parsed file. `refs` has the parser's reference sites per astMap key,
 * and `configs` the text of each file `isResolverConfig` and then `namedConfigs` name, keyed like astMap. Imports in
 * TS/JS, Svelte, Vue, Python, Go and Rust are bound to files, symbols and packages; other
 * languages' imports stay pending. Reference sites are bound after the imports, through them.
 */
export function buildCodeMap(
	astMap: ReadonlyMap<string, readonly ASTSymbol[]>,
	root: string | null,
	{
		refs = new Map(),
		configs = new Map()
	}: {
		refs?: ReadonlyMap<string, readonly ASTRef[]>;
		configs?: ReadonlyMap<string, string>;
	} = {}
): CodeMap {
	const files = new Map<FilePath, FileRecord>();
	for (const [key, symbols] of astMap) {
		const record = fileFromAst(key, symbols, refs.get(key));
		files.set(record.path, record);
	}
	const config = readResolverConfig(configs);
	return resolveRefs(resolveImports({ version: 2, root, files }, config).map, config).map;
}

/**
 * One parsed file as a code map record. Top-level imports become import sites, and an
 * `export … from` the parser reports as an import becomes a re-export site, which the wire
 * never reads. An import nested in a symbol stays a child symbol, as the v1 wire sends it.
 * Each parser ref becomes a site from the innermost symbol whose lines hold it.
 */
export function fileFromAst(
	key: string,
	astSymbols: readonly ASTSymbol[],
	refs: readonly ASTRef[] = []
): FileRecord {
	const path = key as FilePath;
	const ids = new Map<string, number>();
	const symbols: SymbolRecord[] = [];
	const imports: ModuleSite[] = [];
	const reexports: ModuleSite[] = [];
	for (const sym of astSymbols) {
		if (sym.kind === 'import') {
			(/^export\b/.test(sym.name) ? reexports : imports).push({
				line: sym.lineStart,
				text: sym.name,
				module: { state: 'pending' },
				specifiers: null
			});
		} else {
			symbols.push(toSymbolRecord(sym, sym.parentName ?? null, path, ids));
		}
	}
	return {
		path,
		language: inferLanguage(key),
		lines: { start: 1, end: null },
		symbols,
		imports,
		reexports,
		refs: refs.flatMap((ref) => toRefSite(ref, symbols))
	};
}

/**
 * A base belongs to the class or interface whose heading names it, so the base of one the
 * outline did not record (a class nested in a function) is dropped rather than pinned on the
 * function around it.
 */
function toRefSite(ref: ASTRef, symbols: readonly SymbolRecord[]): RefSite[] {
	const target = { state: 'pending' } as const;
	if (ref.kind === 'inherits' || ref.kind === 'implements') {
		const owner = findOwner(symbols, ref.ownerLine);
		return owner
			? [{ kind: ref.kind, line: ref.line, from: owner.id, written: ref.written, target }]
			: [];
	}
	const from = innermostAt(symbols, ref.line)?.id ?? null;
	return [{ kind: ref.kind, line: ref.line, from, written: ref.written, target }];
}

/** The deepest symbol whose lines hold `line`; the first of siblings that share it. */
function innermostAt(symbols: readonly SymbolRecord[], line: number): SymbolRecord | null {
	const hit = symbols.find(
		(sym) => sym.lines.start <= line && (sym.lines.end ?? sym.lines.start) >= line
	);
	return hit ? (innermostAt(hit.children, line) ?? hit) : null;
}

function findOwner(symbols: readonly SymbolRecord[], line: number): SymbolRecord | null {
	for (const sym of symbols) {
		if ((sym.kind === 'class' || sym.kind === 'interface') && sym.lines.start === line) return sym;
		const inner = findOwner(sym.children, line);
		if (inner) return inner;
	}
	return null;
}

function toSymbolRecord(
	sym: ASTSymbol,
	parent: string | null,
	path: FilePath,
	ids: Map<string, number>
): SymbolRecord {
	const qualified = parent ? `${parent}.${sym.name}` : sym.name;
	const seen = (ids.get(qualified) ?? 0) + 1;
	ids.set(qualified, seen);
	return {
		id: `${path}#${qualified}${seen > 1 ? `~${seen}` : ''}` as SymbolId,
		name: sym.name,
		kind: sym.kind,
		lines: { start: sym.lineStart, end: sym.lineEnd },
		badges: sym.badges ? [...sym.badges] : [],
		children: (sym.children ?? []).map((child) => toSymbolRecord(child, qualified, path, ids))
	};
}

export function inferLanguage(filePath: string): string | null {
	const ext = filePath.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'py':
			return 'python';
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'javascript';
		case 'ts':
		case 'mts':
		case 'cts':
			return 'typescript';
		case 'jsx':
			return 'jsx';
		case 'tsx':
			return 'tsx';
		case 'svelte':
			return 'svelte';
		case 'vue':
			return 'vue';
		case 'go':
			return 'go';
		case 'rs':
			return 'rust';
		case 'java':
			return 'java';
		case 'c':
		case 'h':
			return 'c';
		case 'cpp':
		case 'hpp':
		case 'cc':
		case 'cxx':
			return 'cpp';
		case 'rb':
			return 'ruby';
		case 'php':
			return 'php';
		case 'swift':
			return 'swift';
		case 'kt':
		case 'kts':
			return 'kotlin';
		case 'scala':
		case 'sc':
			return 'scala';
		case 'cs':
			return 'csharp';
		case 'md':
		case 'mdc':
			return 'markdown';
		default:
			return detectConfigLanguage(filePath);
	}
}
