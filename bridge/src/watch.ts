import fs from 'fs';
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
