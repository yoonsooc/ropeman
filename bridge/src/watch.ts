import fs from 'fs';
import { lstat, readdir } from 'fs/promises';
import path from 'path';

export interface TreeWatcher {
	/** Watch exactly these folders (repo-relative, '' for the root); others stop being watched */
	watch(folders: readonly string[]): void;
	close(): void;
}

/**
 * One non-recursive `fs.watch` per folder the extraction walked. The walk already applied the
 * skip rules, so `node_modules` and hidden folders are never watched, on every platform: a
 * recursive watch on Linux would add an inotify watch for each of their folders. A folder
 * created later is watched after the extraction that follows its creation walks it.
 */
export function createTreeWatcher(
	root: string,
	onPath: (repoPath: string) => void,
	log: (msg: string) => void
): TreeWatcher {
	const watchers = new Map<string, fs.FSWatcher>();
	let closed = false;

	const open = (folder: string) => {
		try {
			const watcher = fs.watch(path.join(root, folder), (_event, filename) => {
				// Some platforms leave the name out; the folder itself is then what changed
				const name = typeof filename === 'string' ? filename.split(path.sep).join('/') : null;
				onPath(name ? (folder ? `${folder}/${name}` : name) : folder || '.');
			});
			// A folder deleted under the watch reports an error; the next extraction drops it
			watcher.on('error', () => {
				watcher.close();
				watchers.delete(folder);
			});
			watchers.set(folder, watcher);
		} catch (err) {
			log(`Cannot watch ${folder || '.'}: ${(err as Error).message}`);
		}
	};

	return {
		watch(folders) {
			if (closed) return;
			const wanted = new Set(folders);
			for (const [folder, watcher] of watchers) {
				if (!wanted.has(folder)) {
					watcher.close();
					watchers.delete(folder);
				}
			}
			for (const folder of wanted) if (!watchers.has(folder)) open(folder);
		},
		close() {
			closed = true;
			for (const watcher of watchers.values()) watcher.close();
			watchers.clear();
		}
	};
}

const gone = (err: unknown) => ['ENOENT', 'ENOTDIR'].includes((err as NodeJS.ErrnoException).code!);

/**
 * How far before `since` a change time can fall and still be a change made after it. A file
 * system that stores whole seconds (HFS+, exFAT, FAT's 2 s) rounds the time down. Linux stamps
 * fine-grained times from a clock that can lag `Date.now()` by a scheduler tick (up to 10 ms).
 * Both stay well under the watch debounce, so an extraction a watcher started never finds the
 * change it was started for again; a whole-second stamp can, until the next extraction starts
 * 2 s after it.
 */
const stampSlack = (ctimeMs: number) => (ctimeMs % 1000 === 0 ? 2000 : 20);

/**
 * What changed after `since` (ms since the epoch) in the folders a walk entered: each entry
 * whose change time falls between `since` and now, each folder the walk did not enter that was
 * created since, and each of `files` that is gone. It finds what no watcher reports, a change
 * made after the walk read a folder and before its watcher opened. Change time, not modified
 * time, because a rename or a file moved in keeps its modified time. A change time past the
 * millisecond the scan started in (the clock was set back) is not counted, or every extraction
 * would find it again.
 */
export async function changedSince(
	root: string,
	folders: readonly string[],
	files: Iterable<string>,
	since: number
): Promise<string[]> {
	const now = Date.now();
	const walked = new Set(folders);
	const listed = new Map<string, Set<string>>();
	const changed: string[] = [];
	await Promise.all(
		folders.map(async (folder) => {
			let names: string[];
			try {
				names = await readdir(path.join(root, folder));
			} catch (err) {
				// A folder the user cannot list maps as empty on every walk; only a removed one changed
				if (gone(err)) changed.push(folder || '.');
				return;
			}
			listed.set(folder, new Set(names));
			await Promise.all(
				names.map(async (name) => {
					const entry = folder ? `${folder}/${name}` : name;
					if (walked.has(entry)) return;
					try {
						const { ctimeMs } = await lstat(path.join(root, entry));
						if (ctimeMs + stampSlack(ctimeMs) >= since && ctimeMs < now + 1) changed.push(entry);
					} catch (err) {
						if (gone(err)) changed.push(entry);
					}
				})
			);
		})
	);
	for (const file of files) {
		const cut = file.lastIndexOf('/');
		const names = listed.get(cut < 0 ? '' : file.slice(0, cut));
		if (names && !names.has(file.slice(cut + 1))) changed.push(file);
	}
	return changed.sort();
}
