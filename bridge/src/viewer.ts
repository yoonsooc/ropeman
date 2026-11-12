import fs from 'fs';
import type http from 'http';
import path from 'path';
import { pipeline } from 'stream';
import { isInside, openRegularFile } from './fileRead.js';

const CONTENT_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.wasm': 'application/wasm',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8'
};

const HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	// The served viewer can run the local CLI, so no other site may frame it and steer its clicks
	'Content-Security-Policy': "frame-ancestors 'none'",
	'Cache-Control': 'no-cache'
};

/**
 * Dotfiles and dot directories (`.env`, `.git/`) are never served, and `..` is one of them, so a
 * `--viewer .` started in a project does not hand out its secrets.
 */
function hasDotSegment(relative: string): boolean {
	return relative.split(/[\\/]/).some((segment) => segment.startsWith('.'));
}

/** Serves a file of the viewer bundle (`viewerDir`, a real path); `/` serves `index.html`. */
export async function serveViewerFile(
	viewerDir: string,
	req: http.IncomingMessage,
	res: http.ServerResponse
): Promise<void> {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, { Allow: 'GET, HEAD' }).end();
		return;
	}
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
	} catch {
		res.writeHead(400).end();
		return;
	}
	const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
	if (hasDotSegment(relative)) {
		res.writeHead(404).end();
		return;
	}

	// The viewer prerenders `/bridge` as `bridge.html`, the way Cloudflare Pages serves it
	const candidates = path.extname(relative) ? [relative] : [relative, `${relative}.html`];
	let real: string | null = null;
	for (const candidate of candidates) {
		try {
			const found = await fs.promises.realpath(path.join(viewerDir, candidate));
			if ((await fs.promises.stat(found)).isFile()) {
				real = found;
				break;
			}
		} catch {
			// try the next spelling
		}
	}
	if (!real) {
		res.writeHead(404).end();
		return;
	}
	// A symlink in the bundle may point at a dotfile (`config.txt -> .env`) or out of it
	const opened =
		isInside(viewerDir, real) && !hasDotSegment(path.relative(viewerDir, real))
			? await openRegularFile(real)
			: 'not-found';
	if (typeof opened === 'string') {
		res.writeHead(404).end();
		return;
	}
	const { handle, stat } = opened;
	res.writeHead(200, {
		...HEADERS,
		'Content-Type': CONTENT_TYPES[path.extname(real)] ?? 'application/octet-stream',
		'Content-Length': stat.size
	});
	if (req.method === 'HEAD') {
		await handle.close();
		res.end();
		return;
	}
	// Streams the opened file, so a path swapped after the checks is never read; pipeline closes
	// it when the client goes away mid-response
	pipeline(handle.createReadStream(), res, () => {});
}
