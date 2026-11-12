import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { createBridgeServer, HOST, type BridgeOptions } from '../src/bridge';
import { CliRunner } from '../src/cli';
import { parseAllowedOrigins } from '../src/auth';
import { resolveRoot } from '../src/fileRead';
import { MAP_SCHEMA_VERSION } from '../../src/lib/types/ropemanMap';

const TOKEN = 'test-token-0123456789';

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.on('error', reject);
		probe.listen(0, HOST, () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

/** Sends a raw WebSocket handshake so the test controls Host and Origin like a browser would. */
function handshake(port: number, headers: Record<string, string>, token = TOKEN): Promise<number> {
	return new Promise((resolve, reject) => {
		const req = http.request({
			host: HOST,
			port,
			path: `/?token=${token}`,
			headers: {
				Connection: 'Upgrade',
				Upgrade: 'websocket',
				'Sec-WebSocket-Version': '13',
				'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
				...headers
			}
		});
		req.on('upgrade', (res, socket) => {
			socket.destroy();
			resolve(res.statusCode ?? 0);
		});
		req.on('response', (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on('error', reject);
		req.end();
	});
}

function get(
	port: number,
	urlPath: string,
	host = `127.0.0.1:${port}`
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
	return new Promise((resolve, reject) => {
		http
			.get({ host: HOST, port, path: urlPath, headers: { Host: host } }, (res) => {
				let body = '';
				res.on('data', (chunk) => (body += chunk));
				res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
			})
			.on('error', reject);
	});
}

/** Opens a socket the way the probe page does and runs one request. */
async function request(port: number, msg: object): Promise<Record<string, unknown>> {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
	try {
		return await new Promise((resolve, reject) => {
			ws.onerror = () => reject(new Error('socket error'));
			ws.onmessage = (ev) => {
				const reply = JSON.parse(String(ev.data));
				if (reply.type === 'hello') {
					ws.send(JSON.stringify({ id: 1, ...msg }));
				} else if (reply.id === 1) {
					resolve(reply);
				}
			};
		});
	} finally {
		ws.close();
	}
}

/** Sends every message at once and collects the reply to each, keyed by id. */
async function requestAll(port: number, msgs: object[]): Promise<Record<string, unknown>[]> {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
	try {
		return await new Promise((resolve, reject) => {
			const replies = new Map<number, Record<string, unknown>>();
			ws.onerror = () => reject(new Error('socket error'));
			ws.onmessage = (ev) => {
				const reply = JSON.parse(String(ev.data));
				if (reply.type === 'hello') {
					msgs.forEach((msg, i) => ws.send(JSON.stringify({ id: i, ...msg })));
				} else {
					replies.set(reply.id, reply);
					if (replies.size === msgs.length) resolve(msgs.map((_, i) => replies.get(i)!));
				}
			};
		});
	} finally {
		ws.close();
	}
}

describe('bridge server', () => {
	let base: string;
	let viewerDir: string;
	let projectDir: string;
	let server: http.Server | null = null;

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-server-'));
		viewerDir = path.join(base, 'viewer');
		projectDir = path.join(base, 'project');
		fs.mkdirSync(viewerDir);
		fs.mkdirSync(projectDir);
		fs.writeFileSync(path.join(viewerDir, 'index.html'), '<!doctype html><title>viewer</title>');
		fs.writeFileSync(path.join(viewerDir, 'app.js'), 'export {};');
		fs.writeFileSync(path.join(viewerDir, 'bridge.html'), '<!doctype html><title>bridge</title>');
		fs.writeFileSync(path.join(viewerDir, '.env'), 'SECRET=1\n');
		fs.mkdirSync(path.join(viewerDir, 'sub'));
		fs.mkdirSync(path.join(viewerDir, '.git'));
		fs.writeFileSync(path.join(viewerDir, '.git', 'config'), '[remote]\n');
		fs.symlinkSync(path.join(viewerDir, '.env'), path.join(viewerDir, 'config.txt'));
		fs.writeFileSync(path.join(base, 'secret.txt'), 'outside the viewer');
		fs.writeFileSync(path.join(projectDir, 'main.ts'), 'console.log(1);\n');
	});

	afterAll(() => {
		fs.rmSync(base, { recursive: true, force: true });
	});

	afterEach(async () => {
		server?.closeAllConnections();
		if (server) await new Promise((resolve) => server!.close(resolve));
		server = null;
	});

	async function start(overrides: Partial<BridgeOptions> = {}): Promise<number> {
		const port = await freePort();
		({ server } = createBridgeServer({
			port,
			token: TOKEN,
			allowedOrigins: parseAllowedOrigins([]),
			defaultCli: null,
			root: null,
			viewerDir: null,
			session: null,
			runner: new CliRunner(2, base),
			server: { name: '@ropeman/bridge', version: 'test' },
			...overrides
		}));
		await new Promise<void>((resolve) => server!.listen(port, HOST, resolve));
		return port;
	}

	describe('Host check', () => {
		it('refuses a WebSocket upgrade whose Host is not the loopback address', async () => {
			// Arrange
			const port = await start();
			const origin = 'https://ropeman.dev';

			// Act: a rebound domain resolves to 127.0.0.1 but still sends its own name
			const rebound = await handshake(port, { Host: `evil.example:${port}`, Origin: origin });
			const otherPort = await handshake(port, { Host: `127.0.0.1:${port + 1}`, Origin: origin });
			const loopback = await handshake(port, { Host: `127.0.0.1:${port}`, Origin: origin });
			const localhost = await handshake(port, { Host: `localhost:${port}`, Origin: origin });

			// Assert
			expect([rebound, otherPort, loopback, localhost]).toEqual([403, 403, 101, 101]);
		});

		it('refuses an HTTP request whose Host is not the loopback address', async () => {
			const port = await start({ viewerDir: resolveRoot(viewerDir) });
			expect((await get(port, '/', `evil.example:${port}`)).status).toBe(403);
			expect((await get(port, '/')).status).toBe(200);
		});
	});

	describe('local mode', () => {
		it('serves a prerendered route at its path without the .html, as Cloudflare Pages does', async () => {
			const port = await start({ viewerDir: resolveRoot(viewerDir) });

			const route = await get(port, '/bridge');
			const dir = await get(port, '/sub');

			expect(route.status).toBe(200);
			expect(route.body).toContain('<title>bridge</title>');
			expect(dir.status).toBe(404);
		});

		it('serves the viewer with headers that stop framing and sniffing', async () => {
			// Arrange
			const port = await start({ viewerDir: resolveRoot(viewerDir) });

			// Act
			const index = await get(port, '/');
			const script = await get(port, '/app.js');

			// Assert
			expect(index.body).toContain('<title>viewer</title>');
			expect(index.headers['content-type']).toBe('text/html; charset=utf-8');
			expect(index.headers['content-security-policy']).toBe("frame-ancestors 'none'");
			expect(index.headers['x-content-type-options']).toBe('nosniff');
			expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
		});

		it('does not serve files outside the viewer directory', async () => {
			const port = await start({ viewerDir: resolveRoot(viewerDir) });
			expect((await get(port, '/..%2fsecret.txt')).status).toBe(404);
			expect((await get(port, '/%2e%2e/secret.txt')).status).toBe(404);
			expect((await get(port, '/missing.js')).status).toBe(404);
		});

		it('does not serve dotfiles, dot directories or links to them', async () => {
			// Arrange: `--viewer .` started in a project that holds a .env
			const port = await start({ viewerDir: resolveRoot(viewerDir) });

			// Act
			const urls = ['/.env', '/%2eenv', '/sub/%2e%2e/.env', '/.git/config', '/config.txt'];
			const statuses = await Promise.all(urls.map(async (url) => (await get(port, url)).status));

			// Assert
			expect(statuses).toEqual([404, 404, 404, 404, 404]);
		});

		it('answers HEAD with the size and no body', async () => {
			const port = await start({ viewerDir: resolveRoot(viewerDir) });
			const head = await new Promise<http.IncomingMessage & { body: string }>((resolve, reject) => {
				http
					.request({ host: HOST, port, path: '/app.js', method: 'HEAD' }, (res) => {
						let body = '';
						res.on('data', (chunk) => (body += chunk));
						res.on('end', () => resolve(Object.assign(res, { body })));
					})
					.on('error', reject)
					.end();
			});
			expect([head.statusCode, head.headers['content-length'], head.body]).toEqual([200, '10', '']);
		});

		it('accepts its own origin only while it serves the viewer', async () => {
			// Arrange
			const served = await start({ viewerDir: resolveRoot(viewerDir) });
			const servedStatus = await handshake(served, {
				Host: `127.0.0.1:${served}`,
				Origin: `http://127.0.0.1:${served}`
			});
			server!.closeAllConnections();
			await new Promise((resolve) => server!.close(resolve));
			const plain = await start();

			// Act
			const plainStatus = await handshake(plain, {
				Host: `127.0.0.1:${plain}`,
				Origin: `http://127.0.0.1:${plain}`
			});
			const plainGet = await get(plain, '/');

			// Assert
			expect(servedStatus).toBe(101);
			expect(plainStatus).toBe(403);
			expect(plainGet.status).toBe(426);
		});
	});

	describe('messages', () => {
		it('answers file.read with the file under the root', async () => {
			const port = await start({ root: resolveRoot(projectDir) });
			const reply = await request(port, { type: 'file.read', path: 'main.ts' });
			expect(reply.result).toMatchObject({
				path: 'main.ts',
				content: 'console.log(1);\n',
				size: 16
			});
		});

		it('answers file.read with the rejection reason', async () => {
			const port = await start({ root: resolveRoot(projectDir) });
			const reply = await request(port, { type: 'file.read', path: '../secret.txt' });
			expect(reply).toMatchObject({ code: 'outside-root' });
			expect(reply.result).toBeUndefined();
		});

		it('answers file.read past the per-connection limit with busy, then serves again', async () => {
			// Arrange: the README promises 8 reads in flight per connection
			const port = await start({ root: resolveRoot(projectDir) });
			const burst = Array.from({ length: 24 }, () => ({
				type: 'file.read',
				path: 'main.ts'
			}));

			// Act
			const replies = await requestAll(port, burst);
			const after = await request(port, { type: 'file.read', path: 'main.ts' });

			// Assert
			const busy = replies.filter((reply) => reply.code === 'busy').length;
			const served = replies.filter((reply) => reply.result !== undefined).length;
			expect(busy).toBeGreaterThan(0);
			expect(served).toBeGreaterThanOrEqual(8);
			expect(busy + served).toBe(burst.length);
			expect(after.result).toMatchObject({ path: 'main.ts' });
		});

		it('greets each socket with the schema version', async () => {
			// Arrange
			const port = await start();
			const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);

			// Act
			const first = await new Promise<Record<string, unknown>>((resolve) => {
				ws.onmessage = (ev) => resolve(JSON.parse(String(ev.data)));
			});
			ws.close();

			// Assert
			expect(first).toEqual({
				type: 'hello',
				schemaVersion: MAP_SCHEMA_VERSION,
				server: { name: '@ropeman/bridge', version: 'test' }
			});
		});

		it('answers map.get with not-ready when started without a root', async () => {
			const port = await start();
			const reply = await request(port, { type: 'map.get' });
			expect(reply).toMatchObject({ type: 'map.get', code: 'not-ready' });
		});

		it('refuses file.read when started without a root', async () => {
			const port = await start();
			const reply = await request(port, { type: 'file.read', path: 'main.ts' });
			expect(reply.code).toBe('no-root');
		});

		it.skipIf(process.platform === 'win32')('relays chat to the CLI over stdin', async () => {
			// Arrange: a stand-in `claude` that echoes the prompt it reads from stdin
			const bin = path.join(base, 'bin');
			fs.mkdirSync(bin, { recursive: true });
			fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nprintf "got:"\ncat\n', {
				mode: 0o755
			});
			const savedPath = process.env.PATH;
			process.env.PATH = `${bin}${path.delimiter}${savedPath}`;
			try {
				const port = await start({ defaultCli: 'claude' });

				// Act
				const reply = await request(port, { type: 'chat', message: 'explain main.ts' });

				// Assert
				expect(reply.result).toBe('got:explain main.ts');
			} finally {
				process.env.PATH = savedPath;
			}
		});
	});
});
