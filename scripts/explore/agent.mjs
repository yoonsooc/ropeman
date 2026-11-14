/**
 * The sandbox for the gallery's mapping agent. The repository it maps is third-party content,
 * so a prompt injection in it must not reach anything but that clone and the output folder:
 *
 * - Reads: the clone and OUT only (`Read` rules, which Glob and Grep follow). The agent starts
 *   in its own folder, and the clone is not an `--add-dir`, so the clone's `.claude/skills`,
 *   commands and CLAUDE.md never load. The only skill is the copy of this repo's.
 * - Writes: OUT only.
 * - Tools: Bash, Read, Write, Edit and Skill exist in the session, nothing else.
 * - Commands: a `ropeman` on PATH that runs exactly `--version`, `map --root REPO --out OUT
 *   [--depth N]` and `verify --root REPO --map OUT/ropeman.json`, and refuses anything else.
 * - Environment: an allowlist, so no token or session variable of the caller leaks in.
 *
 * `scripts/explore/probe-sandbox.mjs` proves each rule against a hostile repository.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const MODEL = 'sonnet';
const SERVER = path.join(ROOT, 'bridge/dist/server.mjs');

/** What `claude` and the bridge need from the caller's environment, and nothing else. */
const ENV_ALLOW = [
	/^(PATH|HOME|USER|LOGNAME|SHELL|TERM|TMPDIR|LANG)$/,
	/^LC_/,
	/^ANTHROPIC_/,
	// Where the CLI keeps its login, when the user moved it
	/^CLAUDE_CONFIG_DIR$/,
	// Corporate proxies and CAs, without which the CLI cannot reach the API
	/^(HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy|NODE_EXTRA_CA_CERTS)$/
];

export function agentEnv(bin) {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => ENV_ALLOW.some((re) => re.test(key)))
	);
	return { ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

/** Builds the bridge this checkout ships, the one the shim runs. */
export function buildBridge() {
	const res = spawnSync('npm', ['run', '-s', 'build:bridge'], {
		cwd: ROOT,
		stdio: ['ignore', 'ignore', 'inherit']
	});
	if (res.status !== 0) throw new Error('npm run build:bridge failed');
}

// The shim compares whole argument strings, so a path must not need quoting
const SAFE_PATH = /^\/[\w./-]+$/;

/**
 * The agent's folder: the ropeman skill as its only project skill, and a `ropeman` that runs
 * only the commands the skill needs, on this clone and this output folder.
 */
export function prepareSandbox({ agentDir, repoDir, outDir }) {
	for (const p of [agentDir, repoDir, outDir]) {
		if (!SAFE_PATH.test(p)) throw new Error(`sandbox path needs quoting: ${p}`);
	}
	fs.rmSync(path.join(agentDir, '.claude'), { recursive: true, force: true });
	const skillDir = path.join(agentDir, '.claude/skills/ropeman');
	fs.mkdirSync(skillDir, { recursive: true });
	fs.copyFileSync(path.join(ROOT, 'skill/ropeman/SKILL.md'), path.join(skillDir, 'SKILL.md'));

	const bin = path.join(agentDir, 'bin');
	fs.mkdirSync(bin, { recursive: true });
	const shim = path.join(bin, 'ropeman');
	fs.writeFileSync(
		shim,
		`#!/bin/sh
R='${repoDir}'
O='${outDir}'
case "$*" in
	"--version"|"map --root $R --out $O"|"map --root $R --out $O --depth "[1-9]|"verify --root $R --map $O/ropeman.json")
		exec node '${SERVER}' "$@" ;;
esac
echo "ropeman (gallery sandbox): refused: $*" >&2
echo "Run only: ropeman map --root $R --out $O [--depth N], ropeman verify --root $R --map $O/ropeman.json" >&2
exit 2
`
	);
	fs.chmodSync(shim, 0o755);
	return { bin, env: agentEnv(bin) };
}

/** Absolute-path permission rule (`//` marks a filesystem path in Claude Code settings). */
const absRule = (tool, dir) => `${tool}(/${dir}/**)`;

/**
 * Permissions as CLI flags: Claude Code ignores the allow list of an untrusted workspace's
 * `.claude/settings.json`. In `dontAsk` mode anything not allowed is denied.
 */
export const mapPermissions = ({ repoDir, outDir }) => [
	// The only tools that exist in the session; the rules below narrow each one
	'--tools',
	'Bash,Read,Write,Edit,Skill',
	'--permission-mode',
	'dontAsk',
	'--allowedTools',
	'Skill(ropeman)',
	absRule('Read', repoDir),
	absRule('Read', outDir),
	absRule('Write', outDir),
	absRule('Edit', outDir),
	'Bash(ropeman --version)',
	'Bash(ropeman map:*)',
	'Bash(ropeman verify:*)',
	'--disallowedTools',
	'Bash(ropeman serve:*)',
	'Read(**/.env*)'
];

/** A `claude -p` run in the sandbox; the JSON result (or stream events) and the wall time. */
export function runClaude({ agentDir, env }, args, input, { stream = false } = {}) {
	const started = Date.now();
	const res = spawnSync(
		'claude',
		[
			'-p',
			'--model',
			MODEL,
			'--output-format',
			stream ? 'stream-json' : 'json',
			...(stream ? ['--verbose'] : []),
			'--setting-sources',
			'project',
			'--strict-mcp-config',
			'--no-session-persistence',
			...args
		],
		{ cwd: agentDir, input, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
	);
	if (res.error) throw res.error;
	const wallMs = Date.now() - started;
	try {
		if (stream) {
			const events = res.stdout
				.split('\n')
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			return { events, result: events.findLast((e) => e.type === 'result'), wallMs };
		}
		return { result: JSON.parse(res.stdout), wallMs };
	} catch {
		throw new Error(
			`claude -p printed no JSON (exit ${res.status}):\n${res.stderr}\n${res.stdout.slice(0, 2000)}`
		);
	}
}

/** What a `claude -p` run cost, for the report. */
export function usageOf({ result, wallMs }) {
	const u = result.usage ?? {};
	return {
		wallMs,
		turns: result.num_turns,
		costUsd: result.total_cost_usd,
		inputTokens: u.input_tokens,
		cacheReadTokens: u.cache_read_input_tokens,
		cacheWriteTokens: u.cache_creation_input_tokens,
		outputTokens: u.output_tokens
	};
}
