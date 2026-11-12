export interface SkeletonSymbol {
	name: string;
	kind: 'function' | 'class' | 'method' | 'import' | 'frontmatter' | 'heading';
	badges?: string[];
	children?: SkeletonSymbol[];
}

export interface SkeletonImport {
	source: string;
	specifiers: string[];
}

export interface SkeletonFile {
	path: string;
	language: string | null;
	symbols: SkeletonSymbol[];
	imports: SkeletonImport[];
}

export interface SkeletonPayload {
	projectName: string;
	totalFiles: number;
	totalSymbols: number;
	files: SkeletonFile[];
}

/** Why a parsed file is not in the skeleton that is sent. */
export type SkeletonOmission = 'over-budget' | 'excluded-path' | 'no-symbols';

/** The skeleton to send, and every parsed file it leaves out. */
export interface SkeletonSelection {
	payload: SkeletonPayload;
	omitted: { path: string; reason: SkeletonOmission }[];
	/** The payload is larger than the budget, because a drill-down sends one file even when none fits */
	exceedsBudget: boolean;
}
