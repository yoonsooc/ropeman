# Known False Positives

Phase 1 Grep 히트나 Phase 2 Agent 보고 중 **실제로는 위험이 없다고 판정된 항목**. 매 감사마다 Agent 컨텍스트에 이 파일을 주입해 중복 지적을 억제한다.

**3-strike 규칙**: 3회 연속 safe로 재확인된 항목만 `permanent safe`로 분류. 나머지는 매 감사에서 재검토.

**재평가 트리거**: 해당 파일이 수정되면 자동으로 재검토 대상 복귀 (status = `re-review`).

## 형식

```
### ID: FP-N
- 파일: path/to/file.ts:LINE
- 소스: 어떤 Grep/Agent가 잡았는가
- 판정 이유: 왜 safe인가 (구체적 근거)
- 재평가 조건: 언제 다시 봐야 하는가
- Strike 카운트: 0 ~ 3 (3이면 permanent safe)
- 최종 확인: YYYY-MM-DD sprint-NN
```

---

## 활성 False Positive (Strike 0~2)

### FP-1: `{@html}` JSON-LD in explore/share/docs

- 파일:
  - `src/routes/explore/[slug]/+page.svelte:93`
  - `src/routes/docs/[lang]/[...slug]/+page.svelte:38`
- 소스: Phase 1 risky API Grep (`\{@html\s`)
- 판정 이유: `ldJson` 변수는 `data.entry` (정적 curated manifest) 또는 frontmatter(mdsvex 빌드 타임 문자열)만 참조. `</script>` split 패턴(`'<scr' + 'ipt>' + ldJson + '</scr' + 'ipt>'`)으로 script tag 파싱 우회. 사용자 입력이 파이프라인에 존재하지 않음.
- 재평가 조건: `data.entry` 또는 frontmatter 타입이 바뀌거나, ldJson 생성 로직에 동적 사용자 입력이 추가되면 재검토.
- Strike: 0 (초기 등록, 본 스프린트가 첫 판정)

### FP-2: `{@html}` in CodeViewer / CodePanel (Prism 출력)

- 파일:
  - `src/lib/components/CodeViewer.svelte:263`
  - `src/lib/components/CodePanel.svelte:54`
- 소스: Phase 1 risky API Grep
- 판정 이유: 입력이 `Prism.highlight(code, grammar, lang)` 결과로 Prism 내부에서 이미 HTML escape 완료. 사용자 코드가 Prism을 통과한 DOM으로 렌더됨. Prism 자체 CVE 없음 (현재 버전 1.30.0).
- 재평가 조건: Prism 버전 업그레이드, 또는 Prism을 우회해 `code` 원본을 직접 `{@html}`로 넘기는 코드가 등장하면.
- Strike: 0

### FP-3: `{@html}` i18n / 정적 아이콘

- 파일:
  - `src/lib/components/Dropzone.svelte:266` (`i18nStore.t('landing.headline')`)
  - `src/lib/components/Dropzone.svelte:335` (`lang.icon` 정적 SVG)
  - `src/lib/components/nodes/SymbolNode.svelte:45`
- 소스: Phase 1 risky API Grep
- 판정 이유: i18n 문자열은 `i18nStore.svelte.ts`에 **하드코딩된 상수** (빌드 타임에 결정). SVG 아이콘도 코드 상수. 사용자 입력이 도달할 수 없음.
- 재평가 조건: i18n이 외부 번역 서비스로 전환되거나, 아이콘이 사용자 편집 가능 설정으로 바뀌면.
- Strike: 0

### FP-4: `{@html}` in ChatMessage (marked.parse)

- 파일: `src/lib/components/ChatMessage.svelte:44`
- 소스: Phase 1 risky API Grep
- 판정 이유: `marked` 라이브러리 기본 설정이 HTML tag를 제외한 Markdown만 파싱. 단 **marked는 inline HTML을 허용**하므로 AI 응답에 `<script>` 같은 태그가 섞이면 통과함. 다만 marked 옵션 `{ breaks: true, gfm: true }`만 사용 → sanitize 옵션 미설정.
- **⚠️ 한계**: marked 기본값은 inline HTML을 escape하지 않음. AI API가 reliable하다는 가정 하에만 safe. 악의적 프롬프트 주입으로 AI가 XSS payload를 생성할 가능성은 낮지만 0은 아님.
- 재평가 조건: **매 감사마다 재검토** (permanent safe 불가). 사용자가 임의 채팅 응답을 공유/저장하는 기능이 추가되면 즉시 High로 승격.
- Strike: 0 (재검토 필수)

### FP-5: `window.__semanticStore` / `__uploadExplore` dev 헬퍼

- 파일:
  - `src/lib/stores/semanticStore.svelte.ts:331-332`
  - `src/lib/dev/exploreUploader.ts:103`
- 소스: Phase 1 risky API Grep (`window\.__`), Phase 2 Agent B SPA 점검
- 판정 이유: `import.meta.env.DEV` 가드로 production 빌드에서 tree-shake. `+layout.svelte`에서도 dynamic import가 DEV 조건부.
- **⚠️ 검증 필요**: 실제 production 번들(`.svelte-kit/cloudflare/_app/...`)에 문자열이 포함되지 않는지 배포 전마다 확인. Phase 2 Agent B 프롬프트에 이 검증 단계 포함됨.
- 재평가 조건: build flag 변경, vite 설정 변경, `/src/lib/dev/` 디렉토리 외부에서 dev 헬퍼 참조 시.
- Strike: 0

### FP-6: `path.join` with user input in exporters (실제 사용자 입력 아님)

- 파일:
  - `src/lib/services/markdownExporter.ts`
  - `src/lib/services/htmlExporter.ts`
  - `src/lib/services/pdfExporter.ts`
- 소스: Phase 1 risky API Grep (`path\.join`)
- 판정 이유: exporter는 browser-only (Blob download). `path.join`은 실제로 사용되지 않으며 파일명 생성은 `sanitizeFilename()` 통과 후 `${projectName}-architecture.md` 형식으로 고정.
- 재평가 조건: exporter가 서버로 이관되거나 실제 filesystem 경로를 다루기 시작하면.
- Strike: 0

### FP-7: `ALLOWED_ORIGINS` 평문 wrangler.\*.toml

- 파일: `edge-proxy/wrangler.{demo,proxy,share,explore}.toml` 의 `[vars]` 섹션
- 소스: Phase 1 secret leak Grep (origin URL 패턴)
- 판정 이유: `[vars]`는 Cloudflare에서 **public**으로 설계된 환경변수. ALLOWED_ORIGINS는 CORS 허용 목록이므로 노출 의도. secret이 아님.
- 재평가 조건: `[vars]` 섹션에 Bearer 토큰, API 키 등 실제 비밀값이 추가되면 Critical.
- Strike: 1 (이전 스프린트에서도 확인됨)

### FP-8: KV namespace ID 커밋

- 파일:
  - `edge-proxy/wrangler.share.toml` (`id = "cad76fde28e74586b497f3e27c80f448"`)
  - `edge-proxy/wrangler.explore.toml` (`id = "5967bfaab9f54a83b0bc7b6f1559865e"`)
- 소스: Phase 1 secret leak Grep (고유 hex 문자열)
- 판정 이유: KV namespace id는 Cloudflare 계정 내부 식별자로 **공개돼도 쓰기 불가** (wrangler 명령 + 계정 인증 필요). 의도된 노출.
- 재평가 조건: Cloudflare가 KV id 의미론을 변경하거나 account 인증 체계가 약해지면.
- Strike: 1

---

## Permanent Safe (Strike 3+)

(비어있음 — 본 스킬이 3회 이상 실행된 후 승격 예정)

---

## Retired (더 이상 존재하지 않음 또는 코드 변경으로 무효)

(비어있음)
