import type { ASTSymbol, ParseSkip } from '$lib/types/ast';
import type { FileNode } from '$lib/types/fileTree';
import type { SemanticLevel, SemanticNode } from '$lib/types/semantic';
import type { SkeletonSelection } from '$lib/types/skeleton';
import {
	COVERAGE_REASONS,
	COVERAGE_STATUSES,
	type CoverageReason,
	type CoverageReport,
	type CoverageStatus,
	type FileCoverage,
	type LevelCoverage
} from '$lib/types/coverage';
import type { CutFile } from '$lib/utils/filePriority';
import { isEnvValueFile, isJsonData, isLockfile, isSupported } from '$lib/utils/languageDetector';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { semanticStore } from '$lib/stores/semanticStore.svelte';
import { selectSkeleton, selectSubSkeleton } from './skeletonExtractor';

export interface CoverageInput {
	projectName: string;
	fileTree: FileNode | null;
	astMap: Map<string, ASTSymbol[]>;
	cutFiles: readonly CutFile[];
	parseSkips: readonly ParseSkip[];
	skeleton: SkeletonSelection;
	/** Diagram levels keyed like the semantic store's cache ('__root__' or the parent node id) */
	levels: ReadonlyMap<string, SemanticLevel>;
	/** The skeleton a drill-down into `parent` sends */
	drilldownSkeleton: (parent: SemanticNode) => SkeletonSelection;
}

const READ_REASONS = new Set<CoverageReason>([
	'sent',
	'over-budget',
	'no-symbols',
	'excluded-path'
]);

/** Where every file of the loaded project ended up, and how each diagram level used them. */
export function buildCoverage(input: CoverageInput): CoverageReport {
	const relative = (path: string) =>
		path.startsWith(input.projectName + '/') ? path.slice(input.projectName.length + 1) : path;

	const reasons = new Map<string, CoverageReason>();
	for (const cut of input.cutFiles) reasons.set(relative(cut.path), cut.reason);
	const parseSkips = new Map(input.parseSkips.map((skip) => [skip.path, skip.reason]));
	const omitted = new Map(input.skeleton.omitted.map((o) => [o.path, o.reason]));
	const sent = new Set(input.skeleton.payload.files.map((file) => file.path));

	for (const file of filesOf(input.fileTree)) {
		const path = relative(file.path);
		if (reasons.has(path)) continue;
		reasons.set(path, fileReason(file, { astMap: input.astMap, parseSkips, omitted, sent }));
	}

	const files: FileCoverage[] = [...reasons]
		.map(([path, reason]) => ({ path, reason }))
		.sort((a, b) => a.path.localeCompare(b.path));
	const byStatus = Object.fromEntries(
		COVERAGE_STATUSES.map((status) => [status, [] as FileCoverage[]])
	) as Record<CoverageStatus, FileCoverage[]>;
	for (const file of files) byStatus[COVERAGE_REASONS[file.reason]].push(file);

	return {
		files,
		byStatus,
		read: files.filter((file) => READ_REASONS.has(file.reason)).length,
		levels: levelCoverage(input)
	};
}

function fileReason(
	file: FileNode,
	known: {
		astMap: Map<string, ASTSymbol[]>;
		parseSkips: Map<string, CoverageReason>;
		omitted: Map<string, CoverageReason>;
		sent: Set<string>;
	}
): CoverageReason {
	if (!file.language || !isSupported(file.language)) return unreadReason(file.path);
	const skip = known.parseSkips.get(file.path);
	if (skip) return skip;
	if (!known.astMap.has(file.path)) return 'unreadable';
	if (known.sent.has(file.path)) return 'sent';
	return known.omitted.get(file.path) ?? 'no-symbols';
}

function unreadReason(path: string): CoverageReason {
	if (isEnvValueFile(path)) return 'env-values';
	if (isLockfile(path)) return 'lockfile';
	if (isJsonData(path)) return 'data-file';
	return 'unsupported';
}

function levelCoverage(input: CoverageInput): LevelCoverage[] {
	const nodes = new Map<string, SemanticNode>();
	for (const level of input.levels.values()) {
		for (const node of level.nodes) nodes.set(node.id, node);
	}

	const levels: LevelCoverage[] = [];
	for (const [key, level] of input.levels) {
		const parent = level.parentId ? nodes.get(level.parentId) : undefined;
		if (level.parentId && !parent) continue;
		const skeleton = parent ? input.drilldownSkeleton(parent) : input.skeleton;
		levels.push({
			key,
			label: parent?.label ?? level.breadcrumbLabel,
			depth: parent ? parent.depth + 1 : 0,
			assignment: level.assignment ?? null,
			overBudget: skeleton.omitted.filter((o) => o.reason === 'over-budget').length,
			exceedsBudget: skeleton.exceedsBudget
		});
	}
	return levels.sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label));
}

function filesOf(node: FileNode | null): FileNode[] {
	if (!node) return [];
	if (node.kind === 'file') return [node];
	return (node.children ?? []).flatMap(filesOf);
}

/** Coverage of the open project with the current settings, read from the stores. */
export function currentCoverage(): CoverageReport {
	const { projectName, fileTree, astMap } = projectStore;
	const levels = new Map(semanticStore.cache);
	const current = semanticStore.currentLevel;
	if (current) levels.set(current.parentId ?? '__root__', current);

	return buildCoverage({
		projectName,
		fileTree,
		astMap,
		cutFiles: projectStore.cutFiles,
		parseSkips: projectStore.parseSkips,
		skeleton: selectSkeleton(projectName, fileTree, astMap),
		levels,
		drilldownSkeleton: (parent) => selectSubSkeleton(parent.filePaths, fileTree, astMap)
	});
}
