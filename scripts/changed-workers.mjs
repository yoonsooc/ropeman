#!/usr/bin/env node

/**
 * 두 커밋 사이에 바뀐 edge 워커 이름을 출력한다 (ci.yml deploy job).
 * 워커 목록은 edge-proxy/wrangler.<name>.toml 파일에서 읽는다.
 *
 * - src/<name>.ts 또는 wrangler.<name>.toml 변경 → 그 워커
 * - src/shared.ts, package.json, package-lock.json 변경 → 모든 워커
 * - 이전 커밋이 없거나(첫 push, 0000…) diff가 실패하면 → 모든 워커
 * - 설정에 자리표시자(REPLACE_WITH_…)가 남은 워커는 배포할 수 없으므로 빼고 경고한다.
 *   2026-04에 KV id가 자리표시자인 워커 하나가 배포에 계속 실패했고, 그 때문에
 *   production 태그가 멈춰 모든 push가 전체 워커를 다시 배포했다.
 *
 * Usage: node scripts/changed-workers.mjs <before-sha> <after-sha>
 * Output: list=demo proxy   ($GITHUB_OUTPUT 형식)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHARED = new Set([
	'edge-proxy/src/shared.ts',
	'edge-proxy/package.json',
	'edge-proxy/package-lock.json'
]);

const PLACEHOLDER = /REPLACE_WITH_/;

const workers = readdirSync('edge-proxy')
	.map((name) => name.match(/^wrangler\.(\w+)\.toml$/)?.[1])
	.filter(Boolean)
	.sort()
	.filter((w) => {
		if (!PLACEHOLDER.test(readFileSync(`edge-proxy/wrangler.${w}.toml`, 'utf8'))) return true;
		console.error(`::warning::skipping worker '${w}': wrangler.${w}.toml still has a placeholder`);
		return false;
	});

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
