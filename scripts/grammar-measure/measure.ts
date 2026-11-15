import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { SymbolRecord } from '$lib/types/codeMap';
import { detectLanguage, getGrammarFile } from '$lib/utils/languageDetector';
import { extractDirectory } from '../../packages/core/src/extract';

type Tally = Record<string, number>;

interface LanguageStats {
	files: number;
	parseFailed: number;
	symbols: number;
	symbolKinds: Tally;
	imports: number;
	refs: Tally;
	/** Refs the resolver bound to a file or symbol, by kind */
	boundRefs: Tally;
}

/** Per file: symbols, imports, refs. Enough to list the files a grammar change read differently. */
type FileCounts = [symbols: number, imports: number, refs: number];

interface RepoReport {
	repo: string;
	/** Wall time of each extraction run, in ms */
	extractMs: number[];
	languages: Record<string, LanguageStats>;
	files: Record<string, FileCounts>;
}

const USAGE = `usage:
  node scripts/grammar-measure/run.mjs measure <out.json> <folder>... [--runs N]
  node scripts/grammar-measure/run.mjs compare <before.json> <after.json>
`;

const staticDir = fileURLToPath(new URL('../../static/', import.meta.url));
const bump = (t: Tally, key: string, by = 1) => (t[key] = (t[key] ?? 0) + by);

/** The grammar a file is read with (`tsx`, `bash`), or its language when no grammar reads it. */
function grammarOf(language: string | null, path: string): string {
	if (!language) return 'none';
	return getGrammarFile(language, path)?.replace(/^tree-sitter-|\.wasm$/g, '') ?? language;
}

function emptyStats(): LanguageStats {
	return {
		files: 0,
		parseFailed: 0,
		symbols: 0,
		symbolKinds: {},
		imports: 0,
		refs: {},
		boundRefs: {}
	};
}

function countSymbols(symbols: SymbolRecord[], kinds: Tally): number {
	let n = 0;
	for (const symbol of symbols) {
		bump(kinds, symbol.kind);
		n += 1 + countSymbols(symbol.children, kinds);
	}
	return n;
}

async function measureRepo(dir: string, runs: number): Promise<RepoReport> {
	const extractMs: number[] = [];
	let extraction: Awaited<ReturnType<typeof extractDirectory>> | null = null;
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		extraction = await extractDirectory(dir, { wasmDir: staticDir });
		extractMs.push(Math.round(performance.now() - start));
	}
	const languages: Record<string, LanguageStats> = {};
	const files: Record<string, FileCounts> = {};
	for (const skip of extraction!.skipped) {
		if (skip.reason !== 'parse-failed') continue;
		(languages[grammarOf(detectLanguage(skip.path), skip.path)] ??= emptyStats()).parseFailed++;
	}
	for (const record of extraction!.map.files.values()) {
		const stats = (languages[grammarOf(record.language, record.path)] ??= emptyStats());
		const symbols = countSymbols(record.symbols, stats.symbolKinds);
		stats.files++;
		stats.symbols += symbols;
		stats.imports += record.imports.length;
		for (const ref of record.refs) {
			bump(stats.refs, ref.kind);
			if (ref.target.state === 'bound') bump(stats.boundRefs, ref.kind);
		}
		files[record.path] = [symbols, record.imports.length, record.refs.length];
	}
	return { repo: basename(resolve(dir)), extractMs, languages, files };
}

function row(cells: (string | number)[]): string {
	return cells.map((c, i) => (i === 0 ? String(c).padEnd(14) : String(c).padStart(16))).join('');
}

const delta = (before: number, after: number) =>
	before === after
		? `${after}`
		: `${before}->${after} (${after - before > 0 ? '+' : ''}${after - before})`;

function compareRepo(before: RepoReport, after: RepoReport): string[] {
	const out = [
		`## ${after.repo}  extractMs ${before.extractMs.join('/')} -> ${after.extractMs.join('/')}`
	];
	out.push(row(['grammar', 'files', 'parseFailed', 'symbols', 'imports', 'refs']));
	const names = [
		...new Set([...Object.keys(before.languages), ...Object.keys(after.languages)])
	].sort();
	const sum = (t: Tally) => Object.values(t).reduce((a, b) => a + b, 0);
	for (const name of names) {
		const b = before.languages[name] ?? emptyStats();
		const a = after.languages[name] ?? emptyStats();
		out.push(
			row([
				name,
				delta(b.files, a.files),
				delta(b.parseFailed, a.parseFailed),
				delta(b.symbols, a.symbols),
				delta(b.imports, a.imports),
				delta(sum(b.refs), sum(a.refs))
			])
		);
		for (const kind of new Set([...Object.keys(b.refs), ...Object.keys(a.refs)])) {
			const [rb, ra] = [b.refs[kind] ?? 0, a.refs[kind] ?? 0];
			const [bb, ba] = [b.boundRefs[kind] ?? 0, a.boundRefs[kind] ?? 0];
			if (rb !== ra || bb !== ba)
				out.push(`    ${kind}: refs ${delta(rb, ra)}, bound ${delta(bb, ba)}`);
		}
		for (const kind of new Set([...Object.keys(b.symbolKinds), ...Object.keys(a.symbolKinds)])) {
			const [sb, sa] = [b.symbolKinds[kind] ?? 0, a.symbolKinds[kind] ?? 0];
			if (sb !== sa) out.push(`    symbol ${kind}: ${delta(sb, sa)}`);
		}
	}
	const changed = Object.keys({ ...before.files, ...after.files }).filter(
		(path) => String(before.files[path]) !== String(after.files[path])
	);
	out.push(`files read differently: ${changed.length}`);
	for (const path of changed.slice(0, 40)) {
		out.push(
			`    ${path}  [symbols, imports, refs] ${before.files[path] ?? '-'} -> ${after.files[path] ?? '-'}`
		);
	}
	return out;
}

export async function main(argv: string[]): Promise<number> {
	const { positionals, values } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: { runs: { type: 'string', default: '3' } }
	});
	const [command, ...rest] = positionals;
	if (command === 'measure' && rest.length >= 2) {
		const [out, ...dirs] = rest;
		const reports: RepoReport[] = [];
		for (const dir of dirs) reports.push(await measureRepo(dir, Number(values.runs)));
		await writeFile(out, JSON.stringify(reports, null, 1));
		process.stdout.write(
			`${reports.map((r) => `${r.repo}: ${r.extractMs.join('/')} ms`).join('\n')}\n`
		);
		return 0;
	}
	if (command === 'compare' && rest.length === 2) {
		const [before, after] = await Promise.all(
			rest.map(async (f) => JSON.parse(await readFile(f, 'utf8')) as RepoReport[])
		);
		for (const report of after) {
			const old = before.find((r) => r.repo === report.repo);
			if (old) process.stdout.write(`${compareRepo(old, report).join('\n')}\n\n`);
		}
		return 0;
	}
	process.stderr.write(USAGE);
	return 2;
}
