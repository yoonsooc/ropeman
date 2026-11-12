# Ropeman — 아키텍처 상세 (ARCH)

> 프로젝트 개요와 사용법은 → [`README.md`](../README.md)
> 최종 업데이트: 2026-04-09

---

## 1. 디렉토리 구조

```
src/
├── routes/
│   ├── +page.svelte              # 메인 페이지 (레이아웃 + AnalyzeModal + testDir 감지)
│   ├── +layout.svelte            # 전역 레이아웃 (테마 CSS 주입)
│   └── +layout.ts                # SSR 비활성화
│
├── lib/
│   ├── stores/                   # Svelte 5 rune 싱글턴 (createXxxStore 패턴)
│   │   ├── projectStore.svelte.ts    # 파일 트리, AST 맵, 파싱 진행률 ($state.raw)
│   │   ├── graphStore.svelte.ts      # 그래프 노드/엣지
│   │   ├── selectionStore.svelte.ts  # 선택 노드 상태
│   │   ├── semanticStore.svelte.ts   # 시맨틱 레벨, 드릴다운 스택, AI 분석 상태
│   │   ├── authStore.svelte.ts       # AI 트랙 (none/edge/byok/bridge/webgpu) + preferredTrack
│   │   ├── settingsStore.svelte.ts   # 사용자 설정 (API키, 코드 구조 요약 limit, 캐시, 언어, 테마, codeFontSize)
│   │   ├── webgpuStore.svelte.ts     # WebGPU 모델 상태 (status, progress, isSupported, 다중모델, 캐시감지)
│   │   ├── modelCatalogStore.svelte.ts # BYOK 모델 목록 (조회 결과 또는 기본 목록, 세션 한정)
│   │   ├── tabStore.svelte.ts        # 탭 시스템 (diagram/code, preview/pinned)
│   │   ├── layoutStore.svelte.ts     # Split Pane 레이아웃 상태
│   │   ├── onboardingStore.svelte.ts # 온보딩 투어 상태 (Phase 1/2, currentStep, localStorage)
│   │   ├── chatStore.svelte.ts       # 채팅 히스토리 (Svelte 5 runes)
│   │   ├── i18nStore.svelte.ts       # 다국어 지원 (Svelte 5 runes + Help/Onboarding 확장). 언어 값은 settingsStore.language를 읽기만 한다
│   │   └── themeStore.svelte.ts      # 다크/라이트 테마 (Svelte 5 runes)
│   │
│   ├── services/                 # 순수 함수 / stateless 모듈
│   │   ├── aiAdapter.ts              # ★ AI Track 단일 진입점 (callAI)
│   │   ├── aiService.ts              # 채팅용 AI 호출 (캐시 + 재시도)
│   │   ├── semanticAnalysisService.ts # 시맨틱 AI 분석 + JSON 파싱/복구
│   │   ├── skeletonExtractor.ts      # AST → LLM 전송용 코드 구조 요약 (suffix 매칭)
│   │   ├── requestBudget.ts          # 보내기 전 크기 검사: 데모 요청 본문 바이트, BYOK 모델별 토큰 한도
│   │   ├── markdownOutline.ts        # Markdown → frontmatter·제목·링크 심볼 (tree-sitter 없이)
│   │   ├── semanticGraphBuilder.ts   # 시맨틱 노드 → SvelteFlow 변환
│   │   ├── fileSystemService.ts      # File System Access API 래퍼
│   │   ├── parserService.ts          # Web Worker 통신 (parseFile, parseAllFiles)
│   │   ├── graphBuilder.ts           # FileNode → GraphNode/Edge (fallback)
│   │   ├── bridgeService.ts          # 로컬 Bridge WebSocket 연결
│   │   ├── webllmService.ts          # WebLLM Worker 래퍼
│   │   ├── cacheService.ts           # IndexedDB 채팅 캐시 (Orama)
│   │   ├── semanticCacheService.ts   # Cache API 시맨틱 분석 응답 캐시 (요청 해시 키)
│   │   ├── embeddingService.ts       # 온디맨드 임베딩 (Orama)
│   │   ├── exportService.ts          # 다이어그램 PNG/SVG 내보내기
│   │   ├── architectureService.ts    # 아키텍처 그룹 분석 (legacy)
│   │   ├── syntaxThemeService.ts     # Prism 테마 CSS 동적 주입
│   │   ├── searchService.ts          # Orama 검색
│   │   ├── modelCatalogService.ts    # BYOK 키로 프로바이더 모델 목록 조회 + 채팅 모델 필터
│   │   └── testLoader.ts             # dev 전용 테스트 프로젝트 로더
│   │
│   ├── components/               # Svelte 5 컴포넌트
│   │   ├── ZUICanvas.svelte          # 메인 그래프 캔버스 (SvelteFlow) + DrilldownConfirm
│   │   ├── AnalyzeModal.svelte       # ★ 통합 AI 분석 모달 (Demo/BYOK/Bridge/WebGPU + auto_awesome)
│   │   ├── DrilldownConfirmModal.svelte # 추가 분석 확인 팝업
│   │   ├── WebGPUSetupModal.svelte   # WebGPU 모델 선택 + 백그라운드 다운로드 인디케이터
│   │   ├── Header.svelte             # 상단 헤더 (Analyze + 트랙 뱃지 + Help + Settings)
│   │   ├── Sidebar.svelte            # 사이드바 (File Explorer + Semantic Tree, showFiles())
│   │   ├── FileExplorer.svelte       # 파일 탐색기 (파일 유형별 아이콘)
│   │   ├── SemanticTree.svelte       # 시맨틱 트리뷰 + 캐시된 노드 자동 드릴다운
│   │   ├── SemanticDetailPanel.svelte # 노드 상세 패널 (파일 유형별 아이콘)
│   │   ├── CodeViewer.svelte         # 코드 뷰어 (심볼 사이드바, 폰트 크기 설정 반영, 원본 언어명)
│   │   ├── TabBar.svelte             # 탭 바 (drag & drop, 원본 파일명 표기)
│   │   ├── SplitPane.svelte          # 분할 뷰
│   │   ├── Breadcrumb.svelte         # 경로 네비게이션 (자식 노드 드롭다운, 분할뷰 호환)
│   │   ├── ExportController.svelte   # 내보내기 컨트롤러 (PNG/SVG)
│   │   ├── ChatPopup.svelte          # AI 채팅 팝업
│   │   ├── SettingsModal.svelte      # ★ Stitch 디자인 설정 모달 (캐시 클리어, 폰트 슬라이더, info 툴팁)
│   │   ├── HelpModal.svelte          # 도움말 모달 (4탭, FAQ, 투어 재시작, 저작권/이메일)
│   │   ├── OnboardingTour.svelte     # 온보딩 투어 오버레이 (2-phase, cutout 하이라이트)
│   │   ├── Dropzone.svelte           # 랜딩 페이지 (폴더 드롭, 푸터 © + email)
│   │   ├── SearchBar.svelte          # 검색 바
│   │   └── nodes/                    # SvelteFlow 커스텀 노드
│   │       ├── SemanticNode.svelte
│   │       └── SecondarySemanticNode.svelte
│   │
│   ├── workers/
│   │   ├── parserWorker.ts           # tree-sitter WASM 파싱
│   │   └── webllmWorker.ts           # WebLLM 모델 초기화 + 추론
│   │
│   ├── types/
│   │   ├── ast.ts                    # ASTSymbol
│   │   ├── semantic.ts               # SemanticNode, SemanticEdge, SemanticLevel
│   │   ├── skeleton.ts               # SkeletonPayload
│   │   ├── graph.ts                  # GraphNode, GraphEdge
│   │   ├── tab.ts                    # Tab 타입
│   │   ├── fileTree.ts               # FileNode
│   │   ├── ai.ts                      # AIErrorType, AIErrorInfo, classifyAIError, getAIErrorInfo
│   │   └── search.ts                 # 검색 타입
│   │
│   ├── data/aiProviders.ts           # 키가 없을 때 쓰는 기본 모델 목록 (modelCatalogStore가 대체) + 모델 계열별 컨텍스트 창 표
│   ├── config.ts                     # DEMO_URL, PROXY_URL 상수
│   │
│   └── utils/
│       ├── languageDetector.ts       # 확장자 → 언어 매핑
│       ├── locale.ts                 # UI 언어 결정 (저장된 선택 > 브라우저 언어 ko* > en)
│       ├── fileIcons.ts              # 파일 유형별 Material Symbols + 색상 매핑
│       └── contextBuilder.ts         # 채팅용 코드 컨텍스트 구성

edge-proxy/                       # Cloudflare Workers
├── src/
│   ├── shared.ts                     # CORS 헬퍼, callGemini, jsonResponse
│   ├── demo.ts                       # ropeman-demo (rate limit + 서버키 + 모델 폴백)
│   └── proxy.ts                      # ropeman-proxy (BYOK pass-through + 모델 목록)
├── wrangler.demo.toml                # Demo Worker 배포 설정 (placement hint)
└── wrangler.proxy.toml               # Proxy Worker 배포 설정
```

---

## 2. 핵심 데이터 흐름

### Phase 1: 로컬 스캔 및 파싱

```
사용자 폴더 드롭
→ File System Access API (showDirectoryPicker / webkitdirectory fallback)
→ fileSystemService.readDirectoryRecursive()   # 경로를 전부 모은 뒤 filePriority.capFiles()로 순위를 매기고 MAX_FILES에서 자른다
→ { tree, cut } 반환. 파일이 모두 잘린 폴더는 트리에서 뺀다
→ 호출한 컴포넌트가 projectStore.fileTree와 projectStore.cutFiles(잘린 파일과 이유)에 쓴다
→ parserService.parseAllFiles() [Web Worker — tree-sitter WASM]
→ ASTSymbol[] 맵 생성 (projectStore.astMap)
```

### Phase 2: AI 의미론적 분석

```
AST 파싱 완료 → AnalyzeModal에서 트랙 선택 (보낼 크기 KB와 대략의 토큰 수, 고른 트랙·모델의 한도를 넘으면 경고)
→ skeletonExtractor.extractSkeleton()    # 원본 코드 제외, 심볼/시그니처/import만 추출 (기본 250KB 제한). Markdown은 frontmatter name·description, H1~H6, 파일 링크만 (ADR-20)
→ formatPayloadPreview()                 # 압축 JSON. 예산, 모달 표시, 프롬프트가 모두 이 문자열을 쓴다
→ aiAdapter.callAI()                     # ★ 단일 진입점
  ├─ edge:   fetch(DEMO_URL) → Cloudflare Worker → Gemini API
  ├─ byok:   fetch(Gemini/Anthropic) 직접 또는 fetch(PROXY_URL) 경유
  ├─ bridge: sendViaBridge() → WebSocket → 로컬 데몬
  └─ webgpu: webllmGenerate() → Web Worker → 로컬 모델
→ semanticAnalysisService.parseSemanticLevel()
  → repairJSON() → closeBrackets() (스택 기반) → progressive truncation
  → assignFiles()                        # 입력 파일마다 노드 하나. 중복은 첫 배정 유지, 없는 경로는 버림, 빠진 파일은 "미분류" 노드
  → 파일이 0개로 남은 역할은 노드와 엣지째 뺌 (드릴다운할 파일이 없으므로)
→ SemanticLevel (nodes + edges + assignment 개수) → semanticStore
→ semanticGraphBuilder → SvelteFlow 노드/엣지 → ZUICanvas 렌더링
```

### Phase 3: 재귀적 드릴다운

```
노드 더블클릭
→ 캐시 확인 (hasCachedLevel)
  ├─ 캐시 있음: 즉시 드릴다운 (팝업 없이)
  └─ 캐시 없음: DrilldownConfirmModal (skipDrilldownConfirm 설정 존중)
→ 해당 영역 파일들의 sub-skeleton 추출
→ aiAdapter.callAI() → 하위 역할 분석 (배정 대상은 부모 노드의 filePaths)
→ 하위 SemanticLevel → 캔버스 업데이트 + 브레드크럼 + 탭

재분석: 노드 hover 시 리프레시 버튼 → invalidateCache() → 새로 AI 호출
```

### 분석 결과 캐시

AI 응답은 브라우저 Cache API(`ropeman/semantic-v2`)에 저장한다. 키는 실제로 보내는 요청 전체의 SHA-256이다.

```
키 = SHA-256([모델 ID, 시스템 프롬프트, 사용자 프롬프트])
  모델 ID       byok:{provider}:{model} · webgpu:{modelId} · bridge:{cli} · edge
  시스템 프롬프트 TOP_LEVEL/DRILLDOWN 프롬프트 + 언어 지시문 (프롬프트를 고치면 키가 바뀐다)
  사용자 프롬프트 스켈레톤 페이로드 그대로 (시각 필드가 없어 같은 입력이면 같은 문자열이다)
값 = AI 응답 원문 (복원할 때 parseSemanticLevel로 다시 파싱하므로 파서 변경이 반영된다)
```

- 저장: `analyzeTopLevel` / `analyzeDrilldown`이 응답 파싱에 성공하면 저장한다 (설정의 캐시 on일 때). 같은 키는 덮어쓴다.
- 최상위 재사용: `analyzeTopLevel`은 같은 요청의 캐시가 있으면 AI를 부르지 않는다 (새로고침 뒤 트랙을 고르는 경우). 사용자가 다시 분석을 요청하면 `force`로 캐시를 건너뛴다. 다이어그램이 떠 있는 상태에서 트랙을 고를 때와 스니펫 분석 버튼이 그렇다. 드릴다운 재분석은 영구 캐시를 읽지 않으므로 항상 AI를 부른다.
- 복원: 프로젝트 로드가 끝나면 `+page.svelte`가 `restoreCachedAnalysis()`를 부른다. 지금 보낼 최상위 요청으로 루트를 찾고, 복원된 노드마다 드릴다운 요청을 만들어 하위 레벨을 차례로 찾는다. 이미 열려 있는 레벨은 덮어쓰지 않는다. 캐시를 읽는 동안 다른 프로젝트를 열거나 트랙, 언어가 바뀌면(최상위 요청이 달라지면) 결과를 버린다.
- 이름이 같아도 파일, 모델, 프롬프트, 언어, 스켈레톤 예산 중 하나라도 다르면 캐시를 쓰지 않는다. v1(`ropeman/semantic`)은 프로젝트 이름을 키로 써서 같은 이름의 다른 폴더에 엉뚱한 다이어그램을 보여 줬다. v1 캐시는 모듈 로드 때 지운다.
- 한계: edge와 bridge는 서버나 CLI가 모델을 고르므로, 그쪽에서 모델이 바뀌면 키가 그대로다.

---

## 3. AI Track 아키텍처

### activeTrack 우선순위

```
bridge > edge > webgpu > byok > none
```

### aiAdapter.ts — 단일 진입점

```typescript
callAI({ system, user, signal }): Promise<string>
```

| Track            | 구현                  | Worker        | CORS           |
| ---------------- | --------------------- | ------------- | -------------- |
| bridge           | WebSocket → 로컬 데몬 | —             | 불필요         |
| edge             | fetch(DEMO_URL)       | ropeman-demo  | Worker CORS    |
| webgpu           | webllmGenerate()      | webllmWorker  | 불필요         |
| byok (google)    | fetch(Gemini API)     | —             | 직접 호출 가능 |
| byok (anthropic) | fetch(PROXY_URL)      | ropeman-proxy | Worker CORS    |

Bridge는 받은 프롬프트로 로컬 CLI를 실행한다. 그래서 연결을 받기 전에 세 가지를 검사한다(`bridge/src/auth.ts`).

- `127.0.0.1`에만 바인딩한다.
- Origin 허용 목록을 확인한다. 기본은 `https://ropeman.dev`과 로컬 개발 서버이고, `--allow-origin`으로 더할 수 있다.
- 소켓 URL의 `?token=`을 확인한다. 토큰은 `--token`, `ROPEMAN_BRIDGE_TOKEN`, `~/.ropeman/bridge-token` 순서로 정한다. 직접 준 토큰이 16자보다 짧으면 시작하지 않는다. 토큰 파일은 시작할 때마다 0600으로 맞춘다.

클라이언트가 보낸 `cli` 값은 `claude`나 `gemini`일 때만 실행한다. 클라이언트(`bridgeService.ts`)는 `ws://127.0.0.1:{port}/?token=`으로 연결하고, 토큰은 `settingsStore.bridgeToken`에 저장한다.

### Edge Proxy 구조

```
edge-proxy/src/
├── shared.ts       # CORS 헬퍼 + callGemini (maxOutputTokens: 16384)
├── demo.ts         # rate limit (IP 분당 10, 일일 200) + 서버 Gemini API 키 (무료 등급)
└── proxy.ts        # BYOK pass-through (Google/Anthropic/OpenAI) + `action: 'models'`
```

- demo는 `DEMO_MODEL`의 쉼표 목록을 차례로 시도한다. 404·429·5xx이거나 모델별 대기 시간(40초)을 넘기면 다음 모델로 넘어간다 (무료 등급 할당량이 모델별이고, 고부하 모델은 503 대신 응답을 붙잡기도 한다). 순서는 응답 속도 우선: Flash-Lite → Flash (Flash가 고부하일 때 40초를 기다린 뒤에야 넘어가던 문제)
- demo 실패 응답은 오류 코드만 준다 (`demo_rate_limited`, `demo_daily_limit`, `demo_upstream_quota`, `demo_unavailable`). 업스트림 본문은 결제 프로젝트 정보를 담을 수 있어 워커 로그에만 남긴다. 클라이언트는 `demoFailureMessage` → `AIErrorType.DEMO_UNAVAILABLE`로 Explore와 다른 AI 연결을 안내한다
- proxy의 `action: 'models'`는 사용자 키로 Anthropic·OpenAI 모델 목록을 받아 `{id, label, created}`로 돌려준다. Gemini 목록은 브라우저가 직접 조회한다
- `scripts/health-check.mjs`를 `.github/workflows/health-check.yml`이 매일 00:00 UTC에 실행한다 (사이트, pages.dev 리다이렉트, explore, demo 실제 호출, proxy, share)

- `[placement] mode = "smart"`, `hint = "wnam"` — Gemini API 지역 제한 우회
- `ALLOWED_ORIGINS` — CORS 도메인 화이트리스트

---

## 4. JSON 파싱/복구 파이프라인

AI 응답이 truncation되거나 malformed일 때의 복구 전략:

```
AI 응답 텍스트
→ 1. {regex} 매칭 (markdown code block 제거)
→ 2. { fallback (닫는 } 없는 경우)
→ repairJSON()
  → 3. escapeControlCharsInStrings() — 문자열 내 \n, \t 이스케이프
  → 4. trailing comma 제거
  → 5. closeBrackets() — 스택 기반, 열린 순서 역순 닫기
  → 6. progressive truncation — 모든 },  경계에서 역순 cut 시도
→ parseSemanticLevel()
  → 7. 대체 키 탐색 (roles/nodes/groups/components/modules)
  → 8. 엣지 source/target 검증
  → 9. 파일 배정: 경로를 입력 경로로 되돌림 (공통 루트 폴더 생략, "./" 허용), 단계마다 파일 하나에 노드 하나
  → 10. 파일이 0개인 역할 제거, 그 역할에 닿는 엣지도 제거
→ SemanticLevel (assignment: leftOut, duplicated, invented, emptied)
```

---

## 5. 스토어 패턴

### Svelte 5 싱글턴 (표준)

```typescript
function createXxxStore() {
    let field = $state<Type>(initial);
    function persist() { localStorage.setItem(...) }
    return {
        get field() { return field; },
        set field(v) { field = v; persist(); },
    };
}
export const xxxStore = createXxxStore();
```

### 마이그레이션 완료 스토어

- `chatStore.svelte.ts`, `i18nStore.svelte.ts`, `themeStore.svelte.ts` — R2에서 Svelte 5 runes 마이그레이션 완료

---

## 6. 아키텍처 결정 기록 (ADR)

결정 기록은 [`adr/`](./adr/README.md)에 파일별로 있다.

---

## 7. 제약 사항

- **브라우저 전용**: Chromium 기반 (비-localhost는 fallback input)
- **파일 제한**: MAX_FILES=2000, MAX_FILE_SIZE=500KB. 값은 `filePriority.ts` 한 곳에 있다.
  - 상한은 순회 순서가 아니라 순위로 건다. 로컬 폴더, fallback input, GitHub가 같은 `rankFiles()`를 쓴다.
  - 순위는 세 묶음이다. 코드와 지침 파일, 그다음 테스트와 일반 문서, 그다음 문법이 없는 파일 순이다.
  - 묶음 안에서는 폴더마다 차례로 한 파일씩 고른다. 큰 패키지 하나가 상한을 다 써서 다른 패키지가 통째로 빠지는 일을 막는다.
  - 잘린 파일은 이유(`file-limit`, `file-size`, `total-size`)와 함께 `projectStore.cutFiles`에 남는다. 로컬 폴더는 남긴 파일의 핸들만 다시 받는다.
  - `fileSystemService`는 스토어에 쓰지 않고 `{ tree, cut }`을 돌려준다. 스토어 쓰기는 `Dropzone.svelte`와 `+page.svelte`가 한다. 파일이 하나도 남지 않은 폴더는 트리에서 빠진다.
- **AST 파싱**: 14개 언어 tree-sitter WASM (Python, JS, TS, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala)
  - 문법 WASM은 `static/`에 커밋한다. 언어별 파일은 `languageDetector.getGrammarFile()`이 고른다. `.tsx`는 언어는 TypeScript 그대로 두고 JSX를 읽는 `tree-sitter-tsx.wasm`(`tree-sitter-wasms` 0.1.13)으로 파싱한다. `.ts`는 `<T>value` 캐스트를 JSX로 오인하지 않도록 `tree-sitter-typescript.wasm`을 유지한다
- **코드 구조 요약 크기**: 기본 250KB (50-1000KB 범위, 1KB = 1000바이트). 보내는 압축 JSON 전체(바깥 필드 포함)로 잰다
  - 경고는 `requestBudget.ts`가 실제로 보낼 프롬프트(시스템 + 사용자, `topLevelPrompt()`)로 잰다. 데모는 POST 본문(JSON 이스케이프 포함)이 300KB를 넘으면 경고한다(측정 안 함, 모델당 40초 제한. 기본 250KB 스켈레톤이 본문으로 약 15% 커지는 만큼 여유를 둠). BYOK는 고른 프로바이더·모델의 컨텍스트 창(`aiProviders.ts` 표, 출처는 주석)에서 출력 예약(Gemini·OpenAI 16,384, Anthropic 4,096)을 뺀 값과 비교한다. 표에 없는 모델은 128K로 가정하고 그렇다고 알린다. 토큰 수는 1토큰 = 4바이트로 어림한다 (PASEO 측정 4.2)
  - 하위 분석(`extractSubSkeleton`)에는 아직 바이트 예산이 없다 (후속 작업)
- **정적 분석만**: 런타임 동작 분석 불가
- **Edge Worker**: Gemini API 지역 제한 → placement hint 필요
- **WebGPU**: Chrome 113+ / Edge 113+ 필요, ~900MB 모델 다운로드

---

## 8. 배포

Pages 프로젝트 `ropeman`은 직접 업로드 방식이라 GitHub과 연결되어 있지 않다. 운영 배포는 `ci.yml`의 `deploy` job이 맡는다.

```
PR        → ci job (lint, svelte-check, build, unit, worker tests, e2e)
main push → ci job (lint, svelte-check, build, unit, worker tests)
          → deploy job
              1. npm run deploy                     앱 (Pages, --branch=main)
              2. scripts/changed-workers.mjs        바뀐 워커만 고름
              3. npm --prefix edge-proxy run deploy:<worker>
              4. scripts/health-check.mjs           배포 직후 확인
```

- main push는 E2E를 건너뛴다. PR CI는 PR을 그 시점의 main에 합친 트리로 E2E를 돌린다. 그 뒤 main이 움직였으면 병합 전에 PR 브랜치를 갱신해 CI를 다시 통과시킨다
- E2E는 CI에서 워커 4개로 돈다. 모바일·태블릿 프로젝트는 `@responsive` 태그가 붙은 테스트(뷰포트에 따라 동작이 바뀌는 테스트)만 돈다. Playwright 브라우저(headless shell)는 Playwright 버전을 키로 캐시하고, apt 설치(`--with-deps`)는 하지 않는다. 러너 이미지에 Chromium 라이브러리가 이미 있다
- 앱을 먼저 올린다. 새 앱은 예전 워커의 오류 문자열도 처리하지만, 예전 앱은 새 워커의 오류 코드를 처리하지 못한다
- 워커는 `src/<name>.ts`나 `wrangler.<name>.toml`이 바뀐 것만 배포한다. `shared.ts`나 `edge-proxy/package*.json`이 바뀌면 전부 배포한다
- 필요한 GitHub secret: `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, Cloudflare Pages Edit), `CLOUDFLARE_ACCOUNT_ID`
- 워커 시크릿(`GEMINI_API_KEY`, `AI_GATEWAY_TOKEN`)은 wrangler로 따로 등록하며 배포가 덮어쓰지 않는다
- 수동 배포(`npm run deploy`, `npm run deploy:edge:<worker>`)는 장애 대응용이다
