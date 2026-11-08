#!/usr/bin/env node

/**
 * 두 커밋 사이에 바뀐 edge 워커 이름을 출력한다 (ci.yml deploy job).
 * 워커 목록은 edge-proxy/wrangler.<name>.toml 파일에서 읽는다.
 *
 * - src/<name>.ts 또는 wrangler.<name>.toml 변경 → 그 워커
 * - src/shared.ts, package.json, package-lock.json 변경 → 모든 워커
 * - 이전 커밋이 없거나(첫 push, 0000…) diff가 실패하면 → 모든 워커
 *
 * Usage: node scripts/changed-workers.mjs <before-sha> <after-sha>
 * Output: list=demo proxy   ($GITHUB_OUTPUT 형식)
 */

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHARED = new Set([
	'edge-proxy/src/shared.ts',
	'edge-proxy/package.json',
	'edge-proxy/package-lock.json'
]);

const workers = readdirSync('edge-proxy')
	.map((name) => name.match(/^wrangler\.(\w+)\.toml$/)?.[1])
	.filter(Boolean)
	.sort();

function changedFiles(before, after) {
	if (!before || /^0+$/.test(before)) return null;
	try {
		const out = execFileSync('git', ['diff', '--name-only', before, after, '--', 'edge-proxy'], {
			encoding: 'utf8'
		});
		return out.split('\n').filter(Boolean);
	} catch {
		return null;
	}
}

const [before, after = 'HEAD'] = process.argv.slice(2);
const files = changedFiles(before, after);

let selected;
if (files === null || files.some((f) => SHARED.has(f))) {
	selected = workers;
} else {
	selected = workers.filter((w) =>
		files.some((f) => f === `edge-proxy/src/${w}.ts` || f === `edge-proxy/wrangler.${w}.toml`)
	);
}

console.log(`list=${selected.join(' ')}`);
