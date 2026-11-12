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
│   ├── open/+page.svelte         # JSON 열기: ropeman.json을 골라 읽기 전용 뷰어로 연다 (거부되면 이유와 다시 고르기)
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
│   │   ├── codeMapStore.svelte.ts    # 열린 프로젝트의 코드 지도. 파싱이 끝날 때 한 번 만들고, astMap이 바뀌면 null
│   │   ├── i18nStore.svelte.ts       # 다국어 지원 (Svelte 5 runes + Help/Onboarding 확장). 언어 값은 settingsStore.language를 읽기만 한다
│   │   └── themeStore.svelte.ts      # 다크/라이트 테마 (Svelte 5 runes)
│   │
│   ├── services/                 # 순수 함수 / stateless 모듈
│   │   ├── aiAdapter.ts              # ★ AI Track 단일 진입점 (callAI)
│   │   ├── aiService.ts              # 채팅용 AI 호출 (캐시 + 재시도)
│   │   ├── semanticAnalysisService.ts # 시맨틱 AI 분석 + JSON 파싱/복구
│   │   ├── skeletonExtractor.ts      # 코드 지도 → LLM 전송용 코드 구조 요약 (suffix 매칭). select*는 뺀 파일과 이유도 돌려준다
│   │   ├── codeMapBuilder.ts         # AST → 스켈레톤 v2 코드 지도 (`buildCodeMap`, `fileFromAst`). 스토어를 읽지 않아 Node에서도 돈다
│   │   ├── sourceExtraction.ts       # 브라우저와 Node가 같이 쓰는 파싱 순서: 줄 단위 파서 고르기, 파일 순위, 크기 한도, 건너뛴 이유
│   │   ├── hierarchySummary.ts       # 코드 지도 → 폴더 계층 요약 (파일·심볼 수, 폴더 사이 import 수). LLM 없음
│   │   ├── importResolver.ts         # 코드 지도의 import 위치를 파일·심볼·패키지에 연결 (상대 경로, tsconfig paths, 워크스페이스, $lib, Python)
│   │   ├── codeMapScore.ts           # 코드 지도를 정답 그래프(`tests/fixtures/graphs/`)와 비교해 관계 종류별 precision·recall과 놓친 관계를 낸다
│   │   ├── graphifyAdapter.ts        # Graphify `graph.json`의 ast 층을 같은 코드 지도로 읽고, 읽지 않은 것은 이유와 함께 돌려준다 (T1-12 비교용)
│   │   ├── ropemanMapSchema.ts       # `ropeman.json`과 Bridge RPC 메시지를 믿지 않는 입력으로 파싱 (크기, JSON, 형식, 버전, 구조, 단계 트리)
│   │   ├── mapViewer.ts              # 파싱한 ropeman.json을 시맨틱 스토어가 캐시하는 단계 모양으로 펼친다
│   │   ├── mapVerifier.ts            # 지도 검증기 (A-12): 배정 불변식, 경로 실재, 관계 근거를 코드 지도와 대조해 위반을 모두 돌려준다
│   │   ├── coverageService.ts        # 파일마다 분석에서의 행방(보냄, 안 보냄, 잘림, 건너뜀, 못 읽음)과 단계별 배정 수
│   │   ├── requestBudget.ts          # 보내기 전 크기 검사: 데모 요청 본문 바이트, BYOK 모델별 토큰 한도
│   │   ├── markdownOutline.ts        # Markdown → frontmatter·제목·링크 심볼 (tree-sitter 없이)
│   │   ├── configParsers.ts          # Dockerfile·Terraform·env 템플릿·Makefile → 구조 심볼 (줄 단위 파서, 값은 읽지 않음)
│   │   ├── semanticGraphBuilder.ts   # 시맨틱 노드 → SvelteFlow 변환
│   │   ├── fileSystemService.ts      # File System Access API 래퍼
│   │   ├── parserService.ts          # Web Worker 통신 (parseFile → { symbols, refs }, parseAllFiles → { astMap, refs, skipped }). 순서와 한도는 sourceExtraction
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
│   │   ├── CoverageSummary.svelte    # 캔버스 아래 분석 범위 한 줄 요약 + 상태별 파일 목록
│   │   ├── AnalyzeModal.svelte       # ★ 통합 AI 분석 모달 (Demo/BYOK/Bridge/WebGPU + auto_awesome)
│   │   ├── DrilldownConfirmModal.svelte # 추가 분석 확인 팝업
│   │   ├── WebGPUSetupModal.svelte   # WebGPU 모델 선택 + 백그라운드 다운로드 인디케이터
│   │   ├── Header.svelte             # 상단 헤더 (Analyze + 트랙 뱃지 + Help + Settings)
│   │   ├── Sidebar.svelte            # 사이드바 (File Explorer + Semantic Tree, showFiles()). 모바일·태블릿은 아이콘 레일만 레이아웃에 두고 열린 패널만 캔버스 위에 띄움 (바깥 탭, Esc, 파일 선택으로 닫힘. 분석이 끝나도 다시 열지 않음)
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
│   │   ├── parserWorker.ts           # postMessage 어댑터. 파싱은 grammarParser
│   │   ├── grammarParser.ts          # tree-sitter WASM 파싱. `.wasm` 위치만 주입받아 워커와 Node가 같이 쓴다
│   │   ├── configOutline.ts          # YAML·TOML·JSON 매니페스트·Bash 트리 → 구조 심볼 (키와 참조만, 값은 읽지 않음)
│   │   ├── refQueries.ts             # 문법별 tree-sitter 쿼리: 호출, 동적 import, 클래스 상속 위치
│   │   └── webllmWorker.ts           # WebLLM 모델 초기화 + 추론
│   │
│   ├── types/
│   │   ├── ast.ts                    # ASTSymbol, ASTRef (파서가 읽은 참조 위치)
│   │   ├── semantic.ts               # SemanticNode, SemanticEdge, SemanticLevel
│   │   ├── skeleton.ts               # SkeletonPayload (AI에 보내는 형식, v1에 고정)
│   │   ├── ropemanMap.ts             # `ropeman.json` 형식과 버전, Bridge RPC 메시지 타입. 타입만 import해서 bridge와 Node CLI도 그대로 컴파일한다 (ADR-24)
│   │   ├── mapVerification.ts        # 검증 결과: 파서 거부 또는 위반 코드와 규칙(`VIOLATION_RULES`), 위치, 확인 안 된 관계, 검사한 수
│   │   ├── codeMap.ts                # 스켈레톤 v2: 줄 범위, import·참조 위치와 후보 대상, 관계 출처, 역할 관계의 근거. 브라우저에만 둔다 (ADR-21)
│   │   ├── graph.ts                  # GraphNode, GraphEdge
│   │   ├── tab.ts                    # Tab 타입
│   │   ├── fileTree.ts               # FileNode
│   │   ├── ai.ts                      # AIErrorType, AIErrorInfo, classifyAIError, getAIErrorInfo
│   │   └── search.ts                 # 검색 타입
│   │
│   ├── data/aiProviders.ts           # 키가 없을 때 쓰는 기본 모델 목록 (modelCatalogStore가 대체) + 모델 계열별 컨텍스트 창 표
│   ├── data/semanticPalette.ts       # 시맨틱 노드 색 목록. AI 분석과 지도 뷰어가 같이 쓴다 (뷰어가 AI 서비스를 불러오지 않게)
│   ├── config.ts                     # DEMO_URL, PROXY_URL 상수
│   │
│   └── utils/
│       ├── languageDetector.ts       # 확장자 → 언어 매핑, 그다음 파일 이름 → 설정 형식 (dev 전용 `?testDir=` 스캐너 `scripts/vite-dev-fs-plugin.js`도 이 표를 쓴다)
│       ├── sfcScripts.ts             # `.svelte`·`.vue` → `<script>` 본문만 남긴 TS/JS 소스 (파서 워커가 쓴다)
│       ├── locale.ts                 # UI 언어 결정 (저장된 선택 > 브라우저 언어 ko* > en)
│       ├── fileIcons.ts              # 파일 유형별 Material Symbols + 색상 매핑
│       ├── focusTrap.ts              # `role="dialog"` div 모달 카드가 모두 쓰는 액션: 열 때 포커스를 넣고 Tab을 안에 가두고 닫으면 연 버튼으로 돌려줌
│       └── contextBuilder.ts         # 채팅용 코드 컨텍스트 구성

edge-proxy/                       # Cloudflare Workers
├── src/
│   ├── shared.ts                     # CORS 헬퍼, callGemini, jsonResponse
│   ├── demo.ts                       # ropeman-demo (rate limit + 서버키 + 모델 폴백)
│   └── proxy.ts                      # ropeman-proxy (BYOK pass-through + 모델 목록)
├── wrangler.demo.toml                # Demo Worker 배포 설정 (placement hint)
└── wrangler.proxy.toml               # Proxy Worker 배포 설정

bridge/                           # 로컬 Bridge와 `ropeman serve` (`@ropeman/bridge`, npm 패키지)
├── src/
│   ├── server.ts                     # CLI 진입점(`ropeman serve`, `ropeman-bridge`): 플래그 해석, CLI 감지, 토큰, 지도 세션, listen
│   ├── bridge.ts                     # 한 포트에 HTTP(로컬 모드 정적 서빙)와 WebSocket. 들어온 메시지는 `parseRpcRequest`를 거쳐 RPC 처리, 옛 `chat` 중계는 따로
│   ├── mapSession.ts                 # `--root` 하나의 지도: 추출, `map.get`·`node.expand` 답, 이름 붙이기 작업, 파일 변경 감시 → `map.changed`
│   ├── naming.ts                     # 이름 붙이기: 프롬프트(구조만), 답 읽기, 이름 입히기, 검증 실패 시 한 번 재시도
│   ├── cli.ts                        # CLI 실행(argv만, 셸 없음): 시간·출력 상한, 취소, 감지
│   ├── watch.ts                      # 추출이 순회한 폴더마다 `fs.watch` 하나
│   ├── auth.ts                       # Origin 허용 목록, Host 검사, 토큰
│   ├── fileRead.ts                   # `file.read`: 루트 안 파일만, 실제 `.env` 거부, 500KB 상한, sha-256. 응답 타입은 `src/lib/types/ropemanMap.ts`
│   └── viewer.ts                     # `--viewer` 디렉터리 정적 서빙
├── scripts/smoke.mjs                 # 빌드한 서버를 띄워 가짜 CLI로 RPC 한 바퀴 (CI, `npm pack` 확인)
├── test/                             # 단위·소켓 통합 테스트, `fixtures/fake-cli.mjs`(가짜 `claude`·`gemini`), `realCli.test.ts`(실제 CLI 실측, 환경 변수로만 켬)
├── vite.config.ts                    # `npm run build:bridge` → `dist/server.mjs` 하나(코어·파서·검증기 포함, `ws`만 의존성)와 `dist/wasm/`
└── probe/index.html                  # 브라우저 실측용 시제품 페이지 (ADR-23)

packages/core/                    # Node 추출 코어 (npm 워크스페이스 아님, 루트 의존성을 쓴다)
├── src/
│   ├── walk.ts                       # 폴더 순회: 브라우저와 같은 건너뛰기 규칙, 상한 없음. 파일 링크는 대상도 같은 규칙으로 확인, 폴더 링크는 따라가지 않음
│   ├── extract.ts                    # 순회 → 해석 설정 → 파싱 → 코드 지도 → 계층 요약 (`extractDirectory`)
│   ├── groupedMap.ts                 # 추출 → 폴더로 묶은 `grouped` 단계(노드 id가 폴더 부분을 가리켜 id만으로 단계를 다시 만든다)
│   └── cli.ts                        # `ropeman-extract <폴더> [--out 파일]`
├── test/                             # 브라우저 경로와 같은 지도인지(parity), Node 전용 규칙, 폴더로 묶은 지도의 검증(`mapVerifier.test.ts`)
└── vite.config.ts                    # `npm run build:core` → `dist/cli.mjs` 하나와 `dist/wasm/`

scripts/paseo-comparison/         # 실험: 같은 모델·프롬프트에 Ropeman 추출과 graph.json을 넣어 비교 (T1-12)
├── run.mjs                           # vite로 TS 모듈을 Node에서 연다 (`$lib` 별칭)
├── inputs.ts                         # 두 입력을 같은 `CodeMap`으로, 커버리지·디스크 확인·두 지도 일치
├── view.ts                           # 폴더 → 부분과 부분 사이 관계(근거 줄) → 프롬프트
├── checks.ts                         # 답의 구조 검사, 조정 랜드 지수
└── experiment.ts                     # `claude -p` 호출, 실행 기록(호출 시각·사전 등록 해시), 요약 (결과는 docs/measurements/)
```

---

## 2. 핵심 데이터 흐름

### Phase 1: 로컬 스캔 및 파싱

```
사용자 폴더 드롭
→ File System Access API (showDirectoryPicker / webkitdirectory fallback)
→ fileSystemService.readDirectoryRecursive()   # 경로를 전부 모은 뒤 filePriority.capFiles()로 순위를 매기고 MAX_FILES에서 자른다
→ { tree, cut, configs } 반환. 파일이 모두 잘린 폴더는 트리에서 뺀다. configs는 상한 전 목록에서 읽은 해석 설정이다
→ 호출한 컴포넌트가 projectStore.fileTree와 projectStore.cutFiles(잘린 파일과 이유)에 쓴다
→ parserService.parseAllFiles() [Web Worker — tree-sitter WASM. Markdown과 설정 파일은 메인 스레드의 줄 단위 파서]
→ { astMap, refs, skipped } 반환. 호출한 쪽이 projectStore.astMap과 projectStore.parseSkips(크기 초과, 파서 오류, 열지 못한 파일)에 쓴다
→ codeMapStore.build({ astMap, root, refs, configs })   # 파싱 한 번에 코드 지도 한 번. GitHub·?testDir= 로더는 스스로 부른다
```

### Node 추출 (`packages/core`, T2-2)

CLI와 `ropeman serve`(T2-4)가 쓸 추출 경로다. 브라우저와 같은 코드를 부르고, 다른 것은 입출력 어댑터뿐이다.

```
walk.walkDirectory()            # fs 순회. shouldSkipPath·include 항목·MAX_DEPTH는 filePriority 그대로, MAX_FILES 없음
→ collectResolverConfigs()      # 순회한 전체 목록에서 (브라우저와 같은 함수)
→ createGrammarParser(파일 경로) # 워커와 같은 tree-sitter 코드. 워커는 /static URL, Node는 파일 경로를 준다
→ sourceExtraction.parseSources(supportedFiles(tree))   # 같은 순서, 줄 단위 파서, 건너뛴 이유
→ codeMapBuilder.buildCodeMap() → hierarchySummary.summarizeHierarchy()
```

- 한도: 파일 수와 합계 크기(MAX_TOTAL_SIZE) 상한이 없다. 파일 하나는 2MB(`NODE_MAX_FILE_SIZE`)를 넘으면 생성물이나 압축 파일로 보고 읽지 않는다(`file-size`). 브라우저의 500KB보다 크게 잡았다. 바이너리는 지원 언어 확장자만 읽으므로 파서에 닿지 않는다.
- 실제 `.env`는 브라우저와 같은 규칙(`detectLanguage`가 템플릿에만 언어를 준다)이라 열지 않는다. 숨은 폴더와 `node_modules`는 `shouldSkipPath`로 거른다.
- 파일 링크는 대상의 실제 경로가 루트 안이고 그 경로로도 브라우저 규칙을 통과할 때만 따라간다(`walk.isReadableTarget`: `shouldSkipPath`, 실제 `.env` 거부). 그래서 `notes.ts -> .env`나 `dep.ts -> node_modules/...`는 읽지 않는다. 폴더 링크는 따라가지 않는다. 루트 안 폴더는 실제 경로로 순회되므로 readdir 순서와 상관없이 실제 경로 이름이 남고, 루트 밖이거나 건너뛰는 폴더는 읽지 않는다. Chrome의 FileSystemHandle이 링크를 어떻게 다루는지는 확인하지 않았다.
- 읽을 때 경로를 다시 `realpath`로 풀어 같은 규칙으로 확인하고 실제 경로를 연다. 순회 뒤에 파일이 루트 밖 링크로 바뀌어도 따라가지 않는다(`unreadable`). 그 확인과 `openAsBlob()` 사이의 짧은 틈은 막지 않았다. 사용자 자신의 폴더를 읽는 로컬 CLI라 best effort로 둔다. 원격 요청을 받는 Bridge의 `file.read`는 O_NOFOLLOW와 dev·ino 비교로 이 틈도 막는다.
- 파일 내용은 `fs.openAsBlob()`으로 연다. 브라우저 `File.text()`처럼 UTF-8 BOM을 지우므로 같은 파일이 같은 줄과 텍스트가 된다.
- 같음 검증(`packages/core/test/parity.test.ts`): 브라우저 경로(가짜 FileSystemDirectoryHandle → `readDirectoryRecursive` → 실제 `parserWorker`를 같은 스레드에서 돌리는 Worker → `parseAllFiles` → `buildCodeMap`)와 Node 경로의 지도가 파일 순서까지 같고, 순회 목록(`listed`와 전체 경로 집합)과 트리의 파일·언어도 같다. 링크 없는 트리만 대상이다(가짜 핸들이 링크를 만나면 테스트가 실패한다). 링크 규칙은 `extract.test.ts`가 검증한다. 대상: 정답 픽스처 세 저장소(10, 16, 24개 파일)와 이 저장소 `src/`(205개 파일, 참조 위치 13,566개).
- PASEO 실측(`e0f545fed`, 로컬 체크아웃, Apple M4 10코어, Node 26, 5회): 순회 6,756개, 지도 6,171개(브라우저는 2,000개에서 자른다), 건너뜀 2개(2MB 넘는 `html.gen.ts` 하나, 파서 오류 `launcher.sh` 하나). 벽시계 중앙값 6.52초(6.43~6.72초), 추출 끝 시점 최대 RSS 중앙값 974MB(924~996MB). `--out`으로 덤프까지 쓰면 최대 RSS 1.43GiB다. 한 코어에서 도는 tree-sitter WASM(파싱과 쿼리)이 CPU 프로필의 대부분이라, 더 빠르게 하려면 워커 풀(T1-11)이다. 지도에는 심볼 34,533개, 참조 위치 449,288개, import 32,996개(파일·패키지로 연결 27,498, 연결 못 함 58, 해석기 밖 언어 5,440)가 들었다.
- 계층 요약: 폴더마다 아래 파일 수, 심볼 수(중첩 포함), 바로 든 파일 수, 하위 폴더, 그리고 이 폴더의 두 부분(하위 폴더나 바로 든 파일들) 사이의 import 수를 담는다. 대상이 파일 하나로 정해진 import만 센다. 같은 지도는 같은 요약이 된다.
- `--out` 덤프는 확인용이고 `ropeman.json` 형식이 아니다. 형식은 T2-1이, serve 연결은 T2-4가 맡는다.

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

### 스켈레톤 v2 (코드 지도)

파서 출력(`astMap`)을 두 층으로 나눈다 (ADR-21).

- **코드 지도** (`types/codeMap.ts`): 결정론으로 읽은 사실을 모두 담는다. 브라우저에만 두고 AI에 보내지 않는다.
  - 파일마다 파일 전체 줄 범위, 심볼, import 위치, 재수출 위치(`reexports`), 참조 위치(`refs`)를 둔다. 경로(`FilePath`)는 `{root}/{저장소 기준 경로}`이고 `root`는 `CodeMap.root`에 있다.
  - 심볼마다 `id`(`파일#부모.이름`, 같은 이름이 또 나오면 `~2`), 종류(variable·interface·type 포함), 줄 범위 `{ start, end }`. 줄은 1부터 세고 끝 줄을 포함한다. graphify처럼 시작 줄만 주는 입력은 `end: null`이다. `~n`은 선언 순서에 따라 바뀌므로 저장하는 값의 키로 쓰지 않는다.
  - import 위치: 줄, 원문, 모듈 대상, 가져온 이름마다의 대상. 참조 위치: 종류(`calls`, `indirect_call`, `references`, `inherits`, `implements`, `dynamic_import`, graphify 이름 그대로), 줄, 감싼 심볼, 적힌 이름, 대상.
  - 대상(`Binding`) 상태는 셋이다. `pending`은 해석기가 아직 안 봤다는 뜻이다. `bound`는 후보가 하나 이상이고 후보마다 출처가 붙는다. 후보가 여럿이면 모두 INFERRED다. `unresolved`는 해석기가 봤는데 못 찾았다는 뜻이다. 화면의 "연결 못 한 대상"은 `unresolved`만 센다.
  - 출처(`Provenance`)는 `{ source, confidence }`다. 허용 조합은 `PROVENANCE_RULES` 표 하나가 정하고, 표에 없는 조합은 컴파일되지 않는다. 파서(`ast`)는 EXTRACTED만, LLM(`llm`)은 INFERRED만 쓸 수 있다. 해석기와 graphify는 둘 다 쓸 수 있다. 코드 지도에는 LLM 출처가 들어갈 수 없다(`CodeProvenance`).
  - 역할 사이 관계(`SemanticEdge.evidence`, 선택 필드)는 근거가 된 코드 관계를 `RelationRef`(경로, 줄, 관계 이름, 대상 파일, 신뢰도)로 가리킨다. EXTRACTED는 근거가 하나 이상 있어야 한다.
- **전송 형식** (`types/skeleton.ts`의 `SkeletonPayload`): v1 그대로 고정한다. `toWireFile()`은 심볼과 import 원문만 읽는다(`WireSource` 타입). 그래서 줄, 호출, 대상, 출처는 요청 바이트와 캐시 키를 바꾸지 못한다.
- 변환: `fileFromAst(key, symbols, refs)`가 파일 하나를, `buildCodeMap(astMap, root, { refs, configs })`이 astMap 전체를 코드 지도로 바꾸고 import를 해석한다. 참조 위치의 대상은 아직 모두 `pending`이다. `selectSkeleton`·`selectSubSkeleton`은 `fileFromAst()` → `toWireFile()`을 거치므로 해석 결과를 읽지 않는다.
- 참조 위치 추출 (`workers/refQueries.ts`): 파서 워커가 심볼을 읽은 같은 트리에 문법별 쿼리를 한 번 돌리고, `parse-result` 메시지에 `refs`(`ASTRef[]`)를 함께 보낸다. 이름으로 대상을 찾지 않으므로 결과는 트리만으로 정해진다.
  - 호출(`calls`)은 열네 언어의 문법 열다섯 개를 모두 읽는다: TS·TSX·JS, Python, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala. `new Foo()`(JS·TS, Java, C++, PHP, C#)도 `Foo` 호출로 센다. TSX·JS에서는 컴포넌트 태그(대문자로 시작하거나 점이 있는 이름, `<Layout.Frame>`)도 호출이다. `<div>` 같은 기본 태그는 세지 않는다. Java의 `super()`·`this()`도 호출이다. Rust 매크로(`println!`)는 함수가 아니어서 뺀다.
  - 동적 import(`import('./x')`)는 JS·TS에서, 클래스 상속(`inherits`, `implements`)은 JS·TS와 Python에서 읽는다. Python은 위치 인자만 부모로 보고 `metaclass=`는 뺀다.
  - 적힌 이름(`written`)은 호출 대상 부분의 원문이다. 괄호·대괄호·중괄호 안은 비우고 공백은 지운다. 그래서 `z.object({ … }).strict()`는 `z.object().strict`가 된다. 단어 사이 공백 하나만 남긴다(`new Store().save`). 200자에서 자른다.
  - 줄은 호출식이 시작하는 줄이다. graphify와 정답 픽스처(`tests/fixtures/graphs/`)가 같은 규칙을 쓴다. 여러 줄로 이어진 체인 호출은 모두 첫 줄에 놓이고 적힌 이름으로 구별된다.
  - 감싼 심볼(`from`)은 그 줄을 줄 범위에 담은 가장 깊은 심볼이다. 같은 줄에 심볼이 둘이면 먼저 나온 것이다. 심볼 트리에 없는 범위(함수 안 함수, `describe` 콜백, 화살표 함수가 아닌 최상위 `const`)는 바깥 심볼이나 `null`로 간다. 상속은 클래스가 시작하는 줄의 클래스 심볼에만 붙고, 심볼 트리에 없는 클래스(함수 안 클래스, 추상 클래스)의 상속은 버린다.
  - 알려진 빈틈: Rust 매크로의 인자는 파싱되지 않은 토큰 묶음(token tree)이라 그 안의 호출(`println!("{}", v.len())`의 `v.len`)을 읽지 못한다. 감싼 심볼은 줄로만 고르므로, 한 줄에 함수 둘이 있으면 둘째 함수의 호출도 첫째에 붙는다. 심볼에 열(column)이 없고 v1 전송 형식이 고정이라 열로 고르지 않았다. Python 데코레이터 호출(`@app.route("/x")`)은 함수 심볼이 `def` 줄에서 시작하므로 바깥(모듈)으로 간다. Java 생성자는 개요에 없어서 생성자 안 호출은 클래스에서 나온다.
  - 쿼리가 컴파일되지 않거나 돌다가 실패하면 그 문법의 파일은 참조 없이(`refs: []`) 심볼만 보낸다. 컴파일은 문법마다 한 번만 시도하고, 경고(`console.warn`)도 문법마다 한 번만 남긴다.
  - 같은 파일 안 이름 맞추기는 하지 않았다. 지역 변수가 같은 이름을 가리면 틀리므로 EXTRACTED라 할 수 없고, 다른 파일로 가는 호출과 함께 해석기가 맡는다.
  - `parserService.parseFile()`은 `{ symbols, refs }`를 돌려주고, 로더는 파일별 `refs`를 모아 `codeMapStore.build()`에 넘긴다. 줄 단위 파서(Markdown, 설정 파일)는 `refs: []`다. 구조화 복제 비용(PASEO 로컬 폴더, 상한 안 1,951개 파일, `v8.serialize` 크기): `refs` 합계 7.3MB, 파일당 중앙값 1.2KB, 최대 309KB. 같은 파일의 심볼은 1.9MB다.
  - 비용(PASEO, Node, 워커 코드 그대로, 5회 교차 실행 중앙값): `.ts` 4,415개 3.96초 → 5.34초(+35%), `.tsx` 870개 0.59초 → 0.78초(+33%). 늘어난 시간의 대부분은 쿼리가 트리를 도는 WASM 시간이다(호출 패턴 하나만 돌려도 약 1.0초). 읽은 위치는 `.ts`에서 404,435개, `.tsx`에서 39,711개다.
- 앱에서 만들기 (`stores/codeMapStore.svelte.ts`): 로더 다섯 경로(로컬 폴더 선택, webkitdirectory 대체 입력, 스니펫, GitHub, `?testDir=`)가 파싱을 마치고 `projectStore.astMap`을 쓴 뒤 `codeMapStore.build()`를 한 번 부른다. `root`는 astMap 키의 접두어다. 로컬 폴더와 스니펫은 저장소 기준 경로라 `null`, GitHub는 저장소 이름, `?testDir=`는 스캔한 폴더 이름이다.
  - `codeMapStore.map`은 만든 astMap이 지금의 `projectStore.astMap`과 같은 객체일 때만 지도를 준다. 새 프로젝트(`projectStore.reset()`)나 재파싱이 astMap을 바꾸면 곧바로 `null`이라, 다른 프로젝트의 지도가 남지 않는다. 별도 reset 호출이 없어도 된다. 같은 이유로 `build()`도 넘겨받은 astMap이 지금의 것이 아니면 아무것도 하지 않는다. 설정을 기다리는 사이 사용자가 다른 프로젝트를 열면, 늦게 끝난 로더가 새 프로젝트의 지도를 덮어쓰지 못한다.
  - 해석 설정(`configs`)은 MAX_FILES 상한 전에 로더가 본 전체 목록에서 `collectResolverConfigs()`(`importResolver.ts`)로 모은다. `isResolverConfig()` 파일을 읽고 `namedConfigs()`가 새 이름을 주지 않을 때까지 목록에 있는 파일만 더 읽는다. MAX_FILE_SIZE보다 큰 파일과 사용자 제외 경로는 읽지 않는다. 상한은 그대로다. GitHub 로더는 파싱과 같은 크기(`BATCH_SIZE` 20)로 나눠 받아서 큰 모노레포에서도 동시 요청이 20개를 넘지 않는다. 설정을 하나도 못 읽어도 로드는 실패하지 않고 설정 없이 지도를 만든다. PASEO에서는 상한과 순위가 해석 설정 40개를 모두 잘랐고, 이렇게 모으면 40개가 다 들어온다.
  - 비용(PASEO 로컬 폴더, Node, 앱과 같은 함수): `buildCodeMap` 5회 중앙값 73ms(50~139ms). 지도 `files`를 `v8.serialize`하면 23MB다.
  - AI 요청은 코드 지도를 읽지 않는다. `selectSkeleton`·`selectSubSkeleton`이 astMap에서 바로 만들므로 전송 바이트는 그대로다(`skeletonWire.test.ts` 골든, `importResolver.test.ts`·`skeletonExtractor.test.ts`의 해석 전후 바이트 비교).
- 워커는 파일마다 트리를 다 쓰면 `tree.delete()`로 WASM 메모리를 돌려준다. 돌려주지 않으면 한 워커가 PASEO `.ts`를 두 번 반 읽는 동안(약 10,000개) 힙이 차서 그 뒤 모든 파일이 실패했다.
- import 해석 (`importResolver.ts`, 순수 함수): `configs`는 `isResolverConfig()`가 고르는 설정 파일(tsconfig·jsconfig, package.json, pnpm-workspace.yaml, svelte.config)의 원문과, 이 설정들이 `extends`·`references`로 가리키지만 이름으로는 안 골린 파일(`base.json` 등, `namedConfigs()`가 새 이름이 없을 때까지 알려 준다)의 원문을 astMap 키로 담는다. `readResolverConfig()`가 이를 규칙으로 바꾸고 `resolveImports()`가 import 위치의 모듈 대상과 이름별 대상만 바꾼다.
  - TS/JS·Svelte·Vue: 상대 경로(확장자 추가, `/index`, 적힌 `.js`는 같은 이름의 `.ts`가 있으면 `.js`가 있어도 `.ts`, `.d.ts`), SvelteKit `$lib`·`kit.alias`(svelte.config가 없으면 `src/lib`), 가장 가까운 tsconfig의 `paths`·`baseUrl`, 워크스페이스 패키지(`exports`·`main`·`types`, `dist/` 경로는 tsconfig `outDir`→`rootDir`로 소스에 되돌린다), 가장 가까운 package.json의 `imports`(`#x`, 못 찾으면 외부가 아니라 `unresolved`) 순서로 찾는다. 나머지 이름은 외부 패키지다. `exports`·`imports`의 조건은 적힌 순서대로 읽고 `types`·`import`·`require`·`default`·`svelte`·`browser`만 따른다.
  - tsconfig 고르기: 폴더의 `tsconfig.json`(없으면 `jsconfig.json`, 둘 다 없으면 `tsconfig.*.json` 전부)과 그 `references`를 깊이 우선으로 늘어놓고, `files`·`include`·`exclude`가 그 파일을 담는 첫 설정을 쓴다. Vite 템플릿처럼 `tsconfig.json`이 `files: []`와 `references`만 두면 `src/`의 파일은 `tsconfig.app.json`을, `vite.config.ts`는 `tsconfig.node.json`을 쓴다. `include`가 없으면 TS/JS 확장자(`.ts`·`.tsx`·`.mts`·`.cts`·`.js`·`.jsx`·`.mjs`·`.cjs`) 파일만 담고, `exclude`가 없으면 `node_modules`와 `outDir`를 뺀다. `references`가 있고 `files`·`include`가 없는 솔루션 설정은 아무 파일도 담지 않아서 파일이 참조된 설정으로 넘어간다. tsc라면 솔루션도 그 파일을 컴파일하지만, 이렇게 쓴 설정은 솔루션이라는 뜻으로 읽는다. 담는 설정이 없으면 `paths`나 `baseUrl`이 있는 첫 설정을 쓴다. `extends`는 배열이면 뒤의 것이 이기고, 두 부모가 같은 base를 이어받아도(다이아몬드) 양쪽 모두 base를 읽는다. `files`·`include`·`exclude`도 `extends`로 이어받는다.
  - Python: 상대 import, 소스 루트(`__init__.py`가 시작되는 폴더, 프로젝트 폴더, `src/`) 기준 절대 import, `from pkg import mod`의 하위 모듈. Python 3에는 암묵적 상대 import가 없어서 패키지(`__init__.py`가 있는 폴더) 안의 절대 import는 import한 파일의 폴더를 찾지 않는다. `__init__.py`가 없는 폴더(`scripts/`, 테스트 폴더)의 파일은 `python scripts/a.py`가 그 폴더를 `sys.path` 맨 앞에 두듯 같은 폴더의 모듈도 찾는다. 단 소스 루트 다음에 찾아서 같은 이름의 프로젝트 모듈을 가리지 않는다(실행 시 Python은 옆 파일을 먼저 읽지만, 같은 파일을 모듈로 import하면 루트가 이긴다). 어느 경로에서든 일반 모듈이 네임스페이스 패키지보다 먼저다. `__init__.py`가 없는 네임스페이스 패키지에서는 처음 적힌 하위 모듈을 모듈 대상으로 둔다(`from . import x`는 `x.py`). 하위 모듈이 아닌 이름은 선언할 모듈이 없으니 `unresolved`다. 루트 여러 곳에서 찾으면 후보 여럿(INFERRED)이다.
  - 다른 언어의 import는 `pending`으로 남는다. 못 찾은 import는 `unresolved`이고, `resolveImports()`의 `outcomes`가 규칙(`package-imports` 포함)과 이유(`no-file`, `no-entry`, `outside-root`, `unparsed`)를 함께 준다.
  - 이름별 대상은 대상 파일의 최상위 심볼(기본 export는 `export_default` 배지)에서 찾는다. 없으면 그 파일의 import와 재수출(`export … from`, `export *`)을 따라가 선언한 파일까지 간다(배럴 `index.ts`, `__init__.py`). 파서가 기록하지 않는 interface·type·함수가 아닌 `const`는 `unresolved`다.
  - `fileFromAst()`는 파서가 import로 보고한 `export … from` 문을 `reexports`에 둔다. 전송 형식은 `imports`만 읽으므로 요청 바이트는 그대로다. 지금 파서는 이 문을 내보내지 않는다.
- 고정 장치: `skeletonWire.test.ts`가 v2 이전 코드로 찍어 둔 전송 문자열 7종(최상위·드릴다운, 예산 무제한·50KB, 예산을 넘는 파일 하나)과 지금 출력을 비교한다.
- 추출 점수: `tests/fixtures/graphs/`의 정답 그래프로 잰다 (9절).
- graph.json 어댑터 (`graphifyAdapter.ts`, 순수 함수): `readGraphifyGraph(json, root)`가 Graphify가 만든 `graph.json`(`schema_version` 1)을 같은 코드 지도로 읽는다. T1-12가 Ropeman 추출과 Graphify 추출을 `scoreCodeMap`으로 나란히 재려고 둔다. 앱에서 사용자의 graph.json을 여는 경로는 아직 없다.
  - ast 층(`_origin: ast`)만 코드 사실로 읽는다. LLM이 만든 semantic 층, 군집 번호와 군집 이름(`community_name`)은 읽지 않는다(A-10). 관계의 EXTRACTED/INFERRED는 graph.json 값을 그대로 쓰고 출처는 `graphify`다. AMBIGUOUS는 INFERRED로 읽는다.
  - 경로는 `{root}/{source_file}`이다. 심볼 id는 graph.json 노드 id를 쓰지 않고, `contains`·`method` 트리를 줄 순서로 다시 세워 `fileFromAst`와 같은 규칙(`부모.이름`, 같은 이름이 또 나오면 `~n`)으로 만든다. 줄은 `L9` 같은 시작 줄뿐이라 `end: null`이다. 심볼 종류는 이름 모양(`f()`, `.m()`)과 `_callable_class`로만 정한다.
  - graph.json은 방향 없는 단순 그래프라 노드 쌍마다 관계를 하나만 남긴다. 같은 관계가 다른 줄에서 또 나오면 `also_seen`에 접는데, 어댑터는 이것을 줄마다 위치로 다시 편다. 다른 관계끼리 부딪혀 사라진 것(파일 맨 위의 호출이 `contains`에 덮인 경우 등)은 되살리지 못하고 이유(`folded-call`, `reverse-import`)만 남긴다.
  - 한 함수가 한 줄에서 EXTRACTED 대상 둘 이상을 부를 때, 대상 이름이 다르면 위치를 나눠 각각 EXTRACTED로 둔다. PASEO에서 이런 줄 232개를 원문과 맞춰 보니 모두 한 줄에 호출 두 개가 따로 적혀 있었다(`applySkills(targets, nonDestructivePlan(status))`). 이름이 같은 대상들만 한 위치의 후보 여럿이 되고, `Binding` 규칙대로 모두 INFERRED다.
  - 외부 노드(`external: true`)의 이름은 graphify가 만든 슬러그(`ref_node_fs`, `packages_protocol_src_messages_…`)라 모듈 이름으로 되돌릴 수 없다. 그래서 그 import 위치의 모듈은 `unresolved`(연결 못 한 대상)이고, 그런 이름 대상은 버린다. package.json에 적힌 의존성 노드(`file_type: concept`)를 가리키는 import는 그 패키지(`ext:pino`)로 연결한다. package.json이 의존성을 적은 줄 자체는 import가 아니라서 버린다.
  - JS/TS에서 `deferred`로 표시된 `imports_from`은 함수 안의 `import()`라서 그 함수에서 나온 `dynamic_import` 위치가 된다. graphify의 `dynamic_import` 관계에는 줄이 없어서 버린다. 다른 언어의 함수 안 import는 파서 결과처럼 위치를 두지 않는다.
  - 버리거나 약하게 읽은 것은 모두 `issues`에 남는다. 이유는 `ISSUE_REASONS` 표에 있다.
  - graph.json에는 import 문 원문이 없어서 `ModuleSite.text`는 빈 문자열이고 `written`은 `null`이다. 이 지도로 전송 형식(`toWireFile`)을 만들지 않는다.
  - Graphify 이름은 호환 설명에만 쓴다. Ropeman은 Graphify 프로젝트와 관련이 없다. 어댑터는 Graphify(Apache-2.0)의 출력 형식만 읽고 코드는 가져오지 않았다.
- 채울 작업: 참조 위치의 대상(같은 파일 안 포함), T1-8 역할 관계의 근거(코드 지도에서 찾고 없으면 점선).

### 분석 범위 (커버리지)

다이어그램 아래 한 줄 요약(`CoverageSummary.svelte`)이 "파일 N개 중 M개를 AI에 보냄"과 잘림, 건너뜀, 못 읽음 수를 보여 준다. 누르면 상태별 목록, 이유, 경로 검색, 다이어그램 단계별 배정 수가 열린다.

- `coverageService.buildCoverage()`는 순수 함수다. 입력은 `fileTree`, `astMap`, `cutFiles`, `parseSkips`, `selectSkeleton()` 결과, 시맨틱 캐시의 단계들, 코드 지도다. 모든 경로는 프로젝트 이름을 뗀 상대 경로로 맞춘다.
- 패널 머리말 아래 한 줄이 코드 지도의 import·재수출 문이 어디로 이어졌는지 센다(`imports`): 프로젝트 파일, 외부 패키지, 대상을 찾지 못함. 해석기가 읽지 않는 언어의 문(`pending`)은 세지 않고, 셀 문이 없거나 지도가 아직 없으면 줄을 감춘다. PASEO 로컬 폴더에서는 7,996개 중 3,504개가 프로젝트 파일, 3,323개가 패키지, 1,169개가 못 찾음이다. 못 찾은 상대 경로 629개 중 612개는 대상 파일이 목록에는 있지만 상한으로 잘려 파싱되지 않은 경우다.
- 파일 하나에는 이유 하나만 붙는다. 상태는 `COVERAGE_REASONS` 표(`types/coverage.ts`)에서 이유로 정해진다.
  - 이유를 정하는 순서는 로더가 자른 이유, 문법 없음(`unsupported`), 파서가 남긴 이유, 스켈레톤이 뺀 이유(`over-budget`, `excluded-path`, `no-symbols`), 보냄이다.
  - astMap에 없고 기록도 없는 파일은 `unreadable`이다. GitHub 로더는 다운로드 실패와 빈 응답을 `unreadable`, 파서 오류를 `parse-failed`로 `projectStore.parseSkips`에 직접 쓴다.
  - tree-sitter는 문법 오류가 있어도 트리를 돌려준다. 그래서 파서 워커는 트리에 오류가 있고 심볼이 하나도 없을 때 실패로 답하고, 세 로더(폴더, 테스트, GitHub)는 이를 `parse-failed`로 기록한다. 오류가 있어도 심볼이 나온 파일은 그 심볼을 쓴다.
- 수는 지금 설정으로 다시 계산한다. 분석한 뒤 예산을 바꾸면 요약은 새 예산 기준이다.
- 단계별 배정 수는 `SemanticLevel.assignment`(T0-7)에서 읽는다. 드릴다운 단계의 예산 초과 수는 `selectSubSkeleton()`을 다시 돌려 센다. 그 결과가 `exceedsBudget`이면(한도 안에 드는 파일이 없어 가장 작은 파일 하나를 한도를 넘겨 보낸 경우) 단계 줄에 그렇다고 적는다. 분석한 뒤 예산을 줄였을 때 생긴다.
- 세지 않는 것: 로더가 순회하지 않은 폴더(`SKIP_DIRS`, 숨김 파일, 사용자 제외 패턴) 안의 파일, 문법 오류가 있어도 심볼을 돌려준 파일, LLM 출력이 잘리거나 시간이 넘은 경우.

### ropeman.json과 Bridge RPC (ADR-24)

스킬과 CLI가 만든 지도는 `ropeman.json` 파일이나 Bridge 소켓으로 들어온다. 둘 다 같은 타입(`types/ropemanMap.ts`)이고, 읽기 전에 `ropemanMapSchema.ts`가 파싱한다.

- 파일: `format: "ropeman-map"`, `schemaVersion: "MAJOR.MINOR"`, 프로젝트 이름, 만든 도구와 시각, `files`(본 파일 전부와 행방, `FileCoverage`), `levels`(단계 목록).
- 단계(`MapLevel`)는 펼친 노드(`parentId`, 최상위는 null), `naming`(`grouped`는 폴더로 묶은 결정론 결과, `named`는 검증을 통과한 LLM 이름), 노드, 관계, 배정 수를 담는다. 색, 깊이, 파일 수는 파일에 없고 뷰어가 정한다. 경로는 모두 저장소 기준이다.
- 버전: 읽는 쪽은 자기 major만 읽고, 그 major의 minor는 모두 읽는다. minor는 선택 필드만 더하고, 모르는 필드는 버린다. 닫힌 값 목록(행방 이유, 관계 종류, 단계 이름 상태)에 값을 더하면 major가 바뀐다. 오류 코드만은 열린 목록이라, 모르는 코드는 `unknown`으로 읽고 함께 온 문장을 보여 준다.
- 거부 코드: `too-large`(16MiB 초과, 파일은 읽기 전에 크기로), `not-json`, `not-a-map`(`format`이 다름), `newer-version`·`unsupported-version`(major가 다름, 구조보다 먼저 본다), `invalid`(틀린 필드 위치를 `at`에 `levels[1].nodes[0].label`처럼 준다).
- 구조 검사: 노드 id는 지도 전체에서 하나, `__root__`은 못 쓴다(스토어가 최상위 키로 쓴다). 최상위 단계는 하나이고, 나머지 단계는 최상위에서 닿는 노드를 하나씩 펼친다. 그래서 고아 단계와 순환이 없다. 관계는 같은 단계의 두 노드를 잇는다. 배정 불변식, 경로 실재, 관계 근거는 아래 지도 검증기가 본다.
- 모듈 경계: `ropemanMapSchema.ts`와 `mapVerifier.ts`는 `$lib/types/`만 불러온다(타입과 `COVERAGE_REASONS` 같은 상수). 검증기는 여기에 더해 파서만 불러온다. T2-4가 이 파서를 Bridge와 `packages/core`에서 돌리는데, 둘 다 앱 런타임(스토어, 서비스, Svelte)을 번들하지 않기 때문이다. 파서가 닿는 `types/` 파일(`ropemanMap`, `codeMap`, `coverage`, `semantic`, `ast`)도 앱 모듈을 불러오면 안 된다. 직접·간접 import 그래프를 따라가는 테스트(`ropemanMapSchema.test.ts`의 module boundary, 두 모듈 모두)가 이를 막는다. `$lib` 별칭은 T2-4가 Bridge·core 빌드에서 풀어야 한다.
- 값은 필드마다 새 객체로 복사한다. 상속된 키는 읽지 않고, 색처럼 화면 스타일이 되는 값은 파일에서 받지 않는다. 라벨과 설명은 Svelte 텍스트로만 그린다.
- RPC(T2-4가 구현): 요청은 `{ id, type }`이고 응답은 같은 id와 type에 `result`나 `code`·`error`를 담는다. `map.get`은 지도 전체, `node.expand`는 노드 id를 받아 묶음 단계를 바로 돌려주고, 이름이 검증을 통과하면 `node.named` 푸시가 따른다(이미 이름이 있으면 바로 `named` 단계를 돌려주고 푸시는 없다). `file.read`는 #72 모양 그대로다. 서버는 연결마다 `hello`로 스키마 버전을 먼저 알린다. `map.changed`는 바뀐 경로만 알리고, 뷰어가 `map.get`을 다시 부른다.
- JSON 열기(`/open`)는 파싱한 지도를 `mapViewer.toViewerLevels()`로 펼쳐 스냅샷 모드(`readOnlyMode = 'snapshot'`)로 보여 준다. 파일에 없는 단계는 "스냅샷에 없음"으로 보이고 AI를 부르지 않는다. 스냅샷 모드에서는 노드의 다시 분석 버튼도 숨긴다.

### 지도 검증기 (`mapVerifier.ts`, T2-3)

LLM은 지도의 이름과 관계를 쓰기만 하고, 믿을지는 결정론 코드가 정한다(A-12). `verifyMap(input, codeMap)`은 아무 값이나 받아 먼저 `ropeman.json`과 같은 파서(`parseRopemanMapValue`)로 읽고, 읽은 지도를 그 지도가 설명한다는 `CodeMap`과 대조해 위반을 전부 돌려준다. 첫 위반에서 멈추지 않는다. 순수 동기 함수이고 입출력과 LLM이 없다. 브라우저, Bridge, `packages/core`가 같은 코드를 돈다. T2-4는 LLM 이름을 붙인 단계를 `node.named`로 보내기 전에, T2-5는 화면에 위반과 커버리지를 그릴 때 쓴다.

- 파서를 건너뛸 수 없다. serve가 메모리에서 만든 지도도 같은 파서를 거친다. 파서가 거부한 값(필드가 빠진 노드, `files: null`, 근거 없는 EXTRACTED, EXTRACTED ref를 든 INFERRED 근거, 단계 트리 오류)은 예외 없이 `{ parsed: false, failure }`로 돌아오고, `failure`는 파서의 `MapFailure`(코드와 `at`) 그대로다. 단계 트리, 노드 id 중복, 단계 밖 노드를 잇는 관계는 파서만 본다. 통과하면 `{ parsed: true, map, violations, unverified, checked }`이고, `map`은 검사한 사본이라 호출한 쪽은 넘긴 객체 대신 이것을 보여 준다.
- 결과(`types/mapVerification.ts`): 위반마다 코드, 필드 위치(`at`, 파서 거부와 같은 `levels[1].nodes[0].filePaths[2]` 표기), 단계 번호, 노드 id, 파일 경로, 영어 문장. 코드는 17개이고 `VIOLATION_RULES` 표가 코드마다 규칙 하나(assignment, path, evidence)를 정한다. 검사한 파일·단계·노드·관계·근거 수도 함께 돌려줘서, 빈 지도의 통과와 실제 통과를 구분할 수 있다.
- 확인 안 된 관계(`unverified`): refs가 빈 INFERRED 관계는 ADR-21대로 허용하고 위반으로 세지 않는다. 코드 지도로 맞다 틀리다를 가릴 수 없는 LLM의 주장이라서, 결과에 단계 번호, `at`, 양 끝 노드와 함께 따로 적는다. T2-4·T2-5는 이 관계를 점선으로, 사실이 아닌 주장으로 보여야 한다. 이름으로만 맞춘 ref를 든 INFERRED 관계는 그 ref를 검사하므로 이 목록에 없다(점선인 것은 같다).
- 배정(assignment): 단계가 나누는 범위는 최상위가 `files`에서 `sent`로 적힌 파일(코드 지도에 있는 것만), 나머지 단계가 펼친 노드의 파일이다. 범위의 파일은 그 단계의 노드 하나에만 들어간다. 빠지면 `file-unassigned`, 두 번이면 `file-duplicated`, 범위 밖이면 `file-outside-scope`, 파일 없는 노드는 `node-empty`다. `grouped` 단계에 배정 수가 있거나 `named` 단계에 없으면 `assignment-counts`다. 배정 수 가운데 `leftOut`만 지도에서 다시 셀 수 있다. T0-7 복구는 LLM이 빠뜨린 파일을 미분류 노드 하나에 모으므로, `leftOut`이 0보다 크면 그만큼의 파일을 가진 노드가 있어야 한다(없으면 `assignment-left-out`). `duplicated`, `invented`, `emptied`는 LLM 원답에만 있는 수라 다시 셀 수 없다. T2-4가 다른 복구 방식을 쓰면 이 검사를 함께 바꾼다.
- 경로(path): 지도의 모든 경로(`files`, 노드 파일, 근거의 양 끝)는 정규화한 저장소 기준 경로여야 한다. 빈 문자열, `/`로 시작, 드라이브 문자(`C:`), `\`, `.`·`..`·빈 마디, 제어 문자는 `path-invalid`다. 노드 파일과 근거 끝이 코드 지도에 없으면 `path-unknown`이다. 브라우저 코드 지도는 키 앞에 프로젝트 폴더를 붙이므로(`sample-shop/src/a.ts`) 떼고 비교하고, LLM이 그 폴더를 붙여 쓴 경로는 없는 파일로 본다. 경로는 양쪽 모두 NFC로 바꿔 비교한다. macOS는 한글 파일 이름을 NFD로 돌려주고 LLM은 NFC로 쓰기 때문이다. NFC로 바꾸면 같아지는 코드 지도 파일이 둘이면(Linux는 둘을 따로 둔다) 지도의 경로가 어느 쪽인지 정할 수 없어서 `path-collision`으로 지도를 거부한다. `files`는 코드 지도의 파일을 한 번씩 모두 적어야 하고(`coverage-missing`, `coverage-duplicate`), 읽은 이유(`sent`, `over-budget`, `no-symbols`, `excluded-path`)는 코드 지도에 있는 파일에만 붙는다(`coverage-mismatch`). 노드의 `keySymbols`는 그 노드 파일 가운데 하나가 선언한 심볼 이름이나 점 이름(`Store.load`)이어야 한다(`key-symbol-unknown`). 다른 노드 파일의 심볼은 통과하지 않는다.
- 근거(evidence): 관계마다 근거가 있어야 한다(`evidence-missing`). 근거의 ref 하나하나는 코드 지도의 관계여야 한다. 파일, 줄, 관계 종류, 대상 파일이 같은 위치가 있어야 하고(`evidence-unknown`), 관계의 출발 노드 파일에서 도착 노드 파일로 가야 하며(`evidence-ends`, 양 끝을 모두 본다), 확신도가 코드 지도 후보의 것과 같아야 한다(`evidence-confidence`, 이름으로만 맞춘 INFERRED 호출을 EXTRACTED로 적은 경우). import 문은 `imports_from`(모듈)과 `imports`(가져온 이름, 심볼이면 그 심볼의 파일), re-export는 `re_exports`, 참조 위치는 그 종류(`calls` 등)로 찾는다. 심볼의 파일은 `SymbolId`에서 `#` 앞부분 가운데 코드 지도에 있는 가장 긴 것이다. 파일 이름(`a#b.ts`)이나 심볼 이름(Markdown 제목 `C#`)에도 `#`이 들어갈 수 있어서다. `#`이 없는 id는 어느 파일도 가리키지 않는다. `contains`·`method`는 한 파일 안의 심볼 트리라 두 노드 사이 관계의 근거가 될 수 없어서 `evidence-unknown`이다. 코드 지도의 위치 색인은 근거가 가리키는 파일에서만 처음 쓸 때 만든다.
- 보지 않는 것: `assignment`의 `duplicated`·`invented`·`emptied`(위), 근거가 더 있는데 INFERRED로 적은 관계(낮춰 적은 것은 거짓이 아니라 고치는 쪽, T2-4의 몫).
- 검증: 단위 테스트(`mapVerifier.test.ts`)가 코드마다 실제로 나오는 실수 하나를 고장으로 넣고 정확한 코드와 위치를 본다. 표가 `Record<ViolationCode, …>`라 새 코드에 사례가 없으면 컴파일되지 않는다. #76 검증에서 파서를 건너뛰어 통과하거나 예외를 던졌던 값 네 가지, 한글 NFD 파일 이름, `#`이 든 심볼 id는 회귀 테스트로 남겼다. `node scripts/verifier-mutations.mjs`는 `report(...)` 호출 위치마다 하나씩 끄고(18곳), 조건 13개를 약하게 바꾸고(근거의 출발 끝만 보기, NFC 비교 빼기, 옛 `endFile` 자르기 등), 앱 스토어 import를 하나 넣어 본 뒤 테스트가 실패하는지 본다(32개 변이 모두 잡힘). `packages/core/test/mapVerifier.test.ts`는 정답 픽스처 세 저장소를 Node 코어로 추출해 계층 요약대로 폴더마다 펼친 `grouped` 지도를 만들고(관계 근거는 폴더 사이 import), JSON으로 썼다 파서로 읽은 지도가 위반 0인지, 규칙마다 고장 하나를 넣으면 그 코드가 나오는지 본다.
- PASEO 실측(`e0f545fed`, Apple M4, Node 26, `ROPEMAN_VERIFY_DIR=<폴더> npx vitest run packages/core/test/mapVerifier.test.ts`): 지도 파일 6,171개(건너뜀 2개), 폴더 단계 735개, 노드 1,398개, 관계 1,438개, 근거 ref 12,244개, JSON 5.1MB. 위반 0개. `verifyMap` 한 번이 중앙값 67~73ms(7회씩 3번, 최소 65.5ms, 최대 93.1ms). 파서를 안에서 돌리기 전(#76 첫 커밋)에는 45~54ms였다. 늘어난 약 20ms는 파서의 사본 만들기와 경로 NFC 변환으로 본다(나눠 재지 않은 추정). LLM 호출 하나(수 초)에 비하면 작아서 더 줄이지 않았다. 규칙마다 넣은 고장(파일 중복, `../` 경로, 줄을 바꾼 ref)은 각각 `file-duplicated`, `path-invalid`, `evidence-unknown` 하나로만 잡혔다.

### `ropeman serve` (T2-4)

`npx @ropeman/bridge serve --root <폴더>`는 그 폴더의 지도를 WebSocket RPC(ADR-24)로 내준다. 뷰어가 노드를 펼치면 폴더로 묶은 결정론 단계를 바로 돌려주고, 로컬 CLI(`claude -p`나 `gemini -p`)에게 그 단계의 부분마다 이름을 붙이게 한 뒤, 검증기를 통과한 이름만 `node.named`로 보낸다. LLM은 이름과 설명과 핵심 심볼만 쓰고, 파일이 어느 노드에 드는지와 관계는 결정론 코드가 정한다(A-12).

```
시작 → MapSession.start(): extractDirectory(--root) → groupExtraction() → 폴더마다 fs.watch
map.get            → 최상위 grouped 단계 + 이름이 붙은 단계와 그 위 단계들 (한 트리)
node.expand(id)    → 바로 답: 이름이 있으면 named 단계, 없으면 grouped 단계
                   → grouped였으면 이름 작업 → node.named 푸시 하나 (단계, 또는 코드와 이유)
file.read(path)    → #72 그대로 (루트 안, 실제 .env 거부, 500KB, 연결당 8개)
파일 변경          → 300ms 조용하면 다시 추출 → map.changed { paths } 푸시 → 뷰어가 map.get
```

- 노드 id: `dir:<폴더>`는 하위 폴더, `files:<폴더>`(루트는 `files:.`)는 그 폴더에 바로 든 파일들이다. 단계는 id만으로 다시 만들 수 있어서 다시 추출해도 같은 폴더는 같은 id다. 펼칠 수 있는 것은 `dir:` 노드뿐이고 `files:` 노드는 `unknown-node`로 답한다(파일은 `file.read`로 연다). 관계는 계층 요약의 폴더 사이 import이고 근거 ref는 그 import 줄이다(`packages/core/src/groupedMap.ts`). `files`(커버리지)는 지도의 파일을 `sent`, 건너뛴 파일을 그 이유로 적는다.
- 메시지 처리: 들어온 텍스트는 모두 `parseRpcRequest`가 먼저 읽는다. 거부되면 같은 id와 type(읽을 수 있으면)으로 `code: "bad-request"`를 돌려주고 연결은 유지한다. 모르는 type, JSON이 아닌 텍스트, 필드가 빠진 요청이 다 이렇다. 연결마다 첫 메시지는 `hello`(스키마 버전과 서버 이름·버전)다. 옛 `status: connected` 인사는 없앴다(앱은 그것을 읽지 않았다). 예외: 앱의 Bridge AI 트랙(`bridgeService.ts`)이 보내는 `chat`과 `analyze`·`ping`·`status`는 ADR-24 이전의 중계라 RPC 파서를 거치지 않고 예전대로 처리한다. T2-5가 뷰어를 RPC로 옮길 때 지운다.
- CLI에 보내는 것(그대로): 영어 지시문, 프로젝트 이름(`--root` 폴더 이름), 펼친 폴더 경로, 그리고 부분마다 id, 종류(하위 폴더 또는 바로 든 파일), 파일 수, 파일 경로 최대 12개, 선언한 최상위 심볼 최대 24개(`function add`처럼 종류와 이름. 종류는 function·class·interface·type·variable·service·target·job·resource만), 부분 사이 import 수. 재시도면 지난 답이 거부된 이유(검증기 문장, 최대 20개)가 더해진다. 파일 내용은 한 줄도 보내지 않는다. 실제 값이 든 `.env`는 코드 지도에 없고, 프롬프트를 만들 때 한 번 더 걸러 이름도 나가지 않는다. 설정 파일의 `command`·`key`처럼 값을 담을 수 있는 심볼 종류는 뺐다. 프롬프트는 100,000바이트를 넘지 않는다(넘으면 표본을 반씩 줄인다. Linux가 argv 문자열 하나를 128KiB로 자르므로 `gemini -p <프롬프트>`도 들어간다). 부분이 80개를 넘는 단계는 이름을 붙이지 않고 `naming-failed`로 알린다.
- CLI 실행: `spawn(cli, argv)`이고 셸 문자열을 만들지 않는다. CLI 감지도 `execFile(cli, ['--version'])`이다. `claude`는 `-p --output-format json --no-session-persistence --strict-mcp-config --tools ""`(도구·MCP 서버 없음, 세션 저장 안 함)로 돌리고 프롬프트는 stdin으로 준다. JSON 출력에서 답과 토큰 수를 읽는다. `gemini`는 `-p <프롬프트>`이고 토큰 수가 없다. 작업 폴더는 시작할 때 만든 빈 임시 폴더라, 파일을 읽는 CLI라도 프로젝트 밖에서 시작한다. 한 번에 180초, 출력 1MB를 넘으면 SIGTERM, 2초 뒤 SIGKILL로 멈춘다.
- 검증과 재시도: 답(JSON 객체 하나, 코드 펜스나 앞뒤 문장은 벗겨 읽는다)의 이름을 grouped 단계의 파일·관계 위에 입힌 `named` 단계를 만들고, 최상위부터 그 단계까지 이은 지도를 `verifyMap`에 넣는다. 위반이 없을 때만 보낸다. 답이 JSON이 아니거나, 없는 id를 지어내거나(`node-empty`), 부분을 빠뜨리거나(`file-unassigned`), 그 부분 파일에 없는 심볼을 적으면(`key-symbol-unknown`) 그 이유를 붙여 한 번 더 묻는다. 두 번 다 실패하면 폴더 이름을 그대로 두고 `verification-failed`와 이유를 보낸다. CLI가 없거나(`no-cli`), 실패·시간 초과면(`naming-failed`) 다시 묻지 않는다. `named` 단계의 배정 수는 모두 0이다. 파일을 LLM이 나누지 않으므로 빠뜨린·중복·지어낸 파일이 생길 수 없다.
- 이름 보관: 노드마다 마지막으로 통과한 이름을 서버 메모리에 둔다. 파일이 바뀌어 다시 추출하면 새 지도에서 다시 검증하고, 통과하면 그대로 쓴다. 새 하위 폴더가 생기거나 핵심 심볼이 사라져 통과하지 못하면 버리고, 다음 `node.expand`가 다시 묻는다. 디스크에는 쓰지 않는다.
- 상한과 취소: 이름 작업은 서버 전체에서 동시에 2개, 연결마다 기다리는 것 4개까지다(넘으면 `node.expand`가 `busy`). 두 연결이 같은 노드를 펼치면 CLI는 한 번 돌고 둘 다 푸시를 받는다. 기다리는 연결이 모두 닫히면 대기열에서 빼거나 CLI를 멈추고, 아무것도 보내지 않는다. 메시지 크기는 `MAX_MAP_BYTES`(16MiB)다.
- 파일 감시: Node 내장 `fs.watch`를 추출이 순회한 폴더마다 하나씩(비재귀) 건다. 순회가 이미 건너뛰기 규칙을 적용했으므로 `node_modules`와 숨은 폴더는 처음부터 감시하지 않는다. 재귀 감시(`recursive: true`)는 Linux에서 `node_modules`까지 모든 하위 폴더에 inotify 감시를 걸어서 쓰지 않았다. 폴더마다 거는 방식은 macOS, Linux, Windows에서 같게 동작한다. 이벤트 경로도 같은 규칙(`shouldSkipPath`, 실제 `.env`)으로 거른다. 마지막 이벤트 뒤 300ms 조용하면 전체를 다시 추출하고 그동안 모인 경로를 `map.changed`로 보낸다. 추출 중에 온 이벤트는 끝난 뒤 한 번 더 추출한다. 새로 생긴 폴더는 그 추출이 순회한 뒤부터 감시한다. 감시 라이브러리(chokidar 등)는 넣지 않았다. 폴더마다 감시를 거는 데 필요한 것이 `fs.watch`에 다 있고, 건너뛰기 규칙은 순회와 같은 코드를 써야 해서 라이브러리의 무시 규칙이 이점이 없다.
- 번들: `bridge/vite.config.ts`가 `server.ts`부터 코어(`packages/core`), 파서, 검증기, `web-tree-sitter`까지 ES 모듈 하나(`dist/server.mjs`, 약 340KB)로 묶고 `$lib` 별칭을 푼다. 문법 `.wasm` 20개는 `dist/wasm/`에 복사한다. 런타임 의존성은 `ws` 하나다. `npm pack`이 `prepack`으로 빌드한다. 타입 검사는 `npm run check:bridge`(`npm ci --prefix bridge` 뒤, `@types/ws`가 거기 있다). 패키지 0.3.0은 아직 npm에 올리지 않았다(배포는 사용자 승인).
- 검증: `bridge/test/serve.test.ts`가 임시 프로젝트에 `serve`를 띄우고 WebSocket으로 `map.get → node.expand → node.named → file.read → 파일 수정 → map.changed`를 돈다. 받은 메시지는 모두 뷰어의 `parseServerMessage`로 읽고, `map.get` 결과는 새로 추출한 코드 지도로 `verifyMap`해 위반 0을 본다. 가짜 CLI(`test/fixtures/fake-cli.mjs`)가 계획대로 답해서 재시도, 두 번 실패, CLI 오류, 시간 초과, 연결이 닫힐 때 CLI 종료, 두 연결의 작업 공유, `busy`, `no-cli`, 잘못된 메시지를 본다. 가짜 CLI가 받은 stdin에는 파일 경로와 심볼 이름이 있고, 함수 본문 문자열과 `.env` 값과 `.env` 이름은 없다. CI는 번들을 빌드해 `scripts/smoke.mjs`로 픽스처 한 바퀴를 돈다.
- PASEO 실측(`e0f545fed`, Apple M4, Node 26, 2026-11-13, `ROPEMAN_SERVE_DIR=<폴더> ROPEMAN_SERVE_NODE=<id> npx vitest run bridge/test/realCli.test.ts`, 실제 `claude -p` 2회): 첫 추출 7.1~7.7초(지도 6,171개). 추출이 끝난 뒤 `node.expand`의 grouped 답은 프로세스 안에서 1ms 이하, 소켓 너머(번들, 가짜 CLI)로 21ms다. `dir:packages`(부분 11개, 프롬프트 16,286바이트)는 이름이 15.7초 뒤에 왔고 토큰은 입력 11,281(캐시 포함), 출력 1,651이었다. `dir:packages/server`(부분 3개, 4,148바이트)는 5.3초, 입력 2 + 캐시 읽기 649 + 캐시 쓰기 5,690, 출력 336, $0.0528(CLI가 보고한 값, 사용자 기본 모델)이다. 두 번 다 첫 답이 검증을 통과했고, 그 지도를 새로 추출한 코드 지도로 다시 검증해도 위반 0이다. 이름이 오는 시간은 출력 토큰 수와 함께 늘어서(1,651개 15.7초, 336개 5.3초) 모델 생성이 대부분으로 본다(나눠 재지 않은 추정). 서버는 추출 뒤 쉬는 동안 CPU 0%, RSS 약 976MB이고, 다시 추출하는 동안에는 이전 지도를 들고 있어 그보다 커진다(재지 않음). 증분 갱신은 이 단계에 넣지 않았다(A-13 SQLite).

### Phase 3: 재귀적 드릴다운

```
노드 더블클릭
→ 캐시 확인 (hasCachedLevel)
  ├─ 캐시 있음: 즉시 드릴다운 (팝업 없이)
  └─ 캐시 없음: DrilldownConfirmModal (skipDrilldownConfirm 설정 존중)
→ 해당 영역 파일들의 sub-skeleton 추출 (최상위와 같은 바이트 예산. 넘치면 심볼이 많은 파일부터 담고, 안 들어가는 파일은 건너뛰어 더 작은 파일로 채운다. 남긴 파일은 노드 순서대로 보낸다. 한 파일도 안 들어가면 가장 작은 파일 하나를 예산을 넘겨서라도 보내고 `exceedsBudget`으로 표시한다. 그래야 드릴다운이 막히지 않는다)
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

Bridge는 로컬 CLI를 실행한다. RPC의 이름 작업은 서버가 만든 프롬프트로, 옛 `chat` 중계는 받은 프롬프트로 돌린다. 그래서 연결을 받기 전에 네 가지를 검사한다(`bridge/src/auth.ts`).

- `127.0.0.1`에만 바인딩한다.
- `Host` 헤더가 `127.0.0.1:{port}`나 `localhost:{port}`여야 한다. 소켓 연결과 모든 HTTP 요청에 똑같이 적용한다. 공격자가 자기 도메인을 127.0.0.1로 돌려도(DNS 리바인딩) Host에는 그 도메인이 실리므로 거부된다.
- Origin 허용 목록을 확인한다. 기본은 `https://ropeman.dev`과 로컬 개발 서버이고, `--allow-origin`으로 더할 수 있다.
- 소켓 URL의 `?token=`을 확인한다. 토큰은 `--token`, `ROPEMAN_BRIDGE_TOKEN`, `~/.ropeman/bridge-token` 순서로 정한다. 직접 준 토큰이 16자보다 짧으면 시작하지 않는다. 토큰 파일은 시작할 때마다 0600으로 맞춘다.

클라이언트가 보낸 `cli` 값은 `claude`나 `gemini`일 때만 실행한다. 클라이언트(`bridgeService.ts`)는 `ws://127.0.0.1:{port}/?token=`으로 연결하고, 토큰은 `settingsStore.bridgeToken`에 저장한다.

`file.read`는 `--root`로 준 디렉터리 안의 파일 하나를 읽어 내용, sha-256, 바이트 크기를 돌려준다. 메시지 모양은 `types/ropemanMap.ts`에 있다(ADR-24). `--root`가 없으면 꺼져 있다. 절대 경로, 루트를 벗어나는 경로(`..`이나 루트 밖으로 풀리는 심볼릭 링크), 실제 값이 든 env 파일(앱의 `isEnvValueFile`과 같은 규칙, 대소문자 무시), 500,000바이트를 넘는 파일은 거부하고 이유 코드(`outside-root` 등)를 돌려준다(`bridge/src/fileRead.ts`).

로컬 모드(`--viewer <dir>`)에서는 같은 포트가 그 디렉터리를 `http://127.0.0.1:{port}/`로 서빙하고, 그 출처(`http://127.0.0.1:{port}`, `http://localhost:{port}`)를 Origin 허용 목록에 더한다. 페이지와 소켓이 같은 출처라 혼합 콘텐츠 차단과 로컬 네트워크 권한 창이 없다. 토큰은 주소의 해시(`#token=`)로 넘겨 서버 로그나 Referer에 남지 않게 한다. 전달 방식의 근거와 브라우저별 실측은 [ADR-23](./adr/0023-bridge-first-delivery.md)에 있다.

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

### 디자인 토큰과 포커스 링

- 색 토큰은 `src/lib/styles/global.css` 맨 위 `:root`(라이트)와 `[data-theme='dark']`(다크)에 있다. 이름은 astryx 색 역할 문법을 따른다. 예: `--color-background-surface`, `--color-text-secondary`, `--color-on-accent`.
- 상태 색은 쓰이는 표면마다 역할이 따로 있다. 페이지 위 글자는 `--color-text-error`, 진한 채움은 `--color-error`와 그 위 글자 `--color-on-error`, 옅은 채움은 `--color-error-muted`와 그 위 글자 `--color-on-error-muted`다. 점·아이콘은 `--color-icon-*`, 테두리는 `--color-border-*`를 쓴다.
- 노드 종류(`--color-directory` 등)와 AI 트랙(`--track-*`)은 Ropeman 고유 범주 색이라 이름을 유지한다. 엣지 범례(`--color-edge-*`)도 범주 색이다. `semanticGraphBuilder.ts`는 캔버스 선과 화살촉을 `var(--color-edge-*)`로 그린다. 그래서 테마 블록에서 이 토큰을 다시 정의하면 선과 범례가 함께 바뀐다. 지금은 두 테마가 같은 값이라 `:root`에만 있다. 선, 화살촉, 범례가 같은 토큰을 가리키는지 `tokens.test.ts`가 검사한다.
- 포커스 링은 전역 `:focus-visible` 규칙 하나가 `--focus-outline-*` 토큰으로 그린다. 잘리는 스크롤 컨테이너 안에서는 요소에 `--focus-outline-offset: -2px`를 준다. 컴포넌트에서 `outline: none`을 쓰려면 같은 요소나 감싸는 요소가 링을 대신 그려야 한다.
- 척도 토큰도 같은 `:root`에 있다. 값은 astryx core를 따른다.
  - 간격 `--spacing-N`은 N × 0.25rem(4px 격자)이다. 1px 선과 48px보다 큰 간격은 숫자로 둔다.
  - 글자 크기 `--font-size-xs`~`4xl`은 14px(`base`)을 기준으로 한 rem 척도(10·12·14·17·20·24·29·35px)이고, 굵기는 `--font-weight-normal`·`medium`·`semibold`·`bold`다. 줄 간격은 토큰으로 묶지 않는다. 한글 문단에는 astryx 본문 줄 간격 1.4286이 좁기 때문이다. 아이콘 글리프의 글자 크기는 척도 검사에서 빠진다. 선택자의 마지막 부분에 `material-symbols`로 시작하거나 `-icon`, `-chevron`, `-spinner`로 끝나는 클래스가 있어야 글리프로 본다.
  - 반경은 역할로 고른다. `--radius-inner`(4px, 배지·kbd), `--radius-element`(8px, 버튼·입력란), `--radius-container`(12px, 카드·모달), `--radius-full`(알약·스크롤바 손잡이)이다.
  - 그림자는 `--shadow-low`·`med`·`high` 3단계이고 다크 모드에서 다시 정의한다. 바닥이나 옆에 붙은 시트의 방향 그림자는 그대로 둔다.
  - 동작은 `--duration-fast`(125ms)·`--duration-medium`(300ms)과 `--ease-standard`다. 계속 도는 스피너는 토큰을 쓰지 않는다. 동작 줄이기 설정에서는 전역 규칙이 모든 전환과 애니메이션을 즉시 끝낸다.
  - 그래프 노드 내부(`src/lib/components/nodes/`, xyflow 노드·엣지 규칙)는 dagre가 px로 배치하므로 px를 쓴다. 아이콘 글리프 크기는 글자 척도가 아니라서 px로 둔다.
- `src/lib/styles/tokens.test.ts`가 다섯 가지를 검사한다. 두 모드의 WCAG AA 대비 하한, 정의되지 않은 `var()` 참조, 쓰이지 않는 전역 토큰, 스타일 블록 안의 색 리터럴, 척도 토큰 대신 쓴 px·rem 글자 크기와 반경이다. 새 색이나 크기가 필요하면 토큰을 먼저 추가한다.
- 값의 출처와 라이선스는 `global.css` 머리 주석과 `LICENSES/astryx-MIT.txt`에 있다. 패키지를 쓰지 않고 값을 옮긴 이유와 값마다 고른 안은 [ADR-22](adr/0022-astryx-tokens-without-package.md)에 있다.

---

## 6. 아키텍처 결정 기록 (ADR)

결정 기록은 [`adr/`](./adr/README.md)에 파일별로 있다.

---

## 7. 제약 사항

- **브라우저 전용**: Chromium 기반 (비-localhost는 fallback input)
- **파일 제한**: MAX_FILES=2000, MAX_FILE_SIZE=500KB. 값은 `filePriority.ts` 한 곳에 있다.
  - 상한은 순회 순서가 아니라 순위로 건다. 로컬 폴더, fallback input, GitHub가 같은 `rankFiles()`를 쓴다.
  - 순위는 세 묶음이다. 코드와 지침 파일, 그다음 테스트와 일반 문서, 그다음 읽는 파서가 없는 파일 순이다. 설정 파일 네 형식은 코드와 같은 첫 묶음이다.
  - 묶음 안에서는 폴더마다 차례로 한 파일씩 고른다. 큰 패키지 하나가 상한을 다 써서 다른 패키지가 통째로 빠지는 일을 막는다.
  - 잘린 파일은 이유(`file-limit`, `file-size`, `total-size`)와 함께 `projectStore.cutFiles`에 남는다. 로컬 폴더는 남긴 파일의 핸들만 다시 받는다.
  - `fileSystemService`는 스토어에 쓰지 않고 `{ tree, cut }`을 돌려준다. 스토어 쓰기는 `Dropzone.svelte`와 `+page.svelte`가 한다. 파일이 하나도 남지 않은 폴더는 트리에서 빠진다.
  - `githubLoader.loadGitHubRepo()`도 `cutFiles`에 쓰지 않고 `{ cut }`을 돌려준다. 같은 두 컴포넌트가 받아서 쓴다. 트리와 파싱 진행률은 받는 대로 보여야 해서 로더가 직접 쓴다.
- **AST 파싱**: 14개 언어 tree-sitter WASM (Python, JS, TS, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala), 설정·스크립트 4형식(YAML, TOML, JSON, Bash)
  - 문법 WASM은 `static/`에 커밋한다. 언어별 파일은 `languageDetector.getGrammarFile()`이 고른다. `.tsx`는 언어는 TypeScript 그대로 두고 JSX를 읽는 `tree-sitter-tsx.wasm`(`tree-sitter-wasms` 0.1.13)으로 파싱한다. `.ts`는 `<T>value` 캐스트를 JSX로 오인하지 않도록 `tree-sitter-typescript.wasm`을 유지한다
  - 문법이 없는 설정 파일 네 형식은 `configParsers.ts`의 줄 단위 파서가 읽는다(Understand-Anything의 비코드 파서 방식). `sourceExtraction.parseSource()`가 `LINE_PARSERS` 표(Markdown 포함)에서 골라 워커를 띄우지 않고 부른다. Node 추출도 같은 함수를 부른다. 형식은 `languageDetector.detectConfigLanguage()`가 파일 이름으로 정한다. 확장자 표가 먼저라서 `Dockerfile.ts`는 TypeScript다
    - Dockerfile(`Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `Containerfile`): FROM부터 다음 FROM까지가 `stage`이고, 자식으로 EXPOSE `port`와 ENTRYPOINT·CMD `command`를 둔다. 베이스 이미지와 COPY·ADD 원본 경로는 `import`다. `COPY --from`과 앞 단계를 가리키는 FROM, `scratch`는 import가 아니다. 이어 쓰기(`\`, `# escape=`), 이어 쓰기 안의 주석, `RUN <<EOF` 본문을 건너뛴다
    - Terraform(`.tf`): 최상위 resource·data·module은 `resource` 종류에 주소 이름(`aws_s3_bucket.logs`, `data.aws_ami.ubuntu`, `module.vpc`), variable은 `input`, output은 `output`이다. 줄 범위는 짝 맞는 중괄호까지이고, 문자열·`${}` 안·주석·heredoc의 중괄호는 세지 않는다. module의 `source`는 `import`다. provider·locals·terraform 블록과 `.tfvars`(값만 있다)는 읽지 않는다
    - env 템플릿(`.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.defaults`, 마지막 접미사가 이 다섯이면 `.env.local.example`도): 키마다 `env` 심볼 하나다. 실제 값이 든 env 파일(`.env`, `.env.local`, `.env.production` 등)은 언어를 붙이지 않으므로 로컬 폴더와 GitHub 모두 내용을 열지 않는다. 트리에는 남기고 커버리지에 `env-values`(건너뜀)로 보인다. 값을 보고 키를 가려내는 규칙이 계속 새어서, 비밀값이 들어올 파일을 아예 읽지 않기로 했다. 템플릿에서도 키는 `^[A-Z_][A-Z0-9_]*$`만 읽는다. 붙여 넣은 base64·PEM·JWT 조각은 대소문자가 섞여 있어서다. 소문자 키와 점이 든 키는 잃는다. 값은 따옴표가 닫히는지만 보고 심볼에 넣지 않는다. 여러 줄 값(PEM 키) 안의 줄은 키로 읽지 않는다. 따옴표 없는 값이 다음 줄로 넘친 경우(붙여 넣은 PEM, 줄바꿈된 base64)도 같다. 키 다음 줄이 대문자 `KEY=` 대입이 아니거나, 키보다 깊게 들여 써 있거나, 앞 줄이 `\`로 끝나면 빈 줄이나 주석까지를 그 키의 값으로 본다. 이 규칙은 진짜 키를 놓칠 수는 있어도 값 글자로 키를 만들지는 않는다. `KEY: value` 형식과 값이 `=`로 시작하는 줄(`QQ==`)은 키로 읽지 않는다. `.env*`는 숨김 파일이지만 `filePriority`가 경로 필터에서 남긴다(`languageDetector.isEnvFile()`). `*.env`와 `.envrc`는 읽지 않는다
    - Makefile(`Makefile`, `makefile`, `GNUmakefile`, `*.mk`): 규칙 대상마다 `target`이고 마지막 레시피 줄까지가 범위다. 선행 조건은 자식 `import`다. 패턴 규칙(`%.o: %.c`)과 정적 패턴 규칙, 여러 대상 규칙을 읽는다. `include`는 파일 `import`다. 변수 대입, `define` 본문, 대상별 변수, `.PHONY` 같은 특수 대상은 규칙이 아니다
    - YAML(`.yml`, `.yaml`), TOML(`.toml`), JSON 매니페스트(`package.json`, `composer.json`, `tsconfig*.json`, `jsconfig*.json`), Bash(`.sh`, `.bash`)는 `tree-sitter-wasms`의 문법으로 워커에서 읽고, `configOutline.ts`의 `CONFIG_OUTLINES` 표가 트리를 심볼로 바꾼다. 언어는 `detectConfigLanguage()`가 정하므로 전송 언어는 `yaml`, `toml`, `json`, `bash`다. 이름은 매핑 키, 테이블 머리, 함수 이름에서만 온다. 값이 이름이 되는 곳은 형식이 참조로 정한 자리(이미지, action, 패키지, 경로, 포트, Kubernetes 객체의 kind와 name)뿐이고, 공백이 없을 때만이다. env 값, Secret data 값, step 명령, 버전은 읽지 않는다. 문법 오류가 있는 YAML 문서는 통째로 건너뛴다. 오류 복구가 깨진 값을 키로 읽을 수 있어서다
      - YAML: 문서마다 최상위 키가 `key`다. `apiVersion`과 `kind`가 있는 문서는 Kubernetes 객체 하나로, `Kind/name` 이름의 `resource`에 컨테이너 이미지 `import`와 `data`·`stringData` 키(`key`)를 자식으로 둔다. `.github/workflows/` 아래 파일은 `jobs` 키에 job마다 `job`, 그 자식으로 `uses`(`import`)와 env 키(`env`)를 둔다. `env` 키는 env 키를 자식으로 둔다. `compose.yaml`, `docker-compose*.yml`은 `services` 키에 서비스마다 `service`, 그 자식으로 image·build context(`import`), ports(`port`), depends_on(`import`), environment의 매핑 키(`env`)를 둔다. `- KEY=value` 목록 형식은 키와 값이 한 스칼라라서 읽지 않는다. block scalar(`|`, `>`) 안의 줄은 키가 아니다
      - TOML: 최상위 키가 `key`, `[table]`과 `[[table]]`이 `table`이다. 의존성 테이블(`[tool.poetry.dependencies]`, Cargo `[dependencies]`)은 키마다, PEP 508 목록(`[project] dependencies`, `[build-system] requires`, `[project.optional-dependencies]`)은 패키지 이름마다 `import`다. 버전과 URL은 읽지 않는다. scripts 테이블은 진입점마다 `target`이다
      - JSON은 매니페스트만 읽는다. 최상위 키가 `key`이고, 의존성 객체(`dependencies`, `devDependencies`, `require` 등)는 패키지마다 `import`, `scripts`는 스크립트마다 `target`, tsconfig의 `extends`와 `references[].path`는 `import`다. 그 밖의 `.json`은 데이터라서 언어를 붙이지 않고 커버리지에 `data-file`(건너뜀)로 보인다
      - Bash: 최상위 함수가 `function`, `source x.sh`와 `. x.sh`가 첫 인자까지의 `import`다. 명령 이름과 셸이 실행하는 스크립트(`bash deploy.sh`)는 ref(`refQueries.ts`)다
      - 잠금 파일(`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `Cargo.lock`, `uv.lock` 등, `languageDetector.isLockfile()`)은 언어를 붙이지 않고 커버리지에 `lockfile`(건너뜀)로 보인다
      - web-tree-sitter 0.25가 내보내지 않는 함수를 import하는 문법은 그 함수를 처음 부를 때 파싱이 죽는다. `tree-sitter-wasms`의 YAML 스캐너는 C++이라 `operator new`·`delete`를 부르고(모든 YAML), Bash 스캐너는 `[[ a == b ]]`에서 `isalpha`를 부른다. `scripts/alias-grammar-imports.mjs`가 이 import 이름을 런타임이 가진 같은 인자의 함수(`malloc`·`free`·`abort`, `iswalpha`)로 바꾼 사본을 `static/`에 쓰고, 테스트가 그 사본이 원본에서 다시 만든 것과 같은지 확인한다
      - 경로 필터는 `.github/workflows`, `.github/actions`, `.gitlab-ci.yml`, `.circleci`를 숨김 폴더여도 기본으로 남기고, 코드 구조 요약의 제외 경로 규칙보다 우선한다. 파일 수 상한 순위에서 YAML·TOML·JSON은 테스트와 같은 띠에 둔다. 매니페스트 폴더가 코드를 밀어내지 않게 하려는 것이다. Bash는 코드와 같은 띠다
    - 새 종류는 모두 전송 종류다(`ast.ts`의 `CONFIG_SYMBOL_KINDS`). 설정 파일에만 나오므로 기존 파일의 전송 바이트는 그대로이고(`skeletonWire.test.ts`), 심볼이 없는 설정 파일은 `no-symbols`로 빠진다. 전송 언어 이름은 `dockerfile`, `terraform`, `dotenv`, `makefile`이다. 형식마다 자기 용어를 쓰므로 프롬프트 규칙은 더하지 않았다.
  - `.svelte`·`.vue`는 전용 문법 없이 `<script>` 블록(`context="module"`, `module`, `setup` 포함)을 TS/JS로 읽는다. `sfcScripts.componentScriptSource()`가 블록 밖의 글자를 공백으로 바꾸고 줄바꿈은 남겨서, 심볼 줄 번호가 원본 파일 줄과 같다. 문법은 블록의 `lang`(`ts`, `tsx`, 없음 = JS) 중 가장 넓은 것을 `getGrammarFile()`로 고른다. 템플릿과 스타일은 읽지 않는다. JSON-LD처럼 코드가 아닌 `type`과 모르는 `lang`(예: `coffee`)의 블록은 건너뛴다
- **코드 구조 요약 크기**: 기본 250KB (50-1000KB 범위, 1KB = 1000바이트). 보내는 압축 JSON 전체(바깥 필드 포함)로 잰다
  - 경고는 `requestBudget.ts`가 실제로 보낼 프롬프트(시스템 + 사용자, `topLevelPrompt()`)로 잰다. 데모는 POST 본문(JSON 이스케이프 포함)이 300KB를 넘으면 경고한다(측정 안 함, 모델당 40초 제한. 기본 250KB 스켈레톤이 본문으로 약 15% 커지는 만큼 여유를 둠). BYOK는 고른 프로바이더·모델의 컨텍스트 창(`aiProviders.ts` 표, 출처는 주석)에서 출력 예약(Gemini·OpenAI 16,384, Anthropic 4,096)을 뺀 값과 비교한다. 표에 없는 모델은 128K로 가정하고 그렇다고 알린다. 토큰 수는 1토큰 = 4바이트로 어림한다 (PASEO 측정 4.2)
  - 하위 분석(`extractSubSkeleton`)도 같은 예산을 쓴다. 최상위는 첫 초과 파일에서 멈추고, 하위 분석은 초과 파일을 건너뛰며 하나도 안 들어가면 가장 작은 파일 하나를 보낸다. 예산 안에 들면 보내는 문자열은 예산 도입 전과 같다(캐시 키 유지). 예산으로 빠진 파일은 배정 대상(부모 노드의 filePaths)에는 남으므로 그 단계의 미분류 노드로 간다
- **정적 분석만**: 런타임 동작 분석 불가
- **Edge Worker**: Gemini API 지역 제한 → placement hint 필요
- **WebGPU**: Chrome 113+ / Edge 113+ 필요, ~900MB 모델 다운로드
- **빌드: web-llm 리터럴 스캔 우회**: `vite.config.js`의 `webllmSkipLiteralScan`(워커 빌드 전용 플러그인)이 `@mlc-ai/web-llm/lib/index.js` 안의 JSDoc 예제 `new URL('./worker.ts', import.meta.url)`를 같은 길이의 공백으로 바꾼다
  - 이유: 이 주석 하나 때문에 vite의 `vite:worker-import-meta-url`과 `vite:asset-import-meta-url`이 6.5MB 파일 전체에 `stripLiteral`(js-tokens 정규식)을 돌린다. 파일에는 토크나이저 wasm을 담은 약 97만 자짜리 base64 문자열이 있다
  - V8은 한 프로세스가 정규식 코드를 1MB 넘게 만들고 실행 메모리가 16MB를 넘으면 새 정규식을 최적화 없이 컴파일한다 (V8 14.6 `regexp.cc`의 `TooMuchRegExpCode`). 최적화 없는 문자열 정규식은 그 base64 문자열에서 백트랙 스택을 넘겨 `Maximum call stack size exceeded`를 낸다. 빌드 중 언제 컴파일되느냐에 따라 갈려서 약 10번에 1번 빌드가 실패했다 (2026-11-12 측정: 30회 중 3회, Node 26.4). 오류는 바깥 파일 이름인 `webllmService.ts`로 찍힌다
  - 주석은 minify에서 어차피 빠지므로 결과 워커 파일은 바이트 단위로 같다. web-llm이 다른 곳에서 `import.meta.url`을 쓰기 시작하면 플러그인이 빌드를 실패시킨다. 그때는 플러그인을 고친다
  - 재현과 회귀 확인: `node --no-regexp-optimization node_modules/vite/bin/vite.js build`. 플러그인이 없으면 매번 실패하고, 있으면 통과한다

---

## 8. 배포

Pages 프로젝트 `ropeman`은 직접 업로드 방식이라 GitHub과 연결되어 있지 않다. 운영 배포는 `ci.yml`의 `deploy` job이 맡는다.

```
PR        → ci job (lint, svelte-check, build, core·bridge 번들 확인, unit, worker tests, e2e)
main push → ci job (lint, svelte-check, build, core·bridge 번들 확인, unit, worker tests)
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

---

## 9. 테스트

- 단위 테스트는 vitest로 `src/**/*.test.ts`를 돈다. 파서 워커 테스트는 `web-tree-sitter`의 wasm 경로를 `static/`으로 바꿔 Node에서 실제 문법으로 파싱한다.
- E2E는 Playwright로 `tests/*.spec.ts`를 돈다. 로컬 폴더는 `?testDir=<절대 경로>`로 연다. dev 서버 미들웨어(`scripts/vite-dev-fs-plugin.js`)가 폴더를 훑고 파일을 읽어 주고, `testLoader.ts`가 파싱한다.

### 추출 정답 그래프

`tests/fixtures/graphs/`에 import·호출 관계를 손으로 적은 작은 저장소 세 개가 있다. TS 모노레포(워크스페이스, tsconfig paths, `$lib`, 배럴, 동적 import, 순환 import), SvelteKit 앱 조각, Python 패키지다. 형식, 정답 규칙, 기준선 갱신 방법은 그 폴더의 `README.md`에 있다.

- 정답: `<저장소>.truth.json`. 관계 하나가 종류, 파일, 줄, 대상이다. 대상은 SymbolId에서 root를 뗀 문자열이다.
- 채점: `services/codeMapScore.ts`의 `scoreCodeMap(map, truth)`가 종류마다 precision, recall, siteRecall(대상과 상관없이 그 줄에 위치가 있는 비율)과 놓친 관계를 낸다. 순수 함수이고 입력은 `CodeMap`이라 파서, 해석기, graph.json 어댑터 결과를 같은 방식으로 잰다.
- 기준선: `codeMapScore.fixtures.test.ts`가 `?testDir=` 로더와 같은 스캐너(`scanDirectory`)로 파일을 읽어 지금 추출기로 코드 지도를 만들고 `baseline.json`보다 낮아진 값이 있으면 실패한다. 점수가 오르면 `UPDATE_GRAPH_BASELINE=1`로 다시 기록해 같은 PR에 넣는다.
- 저장소 코드는 eslint, prettier, svelte-check에서 뺐다. 포매터가 줄을 옮기면 정답이 틀어진다.
- PASEO 비교(T1-12): `scripts/paseo-comparison/`이 Ropeman 추출과 Graphify `graph.json`을 같은 프롬프트로 바꿔 모델에 넣고 결과를 결정론 검사로 잰다. 방법과 숫자는 `docs/measurements/2026-11-13-paseo-graphify-comparison.md`에 있다. 검사 함수의 테스트는 `comparison.test.ts`이고 루트 `npm run test:unit`에 들어간다.
- Graphify 점수: `tests/fixtures/graphify/`에 세 저장소를 Graphify 0.9.104로 읽은 `graph.json`과 손으로 쓴 `hand.graph.json`이 있다. `graphifyAdapter.test.ts`가 어댑터 결과를 같은 정답으로 채점해 기록한 값과 같은지 본다. 만든 방법과 점수는 그 폴더의 `README.md`에 있다.
