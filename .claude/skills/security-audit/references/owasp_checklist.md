# OWASP Checklist & Agent Prompt Seeds

Phase 1 Grep 패턴 모음과 Phase 2 Agent 3개의 프롬프트 시드. 감사 실행 시 이 파일을 그대로 Agent 컨텍스트로 주입한다.

## Phase 1 — Grep 패턴

### Secret Leak Patterns

`rg -E`로 실행. false positive가 많으니 **히트 시 사람이 재검토** 의무.

```
(sk-[A-Za-z0-9]{20,})          # Anthropic / OpenAI user keys
(AIza[0-9A-Za-z_-]{35})         # Google API keys
(ghp_[0-9A-Za-z]{36})           # GitHub Personal Access Token
(gho_[0-9A-Za-z]{36})           # GitHub OAuth
(xox[baprs]-[0-9A-Za-z-]+)      # Slack tokens
(-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)
```

대상: tracked 파일 전체 + `git log -p` (커밋 이력 포함). `.dev.vars.example` 같은 의도된 샘플은 false positive 처리.

### Risky API Patterns (SPA)

```
\{@html\s                       # Svelte 직접 HTML 주입
\.innerHTML\s*=
dangerouslySetInnerHTML         # React 스타일 (쓰지 않지만 방어적)
\beval\s*\(
new\s+Function\s*\(
document\.write\s*\(
```

대상: `src/`. 히트 시 `attack_surface_map.md`의 "XSS 표면" 표와 대조. 신규 `{@html}` 등장 시 반드시 재평가.

### Risky API Patterns (Worker / Bridge / Node)

```
child_process
\.exec\s*\(
\.spawn\s*\(
path\.join\s*\([^)]*(?:req\.|request\.|params\.|ctx\.)   # 사용자 입력 → path
\.\./                           # 경로 순회 리터럴 (false positive 많음)
readFile(Sync)?\s*\(
```

대상: `edge-proxy/src/`, `bridge/src/`, Node.js 스크립트.

### 외부 CDN / SRI 점검

```
<link[^>]+href="https?:                # 외부 CSS/폰트
<script[^>]+src="https?:               # 외부 JS
integrity="                            # SRI 적용 확인
```

대상: `src/app.html`, `src/routes/**/+layout.svelte`, `.svelte-kit/` 빌드 출력.

### 의존성 스캔 명령

```sh
bun pm audit                                    # 루트
(cd edge-proxy && npm audit --production)
(cd bridge && npm audit --production)

# 선택 (더 포괄적이지만 설치 필요)
osv-scanner --lockfile=bun.lock --lockfile=bridge/package-lock.json
```

`npm audit`의 `--audit-level=moderate` 이상만 report. dev deps는 runtime 영향 낮으므로 `--production` flag 우선.

## Phase 2 — Agent Prompt Seeds

각 Agent 프롬프트 시작 부분에 **아래 공통 컨텍스트**를 주입:

- `.claude/skills/security-audit/references/attack_surface_map.md` 전체
- `.claude/skills/security-audit/references/known_false_positives.md` 전체
- `.claude/skills/code-reviewer/references/common_antipatterns.md` 중 AP-8 / AP-11 / AP-13

### Agent A — Edge Worker Auditor

```
You are auditing the Ropeman Cloudflare Worker layer for security.
Scope: edge-proxy/src/*.ts (demo, proxy, share, explore) + shared.ts
Methodology: For each worker, walk OWASP API Top 10 and return Pass / Fail / N-A:
  1. Broken Object Level Authorization — slug/path parameter tampering
  2. Broken Authentication — Bearer token handling, admin endpoint guard
  3. Broken Object Property Level Authorization — body field mass-assignment
  4. Unrestricted Resource Consumption — rate limit robustness, body size, timeout
  5. Broken Function Level Authorization — method-level access (GET vs POST/DELETE)
  6. Unrestricted Access to Sensitive Business Flows — quota drain, enumeration
  7. Server-Side Request Forgery — fetch URLs built from user input
  8. Security Misconfiguration — CORS, error messages, default allow
  9. Improper Inventory Management — unused endpoints, dead routes
  10. Unsafe Consumption of APIs — upstream response passthrough (Gemini, GitHub)

Hard requirements:
  - For every finding include: file:line, attack vector, severity (Critical/High/Medium/Low), concrete fix
  - CF-Connecting-IP trust and V8 isolate rate-limit reset MUST be evaluated for demo/github/share
  - upstream API error passthrough (demo/proxy) MUST be flagged — even if already known
  - explore.ts Origin-optional + Bearer combo: verify Bearer is enforced for BOTH POST and DELETE
  - do NOT report items already in known_false_positives.md unless new evidence exists

Output format:
  ## Findings
  | ID | Severity | File:Line | Title | Fix |
  ## OWASP Summary Table (worker × category)
  ## New False Positive Candidates
Output length: under 900 words.
```

### Agent B — SPA Auditor

```
You are auditing the Ropeman SvelteKit SPA for client-side security.
Scope: src/**/*.{ts,svelte} (excluding tests)
Methodology: Cover these dimensions:
  1. XSS via {@html} — verify every occurrence against attack_surface_map.md's "XSS 표면" table. Flag any NEW occurrence or source change.
  2. Sensitive storage — localStorage / sessionStorage / IndexedDB contents.
     Verify: which keys in settingsStore are secret-grade? What XSS payload could exfiltrate them?
  3. Dev-only helpers in production bundle — check that __semanticStore, __uploadExplore, any window.* assignments are properly guarded by import.meta.env.DEV AND tree-shaken from the production build.
     Verify by Reading `.svelte-kit/output/client/_app/immutable/chunks/*.js` after a prod build if possible.
  4. Fetch URL construction — is any user-controlled input concatenated into fetch URLs without validation? (SSRF / data leakage)
     Check apiKeyValidator.ts (Google key in query string), CodeViewer.svelte (GitHub raw), exploreService, ShareDialog.
  5. Snapshot injection (AP-8) — validateSnapshot/validateManifest depth. Can hostile JSON with exotic node.label values reach the DOM unescaped?
  6. CSP / SRI — absence of Content-Security-Policy header in src/app.html and its implications.
  7. Exporter XSS — htmlExporter.ts inlines SVG + JSON; verify </script> escape, innerHTML usage in the emitted viewer.

Hard requirements:
  - Every finding: file:line, severity, concrete fix
  - Identify dev helpers that WOULD leak into production (not just "might")
  - Do not re-report items in known_false_positives.md
  - If marked.parse() is involved, explicitly analyze whether AI-returned Markdown could embed dangerous HTML despite marked defaults

Output format same as Agent A. Under 900 words.
```

### Agent C — Infra / CI Auditor

```
You are auditing Ropeman's infrastructure, CI/CD, and build supply chain.
Scope: .github/workflows/, wrangler*.toml, edge-proxy/wrangler.*.toml, bridge/src/server.ts, bun.lock, package.json (all three)
Methodology:
  1. GitHub Actions supply chain
     - Are all third-party actions pinned to a commit SHA (strongest) or at least a major version?
     - Is the `permissions:` block set to minimum required scopes?
     - Any secrets exposed in env / logs?
     - artifact upload/download paths — any way to poison?
  2. Cloudflare Worker configuration
     - Placeholder values not yet replaced (REPLACE_WITH_* in any wrangler.*.toml)
     - ALLOWED_ORIGINS consistency across 4 wrangler toml files
     - observability flags, custom_domain correctness
     - Secret names referenced in code but not documented in config
  3. Lockfile policy
     - bun.lock is in .gitignore but committed — decision required: keep or remove?
     - package-lock.json vs bun.lock duplication — which is canonical?
     - edge-proxy has no lockfile (devDeps only) — acceptable?
  4. Bridge (bridge/src/server.ts)
     - WebSocket binding: localhost only? Any 0.0.0.0 risk?
     - Origin header verification on WebSocket upgrade?
     - child_process.stdin.write(prompt) — user-controlled input to CLI stdin. Length limits? Shell-metacharacter risk even though direct shell isn't invoked?
     - Is the spawned CLI command name truly whitelisted (no path injection)?
  5. Dependabot / renovate / audit in CI — is automated vulnerability tracking in place?

Hard requirements:
  - File:line references for every finding
  - For wrangler toml, specify which worker file the issue affects
  - Bridge prompt injection: provide a concrete attack payload example
  - Do not re-flag known_false_positives.md items

Output format same as Agent A. Under 900 words.
```

## Phase 3 — 위협 시나리오 작성 가이드

Agent가 놓친 **비즈니스 로직 결함**만 사람이 서술. 자동 스캐너가 잡는 영역은 Phase 1/2로 이관.

시나리오 구조:

```
## S-N: <한 줄 제목>
- 전제: 공격자가 사전에 보유한 정보/권한
- 스텝: 1~3 단계 공격 경로
- 영향: 비용 / 데이터 / 신뢰 피해
- 완화: 구체적 방어 조치 (구현 비용 포함)
- 우선순위: Critical / High / Medium / Low
```

`references/threat_scenarios_seed.md`의 기존 시나리오를 먼저 검토하고, 여전히 유효한 것은 재활용한다.
