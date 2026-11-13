#!/usr/bin/env node
// A stand-in for `claude -p` and `gemini -p`. Each run takes the next step of
// $FAKE_CLI_DIR/plan.json (then "names" forever) and records its argv, stdin and cwd in
// $FAKE_CLI_DIR/calls/<n>.json, so a test can check both what it answered and what it was sent.
// The fork steps start a grandchild and record both pids in grandchildren/<n>.json, so a test
// can check that stopping the run ends the whole tree.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.FAKE_CLI_DIR;
const args = process.argv.slice(2);
const claudeStyle = args.includes('--output-format');
const geminiStyle = args.includes('--approval-mode');
const stdin = fs.readFileSync(0, 'utf8');
const prompt = geminiStyle ? args[args.indexOf('-p') + 1] : stdin;

const callsDir = path.join(dir, 'calls');
fs.mkdirSync(callsDir, { recursive: true });
// Two runs that start together count the same files, so the first to create a number takes it
let n = fs.readdirSync(callsDir).length;
for (;;) {
	try {
		fs.writeFileSync(
			path.join(callsDir, `${String(n).padStart(3, '0')}.json`),
			JSON.stringify({ args, stdin, cwd: process.cwd(), pid: process.pid }),
			{ flag: 'wx' }
		);
		break;
	} catch (err) {
		if (err.code !== 'EEXIST') throw err;
		n++;
	}
}
let plan = [];
try {
	plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
} catch {
	// no plan: every run answers with valid names
}
const step = plan[n] ?? 'names';

const partNames = () =>
	JSON.parse(prompt.split('\n')[prompt.split('\n').indexOf('Parts:') + 1]).map((part) => ({
		id: part.id,
		label: `Named ${part.id.slice(part.id.indexOf(':') + 1)}`,
		description: `What ${part.id} does.`,
		keySymbols: part.symbols.slice(0, 1).map((s) => s.slice(s.indexOf(' ') + 1))
	}));

/** Starts a grandchild that outlives this process unless its whole group is killed. */
function fork(stubborn) {
	const code = `${stubborn ? "process.on('SIGTERM', () => {});" : ''}setInterval(() => {}, 1000);`;
	// stdio ignored, like a daemon: closing the pipes says nothing about the grandchild
	const grandchild = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
	const forks = path.join(dir, 'grandchildren');
	fs.mkdirSync(forks, { recursive: true });
	fs.writeFileSync(
		path.join(forks, `${String(n).padStart(3, '0')}.json`),
		JSON.stringify({ pid: process.pid, grandchild: grandchild.pid })
	);
	if (stubborn) process.on('SIGTERM', () => {});
	setInterval(() => {}, 1000);
}

function answer(text) {
	if (claudeStyle) {
		process.stdout.write(
			JSON.stringify({
				type: 'result',
				subtype: 'success',
				is_error: false,
				result: text,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					cache_read_input_tokens: 5,
					cache_creation_input_tokens: 0
				},
				total_cost_usd: 0.001
			})
		);
	} else process.stdout.write(text);
}

switch (step) {
	case 'names':
		answer('```json\n' + JSON.stringify({ nodes: partNames() }) + '\n```');
		break;
	case 'bad-symbol':
		answer(
			JSON.stringify({ nodes: partNames().map((x) => ({ ...x, keySymbols: ['noSuchSymbol'] })) })
		);
		break;
	case 'drop-one':
		answer(JSON.stringify({ nodes: partNames().slice(0, -1) }));
		break;
	case 'echo':
		answer(`got:${prompt}`);
		break;
	case 'not-json':
		answer('I would rather not.');
		break;
	case 'exit':
		process.stderr.write('fake failure\n');
		process.exit(3);
		break;
	case 'gate': {
		// Names once the test creates $FAKE_CLI_DIR/release, so it can look at the pending state first
		const release = path.join(dir, 'release');
		const timer = setInterval(() => {
			if (!fs.existsSync(release)) return;
			clearInterval(timer);
			answer(JSON.stringify({ nodes: partNames() }));
		}, 50);
		break;
	}
	case 'hang':
		setInterval(() => {}, 1000);
		break;
	case 'fork-hang':
		fork(false);
		break;
	case 'fork-stubborn':
		fork(true);
		break;
}
