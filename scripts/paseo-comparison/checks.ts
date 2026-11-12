import { partOf, type Evidence, type FolderView } from './view';

export interface Group {
	name: string;
	summary: string;
	members: string[];
	evidence: Evidence[];
}

export type Parsed = { ok: true; groups: Group[]; strict: boolean } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isEvidence = (v: unknown): v is Evidence =>
	isRecord(v) &&
	typeof v.path === 'string' &&
	typeof v.line === 'number' &&
	typeof v.to === 'string';

const isGroup = (v: unknown): v is Group =>
	isRecord(v) &&
	typeof v.name === 'string' &&
	typeof v.summary === 'string' &&
	Array.isArray(v.members) &&
	v.members.every((m) => typeof m === 'string') &&
	Array.isArray(v.evidence) &&
	v.evidence.every(isEvidence);

/**
 * The model's reply as groups. `strict` is whether the reply was JSON as asked; a reply wrapped
 * in a code fence or prose is still read from its outermost braces, so the other checks run.
 */
export function parseAnswer(text: string): Parsed {
	const trimmed = text.trim();
	let strict = true;
	let json: unknown;
	try {
		json = JSON.parse(trimmed);
	} catch {
		strict = false;
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		try {
			json = JSON.parse(trimmed.slice(start, end + 1));
		} catch {
			return { ok: false, error: 'not JSON' };
		}
	}
	if (!isRecord(json) || !Array.isArray(json.groups) || !json.groups.every(isGroup)) {
		return { ok: false, error: 'not the {groups:[...]} shape' };
	}
	return { ok: true, groups: json.groups, strict };
}

/** The deterministic checks on one reply, all computed from the view the model was given. */
export interface CheckResult {
	parsed: boolean;
	strictJson: boolean;
	groups: number;
	parts: number;
	/** Parts in no group */
	missing: number;
	/** Parts in more than one group */
	duplicated: number;
	/** Members that are not a part of the view */
	unknown: number;
	groupCountOk: boolean;
	evidence: number;
	/** Cited sites that are one of the view's evidence sites, path, line and target alike */
	evidenceInInput: number;
	/** Cited sites whose file or target falls in a member of the citing group */
	evidenceOnGroup: number;
	/** Groups that cite at least one site found in the input */
	groupsWithEvidence: number;
	/** Every structural check holds and every cited site is in the input */
	pass: boolean;
}

const siteKey = (e: Evidence) => `${e.path}:${e.line}->${e.to}`;

export function checkAnswer(view: FolderView, parsed: Parsed): CheckResult {
	const parts = view.parts.length;
	if (!parsed.ok) {
		return {
			parsed: false,
			strictJson: false,
			groups: 0,
			parts,
			missing: parts,
			duplicated: 0,
			unknown: 0,
			groupCountOk: false,
			evidence: 0,
			evidenceInInput: 0,
			evidenceOnGroup: 0,
			groupsWithEvidence: 0,
			pass: false
		};
	}
	const known = new Set(view.parts.map((p) => p.path));
	const sites = new Set(view.relations.flatMap((r) => r.evidence.map(siteKey)));
	const seen = new Map<string, number>();
	let unknown = 0;
	let evidence = 0;
	let evidenceInInput = 0;
	let evidenceOnGroup = 0;
	let groupsWithEvidence = 0;
	for (const group of parsed.groups) {
		for (const member of new Set(group.members)) {
			if (known.has(member)) seen.set(member, (seen.get(member) ?? 0) + 1);
			else unknown++;
		}
		const members = new Set(group.members);
		let cited = false;
		for (const site of group.evidence) {
			evidence++;
			if (sites.has(siteKey(site))) {
				evidenceInInput++;
				cited = true;
			}
			const from = partOf(site.path, view.folder);
			const to = partOf(site.to, view.folder);
			if ((from !== null && members.has(from)) || (to !== null && members.has(to)))
				evidenceOnGroup++;
		}
		if (cited) groupsWithEvidence++;
	}
	const missing = parts - seen.size;
	const duplicated = [...seen.values()].filter((n) => n > 1).length;
	const groups = parsed.groups.length;
	const groupCountOk = groups >= 2 && groups <= 8 && groups < parts;
	return {
		parsed: true,
		strictJson: parsed.strict,
		groups,
		parts,
		missing,
		duplicated,
		unknown,
		groupCountOk,
		evidence,
		evidenceInInput,
		evidenceOnGroup,
		groupsWithEvidence,
		pass:
			missing === 0 &&
			duplicated === 0 &&
			unknown === 0 &&
			groupCountOk &&
			evidenceInInput === evidence
	};
}

/** Part path -> index of the first group that lists it. */
export function labels(groups: readonly Group[]): Map<string, number> {
	const out = new Map<string, number>();
	groups.forEach((group, i) => {
		for (const member of group.members) if (!out.has(member)) out.set(member, i);
	});
	return out;
}

const choose2 = (n: number) => (n * (n - 1)) / 2;

/**
 * Adjusted Rand index of two groupings over the parts both of them place: 1 for the same
 * partition, about 0 for chance agreement. Two partitions with no pair structure (one group
 * each, or all singletons) score 1 when identical and 0 otherwise.
 */
export function adjustedRandIndex(a: Map<string, number>, b: Map<string, number>): number {
	const common = [...a.keys()].filter((k) => b.has(k));
	const n = common.length;
	if (n < 2) return 1;
	const cells = new Map<string, number>();
	const rows = new Map<number, number>();
	const cols = new Map<number, number>();
	for (const k of common) {
		const i = a.get(k)!;
		const j = b.get(k)!;
		cells.set(`${i},${j}`, (cells.get(`${i},${j}`) ?? 0) + 1);
		rows.set(i, (rows.get(i) ?? 0) + 1);
		cols.set(j, (cols.get(j) ?? 0) + 1);
	}
	const sum = (m: Map<unknown, number>) => [...m.values()].reduce((s, v) => s + choose2(v), 0);
	const index = sum(cells);
	const sumRows = sum(rows);
	const sumCols = sum(cols);
	const expected = (sumRows * sumCols) / choose2(n);
	const max = (sumRows + sumCols) / 2;
	if (max === expected) return index === max ? 1 : 0;
	return (index - expected) / (max - expected);
}
