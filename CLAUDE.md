# Ropeman — 코드 시각화 도구 (MVP)

## Tech Stack

- SvelteKit + Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- @xyflow/svelte (SvelteFlow) — 그래프 렌더링
- web-tree-sitter WASM — 여러 프로그래밍 언어 AST 파싱 (Web Worker)
- File System Access API (`showDirectoryPicker`)
- @dagrejs/dagre — 레이아웃, @orama — 검색

## Conventions

- 스토어: `src/lib/stores/` 모듈 레벨 싱글턴 (getter/setter export)
- 서비스: `src/lib/services/` 순수 함수 또는 stateless 모듈
- 컴포넌트: Svelte 5 `$props()` destructuring, snippet 미사용
- 파싱: parserWorker.ts (Web Worker) → postMessage → parserService.ts
- 타입: `src/lib/types/` (ast.ts, graph.ts, search.ts)

## Constraints

- 브라우저 전용 (SSR 없음, adapter-cloudflare)
- FileSystemHandle 한계 → MAX_FILES=2000, MAX_FILE_SIZE=500KB
- 운영 배포는 main 병합 시 CI `deploy` job이 한다 (앱 + 바뀐 워커 + 헬스 체크, `docs/ARCH.md` 8절). 수동 배포는 장애 대응용

## Agent Onboarding

- 새 세션: `/catchup`(.spec/history 최신 3개) → 레퍼런스 확인 → `/sync`(소스 스캔). `.spec/`은 symlink라 Glob 대신 Bash ls나 Read로 연다.
  - `.spec/PRD.md` 비전·로드맵, `.spec/tasks/` 원자적 태스크, `docs/ARCH.md` 아키텍처, `docs/adr/` 결정 기록(형식은 `docs/adr/README.md`). 없으면 사용자에게 확인한다.
- 개발은 pstack(poteto-mode) 플레이북을 따른다. 에이전트는 제품 방향 결정, 새 프레임워크·저장소·주요 의존성 도입(같은 PR에 ADR)에서만 멈추고 사용자에게 묻는다.
- 스프린트 ID는 `YYYY-MM-dd-{n}`(예: `2026-03-03-01`)이고 PRD 로드맵, history 파일명, changelog, 브랜치명에 쓴다.
- 스프린트 실행(대상 선정, Task 상태)과 마무리(PRD 6개 필드, Task, changelog, finalize PR)는 사용자가 요청할 때만 하고, 절차는 `sprint` 스킬에 있다.

## 작업 주기 (일상 작업)

커밋 경계 = 의사결정 경계. 구현 커밋(A)과 리뷰 수정 커밋(B)을 분리해 git 이력에 "구현 → 리뷰 수정" 경계를 남기고, 각 커밋은 따로 revert할 수 있어야 한다.

1. 작업 단위마다 `unit/{sprint_id}/{slug}` 브랜치를 만든다. `sprint/{sprint_id}`는 마무리 전용이고 pre-push 훅이 그때 마무리 누락을 검사한다.
2. 구현 → `npm run test:unit && npm run build` 통과 → **커밋 A** `feat({scope}): ...`/`fix(...)` (리뷰 전 상태).
3. pstack `thermo-nuclear-review`를 작성자와 다른 모델의 검증 서브에이전트로 돌린다. `/code-reviewer`는 이 주기에서 쓰지 않는다(수시 점검용).
4. 리뷰 보고서 `.spec/reviews/{sprint_id}-review.md`: 대상, C/W/S 개수, 이슈별 증상·원인·수정·결정, 오탐과 스킵한 Suggestion의 이유. 새 안티패턴은 `common_antipatterns.md`로 올리고 링크한다. 2차 리뷰는 같은 파일에 절을 추가한다(삭제 금지). 보고서는 리뷰 시점의 스냅샷이다.
5. Critical·Warning은 바로 고치고 Suggestion은 판단한다. 스프린트 중 고친 버그는 `.spec/bug-report/`에 기록한다.
6. 테스트·빌드 재통과 → **커밋 B** `review: {요약} ({C}C/{W}W/{S}S)`, 본문은 주요 수정 목록과 `- 리뷰 보고서: .spec/reviews/{sprint_id}-review.md`.
7. 단위 PR은 검증 통과와 PR CI 통과 후 `gh pr merge --merge`로 병합한다(squash 금지). 사용자 승인 단계는 없고 사용자는 병합된 결과를 검토한다.

PRD·Task 상태·changelog 같은 메타데이터는 이 주기에서 건드리지 않는다.

## 문서 위치

- `docs/`(공개, git 추적): ARCH와 ADR. 구조나 결정이 바뀌면 코드와 같은 커밋에서 갱신한다.
- `.spec/`(비공개, git 미추적): PRD, 태스크, 전략, history, 리뷰. 커리어 맥락은 여기에만 쓴다.
- 프레임워크, 저장소, 주요 의존성을 도입하거나 교체할 때는 같은 PR에 ADR을 추가한다.
- 외부 디자인 도구(Stitch 등) 산출물을 코드에 반영할 때는 `design-import` 스킬의 절차(매핑표 확인 → 전수 변환 → 검증 → 정본 관리)를 따른다.

## 테스트

- `src/lib/services/` 또는 `src/lib/stores/` 파일 변경 시 대응하는 `.test.ts` 파일을 반드시 추가 또는 업데이트한다.
- vitest, AAA 패턴, 외부 의존성은 `vi.mock()`.
- 실제 발생했던 버그 케이스는 테스트에 포함 (regression test).
- `edge-proxy/test/`는 루트 `npm run test:unit`에 들어가지 않는다. workerd에서 도는 `npm test --prefix edge-proxy`로 따로 실행한다(CI의 Worker tests 단계).
