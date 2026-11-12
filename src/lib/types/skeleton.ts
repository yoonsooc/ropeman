/**
 * The request the AI receives, frozen at v1: any change to a field or its key order moves
 * every cache key. Skeleton v2 (`codeMap.ts`) projects into it and adds nothing (ADR-21).
 */
import type { SymbolKind } from './ast';

/** Kinds the code map keeps but the AI is not sent. */
export const LOCAL_ONLY_KINDS = [
	'variable',
	'interface',
	'type'
] as const satisfies readonly SymbolKind[];

export type WireSymbolKind = Exclude<SymbolKind, (typeof LOCAL_ONLY_KINDS)[number]>;

export interface SkeletonSymbol {
	name: string;
	kind: WireSymbolKind;
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
