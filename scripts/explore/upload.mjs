#!/usr/bin/env node
/**
 * Uploads the snapshots `pipeline.mjs` built to the explore worker, then reads each one back:
 *
 *   node scripts/explore/upload.mjs [slug...] [--batch N] [--work DIR] [--url URL] [--dry-run]
 *
 * `--batch N` takes the built snapshots of that `repos.json` batch; with neither slugs nor a
 * batch it takes every snapshot built in the work folder. Each must be the file whose
 * checks passed (its sha256 is in report.json) and come from the commit `repos.json` pins.
 * `--dry-run` stops after those checks and needs no token. Otherwise the admin token comes from
 * the EXPLORE_ADMIN_TOKEN environment variable; it is sent only as the Authorization header
 * and never printed, logged or written.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/explore/repos.json'), 'utf8'));
const TOKEN_VAR = 'EXPLORE_ADMIN_TOKEN';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const out = (line) => process.stdout.write(`${line}\n`);

function parseArgs(argv) {
	const args = {
		slugs: [],
		work: path.join(os.homedir(), '.cache', 'ropeman-explore'),
		url: 'https://explore.ropeman.dev',
		dryRun: false
	};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--work') args.work = path.resolve(argv[++i]);
		else if (argv[i] === '--url') args.url = argv[++i].replace(/\/$/, '');
		else if (argv[i] === '--dry-run') args.dryRun = true;
		else if (argv[i] === '--batch') {
			const batch = Number(argv[++i]);
			args.slugs.push(...Object.keys(REPOS).filter((slug) => REPOS[slug].batch === batch));
		} else args.slugs.push(argv[i]);
	}
	if (args.slugs.length === 0) {
		args.slugs = Object.keys(REPOS).filter((slug) =>
			fs.existsSync(path.join(args.work, slug, 'snapshot.json'))
		);
	}
	// The token goes in a header, so it must never travel in the clear off this machine
	const { protocol, hostname } = new URL(args.url);
	const local = hostname === 'localhost' || hostname === '127.0.0.1';
	if (protocol !== 'https:' && !(protocol === 'http:' && local)) {
		throw new Error(`--url must be https (or http://localhost for a local worker): ${args.url}`);
	}
	return args;
}

/** A response body short enough to print: the worker's error, not a page of HTML. */
const brief = (text) => (text.length > 200 ? `${text.slice(0, 200)}…` : text);

/** The snapshot text when it is the one the pipeline checked, or why it is not. */
function readChecked(work, slug) {
	if (!REPOS[slug]) return { error: 'not in repos.json' };
	const dir = path.join(work, slug);
	const file = path.join(dir, 'snapshot.json');
	if (!fs.existsSync(file)) return { error: 'no snapshot.json (run pipeline.mjs first)' };
	const reportFile = path.join(dir, 'report.json');
	if (!fs.existsSync(reportFile)) return { error: 'no report.json (run pipeline.mjs again)' };
	const text = fs.readFileSync(file, 'utf8');
	const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
	const sha = sha256(text);
	if (report.problems?.length) return { error: `report lists problems: ${report.problems[0]}` };
	if (report.snapshotSha256 !== sha)
		return { error: 'snapshot.json differs from the checked build' };
	const commit = JSON.parse(text).commit;
	if (commit !== REPOS[slug].commit) return { error: `commit ${commit} is not the pinned one` };
	return { text, sha, bytes: Buffer.byteLength(text), commit };
}

async function upload(args, slug, snap, token) {
	const endpoint = `${args.url}/explore/${slug}`;
	const posted = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: snap.text
	});
	if (!posted.ok) {
		return {
			status: posted.status,
			error: `upload failed: HTTP ${posted.status} ${brief(await posted.text())}`
		};
	}
	const read = await fetch(endpoint, { cache: 'no-store' });
	if (!read.ok) return { error: `read-back failed: HTTP ${read.status}` };
	const readSha = sha256(await read.text());
	return readSha === snap.sha ? {} : { error: `read-back sha256 ${readSha.slice(0, 12)} differs` };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const token = process.env[TOKEN_VAR];
	if (!args.dryRun && !token) {
		throw new Error(`Set ${TOKEN_VAR} in this shell, or pass --dry-run.`);
	}
	if (args.slugs.length === 0) throw new Error(`No snapshot.json under ${args.work}.`);

	let failed = 0;
	for (const slug of args.slugs) {
		const snap = readChecked(args.work, slug);
		if (snap.error) {
			out(`${slug}\tSKIP\t${snap.error}`);
			failed++;
			continue;
		}
		const facts = `${(snap.bytes / 1024).toFixed(0)} KB\tsha256 ${snap.sha.slice(0, 12)}\tcommit ${snap.commit.slice(0, 7)}`;
		if (args.dryRun) {
			out(`${slug}\tREADY\t${facts}`);
			continue;
		}
		const { status, error } = await upload(args, slug, snap, token).catch((err) => ({
			error: `network: ${brief(err.message)}`
		}));
		out(
			`${slug}\t${error ? 'FAIL' : 'OK'}\t${facts}${error ? `\t${error}` : '\tread back identical'}`
		);
		if (error) failed++;
		// A wrong token fails every slug the same way
		if (status === 401) {
			out(`stopped: the worker refused ${TOKEN_VAR}; nothing after ${slug} was sent`);
			break;
		}
	}
	if (failed) process.exit(1);
}

main().catch((err) => {
	process.stderr.write(`[upload] ${err.message}\n`);
	process.exit(1);
});
