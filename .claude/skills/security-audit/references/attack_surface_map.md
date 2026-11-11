# Ropeman Attack Surface Map

Phase 2 Agent에 컨텍스트로 주입하기 위한 공격면 인벤토리. 코드베이스가 바뀌면 **스프린트 종료 시 sync 스킬과 함께 갱신**한다.

최종 갱신: 2026-04-16

## 1. Cloudflare Edge Workers (`edge-proxy/src/`)

| Worker       | 도메인                | 엔드포인트                                                           | 인증                | KV                            | Secret                   |
| ------------ | --------------------- | -------------------------------------------------------------------- | ------------------- | ----------------------------- | ------------------------ |
| `demo.ts`    | `demo.ropeman.dev`    | POST `/` (Gemini proxy)                                              | 없음                | —                             | `GEMINI_API_KEY`         |
| `proxy.ts`   | `proxy.ropeman.dev`   | POST `/` (BYOK passthrough)                                          | 없음                | —                             | `AI_GATEWAY_TOKEN`(선택) |
| `share.ts`   | `share.ropeman.dev`   | POST `/share`, GET `/share/{slug}`                                   | 없음                | `ROPEMAN_SHARE_STORE` 14d TTL | —                        |
| `explore.ts` | `explore.ropeman.dev` | GET `/explore`, GET `/explore/{slug}`, POST/DELETE `/explore/{slug}` | POST/DELETE: Bearer | `ROPEMAN_EXPLORE_STORE` ∞     | `EXPLORE_ADMIN_TOKEN`    |

공통 (`shared.ts`): `getAllowedOrigin()` (정확 매칭), `callGemini()` (maxOutputTokens 16384), `jsonResponse()`.

### 알려진 검토 지점

- 모든 워커: **CF-Connecting-IP 신뢰** → 프록시 뒤 클라이언트 스푸핑 가능성
- `demo.ts` / `proxy.ts`: Gemini/upstream 에러 응답을 **원문 그대로 반환** (에러 메시지에 quota/auth/region 정보 노출)
- `share.ts`: body **구조 검증 없음** (explore와 달리 `isValidSnapshot` 없음)
- `explore.ts`: Origin-optional — 브라우저 아닌 경우 통과, Bearer 토큰이 유일한 쓰기 방어
- Rate limit: `demo`/`share`는 **인메모리 Map** (워커 재시작/isolate별 리셋)

## 2. SPA 클라이언트 (`src/`)

### XSS 표면: `{@html ...}` 사용 8곳

| 파일                                        | 라인 | 입력 소스                       | 이스케이프        | 평가                               |
| ------------------------------------------- | ---- | ------------------------------- | ----------------- | ---------------------------------- |
| `routes/explore/[slug]/+page.svelte`        | 93   | JSON-LD (`data.entry` 정적)     | `</script>` split | Safe                               |
| `routes/docs/[lang]/[...slug]/+page.svelte` | 38   | JSON-LD (frontmatter)           | `</script>` split | Safe                               |
| `lib/components/CodeViewer.svelte`          | 263  | Prism.js 출력                   | Prism 내부        | Safe                               |
| `lib/components/Dropzone.svelte`            | 266  | i18n 정적                       | —                 | Safe                               |
| `lib/components/Dropzone.svelte`            | 335  | 언어 아이콘 SVG 상수            | —                 | Safe                               |
| `lib/components/ChatMessage.svelte`         | 44   | `marked.parse(message.content)` | marked 기본 방어  | **재평가 필요** (AI 응답 XSS 벡터) |
| `lib/components/CodePanel.svelte`           | 54   | Prism 출력                      | Prism 내부        | Safe                               |
| `lib/components/nodes/SymbolNode.svelte`    | 45   | 정적 아이콘                     | —                 | Safe                               |

### 민감 값 저장

- `lib/stores/settingsStore.svelte.ts`: **localStorage 평문** (`geminiApiKey`, `anthropicApiKey`, `openaiApiKey`, ...)
- dev-only 헬퍼: `window.__semanticStore`, `window.__uploadExplore` (모두 `import.meta.env.DEV` 가드)
- sessionStorage: 사용 안 함

### 외부 fetch 경로

- `lib/components/CodeViewer.svelte:160-161` — `raw.githubusercontent.com` (projectStore에서 검증된 값)
- `lib/services/apiKeyValidator.ts:30-37` — Google API를 **URL 쿼리 파라미터로 호출** (`?key=${key}`) → referer log 노출 위험
- `lib/services/exploreService.ts:170,202` — `EXPLORE_URL`
- `lib/components/ShareDialog.svelte:70` — `SHARE_URL`

### Snapshot 주입 (AP-8 관련)

- `routes/explore/[slug]/+page.svelte` → `fetchExploreSnapshot()` → `validateSnapshot()` (shallow)
- `routes/share/[slug]/+page.svelte` → fetch → top-level validator (shallow)

`validateSnapshot()`은 top-level 구조만 검증하고 **nodes/edges 내부 속성(label, description, filePaths 등)은 미검증**. 이 값들이 `{@html}` 없이 항상 텍스트로만 렌더되는지가 관건.

### 보안 헤더

- `src/app.html` — **CSP/SRI 없음**
- 외부 로드: `fonts.googleapis.com`, `fonts.gstatic.com`, `static.cloudflareinsights.com` 모두 integrity 속성 없음
- `hooks.server.ts` — 커스텀 응답 헤더 설정 없음

## 3. Bridge 로컬 CLI (`bridge/`)

- WebSocket 서버 (`ws`), 기본 port 9800, **localhost 바인딩만**
- CLI 화이트리스트: `claude` 또는 `gemini`만 spawn 허용
- **Prompt sanitization 없음** — `child.stdin.write(prompt)` 전달, 길이/특수문자 제한 없음
- 타임아웃: 120s (DoS 기본 방어)

## 4. 인프라 / CI

- Root `wrangler.toml`: Pages 설정, 변수 없음
- `edge-proxy/wrangler.*.toml` 4종: `[vars] ALLOWED_ORIGINS` 평문 (공개 의도)
- `bun.lock`: `.gitignore`에 제외 선언됐지만 **실제로는 커밋됨** (정책 불일치)
- `.github/workflows/ci.yml`: `actions/checkout@v4`, `setup-node@v4`, npm ci + lint + build + test:unit + test:e2e
- Dependabot: **없음**
- Permissions block: 명시되지 않음 (GitHub 기본값)

## 5. 정적 자산 (`static/`)

- `robots.txt`, `favicon.svg`, 11개 tree-sitter WASM 파일 (~18MB)
- 사용자 업로드 경로 없음
- WASM **SRI 해시 없음** (Cloudflare Pages 캐시 의존)

## 6. 외부 의존성

- 루트 deps 15 (`@xyflow/svelte`, `@mlc-ai/web-llm`, `@dagrejs/dagre`, `marked`, `prismjs`, `web-tree-sitter`, 언어별 tree-sitter WASM)
- `bridge` deps: `ws` 8.18
- `edge-proxy` deps: 없음 (devDeps만)
