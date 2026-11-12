import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isEnvValueFile } from '$lib/utils/languageDetector';
import {
	CONDITIONS,
	checkOnDisk,
	compareMaps,
	coverage,
	loadGraphify,
	loadRopeman,
	type Condition,
	type LoadedInput
} from './inputs';
import { folderView, renderPrompt, PROMPT_VERSION, type FolderView } from './view';
import { adjustedRandIndex, checkAnswer, labels, parseAnswer, type CheckResult } from './checks';

const USAGE = `usage: node scripts/paseo-comparison/run.mjs --repo <dir> --graph <graph.json> --out <dir>
  [--folder <path>]... [--runs 3] [--model claude-sonnet-5-5] [--effort medium]
  [--skip graphify-out] [--max-calls 24] [--prereg <doc.md>] [--dry-run]
Writes inputs.json, prompts/, runs/ and summary.json under --out. A run whose file exists is
not repeated, so a rerun after a failure only makes the missing calls. Model calls need
--prereg, the Markdown file whose pre-registration section each run file stamps by hash.\n`;

interface Options {
	repo: string;
	graph: string;
	out: string;
	folders: string[];
	runs: number;
	model: string;
	effort: string;
	skip: string[];
	maxCalls: number;
	prereg: string | null;
	dryRun: boolean;
}

export function readOptions(args: string[]): Options | null {
	const { values } = parseArgs({
		args,
		options: {
			repo: { type: 'string' },
			graph: { type: 'string' },
			out: { type: 'string' },
			folder: { type: 'string', multiple: true },
			runs: { type: 'string', default: '3' },
			model: { type: 'string', default: 'claude-sonnet-5-5' },
			effort: { type: 'string', default: 'medium' },
			skip: { type: 'string', multiple: true },
			'max-calls': { type: 'string', default: '24' },
			prereg: { type: 'string' },
			'dry-run': { type: 'boolean', default: false }
		}
	});
	if (!values.repo || !values.graph || !values.out) return null;
	return {
		repo: values.repo,
		graph: values.graph,
		out: values.out,
		folders: (values.folder ?? ['']).map((f) => f.replace(/^\.\/?|\/+$/g, '').replace(/^\.$/, '')),
		runs: Number(values.runs),
		model: values.model!,
		effort: values.effort!,
		skip: values.skip ?? ['graphify-out'],
		maxCalls: Number(values['max-calls']),
		prereg: values.prereg ?? null,
		dryRun: values['dry-run']!
	};
}

interface ModelReply {
	text: string;
	/** Uncached, cache-write and cache-read input tokens of the named model, summed */
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	durationMs: number;
	wallMs: number;
	/** Every model the CLI billed for the call, the named one and any helper */
	models: string[];
	isError: boolean;
}

/** One `claude -p` call: no tools, no settings or MCP, a fixed system prompt, an empty cwd. */
async function callModel(prompt: string, o: Options, cwd: string): Promise<ModelReply> {
	const args = [
		'-p',
		'--model',
		o.model,
		'--effort',
		o.effort,
		'--tools',
		'',
		'--system-prompt',
		'You answer with JSON only.',
		'--setting-sources',
		'',
		'--strict-mcp-config',
		'--no-session-persistence',
		'--output-format',
		'json'
	];
	const started = performance.now();
	const stdout = await new Promise<string>((resolve, reject) => {
		const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'inherit'] });
		let out = '';
		child.stdout.on('data', (chunk) => (out += chunk));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${out.slice(0, 300)}`))
		);
		child.stdin.end(prompt);
	});
	const wallMs = performance.now() - started;
	const raw = JSON.parse(stdout);
	const usage = raw.usage ?? {};
	return {
		text: String(raw.result ?? ''),
		inputTokens:
			(usage.input_tokens ?? 0) +
			(usage.cache_creation_input_tokens ?? 0) +
			(usage.cache_read_input_tokens ?? 0),
		outputTokens: usage.output_tokens ?? 0,
		costUsd: raw.total_cost_usd ?? 0,
		durationMs: raw.duration_ms ?? 0,
		wallMs,
		models: Object.keys(raw.modelUsage ?? {}),
		isError: raw.is_error === true
	};
}

const slug = (folder: string) => (folder === '' ? 'root' : folder.replaceAll('/', '_'));

interface Planned {
	condition: Condition;
	folder: string;
	run: number;
}

/** Every call the options ask for. Conditions alternate, so a slow stretch of the API does not land on one side */
export function planRuns(o: Options): Planned[] {
	const plan: Planned[] = [];
	for (let run = 1; run <= o.runs; run++)
		for (const folder of o.folders)
			for (const condition of CONDITIONS) plan.push({ condition, folder, run });
	return plan;
}

/**
 * The pre-registration section of a Markdown file: from the `## ` heading that names
 * 사전 등록 up to the next `## ` heading. Null when there is none.
 */
export function preregistrationSection(markdown: string): string | null {
	const lines = markdown.split('\n');
	const start = lines.findIndex((l) => l.startsWith('## ') && l.includes('사전 등록'));
	if (start < 0) return null;
	const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
	return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

interface Preregistration {
	file: string;
	/** SHA-256 of the pre-registration section, hex */
	sha256: string;
}

export async function readPreregistration(file: string): Promise<Preregistration | null> {
	const section = preregistrationSection(await readFile(file, 'utf8'));
	if (section === null) return null;
	return { file, sha256: createHash('sha256').update(section).digest('hex') };
}

/** Why the calls still to make may not run, or null when they may */
export function refuseCalls(
	todo: number,
	o: Options,
	preregistration: Preregistration | null
): string | null {
	if (todo > o.maxCalls) return `${todo} calls planned, over --max-calls ${o.maxCalls}`;
	if (todo > 0 && preregistration === null)
		return 'model calls need --prereg <doc.md> with a 사전 등록 section';
	return null;
}

interface RunRecord extends Planned {
	/** When the call started, ISO 8601 UTC. Absent in runs made before it was recorded */
	calledAt?: string;
	/** The pre-registration the call ran under. Absent in runs made before it was recorded */
	preregistration?: Preregistration;
	promptVersion: number;
	promptChars: number;
	reply: ModelReply;
	check: CheckResult;
}

/** The payload holds paths, counts, symbol names and line numbers; no file text goes into it. */
function assertNoEnvValues(view: FolderView) {
	const leaked = view.parts.filter((p) => isEnvValueFile(p.path.toLowerCase()));
	if (leaked.length > 0) throw new Error(`env value file in prompt: ${leaked[0].path}`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const round = (x: number, d = 3) => Number(x.toFixed(d));

export async function main(args: string[]): Promise<number> {
	const o = readOptions(args);
	if (!o) {
		process.stderr.write(USAGE);
		return 2;
	}
	const wasmDir = fileURLToPath(new URL('../../static', import.meta.url));
	const cwd = join(o.out, 'cwd');
	for (const dir of ['prompts', 'runs', 'cwd']) await mkdir(join(o.out, dir), { recursive: true });

	const inputs: Record<Condition, LoadedInput> = {
		ropeman: await loadRopeman(o.repo, wasmDir, o.skip),
		graphify: await loadGraphify(o.graph)
	};
	const inputReport: Record<string, unknown> = {};
	for (const c of CONDITIONS) {
		inputReport[c] = {
			seconds: round(inputs[c].seconds, 2),
			coverage: coverage(inputs[c]),
			disk: await checkOnDisk(o.repo, inputs[c]),
			issues: inputs[c].issues
		};
	}

	const views = new Map<string, FolderView>();
	const prompts: Record<string, { parts: number; relations: number; chars: number }> = {};
	for (const folder of o.folders) {
		for (const c of CONDITIONS) {
			const view = folderView(inputs[c].map, folder, inputs[c].edges);
			assertNoEnvValues(view);
			const prompt = renderPrompt(view);
			views.set(`${c}:${folder}`, view);
			prompts[`${c}:${folder || '.'}`] = {
				parts: view.parts.length,
				relations: view.relations.length,
				chars: prompt.length
			};
			await writeFile(join(o.out, 'prompts', `${c}-${slug(folder)}.txt`), prompt);
		}
	}
	const agreement = compareMaps(inputs.ropeman, inputs.graphify);
	await writeFile(
		join(o.out, 'inputs.json'),
		JSON.stringify({ inputs: inputReport, agreement, prompts }, null, 1)
	);
	process.stderr.write(`${JSON.stringify(prompts)}\n`);
	if (o.dryRun) return 0;

	const plan = planRuns(o);
	const runFile = (p: Planned) =>
		join(o.out, 'runs', `${p.condition}-${slug(p.folder)}-${p.run}.json`);
	const todo = plan.filter((p) => !existsSync(runFile(p)));
	const preregistration = o.prereg === null ? null : await readPreregistration(o.prereg);
	const refusal = refuseCalls(todo.length, o, preregistration);
	if (refusal !== null) {
		process.stderr.write(`${refusal}\n`);
		return 1;
	}
	for (const p of todo) {
		const view = views.get(`${p.condition}:${p.folder}`)!;
		const prompt = renderPrompt(view);
		const calledAt = new Date().toISOString();
		const reply = await callModel(prompt, o, cwd);
		const check = checkAnswer(view, parseAnswer(reply.text));
		const record: RunRecord = {
			...p,
			calledAt,
			preregistration: preregistration!,
			promptVersion: PROMPT_VERSION,
			promptChars: prompt.length,
			reply,
			check
		};
		// Written aside and renamed, so a crash mid-write never leaves a run file that looks done
		await writeFile(`${runFile(p)}.tmp`, JSON.stringify(record, null, 1));
		await rename(`${runFile(p)}.tmp`, runFile(p));
		process.stderr.write(
			`${p.condition} ${p.folder || '.'} #${p.run}: pass=${check.pass} groups=${check.groups} in=${reply.inputTokens} out=${reply.outputTokens} ${Math.round(reply.wallMs / 1000)}s\n`
		);
	}

	// Checks are redone from each stored reply, so a summary always reflects the current checks
	const records: RunRecord[] = [];
	let staleChecks = 0;
	for (const p of plan) {
		const stored: RunRecord = JSON.parse(await readFile(runFile(p), 'utf8'));
		const check = checkAnswer(
			views.get(`${p.condition}:${p.folder}`)!,
			parseAnswer(stored.reply.text)
		);
		const keys = Object.keys(check) as (keyof CheckResult)[];
		if (keys.some((k) => check[k] !== stored.check[k])) staleChecks++;
		records.push({ ...stored, check });
	}
	const summary = { ...summarize(records, views, o), staleChecks };
	await writeFile(join(o.out, 'summary.json'), JSON.stringify(summary, null, 1));
	process.stdout.write(`${JSON.stringify(summary, null, 1)}\n`);
	return 0;
}

function summarize(records: RunRecord[], views: Map<string, FolderView>, o: Options) {
	/** The reply's grouping, kept to `only` parts when given */
	const groupsOf = (r: RunRecord, only: Set<string> | null) => {
		const parsed = parseAnswer(r.reply.text);
		const all = parsed.ok ? labels(parsed.groups) : new Map<string, number>();
		return only === null ? all : new Map([...all].filter(([part]) => only.has(part)));
	};
	const pairs = (a: RunRecord[], b: RunRecord[] | null, only: Set<string> | null = null) => {
		const out: number[] = [];
		const ari = (x: RunRecord, y: RunRecord) =>
			adjustedRandIndex(groupsOf(x, only), groupsOf(y, only));
		if (b === null) {
			for (let i = 0; i < a.length; i++)
				for (let j = i + 1; j < a.length; j++) out.push(ari(a[i], a[j]));
		} else {
			for (const x of a) for (const y of b) out.push(ari(x, y));
		}
		return out;
	};
	const spread = (xs: number[]) => ({
		values: xs.map((x) => round(x)),
		mean: round(mean(xs)),
		min: round(Math.min(...xs)),
		max: round(Math.max(...xs))
	});
	const cells: Record<string, unknown> = {};
	const agreement: Record<string, unknown> = {};
	for (const folder of o.folders) {
		const of = (c: Condition) => records.filter((r) => r.condition === c && r.folder === folder);
		for (const c of CONDITIONS) {
			const rs = of(c);
			const view = views.get(`${c}:${folder}`)!;
			const within = pairs(rs, null);
			cells[`${c}:${folder || '.'}`] = {
				parts: view.parts.length,
				relations: view.relations.length,
				runs: rs.length,
				pass: rs.filter((r) => r.check.pass).length,
				strictJson: rs.filter((r) => r.check.strictJson).length,
				groups: rs.map((r) => r.check.groups),
				missing: rs.map((r) => r.check.missing),
				duplicated: rs.map((r) => r.check.duplicated),
				unknown: rs.map((r) => r.check.unknown),
				evidence: rs.map((r) => r.check.evidence),
				evidenceInInput: rs.map((r) => r.check.evidenceInInput),
				evidenceOnGroup: rs.map((r) => r.check.evidenceOnGroup),
				groupsWithEvidence: rs.map((r) => r.check.groupsWithEvidence),
				inputTokens: rs.map((r) => r.reply.inputTokens),
				outputTokens: rs.map((r) => r.reply.outputTokens),
				wallSeconds: rs.map((r) => round(r.reply.wallMs / 1000, 1)),
				costUsd: round(
					rs.reduce((s, r) => s + r.reply.costUsd, 0),
					4
				),
				models: [...new Set(rs.flatMap((r) => r.reply.models))],
				withinAri: within.map((x) => round(x)),
				withinAriMean: round(mean(within)),
				names: rs.map((r) => {
					const parsed = parseAnswer(r.reply.text);
					return parsed.ok ? parsed.groups.map((g) => g.name) : [];
				})
			};
		}
		const ropemanParts = new Set(views.get(`ropeman:${folder}`)!.parts.map((p) => p.path));
		const common = new Set(
			views
				.get(`graphify:${folder}`)!
				.parts.map((p) => p.path)
				.filter((p) => ropemanParts.has(p))
		);
		const cross = pairs(of('ropeman'), of('graphify'));
		agreement[folder || '.'] = {
			commonParts: common.size,
			crossAri: cross.map((x) => round(x)),
			crossAriMean: round(mean(cross)),
			// Within and between on the same parts: both conditions' runs, kept to the common parts
			onCommonParts: {
				cross: spread(pairs(of('ropeman'), of('graphify'), common)),
				ropeman: spread(pairs(of('ropeman'), null, common)),
				graphify: spread(pairs(of('graphify'), null, common))
			}
		};
	}
	const totals = {
		calls: records.length,
		inputTokens: records.reduce((s, r) => s + r.reply.inputTokens, 0),
		outputTokens: records.reduce((s, r) => s + r.reply.outputTokens, 0),
		costUsd: round(
			records.reduce((s, r) => s + r.reply.costUsd, 0),
			4
		)
	};
	return {
		model: o.model,
		effort: o.effort,
		promptVersion: PROMPT_VERSION,
		totals,
		cells,
		agreement
	};
}
