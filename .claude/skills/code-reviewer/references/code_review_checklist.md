# Ropeman Code Review Checklist

커밋이나 PR 전에 이 체크리스트로 리뷰를 수행한다.

## A. 구조 & 컨벤션

- [ ] 새 스토어가 `createXxxStore()` 싱글턴 패턴을 따르는가
- [ ] `writable()` 신규 사용이 없는가 (Svelte 5 `$state` 사용)
- [ ] 서비스가 스토어를 직접 수정하지 않는가 (결과 반환 → 호출자가 저장)
- [ ] 컴포넌트에 비즈니스 로직이 혼재되지 않았는가
- [ ] 새 타입이 `src/lib/types/`에 정의되어 있는가

## B. Svelte 5 Runes

- [ ] `$props()` 구조분해 + 타입 명시
- [ ] `$state`는 컴포넌트/스토어 초기화 시점에서만 선언
- [ ] `$derived` / `$derived.by()`로 계산값 선언 (수동 업데이트 금지)
- [ ] `$effect`에서 cleanup 함수 반환 (구독 해제, 타이머 정리 등)
- [ ] `$effect` 내 무한 루프 방지 (의존성 순환 확인)

## C. AI Track 연동

- [ ] 새 AI provider 추가 시 `callAI()` 분기 + `aiService.sendMessage()` 분기 모두 처리
- [ ] `authStore.activeTrack` 우선순위 반영 확인
- [ ] Proxy Worker 경유 시 CORS 설정 (ALLOWED_ORIGINS) 확인
- [ ] JSON 파싱 실패 시 `repairJSON` → `closeBrackets` 복구 경로 동작 확인
- [ ] 에러 응답이 사용자에게 명확히 표시되는가

## D. Edge Proxy / Worker

- [ ] `wrangler.demo.toml` / `wrangler.proxy.toml` 설정 일관성
- [ ] `ALLOWED_ORIGINS`에 개발/프로덕션 도메인 포함
- [ ] `maxOutputTokens` 충분한지 (현재 16384)
- [ ] `[placement] hint` 설정으로 지역 제한 방지
- [ ] Secret (GEMINI_API_KEY) 설정 확인

## E. 성능 & 제약

- [ ] `MAX_FILES=2000`, `MAX_FILE_SIZE=500KB` 제약 준수
- [ ] Skeleton size limit 설정 반영 (`settingsStore.maxSkeletonKB`)
- [ ] 대형 Map 업데이트 시 불필요한 복사 최소화
- [ ] Worker 생성은 lazy (첫 호출 시)
- [ ] AbortController로 장시간 작업 취소 가능

## F. 접근성 & UX

- [ ] 모달: `role="dialog"` + `aria-modal="true"` + Escape + backdrop 클릭
- [ ] 버튼/링크에 `title` 또는 `aria-label`
- [ ] 로딩 상태 표시 (progress pill)
- [ ] 에러 상태 표시 (toast, 인라인 메시지)
- [ ] 현재 AI 모드가 Header 뱃지에 반영

## G. 빌드 & 테스트

- [ ] `npm run build` 성공
- [ ] `npm run lint` 0 errors
- [ ] `npm run test:unit` 전체 통과
- [ ] 새 패키지 설치 후 `node_modules/.vite` 캐시 클리어 확인

## H. 문서화

- [ ] 구조가 바뀌었으면 같은 커밋에서 `docs/ARCH.md` 갱신
- [ ] 프레임워크·저장소·주요 의존성을 들이거나 바꿨으면 같은 PR에 ADR (`docs/adr/README.md`)
- [ ] 실제 있었던 버그를 고쳤으면 회귀 테스트 추가
