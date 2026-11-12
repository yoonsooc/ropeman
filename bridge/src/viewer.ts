import fs from 'fs';
import type http from 'http';
import path from 'path';

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
	const target = path.join(viewerDir, relative);

	let real: string;
	try {
		real = await fs.promises.realpath(target);
	} catch {
		res.writeHead(404).end();
		return;
	}
	const rel = path.relative(viewerDir, real);
	const stat = rel.startsWith('..') || path.isAbsolute(rel) ? null : await fs.promises.stat(real);
	if (!stat?.isFile()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, {
		...HEADERS,
		'Content-Type': CONTENT_TYPES[path.extname(real)] ?? 'application/octet-stream',
		'Content-Length': stat.size
	});
	if (req.method === 'HEAD') {
		res.end();
		return;
	}
	fs.createReadStream(real).pipe(res);
}
