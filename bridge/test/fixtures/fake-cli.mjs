#!/usr/bin/env node
// A stand-in for `claude -p` and `gemini -p`. Each run takes the next step of
// $FAKE_CLI_DIR/plan.json (then "names" forever) and records its argv, stdin and cwd in
// $FAKE_CLI_DIR/calls/<n>.json, so a test can check both what it answered and what it was sent.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.FAKE_CLI_DIR;
const args = process.argv.slice(2);
const claudeStyle = args.includes('--output-format');
const stdin = fs.readFileSync(0, 'utf8');
const prompt = claudeStyle ? stdin : args[args.indexOf('-p') + 1];

const callsDir = path.join(dir, 'calls');
fs.mkdirSync(callsDir, { recursive: true });
const n = fs.readdirSync(callsDir).length;
fs.writeFileSync(
	path.join(callsDir, `${String(n).padStart(3, '0')}.json`),
	JSON.stringify({ args, stdin, cwd: process.cwd(), pid: process.pid })
);
let plan = [];
try {
	plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
} catch {
	// no plan: every run answers with valid names
}
const step = plan[n] ?? 'names';

const parts = JSON.parse(prompt.split('\n')[prompt.split('\n').indexOf('Parts:') + 1]);
const names = parts.map((part) => ({
	id: part.id,
	label: `Named ${part.id.slice(part.id.indexOf(':') + 1)}`,
	description: `What ${part.id} does.`,
	keySymbols: part.symbols.slice(0, 1).map((s) => s.slice(s.indexOf(' ') + 1))
}));

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
		answer('```json\n' + JSON.stringify({ nodes: names }) + '\n```');
		break;
	case 'bad-symbol':
		answer(JSON.stringify({ nodes: names.map((x) => ({ ...x, keySymbols: ['noSuchSymbol'] })) }));
		break;
	case 'drop-one':
		answer(JSON.stringify({ nodes: names.slice(0, -1) }));
		break;
	case 'not-json':
		answer('I would rather not.');
		break;
	case 'exit':
		process.stderr.write('fake failure\n');
		process.exit(3);
		break;
	case 'hang':
		setInterval(() => {}, 1000);
		break;
}
