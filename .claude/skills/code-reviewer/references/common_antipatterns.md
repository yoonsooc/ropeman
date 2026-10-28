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
