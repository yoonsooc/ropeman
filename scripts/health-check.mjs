#!/usr/bin/env node

/**
 * 공개 엔드포인트가 처음 온 방문자 기준으로 동작하는지 확인한다 (.github/workflows/health-check.yml).
 * 하나라도 실패하면 exit 1 → 예약 실행이 실패하고 GitHub가 알림 메일을 보낸다.
 *
 * demo 확인은 실행마다 Gemini 무료 등급 요청 1건을 쓴다.
 *
 * Usage: node scripts/health-check.mjs
 */

import { appendFileSync } from 'node:fs';

const ORIGIN = 'https://ropeman.dev';
const TIMEOUT_MS = 60_000;
// demo tries up to three models with a 40 s wait each (edge-proxy/src/demo.ts)
const DEMO_TIMEOUT_MS = 150_000;

function request(url, init = {}, timeoutMs = TIMEOUT_MS) {
	return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function post(url, body, timeoutMs) {
	return request(
		url,
		{
			method: 'POST',
			headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		},
		timeoutMs
	);
}

function expectStatus(response, expected) {
	if (response.status !== expected) {
		throw new Error(`expected HTTP ${expected}, got ${response.status}`);
	}
}

const checks = [
	{
		name: 'site',
		async run() {
			const response = await request(`${ORIGIN}/`, { headers: { 'accept-language': 'en-US' } });
			expectStatus(response, 200);
			if (!(await response.text()).includes('<html lang="en"')) {
				throw new Error('the English landing is missing');
			}
		}
	},
	{
		name: 'site in Korean',
		async run() {
			// `/` picks the prerendered landing by language at the edge (hooks.server.ts)
			const response = await request(`${ORIGIN}/`, { headers: { 'accept-language': 'ko-KR' } });
			expectStatus(response, 200);
			if (!(await response.text()).includes('<html lang="ko"')) {
				throw new Error('a Korean browser did not get the Korean landing');
			}
		}
	},
	{
		name: 'pages.dev redirect',
		async run() {
			// Prerendered pages are static, so the redirect lives in app.html, not in a 301
			const response = await request('https://ropeman.pages.dev/', { redirect: 'manual' });
			if (response.status >= 300 && response.status < 400) return;
			const html = await response.text();
			if (!html.includes("location.hostname === 'ropeman.pages.dev'")) {
				throw new Error(`HTTP ${response.status} without the redirect script`);
			}
		}
	},
	{
		name: 'explore gallery',
		async run() {
			const response = await request('https://explore.ropeman.dev/explore', {
				headers: { Origin: ORIGIN }
			});
			expectStatus(response, 200);
		}
	},
	{
		name: 'demo analysis',
		async run() {
			const response = await post(
				'https://demo.ropeman.dev',
				{ messages: [{ role: 'user', content: 'Reply with OK.' }] },
				DEMO_TIMEOUT_MS
			);
			const body = await response.json().catch(() => ({}));
			if (response.status !== 200) {
				throw new Error(`HTTP ${response.status} ${body.error ?? ''}`.trim());
			}
			if (!body?.candidates?.[0]?.content?.parts?.[0]?.text) {
				throw new Error('empty model response');
			}
		}
	},
	{
		name: 'byok proxy',
		async run() {
			// Without a key the worker answers 400: alive and validating, nothing spent
			expectStatus(await post('https://proxy.ropeman.dev', {}), 400);
		}
	},
	{
		name: 'share store',
		async run() {
			const response = await request('https://share.ropeman.dev/share/00000000', {
				headers: { Origin: ORIGIN }
			});
			expectStatus(response, 404);
		}
	}
];

const results = [];
for (const check of checks) {
	const started = Date.now();
	try {
		await check.run();
		results.push({ name: check.name, ok: true, detail: '', ms: Date.now() - started });
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		results.push({ name: check.name, ok: false, detail, ms: Date.now() - started });
	}
}

const lines = [
	'| check | result | ms | detail |',
	'|---|---|---|---|',
	...results.map((r) => `| ${r.name} | ${r.ok ? 'ok' : 'FAIL'} | ${r.ms} | ${r.detail} |`)
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Health check\n\n${lines.join('\n')}\n`);
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
