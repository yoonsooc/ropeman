/**
 * exploreService — public gallery (/explore) data access (SH4 / ADR-19)
 *
 * Two data sources:
 *   - Curated metadata (`static/explore-curated.json`): list of repos to show in
 *     the gallery, including human-written descriptions and slug → owner/repo
 *     mapping. Bundled at build time so the gallery list itself is fully static.
 *   - Snapshot KV store (Edge Worker at EXPLORE_URL): the actual analyzed
 *     SemanticLevel data, refreshed manually by the maintainer (no TTL).
 *
 * The /explore route never needs the KV store; only /explore/[slug] does.
 */
import { EXPLORE_URL } from '$lib/config';
import type { SemanticLevel } from '$lib/types/semantic';
import curatedRaw from '$lib/data/explore-curated.json';
import { MAX_FILE_SIZE } from '$lib/utils/filePriority';

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const commitOrUndefined = (v: unknown) =>
	typeof v === 'string' && COMMIT_SHA.test(v) ? v : undefined;

export interface CuratedEntry {
	slug: string;
	owner: string;
	repo: string;
	title: string;
	language: string;
	description: string;
	/** Korean description, shown when the UI locale is ko */
	descriptionKo?: string;
	stars?: string;
	/**
	 * Commit a legacy snapshot was analyzed at. Snapshots from before the snapshot
	 * recorded its own `commit` need it to open their files.
	 */
	ref?: string;
}

export interface CuratedManifest {
	updatedAt: string;
	entries: CuratedEntry[];
}

export interface ExploreSnapshot {
	projectName: string;
	owner?: string;
	repo?: string;
	semanticLevels: Record<string, SemanticLevel>;
	filePaths?: string[];
	analyzedAt?: string;
	/** Commit the snapshot was analyzed at. A snapshot that records it stores repository paths. */
	commit?: string;
}

/** Build-time bundled curated manifest, validated once at module load. */
let _curatedCache: CuratedManifest | null = null;
export function getCuratedManifest(): CuratedManifest {
	if (_curatedCache) return _curatedCache;
	const validated = validateManifest(curatedRaw as unknown);
	_curatedCache = validated ?? { updatedAt: '', entries: [] };
	return _curatedCache;
}

/** Validate the curated manifest shape (defensive — JSON ships with the build). */
export function validateManifest(data: unknown): CuratedManifest | null {
	if (!data || typeof data !== 'object') return null;
	const obj = data as Record<string, unknown>;
	if (typeof obj.updatedAt !== 'string') return null;
	if (!Array.isArray(obj.entries)) return null;
	const entries: CuratedEntry[] = [];
	for (const raw of obj.entries) {
		if (!raw || typeof raw !== 'object') continue;
		const e = raw as Record<string, unknown>;
		if (
			typeof e.slug === 'string' &&
			typeof e.owner === 'string' &&
			typeof e.repo === 'string' &&
			typeof e.title === 'string' &&
			typeof e.language === 'string' &&
			typeof e.description === 'string'
		) {
			entries.push({
				slug: e.slug,
				owner: e.owner,
				repo: e.repo,
				title: e.title,
				language: e.language,
				description: e.description,
				descriptionKo: typeof e.descriptionKo === 'string' ? e.descriptionKo : undefined,
				stars: typeof e.stars === 'string' ? e.stars : undefined,
				ref: commitOrUndefined(e.ref)
			});
		}
	}
	return { updatedAt: obj.updatedAt, entries };
}

export function findCuratedEntry(
	manifest: CuratedManifest,
	slug: string
): CuratedEntry | undefined {
	return manifest.entries.find((e) => e.slug === slug);
}

/** Filter manifest by language and free-text query (case-insensitive). */
export function filterEntries(
	entries: CuratedEntry[],
	options: { language?: string; query?: string }
): CuratedEntry[] {
	const lang = options.language?.toLowerCase();
	const q = options.query?.toLowerCase().trim();
	return entries.filter((e) => {
		if (lang && lang !== 'all' && e.language.toLowerCase() !== lang) return false;
		if (q) {
			const hay = `${e.title} ${e.owner} ${e.repo} ${e.description}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

/** Distinct language list across the manifest, sorted alphabetically. */
export function listLanguages(entries: CuratedEntry[]): string[] {
	const set = new Set<string>();
	for (const e of entries) set.add(e.language);
	return [...set].sort();
}

/** Validate snapshot shape returned by the explore Worker (defensive). */
export function validateSnapshot(data: unknown): ExploreSnapshot | null {
	if (!data || typeof data !== 'object') return null;
	const obj = data as Record<string, unknown>;
	if (typeof obj.projectName !== 'string') return null;
	if (!obj.semanticLevels || typeof obj.semanticLevels !== 'object') return null;

	// Validate each level structurally — same checks the share viewer uses (AP-8).
	const levels: Record<string, SemanticLevel> = {};
	for (const [key, value] of Object.entries(obj.semanticLevels)) {
		const lvl = value as Record<string, unknown>;
		if (
			lvl &&
			typeof lvl === 'object' &&
			Array.isArray(lvl.nodes) &&
			Array.isArray(lvl.edges) &&
			typeof lvl.breadcrumbLabel === 'string' &&
			(lvl.parentId === null || typeof lvl.parentId === 'string')
		) {
			levels[key] = lvl as unknown as SemanticLevel;
		}
	}

	return {
		projectName: obj.projectName,
		owner: typeof obj.owner === 'string' ? obj.owner : undefined,
		repo: typeof obj.repo === 'string' ? obj.repo : undefined,
		semanticLevels: levels,
		filePaths: Array.isArray(obj.filePaths) ? (obj.filePaths as string[]) : undefined,
		analyzedAt: typeof obj.analyzedAt === 'string' ? obj.analyzedAt : undefined,
		commit: commitOrUndefined(obj.commit)
	};
}

export type FetchSnapshotResult =
	| { ok: true; snapshot: ExploreSnapshot }
	| { ok: false; status: 'not-analyzed' | 'error'; message: string };

export type UploadSnapshotResult = { ok: true } | { ok: false; message: string };

/**
 * Upload a curated snapshot to the explore worker (admin-only).
 * Requires the worker deployed + EXPLORE_ADMIN_TOKEN configured.
 * Intended to be called from a dev-only console helper
 * (`__uploadExplore`), never from production UI code.
 */
export async function uploadExploreSnapshot(
	slug: string,
	snapshot: ExploreSnapshot,
	token: string
): Promise<UploadSnapshotResult> {
	if (!EXPLORE_URL) {
		return { ok: false, message: 'EXPLORE_URL is not configured.' };
	}
	if (!token) {
		return { ok: false, message: 'Admin token is required.' };
	}
	try {
		const res = await fetch(`${EXPLORE_URL}/explore/${slug}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify(snapshot)
		});
		if (res.ok) return { ok: true };
		const text = await res.text().catch(() => '');
		return { ok: false, message: `HTTP ${res.status}: ${text || res.statusText}` };
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : 'Network error'
		};
	}
}

export async function fetchExploreSnapshot(slug: string): Promise<FetchSnapshotResult> {
	// If EXPLORE_URL is not configured, the worker is not deployed yet —
	// treat it as "not analyzed" so the viewer shows the friendly fallback
	// instead of a confusing error screen.
	if (!EXPLORE_URL) {
		return {
			ok: false,
			status: 'not-analyzed',
			message: 'This project has not been analyzed yet.'
		};
	}

	try {
		const res = await fetch(`${EXPLORE_URL}/explore/${slug}`);
		if (res.status === 404) {
			return {
				ok: false,
				status: 'not-analyzed',
				message: 'This project has not been analyzed yet.'
			};
		}
		if (!res.ok) {
			return {
				ok: false,
				status: 'error',
				message: `HTTP ${res.status}: failed to load explore snapshot.`
			};
		}
		const raw = await res.json();
		const snapshot = validateSnapshot(raw);
		if (!snapshot) {
			return { ok: false, status: 'error', message: 'Invalid snapshot payload.' };
		}
		return { ok: true, snapshot };
	} catch {
		// Network-level failure (DNS, CORS, offline) — most likely the
		// explore worker is unreachable. Degrade gracefully to the
		// "not analyzed yet" state rather than surfacing a raw fetch error.
		return {
			ok: false,
			status: 'not-analyzed',
			message: 'This project has not been analyzed yet.'
		};
	}
}

/** Where a snapshot's files live on GitHub, and how its paths map to repository paths */
export interface ExploreSource {
	owner: string;
	repo: string;
	commit: string;
	/**
	 * `repo`: the snapshot records its commit and stores repository paths.
	 * `legacy`: an older snapshot. The GitHub loader named files `<repo>/<path>`, but tokio's
	 * snapshot holds repository paths, so `prefixed` records whether every path had the prefix.
	 */
	paths: { kind: 'repo' } | { kind: 'legacy'; prefixed: boolean };
}

/** Null when neither the snapshot nor its curated entry says which commit was analyzed. */
export function exploreSource(
	entry: CuratedEntry,
	snapshot: ExploreSnapshot
): ExploreSource | null {
	const { owner, repo } = entry;
	if (snapshot.commit) return { owner, repo, commit: snapshot.commit, paths: { kind: 'repo' } };
	if (!entry.ref) return null;
	const paths = Object.values(snapshot.semanticLevels).flatMap((level) =>
		level.nodes.flatMap((node) => node.filePaths ?? [])
	);
	const prefixed = paths.length > 0 && paths.every((p) => p.startsWith(`${repo}/`));
	return { owner, repo, commit: entry.ref, paths: { kind: 'legacy', prefixed } };
}

/**
 * Repository paths to try for a snapshot path, most likely first. A legacy path that starts
 * with `<repo>/` may be a loader prefix or a real folder of that name (tokio has one), so
 * both readings are tried. Empty when a segment is empty, `.` or `..`, which the browser
 * would resolve outside the repository.
 */
export function exploreRepoPaths(source: ExploreSource, path: string): string[] {
	if (path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return [];
	const prefix = `${source.repo}/`;
	if (source.paths.kind === 'repo' || !path.startsWith(prefix)) return [path];
	const stripped = path.slice(prefix.length);
	return source.paths.prefixed ? [stripped, path] : [path, stripped];
}

export function exploreFileUrl(
	source: ExploreSource,
	repoPath: string,
	view: 'raw' | 'blob'
): string {
	const encoded = repoPath.split('/').map(encodeURIComponent).join('/');
	const { owner, repo, commit } = source;
	return view === 'raw'
		? `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${encoded}`
		: `https://github.com/${owner}/${repo}/blob/${commit}/${encoded}`;
}

export type ExploreFileFailure =
	| { reason: 'invalid-path' | 'not-found' | 'too-large' | 'binary' | 'rate-limited' }
	/** `status` is missing when the request never got an answer */
	| { reason: 'unavailable'; status?: number };

export type ExploreFileResult =
	| { ok: true; content: string; repoPath: string }
	| ({ ok: false } & ExploreFileFailure);

async function fetchRawFile(
	url: string
): Promise<{ ok: true; content: string } | ({ ok: false } & ExploreFileFailure)> {
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
	if (res.status === 404) return { ok: false, reason: 'not-found' };
	if (res.status === 403 || res.status === 429) return { ok: false, reason: 'rate-limited' };
	if (!res.ok) return { ok: false, reason: 'unavailable', status: res.status };
	// The header is the compressed size when GitHub gzips, so the body length decides too
	if (Number(res.headers.get('content-length')) > MAX_FILE_SIZE) {
		return { ok: false, reason: 'too-large' };
	}
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await res.arrayBuffer());
	} catch {
		return { ok: false, reason: 'unavailable' };
	}
	if (bytes.length > MAX_FILE_SIZE) return { ok: false, reason: 'too-large' };
	if (bytes.subarray(0, 8000).includes(0)) return { ok: false, reason: 'binary' };
	return { ok: true, content: new TextDecoder().decode(bytes) };
}

/** Reads one snapshot file from GitHub, trying the next repository path only on a 404. */
export async function fetchExploreFile(
	source: ExploreSource,
	path: string
): Promise<ExploreFileResult> {
	const candidates = exploreRepoPaths(source, path);
	if (candidates.length === 0) return { ok: false, reason: 'invalid-path' };
	let result: ExploreFileResult = { ok: false, reason: 'not-found' };
	for (const repoPath of candidates) {
		const got = await fetchRawFile(exploreFileUrl(source, repoPath, 'raw'));
		if (got.ok) return { ...got, repoPath };
		result = got;
		if (got.reason !== 'not-found') break;
	}
	return result;
}
