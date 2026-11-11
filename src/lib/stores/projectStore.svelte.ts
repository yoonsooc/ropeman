import type { FileNode } from '$lib/types/fileTree';
import type { ASTSymbol } from '$lib/types/ast';
import type { CutFile } from '$lib/utils/filePriority';

interface ProjectState {
	fileTree: FileNode | null;
	astMap: Map<string, ASTSymbol[]>;
	isLoading: boolean;
	projectName: string;
	parsingProgress: { done: number; total: number };
	isSnippetMode: boolean;
}

function createProjectStore() {
	let fileTree = $state.raw<FileNode | null>(null);
	let astMap = $state.raw<Map<string, ASTSymbol[]>>(new Map());
	let githubInfo = $state<{ owner: string; repo: string; ref: string } | null>(null);
	let isLoading = $state(false);
	let projectName = $state('');
	let parsingProgress = $state({ done: 0, total: 0 });
	let isSnippetMode = $state(false);
	let cutFiles = $state.raw<CutFile[]>([]);

	return {
		get fileTree() {
			return fileTree;
		},
		set fileTree(v: FileNode | null) {
			fileTree = v;
		},

		get astMap() {
			return astMap;
		},
		set astMap(v: Map<string, ASTSymbol[]>) {
			astMap = v;
		},

		/** GitHub repo info for on-demand file fetching */
		get githubInfo() {
			return githubInfo;
		},
		set githubInfo(v: { owner: string; repo: string; ref: string } | null) {
			githubInfo = v;
		},

		get isLoading() {
			return isLoading;
		},
		set isLoading(v: boolean) {
			isLoading = v;
		},

		get projectName() {
			return projectName;
		},
		set projectName(v: string) {
			projectName = v;
		},

		get parsingProgress() {
			return parsingProgress;
		},
		set parsingProgress(v: { done: number; total: number }) {
			parsingProgress = v;
		},

		get isSnippetMode() {
			return isSnippetMode;
		},
		set isSnippetMode(v: boolean) {
			isSnippetMode = v;
		},

		/** Files the loader left out of the open project, with the reason */
		get cutFiles() {
			return cutFiles;
		},
		set cutFiles(v: CutFile[]) {
			cutFiles = v;
		},

		reset() {
			fileTree = null;
			astMap = new Map();
			githubInfo = null;
			isLoading = false;
			projectName = '';
			parsingProgress = { done: 0, total: 0 };
			isSnippetMode = false;
			cutFiles = [];
		}
	};
}

export const projectStore = createProjectStore();
