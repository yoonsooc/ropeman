#!/usr/bin/env node
// Runs a built bridge the way a user does and drives one RPC session against it:
//   node bridge/scripts/smoke.mjs <server.mjs or installed bin> <project folder>
// The CLI is the test fake (bridge/test/fixtures/fake-cli.mjs) put on PATH as `claude`, so
// no model is called. Prints one JSON line of what came back and exits non-zero on a failure.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [server, root] = process.argv.slice(2);
if (!server || !root) {
	process.stderr.write('usage: smoke.mjs <server.mjs> <project folder>\n');
	process.exit(2);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ropeman-smoke-'));
const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
fs.symlinkSync(
	fileURLToPath(new URL('../test/fixtures/fake-cli.mjs', import.meta.url)),
	path.join(bin, 'claude')
);

const port = await new Promise((resolve) => {
	const probe = net.createServer().listen(0, '127.0.0.1', () => {
		const { port } = probe.address();
		probe.close(() => resolve(port));
	});
});
const token = randomBytes(16).toString('hex');
const child = spawn(
	server.endsWith('.mjs') ? process.execPath : server,
	[
		...(server.endsWith('.mjs') ? [server] : []),
		'serve',
		'--root',
		root,
		'--port',
		String(port),
		'--cli',
		'claude'
	],
	{
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH}`,
			FAKE_CLI_DIR: work,
			ROPEMAN_BRIDGE_TOKEN: token
		},
		stdio: ['ignore', 'pipe', 'inherit']
	}
);
let log = '';
child.stdout.on('data', (d) => (log += d));

function fail(message) {
	process.stderr.write(`smoke: ${message}\n--- server log ---\n${log}`);
	child.kill();
	process.exit(1);
}
const deadline = setTimeout(() => fail('timed out'), 60_000);

const started = Date.now();
while (!log.includes('Bridge server ready')) {
	if (child.exitCode !== null) fail(`server exited with ${child.exitCode}`);
	await new Promise((r) => setTimeout(r, 50));
}

const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
const messages = [];
ws.onmessage = (ev) => messages.push(JSON.parse(String(ev.data)));
await new Promise((resolve, reject) => {
	ws.onopen = resolve;
	ws.onerror = () => reject(new Error('socket error'));
}).catch((err) => fail(err.message));

async function wait(match) {
	while (!messages.some(match)) await new Promise((r) => setTimeout(r, 20));
	return messages.find(match);
}
let id = 0;
async function call(msg) {
	const mine = ++id;
	const sent = Date.now();
	ws.send(JSON.stringify({ id: mine, ...msg }));
	const reply = await wait((m) => m.id === mine);
	if (!('result' in reply)) fail(`${msg.type}: ${reply.code} ${reply.error}`);
	return { reply, ms: Date.now() - sent };
}

const hello = await wait((m) => m.type === 'hello');
const map = await call({ type: 'map.get' });
const node = map.reply.result.levels[0].nodes.find((n) => n.id.startsWith('dir:'));
if (!node) fail('no folder node on the top level');
const expand = await call({ type: 'node.expand', nodeId: node.id });
const namedAt = Date.now();
const named = await wait((m) => m.type === 'node.named' && m.nodeId === node.id);
if (!named.level) fail(`node.named: ${named.code} ${named.error}`);
const file = await call({ type: 'file.read', path: node.filePaths[0] });

clearTimeout(deadline);
ws.close();
child.kill('SIGTERM');
process.stdout.write(
	JSON.stringify({
		server: hello.server,
		schemaVersion: hello.schemaVersion,
		files: map.reply.result.files.length,
		top: map.reply.result.levels[0].nodes.map((n) => n.id),
		expanded: node.id,
		parts: expand.reply.result.nodes.length,
		named: named.level.nodes.map((n) => n.label),
		fileRead: { path: file.reply.result.path, size: file.reply.result.size },
		ms: {
			startToReady: namedAt - started,
			mapGet: map.ms,
			expand: expand.ms,
			named: Date.now() - namedAt
		}
	}) + '\n'
);
fs.rmSync(work, { recursive: true, force: true });
