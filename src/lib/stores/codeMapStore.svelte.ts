import type { ASTRef, ASTSymbol } from '$lib/types/ast';
import type { CodeMap } from '$lib/types/codeMap';
import { buildCodeMap } from '$lib/services/skeletonExtractor';
import { projectStore } from './projectStore.svelte';

/** What a loader read in one parse of the open project. */
export interface CodeMapInput {
	astMap: Map<string, ASTSymbol[]>;
	/** The folder every astMap key starts with: the repository on GitHub, null for a local folder */
	root: string | null;
	refs: ReadonlyMap<string, readonly ASTRef[]>;
	/** `collectResolverConfigs` texts, keyed like astMap */
	configs: ReadonlyMap<string, string>;
}

function createCodeMapStore() {
	let built = $state.raw<{ astMap: Map<string, ASTSymbol[]>; map: CodeMap } | null>(null);

	return {
		/**
		 * The code map of the open project. Null until a parse finishes, and as soon as anything
		 * replaces `projectStore.astMap` (a new project, a reset, a re-parse), so a map never
		 * outlives the parse it came from.
		 */
		get map(): CodeMap | null {
			return built && built.astMap === projectStore.astMap ? built.map : null;
		},

		/**
		 * Build once per finished parse, after `projectStore.astMap` is set to `input.astMap`.
		 * A no-op once something else replaced it, so a load that finishes after the user opened
		 * another project cannot overwrite that project's map.
		 */
		build({ astMap, root, refs, configs }: CodeMapInput) {
			if (projectStore.astMap !== astMap) return;
			built = { astMap, map: buildCodeMap(astMap, root, { refs, configs }) };
		}
	};
}

export const codeMapStore = createCodeMapStore();
