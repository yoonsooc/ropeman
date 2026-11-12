# Ropeman Anti-Patterns & 개선 항목

## AP-1: 레거시 Svelte 4 스토어

**문제**: `chatStore.ts`, `i18nStore.ts`, `themeStore.ts`가 `writable()` 사용
**영향**: Svelte 5 runes 패턴과 불일치, 코드 일관성 저하
**해결**: `createXxxStore()` + `$state` 싱글턴으로 마이그레이션

```typescript
// Bad: Svelte 4
import { writable } from 'svelte/store';
export const theme = writable<'dark' | 'light'>('dark');

// Good: Svelte 5
function createThemeStore() {
	let theme = $state<'dark' | 'light'>('dark');
	return {
		get theme() {
			return theme;
		},
		set theme(v) {
			theme = v;
			persist();
		}
	};
}
```

---

## AP-2: Service 내부 상태 보유

**문제**: `parserService.ts`가 Worker 인스턴스 + projectStore 직접 수정
**영향**: 테스트 어려움, 부수효과 추적 어려움
**해결**: Worker 인스턴스는 허용하되, 스토어 수정은 호출자에게 위임

```typescript
// Bad: 서비스가 스토어 직접 수정
export async function parseAllFiles(tree: FileNode) {
	// ...
	projectStore.astMap = new Map(batchMap); // 부수효과
	projectStore.isLoading = false; // 부수효과
}

// Better: 결과만 반환, 호출자가 스토어 수정
export async function parseAllFiles(tree: FileNode): Promise<Map<string, ASTSymbol[]>> {
	// ... 파싱 로직
	return batchMap; // 순수 결과 반환
}
```

---

## AP-3: AI Track 분기 중복

**문제**: `aiService.ts`와 `semanticAnalysisService.ts`에 동일한 track 분기 로직 존재
**영향**: 새 Provider 추가 시 두 곳 모두 수정 필요, DRY 위반
**해결**: 어댑터 팩토리 패턴 도입

```typescript
// Bad: 두 서비스에서 동일 분기 반복
// aiService.ts
if (track === 'webgpu') { ... }
if (track === 'edge') { ... }
if (track === 'bridge') { ... }

// semanticAnalysisService.ts
if (track === 'webgpu') { ... }
if (track === 'edge') { ... }
if (track === 'bridge') { ... }

// Good: 단일 팩토리
type AIAdapter = (system: string, user: string, signal?: AbortSignal) => Promise<string>;

function getAdapter(track: AuthTrack): AIAdapter {
    switch (track) {
        case 'bridge': return (s, u) => sendViaBridge(s + '\n\n' + u);
        case 'webgpu': return (s, u) => webllmGenerate(s, u);
        case 'edge': return (s, u, sig) => callEdgeProxy(s, u, sig);
        case 'byok': return (s, u, sig) => callByok(s, u, sig);
        default: throw new Error('AI not connected');
    }
}
```

---

## AP-4: 에러를 content 문자열에 담아 반환

**문제**: `aiService.ts`에서 에러 시 `{ content: "Error: ...", relatedNodes: [] }` 반환
**영향**: UI에서 에러 상태를 명확히 구분 불가, Fallback UI 구현 어려움

```typescript
// Bad
return { content: `Edge proxy error: ${error.message}`, relatedNodes: [] };

// Good: Result 타입 구분
type AIResult =
	| { ok: true; content: string; relatedNodes: string[] }
	| { ok: false; error: string; code: 'NETWORK' | 'PARSE' | 'AUTH' | 'ABORT' };
```

---

## AP-5: MAX_FILE_SIZE 체크 위치

**문제**: 파일 크기 제한(500KB)이 `parserService.ts`에서 처리 — 파일을 메모리에 로드한 후 체크
**영향**: 대형 파일을 불필요하게 메모리에 로드
**해결**: `fileSystemService.ts`의 디렉토리 탐색 시점에서 체크

```typescript
// Bad: 파일 읽은 후 크기 체크
const fileObj = await handle.getFile();
if (fileObj.size > MAX_FILE_SIZE) {
	continue;
}
const content = await fileObj.text(); // 이미 메모리 로드됨

// Good: 읽기 전 크기 체크
const fileObj = await handle.getFile();
if (fileObj.size > MAX_FILE_SIZE) {
	continue;
} // 읽기 스킵
const content = await fileObj.text();
```

참고: 현재 코드는 이미 `getFile()` 후 size 체크를 하고 있어 text() 호출 전에 스킵되지만, `getFile()` 자체도 메타데이터만 가져오므로 실질적 문제는 작음.

---

## AP-6: Map 복사 — 주의: analysisRequests는 복사 필수

**문제**: `semanticStore`에서 분석 요청 추가/제거 시 매번 `new Map(...)` 복사
**현실**: `analysisRequests` Map은 `.size` 기반 derived(`isAnalyzing`)와 `.values()` 이터레이션(`analysisProgress`)에 의존하므로, **Svelte 5의 Map proxy가 이를 제대로 추적하지 못함**. 직접 mutation으로 변경하면 프로그레스 pill이 표시되지 않는 버그 발생.
**결론**: `analysisRequests`는 반드시 `new Map()` 복사 + 재할당 패턴 유지. `cache` Map은 UI 바인딩이 없으므로 직접 mutation 가능.

```typescript
// analysisRequests: 복사 필수 (UI 바인딩 있음)
const next = new Map(analysisRequests);
next.set(nodeId, request);
analysisRequests = next;

// cache: 직접 mutation 가능 (UI 바인딩 없음)
cache.set(key, level);
```

**⚠️ 코드 리뷰 시 "불필요한 Map 복사" 지적 금지** — analysisRequests의 복사는 의도적임.

---

## AP-7: AnalyzeModal 비즈니스 로직 혼재

**문제**: `AnalyzeModal.svelte`에 API 키 유효성 검증, Bridge 연결, Provider 변경 로직이 모두 포함
**영향**: 컴포넌트 비대화, 테스트 어려움
**해결**: `authService` 또는 `connectionService`로 분리

---

## AP-8: 외부 JSON을 타입 검증 없이 스토어 주입

**문제**: `src/routes/share/[slug]/+page.svelte` 초기 구현에서 `await res.json()`의 결과를 `as SemanticLevel` 캐스팅만 하고 `semanticStore`에 주입 — runtime 형태 검증 없음
**영향**: KV 저장소가 변조되거나 저장 스키마가 바뀌면 runtime 오류 또는 silent corruption
**해결**: unknown으로 받고 구조 가드로 검증 후 주입

```typescript
// Bad
const snapshot = await res.json();
for (const [key, level] of Object.entries(snapshot.semanticLevels)) {
	cacheMap.set(key, level as SemanticLevel); // 검증 없음
}

// Good
const snapshot = await res.json();
if (!snapshot || typeof snapshot !== 'object' || !snapshot.semanticLevels) {
	throw new Error('Invalid snapshot');
}
for (const [key, value] of Object.entries(snapshot.semanticLevels)) {
	const level = value as Record<string, unknown>;
	if (level && Array.isArray(level.nodes) && Array.isArray(level.edges)) {
		cacheMap.set(key, level as unknown as SemanticLevel);
	}
}
```

**교훈**: 시스템 경계(네트워크, KV, localStorage, File System) 넘어 들어오는 데이터는 항상 runtime 검증.
**관련 스프린트**: 2026-04-12-01

---

## AP-9: FileSystemFileHandle 만료에 대한 잘못된 진단

**문제**: "폴더 오픈 후 파일 클릭 시 권한 에러" 현상을 "핸들 만료"로 잘못 진단 → LRU 캐시를 추가해 우회하려 함
**실제 원인**: HMR/배포로 **페이지가 리로드**되면서 메모리의 핸들이 사라짐. 핸들 자체에는 만료 시간이 없음.
**해결**:

1. 로컬 폴더는 원래 동작대로 유지 (리로드 시 재드롭 요구)
2. GitHub 로더는 핸들이 없으므로 `raw.githubusercontent.com`에서 on-demand fetch

```typescript
// 잘못된 해결 (과도한 캐시)
projectStore.fileContents; // Map<path, string> — 전체 파일 메모리 캐시

// 올바른 접근
// CodeViewer에서 소스별 fetch 전략 분기
if (fileNode?.handle) return await fileNode.handle.getFile().text(); // 로컬
if (githubInfo) return await fetch(rawUrl).text(); // GitHub on-demand
```

**교훈**: 증상이 반복되어도 **근본 원인 진단 전에 해결책을 구현하지 말 것**. 가설을 사용자에게 검증받고 진행.
**관련 스프린트**: 2026-04-11-01, 2026-04-12-01

---

## AP-10: wrangler.toml에서 최상위 키를 테이블 헤더 뒤에 배치

**문제**: `[[kv_namespaces]]` 헤더 이후에 `routes = [...]`를 작성하면 TOML이 `routes`를 해당 테이블의 필드로 해석 → `Unexpected fields found in kv_namespaces[0] field: "routes"` 경고
**영향**: 라우트 설정이 적용되지 않아 커스텀 도메인 바인딩이 누락
**해결**: 최상위 키(`routes`, `name`, `main` 등)는 **모든 테이블 헤더가 등장하기 전**에 선언

```toml
# Bad — routes가 kv_namespaces 테이블의 필드로 해석됨
[[kv_namespaces]]
binding = "X"
id = "..."

routes = [
  { pattern = "share.ropeman.dev", custom_domain = true }
]

# Good — 최상위 키를 테이블 헤더 전에
name = "ropeman-share"
main = "src/share.ts"
compatibility_date = "2026-03-10"

routes = [
  { pattern = "share.ropeman.dev", custom_domain = true }
]

[[kv_namespaces]]
binding = "X"
id = "..."
```

**교훈**: TOML 테이블 헤더 이후의 모든 키는 그 테이블에 속한다. 최상위 키와 테이블을 섞지 말 것.
**관련 스프린트**: 2026-04-12-01

---

## AP-11: Dropzone에 projectStore.isLoading을 직접 설정

**문제**: GitHub URL 로딩 중 `projectStore.isLoading = true`로 설정 → `+page.svelte`의 `{#if !hasProject && !isLoading}` 조건에서 Dropzone이 언마운트됨 → 에러 후 재마운트되면서 로컬 `error` 상태가 초기화되어 에러 메시지 표시 실패
**영향**: 사용자가 왜 로딩이 실패했는지 알 수 없음
**해결**: Dropzone 내부에 `isLoadingGithub` 로컬 상태 도입, `projectStore.isLoading`은 건드리지 않음. 에러 시 `resetStores()`로 원상복귀.

```typescript
// Bad — Dropzone이 projectStore.isLoading을 토글
projectStore.isLoading = true;
try {
	await loadGitHubRepo(parsed);
} catch (err) {
	error = '...';
	projectStore.isLoading = false; // Dropzone 재마운트 → error 초기화
}

// Good — 로컬 상태로 처리
isLoadingGithub = true;
try {
	resetStores(); // fileTree null → hasProject false 유지
	await loadGitHubRepo(parsed);
	onload?.();
} catch (err) {
	resetStores(); // 에러 시 원상복귀, 언마운트 없음
	error = '...';
} finally {
	isLoadingGithub = false;
}
```

**교훈**: 컴포넌트 로컬 UI 상태는 **글로벌 스토어와 분리**. 글로벌 상태 변경이 해당 컴포넌트의 마운트/언마운트를 트리거하면 로컬 state가 소실될 수 있음.
**관련 스프린트**: 2026-04-11-01

---

## AP-12: tabStore.viewMode가 primary 패인만 참조

**문제**: `viewMode` derived가 `activeTabId`(primary 패인 활성 탭)만 기준으로 `'semantic' | 'code'`를 결정 → 분할 뷰에서 다이어그램이 secondary에 있으면 `viewMode === 'code'`로 판정 → `hasSemanticSelection`이 false → 노드 클릭 시 윙패널 미표시
**영향**: 분할 뷰에서 특정 배치일 때만 UI가 제대로 동작하지 않는 미묘한 버그
**해결**: split 모드에서는 `focusedPane`의 활성 탭을 기준으로 계산

```typescript
// Bad
get viewMode(): 'semantic' | 'code' {
    const active = tabs.find((t) => t.id === activeTabId);
    return active?.type === 'diagram' ? 'semantic' : 'code';
}

// Good
get viewMode(): 'semantic' | 'code' {
    if (layoutStore.isSplit) {
        const focusedTabId = layoutStore.focusedPane === 'secondary'
            ? layoutStore.secondaryActiveTabId
            : activeTabId;
        const active = tabs.find((t) => t.id === focusedTabId);
        return active?.type === 'diagram' ? 'semantic' : 'code';
    }
    const active = tabs.find((t) => t.id === activeTabId);
    return active?.type === 'diagram' ? 'semantic' : 'code';
}
```

**교훈**: 분할 뷰/멀티 패널 구조에서 파생값(derived)을 계산할 때 **모든 패널을 고려**. "primary만 보면 되겠지"는 함정.
**관련 스프린트**: 2026-04-11-01

---

## AP-13: 요구사항 ID 네임스페이스 충돌

**문제**: `S1`이 이미 "Snippet analysis"에 할당되어 있는데 Share 관련 태스크(`S1 share-persistence`, `S2 share-route`, `S3 share-button`)를 같은 접두사로 새로 생성 → 파일명만 다르고 ID가 충돌
**영향**: PRD 구현 현황 표에서 동일 ID 두 번 등장, 로드맵 참조 모호
**해결**: 충돌 시 즉시 새 접두사 할당 (여기서는 `SH`), PRD의 "요구사항 ID 체계" 표에도 추가

```
S — Snippet (기존)
SH — Share  (신규)
```

**교훈**: 새 태스크 생성 전 `ls .spec/tasks/TASK-{접두사}*.md`로 충돌 확인. 애매하면 두 글자 접두사 사용.
**관련 스프린트**: 2026-04-12-01

---

## AP-14: 컴포넌트 내부에 i18n 한/영 ternary 인라인 작성

**증상**: 컴포넌트 템플릿에 `i18nStore.locale === 'ko' ? '한국어' : 'English'` 직접 박힘. `i18nStore.t()` 미사용.

```svelte
<!-- BAD -->
<h3>{i18nStore.locale === 'ko' ? '처음이신가요?' : 'New here?'}</h3>
<button>EXPLORE GALLERY</button>
<!-- 더 나쁨: 번역조차 없음 -->
```

**원인**: 새 UI 파편 작성 시 interface에 키 추가가 번거로움. "한두 줄이니 지금은 인라인, 나중에 정리"가 누적.

**영향**:

- 같은 문구가 여러 컴포넌트에 산재, 수정 시 grep 의존
- 타입 보호 없음 (문자열 리터럴이라 컴파일러 감지 불가)
- 새 로케일 확장 시 모든 인라인 ternary 수작업 마이그레이션
- CLAUDE.md "모든 UI 문자열 i18n" 원칙 위반

**해결**:

1. 신규 UI 문자열은 **반드시** `i18nStore.svelte.ts`의 관련 Translations interface에 키 추가 + ko/en 정의
2. 컴포넌트는 `i18nStore.t('namespace.key')`만 호출
3. 플레이스홀더 필요 시 prefix/suffix 키로 분할 또는 템플릿 문자열과 키를 조합 (예: `{nodeLabel} — {i18nStore.t('...')}`)
4. 기존 인라인 ternary는 리뷰에서 Warning 등재 후 마이그레이션

**검출**: Grep 패턴 `i18nStore\.locale\s*===\s*['"]ko['"]` 전체 스캔 또는 하드코딩 한글/영문 병기를 리뷰 시 확인

**관련 스프린트**: 2026-04-13-01 (2차 리뷰에서 Dropzone.svelte, ExploreDrilldownPromptDialog.svelte에서 발견·수정)

---

## 우선순위

| ID    | 영향도 | 난이도 | 권장 시기               |
| ----- | ------ | ------ | ----------------------- |
| AP-3  | 높음   | 중간   | 다음 스프린트           |
| AP-4  | 높음   | 낮음   | 다음 스프린트           |
| AP-8  | 높음   | 낮음   | 경계 데이터 검증 습관화 |
| AP-9  | 높음   | 낮음   | 진단 프로세스 원칙      |
| AP-1  | 중간   | 낮음   | 리팩토링 스프린트       |
| AP-2  | 중간   | 중간   | 리팩토링 스프린트       |
| AP-7  | 중간   | 중간   | 리팩토링 스프린트       |
| AP-11 | 중간   | 낮음   | 즉시 준수               |
| AP-12 | 중간   | 낮음   | 즉시 준수               |
| AP-10 | 낮음   | 낮음   | 참고                    |
| AP-13 | 낮음   | 낮음   | 참고                    |
| AP-14 | 중간   | 낮음   | 신규 UI 작성 시 준수    |
| AP-5  | 낮음   | 낮음   | 필요 시                 |
| AP-6  | 낮음   | 낮음   | 필요 시                 |

## AP-15: 벡터 저장소를 차원만으로 구분

**증상**: pgvector 테이블 이름을 `chunks_d768`처럼 차원만으로 정했다. 차원이 같은 다른 임베딩 모델(예: Gemini 768 축소판과 jina 768)로 바꾸면 서로 다른 좌표계의 벡터가 한 테이블에 섞이고, 오류 없이 검색 품질만 조용히 무너진다. 고친 뒤에도 63자 식별자 제한으로 이름을 자르면 `_d{dim}`이 잘려 같은 문제가 남았다
**원인**: "차원이 같으면 호환된다"는 가정. 벡터는 모델마다 좌표계가 다르다
**해결**: 저장소 키에 **모델 이름과 차원을 모두** 넣는다. 길이 제한이 있으면 자르지 말고 해시를 붙인다(`agent/src/agent/retrieval/vector.py` `table_name`). 회귀 테스트: `test_vector_tables_differ_per_model_even_with_same_dimension`, `test_long_model_names_keep_dimension_and_stay_distinct`
**관련 스프린트**: 2026-10-26-01

## AP-16: FastAPI 동기 엔드포인트에서 DB 연결 하나를 공유

**증상**: 서비스 객체가 `psycopg.connect()` 연결 하나를 들고 모든 요청에서 쓴다. FastAPI는 동기(`def`) 엔드포인트를 스레드 풀에서 돌리므로, 한 요청의 트랜잭션 안에서 다른 요청의 쿼리가 실행된다. 재색인 중 조회가 빈 상태를 보고 404를 내거나, 조회 오류가 재색인 트랜잭션을 깨뜨린다. 연결이 끊기면 재시작 전까지 전부 500
**원인**: 단일 사용자 스크립트 습관을 서버 코드에 그대로 옮김. 테스트는 인메모리 저장소라 드러나지 않는다
**해결**: `psycopg_pool.ConnectionPool`로 호출마다 연결을 빌린다. 연결별 설정(`register_vector`)은 `configure=`로. 실제 DB에서 동시 질의 스모크 테스트를 돌린다
**관련 스프린트**: 2026-10-26-01

## AP-17: 렌더링되지 않는 컴포넌트를 고침

**증상**: 개인정보 안내(Gemini 무료 등급, BYOK 키 경로)를 `ConnectModal.svelte`와 `OnboardingModal.svelte`에 넣었는데, 두 컴포넌트를 import하는 곳이 앱에 없었다(`tests/smoke.mjs`뿐). 실제 화면(AnalyzeModal, 도움말 i18n)에는 "키는 서버로 전송되지 않는다"는 틀린 문구가 그대로 남았다. 테스트·빌드·리뷰 전까지 아무도 몰랐다
**원인**: 문구를 grep으로 찾아 첫 번째로 걸린 파일을 고쳤다. 같은 역할의 컴포넌트가 둘 있었고(Connect/Analyze), 쓰이는 쪽을 확인하지 않았다
**해결**: UI를 고치기 전에 `grep -rn "<ComponentName" src/routes src/lib`로 렌더링 경로를 확인한다. 사용자에게 보이는 문구는 i18n 키로 두고, 키가 어느 화면에서 쓰이는지 따라간다. 쓰이지 않는 컴포넌트는 정리 대상으로 기록한다
**관련 스프린트**: 2026-11-07-01 (발생), 2026-11-08-01 (발견)

## AP-18: 배포 대상을 push의 `before..sha`로 고름

**증상**: CI deploy job이 `github.event.before..github.sha` diff로 배포할 워커를 골랐다. GitHub은 concurrency 그룹에 대기 실행을 하나만 두므로, 배포 중에 push가 두 번 더 오면 가운데 실행이 취소되고 그 push의 워커 변경은 배포되지 않는다. 실패한 워커도 다음 push가 자기 범위만 보므로 다시 배포되지 않는다. CI가 순서를 바꿔 끝나면 옛 커밋이 새 커밋 뒤에 배포되어 운영이 되돌아갈 수 있다
**원인**: "push 한 번 = 배포 한 번"이라는 가정. 대기 실행 취소와 실패 재시도를 고려하지 않았다
**해결**: 마지막으로 배포가 끝난 커밋을 태그(`production`)로 남기고 그 태그부터 diff한다. 모든 배포가 성공했을 때만 태그를 옮긴다. 배포 시작 시 `origin/main`이 자기 커밋이 아니면 건너뛴다. 배포 토큰은 배포 단계의 env에만 둔다(`npm ci` 설치 스크립트가 읽지 못하게)
**관련 스프린트**: 2026-11-07-01 (발생), 2026-11-08-01 (발견)

## AP-19: 강조색 채움 위 글자색을 하드코딩

**증상**: 주 버튼과 배지가 `background: var(--accent)` 위에 `color: white`(또는 `#fff`, `var(--sidebar-icon-bg)`)를 썼다. 라이트 테마의 진한 파랑에서는 통과하지만, 다크 테마 강조색(`#a3a6ff`)은 밝아서 흰 글자가 약 2.2:1이 된다. 랜딩 주 버튼은 그라디언트 배경이라 배경색을 읽는 대비 측정에서도 빠졌다. hover 규칙에만 남은 `#fff`도 같은 문제를 냈다
**원인**: 테마마다 강조색 명도가 다른데, 그 위 글자색은 테마와 무관한 고정값이었다. 그라디언트 배경은 `background-color`가 투명이라 자동 대비 측정이 건너뛴다
**해결**: 강조 채움 위 글자는 `--on-accent` 토큰만 쓴다(라이트 흰색, 다크 거의 검정). 채움을 바꾸는 hover·active 규칙도 함께 확인한다. 대비를 측정할 때 그라디언트·이미지 배경은 가장 밝은 색 기준으로 따로 잰다
**관련 스프린트**: 2026-11-09-01

## AP-20: 워커 밖으로 옮긴 파싱에 역추적 정규식

**증상**: Markdown 개요를 tree-sitter 워커 대신 메인 스레드에서 뽑으면서 제목 정규식 `^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$`와 링크 정규식 `\[[^\]]*\]\(`를 썼다. 공백이 긴 줄이나 `[`가 이어진 줄에서 시간이 제곱으로 늘어(공백 2만 자에 306ms, `[` 4만 개에 552ms) 공개 저장소의 파일 하나로 탭이 멈출 수 있었다
**원인**: 워커가 막아 주던 비용을 메인 스레드로 가져오면서, 지연(lazy) 수량자 + 선택 그룹 + 끝 고정이 만드는 역추적을 따져 보지 않았다. 파일 한도(500KB)가 크다
**해결**: 줄 길이 상한을 두고(2,000자), 끝의 `#` 같은 선택 부분은 정규식 대신 코드로 자른다. 문자 클래스는 여는 기호도 빼서(`[^\][]*`) 시작점마다 끝까지 훑지 않게 한다. 병리적 입력의 시간 상한을 테스트로 고정한다
**관련 스프린트**: 2026-11-10-01

## AP-21: 심볼릭 링크를 링크 이름으로만 검사

**증상**: 경로 규칙(숨은 파일, `node_modules`, 실제 `.env`)을 링크의 이름에만 걸었다. `config.txt -> .env`(Bridge 뷰어, #72)나 `notes.ts -> .env`(Node 추출, #74)처럼 허용되는 이름의 링크가 거부되는 파일을 가리키면 그 내용이 나갔다. 루트 안인지(`realpath`)는 봤지만 이름 규칙은 대상에 다시 걸지 않았다
**원인**: "루트 안이면 안전하다"는 가정. 루트 안에도 읽으면 안 되는 파일이 있다
**해결**: 링크를 따라갈 때는 대상의 실제 경로(루트 기준 상대 경로)에도 같은 규칙을 건다(`packages/core/src/walk.ts`의 `isReadableTarget`). 읽는 시점에 경로를 다시 풀어 같은 검사를 한다. 대소문자를 가리지 않는 디스크를 위해 env 이름은 소문자로 바꿔 비교한다
**관련 스프린트**: 2026-11-12-04 (#72, #74)

## AP-22: 최종 결과만 비교하는 같음(parity) 테스트

**증상**: Node 추출과 브라우저 경로의 같음 테스트가 코드 지도만 비교했다. 순회 목록(`paths`)은 해석 설정 수집과 `listed`에만 쓰이고 지도에는 닿지 않아, `index.ts`를 모두 목록에서 빼는 변형을 넣어도 테스트가 통과했다
**원인**: 테스트가 비교한 값이 바꾼 단계의 출력 전부를 담지 않았다
**해결**: 같음 테스트는 두 경로가 갈라지는 단계의 중간 결과(목록, 개수, 트리)까지 비교한다. 테스트를 쓴 뒤 중간 결과 하나를 망가뜨리는 변형으로 실패하는지 확인한다
**관련 스프린트**: 2026-11-12-04 (#74)

## AP-23: 검사 함수가 파서를 거치지 않은 값을 받는다

**증상**: 지도 검증기 `verifyMap(map: RopemanMap, …)`이 파싱한 지도 타입을 받았다. 파서가 막는 값(근거 없는 EXTRACTED, EXTRACTED ref를 든 INFERRED 근거)을 `as` 캐스트나 메모리에서 만든 객체로 넘기면 통과했고, 필드가 빠진 값(`nodes: [{ id: 'A' }]`, `files: null`)은 예외를 던졌다(#76). 그 구멍을 막으려고 단계 트리 검사를 파서와 검증기에 두 번 적어 두기도 했다
**원인**: "파서를 거친 값만 온다"는 가정을 타입 이름에만 맡겼다. 타입은 캐스트와 변경(파싱 뒤 `push`)을 막지 못한다
**해결**: 공개 검사 함수가 `unknown`을 받아 안에서 파서를 먼저 돌리고, 거부는 예외 대신 결과(`{ parsed: false, failure }`)로 돌려준다. 파서가 보는 불변식은 파서에만 둔다. 검사한 사본을 결과에 담아 호출한 쪽이 넘긴 객체 대신 그것을 쓰게 한다
**관련 스프린트**: 2026-11-12-04 (#76)

## AP-24: 파일 경로를 쓴 그대로 비교

**증상**: macOS는 한글 파일 이름을 NFD로 돌려주고 LLM은 NFC로 쓴다. 지도 검증기가 두 경로를 문자열 그대로 비교해 `장바구니.svelte`가 없는 파일(`path-unknown`)이 됐다(#76)
**원인**: 눈에 같은 경로가 바이트로도 같다는 가정
**해결**: 출처가 다른 경로(디스크, LLM, 사용자 입력)를 비교할 때는 양쪽을 NFC로 바꾼다. 바꾼 뒤 같아지는 파일이 둘이면(Linux는 둘을 따로 둔다) 어느 쪽인지 정할 수 없으므로 실패로 처리한다. 바꾼 키에 타입 브랜드를 붙이면 한쪽만 바꾸는 실수가 컴파일되지 않는다
**관련 스프린트**: 2026-11-12-04 (#76)
