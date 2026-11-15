/** A project githubLoader read. `commit` is set when GitHub reported the commit, and `ref` is then that commit. */
export interface GitHubInfo {
	owner: string;
	repo: string;
	/** What raw.githubusercontent.com reads files at */
	ref: string;
	commit: string | null;
}
