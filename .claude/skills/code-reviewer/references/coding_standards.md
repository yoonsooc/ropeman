# Ropeman Coding Standards

## 1. Store 패턴 (Svelte 5 싱글턴)

### 필수 구조

```typescript
function createXxxStore() {
	const stored = typeof window !== 'undefined' ? localStorage.getItem('key') : null;
	const initial = stored ? JSON.parse(stored) : {};
	let field = $state<Type>(initial.field ?? defaultValue);

	function persist() {
		if (typeof window !== 'undefined') {
			localStorage.setItem('key', JSON.stringify({ field }));
		}
	}

	return {
		get field() {
			return field;
		},
		set field(v: Type) {
			field = v;
			persist();
		},
		get computedField(): Type {
			return /* derived logic */;
		},
		clearAll() {
			field = defaultValue;
			localStorage.removeItem('key');
		}
	};
}
export const xxxStore = createXxxStore();
```

### 체크리스트

- `$state` 변수는 클로저 내부에만 (외부 직접 접근 불가)
- getter/setter 쌍으로 외부 접근 제공
- setter에서 `persist()` 자동 호출 (영구 저장 필요 시)
- `clearAll()`에서 모든 필드 초기화 + localStorage 제거
- `$state.raw`는 대형 객체(Map, FileTree 등)에만 사용
- `writable()` 사용 금지 (레거시)

### 참조: settingsStore, authStore, projectStore

---

## 2. Service 패턴

### Stateless 원칙

서비스는 순수 함수 또는 stateless 모듈. 상태 필요 시 스토어로 분리.

### 허용 예외

- Worker 인스턴스 관리 (parserService, webllmService)
- WebSocket 연결 (bridgeClient) — 상태는 bridgeStore에 위임

### Worker 통신 프로토콜

```typescript
// Service: lazy Worker 생성 + pendingRequests Map
function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL('$lib/workers/xxxWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = handleMessage;
	}
	return worker;
}

// Worker: type 기반 메시지 디스패치
self.onmessage = async (e) => {
	const { type, id, payload } = e.data;
	switch (type) {
		case 'init':
			self.postMessage({ type: 'init-done', id });
			break;
		case 'action':
			self.postMessage({ type: 'action-result', id, payload });
			break;
	}
};
```

### 체크리스트

- 서비스 함수는 스토어를 직접 수정하지 않음
- Worker 생성은 lazy (첫 호출 시)
- pendingRequests Map으로 비동기 응답 추적
- AbortController/signal 지원 (장시간 작업)

### 참조: parserService, webllmService, skeletonExtractor

---

## 3. Component 패턴

### Props & 상태

```svelte
<script lang="ts">
	let { open, onclose }: { open: boolean; onclose: () => void } = $props();
	let expanded = $state(false);
	const computed = $derived(someStore.value > 0);
</script>
```

### 모달 필수 요소

- `{#if open}` 조건부 렌더링
- backdrop 클릭 → `onclose()`
- Escape 키 → `onclose()`
- `role="dialog"` + `aria-modal="true"`
- 중첩 모달은 별도 컴포넌트

### 체크리스트

- `$props()` 구조분해 + 타입 명시
- 이벤트 콜백: `onxxx` prefix
- 비즈니스 로직은 서비스로 위임
- CSS는 `<style>` scoped (전역 스타일 금지)

---

## 4. AI Track 분기

### 우선순위: `bridge > edge > webgpu > byok > none`

### callAI 구조

```typescript
const track = authStore.activeTrack;
if (track === 'bridge') return sendViaBridge(...);
if (track === 'webgpu') return webllmGenerate(...);
if (track === 'edge') return callEdgeProxy(...);
if (track === 'byok') {
    if (settingsStore.aiProvider === 'anthropic') return callProxyWorker(...);
    return callGemini(...);
}
```

---

## 5. JSON 파싱/복구 파이프라인

1. `escapeControlCharsInStrings()` — 제어문자 이스케이프
2. trailing comma 제거
3. `closeBrackets()` — 스택 기반 미닫힌 괄호 닫기
4. progressive truncation — `},` 경계 역순 cut

---

## 6. 에러 핸들링

### 현재 패턴

- `semanticAnalysisService`: `semanticStore.analysisError` + toast
- `aiService`: 에러를 `content` 문자열에 담아 반환 (개선 필요)

### AbortController 패턴

```typescript
function throwIfAborted(controller: AbortController) {
	if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
}
function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}
```
