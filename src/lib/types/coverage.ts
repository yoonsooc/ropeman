import type { AssignmentCounts } from './semantic';

/** Where a file of the project ended up on its way to the AI. */
export type CoverageStatus = 'sent' | 'not-sent' | 'cut' | 'skipped' | 'failed';

/** Each reason belongs to exactly one status, so a file carries only its reason. */
export const COVERAGE_REASONS = {
	sent: 'sent',
	'over-budget': 'not-sent',
	'no-symbols': 'not-sent',
	'file-limit': 'cut',
	'excluded-path': 'skipped',
	'file-size': 'skipped',
	'total-size': 'skipped',
	unsupported: 'skipped',
	'env-values': 'skipped',
	'parse-failed': 'failed',
	unreadable: 'failed'
} as const satisfies Record<string, CoverageStatus>;

export type CoverageReason = keyof typeof COVERAGE_REASONS;

export const COVERAGE_STATUSES: readonly CoverageStatus[] = [
	'sent',
	'not-sent',
	'cut',
	'skipped',
	'failed'
];

export interface FileCoverage {
	/** Relative to the project root, without the project name */
	path: string;
	reason: CoverageReason;
}

/** How the AI's answer for one diagram level matched the files it was given. */
export interface LevelCoverage {
	key: string;
	label: string;
	depth: number;
	/** Absent on levels cached or shared before the counts existed */
	assignment: AssignmentCounts | null;
	/** Files of this level the budget kept out of the request */
	overBudget: number;
	/** No file fit the budget, so the request sent the smallest one over it */
	exceedsBudget: boolean;
}

/** What the resolver bound the import and re-export statements of the code map to. */
export interface ImportCoverage {
	/** A file in the project */
	project: number;
	/** A package outside it */
	external: number;
	/** The resolver looked and found nothing */
	unresolved: number;
}

export interface CoverageReport {
	files: FileCoverage[];
	byStatus: Record<CoverageStatus, FileCoverage[]>;
	/** Files the parser read: sent, not sent, or excluded by path */
	read: number;
	levels: LevelCoverage[];
	/** Null before the code map is built, or when no statement is in a language the resolver reads */
	imports: ImportCoverage | null;
}
