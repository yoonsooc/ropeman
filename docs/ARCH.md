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
│   │   ├── skeletonExtractor.ts      # AST → 스켈레톤 v2 → LLM 전송용 코드 구조 요약 (suffix 매칭). select*는 뺀 파일과 이유도 돌려준다
│   │   ├── importResolver.ts         # 코드 지도의 import 위치를 파일·심볼·패키지에 연결 (상대 경로, tsconfig paths, 워크스페이스, $lib, Python)
│   │   ├── codeMapScore.ts           # 코드 지도를 정답 그래프(`tests/fixtures/graphs/`)와 비교해 관계 종류별 precision·recall과 놓친 관계를 낸다
│   │   ├── coverageService.ts        # 파일마다 분석에서의 행방(보냄, 안 보냄, 잘림, 건너뜀, 못 읽음)과 단계별 배정 수
│   │   ├── requestBudget.ts          # 보내기 전 크기 검사: 데모 요청 본문 바이트, BYOK 모델별 토큰 한도
│   │   ├── markdownOutline.ts        # Markdown → frontmatter·제목·링크 심볼 (tree-sitter 없이)
│   │   ├── semanticGraphBuilder.ts   # 시맨틱 노드 → SvelteFlow 변환
│   │   ├── fileSystemService.ts      # File System Access API 래퍼
│   │   ├── parserService.ts          # Web Worker 통신 (parseFile, parseAllFiles → { astMap, skipped })
│   │   ├── graphBuilder.ts           # FileNode → GraphNode/Edge (fallback, import 관계 없음)
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
│   │   ├── parserWorker.ts           # tree-sitter WASM 파싱
│   │   ├── refQueries.ts             # 문법별 tree-sitter 쿼리: 호출, 동적 import, 클래스 상속 위치
│   │   └── webllmWorker.ts           # WebLLM 모델 초기화 + 추론
│   │
│   ├── types/
│   │   ├── ast.ts                    # ASTSymbol, ASTRef (파서가 읽은 참조 위치)
│   │   ├── semantic.ts               # SemanticNode, SemanticEdge, SemanticLevel
│   │   ├── skeleton.ts               # SkeletonPayload (AI에 보내는 형식, v1에 고정)
│   │   ├── codeMap.ts                # 스켈레톤 v2: 줄 범위, import·참조 위치와 후보 대상, 관계 출처, 역할 관계의 근거. 브라우저에만 둔다 (ADR-21)
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
│       ├── languageDetector.ts       # 확장자 → 언어 매핑 (dev 전용 `?testDir=` 스캐너 `scripts/vite-dev-fs-plugin.js`도 이 표를 쓴다)
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
→ { astMap, skipped } 반환. 호출한 쪽이 projectStore.astMap과 projectStore.parseSkips(크기 초과, 파서 오류, 열지 못한 파일)에 쓴다
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
  - 아직 `parserService`는 `refs`를 버린다. 코드 지도를 화면에 잇는 작업이 파일별 `refs`를 모아 `buildCodeMap`에 넘긴다.
  - 비용(PASEO, Node, 워커 코드 그대로, 5회 교차 실행 중앙값): `.ts` 4,415개 3.96초 → 5.34초(+35%), `.tsx` 870개 0.59초 → 0.78초(+33%). 늘어난 시간의 대부분은 쿼리가 트리를 도는 WASM 시간이다(호출 패턴 하나만 돌려도 약 1.0초). 읽은 위치는 `.ts`에서 404,435개, `.tsx`에서 39,711개다.
- 워커는 파일마다 트리를 다 쓰면 `tree.delete()`로 WASM 메모리를 돌려준다. 돌려주지 않으면 한 워커가 PASEO `.ts`를 두 번 반 읽는 동안(약 10,000개) 힙이 차서 그 뒤 모든 파일이 실패했다.
- import 해석 (`importResolver.ts`, 순수 함수): `configs`는 `isResolverConfig()`가 고르는 설정 파일(tsconfig·jsconfig, package.json, pnpm-workspace.yaml, svelte.config)의 원문을 astMap 키로 담는다. `readResolverConfig()`가 이를 규칙으로 바꾸고 `resolveImports()`가 import 위치의 모듈 대상과 이름별 대상만 바꾼다.
  - TS/JS·Svelte·Vue: 상대 경로(확장자 추가, `/index`, 적힌 `.js`→`.ts`, `.d.ts`), SvelteKit `$lib`·`kit.alias`(svelte.config가 없으면 `src/lib`), 가장 가까운 tsconfig의 `paths`·`baseUrl`(`extends` 포함, `tsconfig.json`이 없는 폴더는 `tsconfig.*.json`을 합친다), 워크스페이스 패키지(`exports`·`main`·`types`, `dist/` 경로는 tsconfig `outDir`→`rootDir`로 소스에 되돌린다) 순서로 찾는다. 나머지 이름은 외부 패키지다.
  - Python: 상대 import, 패키지 루트(`__init__.py`가 시작되는 폴더) 기준 절대 import, `from pkg import mod`의 하위 모듈. 루트 여러 곳에서 찾으면 후보 여럿(INFERRED)이다.
  - 다른 언어의 import는 `pending`으로 남는다. 못 찾은 import는 `unresolved`이고, `resolveImports()`의 `outcomes`가 규칙과 이유(`no-file`, `no-entry`, `outside-root`, `unparsed`)를 함께 준다.
  - 이름별 대상은 대상 파일의 최상위 심볼(기본 export는 `export_default` 배지)에서 찾는다. 없으면 그 파일의 import와 재수출(`export … from`, `export *`)을 따라가 선언한 파일까지 간다(배럴 `index.ts`, `__init__.py`). 파서가 기록하지 않는 interface·type·함수가 아닌 `const`는 `unresolved`다.
  - `fileFromAst()`는 파서가 import로 보고한 `export … from` 문을 `reexports`에 둔다. 전송 형식은 `imports`만 읽으므로 요청 바이트는 그대로다. 지금 파서는 이 문을 내보내지 않는다.
- 고정 장치: `skeletonWire.test.ts`가 v2 이전 코드로 찍어 둔 전송 문자열 7종(최상위·드릴다운, 예산 무제한·50KB, 예산을 넘는 파일 하나)과 지금 출력을 비교한다.
- 추출 점수: `tests/fixtures/graphs/`의 정답 그래프로 잰다 (9절).
- 채울 작업: 참조 위치의 대상(같은 파일 안 포함), T1-8 역할 관계의 근거(코드 지도에서 찾고 없으면 점선), T1-10 graph.json을 같은 코드 지도로 읽는 어댑터.

### 분석 범위 (커버리지)

다이어그램 아래 한 줄 요약(`CoverageSummary.svelte`)이 "파일 N개 중 M개를 AI에 보냄"과 잘림, 건너뜀, 못 읽음 수를 보여 준다. 누르면 상태별 목록, 이유, 경로 검색, 다이어그램 단계별 배정 수가 열린다.

- `coverageService.buildCoverage()`는 순수 함수다. 입력은 `fileTree`, `astMap`, `cutFiles`, `parseSkips`, `selectSkeleton()` 결과, 시맨틱 캐시의 단계들이다. 모든 경로는 프로젝트 이름을 뗀 상대 경로로 맞춘다.
- 파일 하나에는 이유 하나만 붙는다. 상태는 `COVERAGE_REASONS` 표(`types/coverage.ts`)에서 이유로 정해진다.
  - 이유를 정하는 순서는 로더가 자른 이유, 문법 없음(`unsupported`), 파서가 남긴 이유, 스켈레톤이 뺀 이유(`over-budget`, `excluded-path`, `no-symbols`), 보냄이다.
  - astMap에 없고 기록도 없는 파일은 `unreadable`이다. GitHub 로더는 다운로드 실패와 빈 응답을 `unreadable`, 파서 오류를 `parse-failed`로 `projectStore.parseSkips`에 직접 쓴다.
  - tree-sitter는 문법 오류가 있어도 트리를 돌려준다. 그래서 파서 워커는 트리에 오류가 있고 심볼이 하나도 없을 때 실패로 답하고, 세 로더(폴더, 테스트, GitHub)는 이를 `parse-failed`로 기록한다. 오류가 있어도 심볼이 나온 파일은 그 심볼을 쓴다.
- 수는 지금 설정으로 다시 계산한다. 분석한 뒤 예산을 바꾸면 요약은 새 예산 기준이다.
- 단계별 배정 수는 `SemanticLevel.assignment`(T0-7)에서 읽는다. 드릴다운 단계의 예산 초과 수는 `selectSubSkeleton()`을 다시 돌려 센다. 그 결과가 `exceedsBudget`이면(한도 안에 드는 파일이 없어 가장 작은 파일 하나를 한도를 넘겨 보낸 경우) 단계 줄에 그렇다고 적는다. 분석한 뒤 예산을 줄였을 때 생긴다.
- 세지 않는 것: 로더가 순회하지 않은 폴더(`SKIP_DIRS`, 숨김 파일, 사용자 제외 패턴) 안의 파일, 문법 오류가 있어도 심볼을 돌려준 파일, LLM 출력이 잘리거나 시간이 넘은 경우.

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
- 값의 출처와 라이선스는 `global.css` 머리 주석과 `LICENSES/astryx-MIT.txt`에 있다.

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
  - `githubLoader.loadGitHubRepo()`도 `cutFiles`에 쓰지 않고 `{ cut }`을 돌려준다. 같은 두 컴포넌트가 받아서 쓴다. 트리와 파싱 진행률은 받는 대로 보여야 해서 로더가 직접 쓴다.
- **AST 파싱**: 14개 언어 tree-sitter WASM (Python, JS, TS, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala)
  - 문법 WASM은 `static/`에 커밋한다. 언어별 파일은 `languageDetector.getGrammarFile()`이 고른다. `.tsx`는 언어는 TypeScript 그대로 두고 JSX를 읽는 `tree-sitter-tsx.wasm`(`tree-sitter-wasms` 0.1.13)으로 파싱한다. `.ts`는 `<T>value` 캐스트를 JSX로 오인하지 않도록 `tree-sitter-typescript.wasm`을 유지한다
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
