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

- 새 세션 시작 시 순서대로 수행
  1. `/catchup` → .spec/history 최신 3개 읽고 맥락 파악
  2. 전체 레퍼런스(⚠️ .spec/은 symlink — Glob 대신 Bash ls 또는 Read로 접근) 확인
     - `.spec/PRD.md` — 비전/로드맵
     - `docs/ARCH.md` — 아키텍처 (코드와 함께 git 추적)
     - `docs/adr/` — 결정 기록, 형식과 작성 조건은 `docs/adr/README.md`
     - `.spec/tasks/` — 원자적 태스크
     - 위 파일이 없으면 사용자에게 확인 후 진행
  3. `/sync` → 소스 스캔 (현재 코드가 실제로 어떤 상태인가)

- 개발은 pstack(poteto-mode) 플레이북을 따른다. 에이전트는 제품 방향 결정, 새 프레임워크·저장소·주요 의존성 도입(같은 PR에 ADR)에서만 멈추고 사용자에게 묻는다.

- 스프린트 수행 규칙 (사용자가 스프린트 실행을 요청했을 때만 적용)
  1. `.spec/PRD.md`의 '7. 우선순위 및 로드맵'과 `.spec/tasks/` 의 Task md 파일로 대상을 파악한다.
  2. 가능하면 Agent Team을 구성하여 Task를 병렬 수행한다. 각 Task는 개발 → 테스트 → 코드 리뷰 순서.
  3. Task 상태 변경: 작업 시작 시 `In-Progress`, DoD 전부 충족 시 `Done`.
  4. 스프린트는 최대 4개 Task. 미완료 Task가 있으면 포함 + P1에서 가져와 4개를 채운다.

- 스프린트 ID: `YYYY-MM-dd-{n}` (예: `2026-03-03-01`). PRD 로드맵, history 파일명, changelog, 브랜치명에 사용.

- ⚠️ **스프린트 작업 주기 (반복 가능, 일상 작업)**

  하나의 스프린트 안에서 아래 주기를 **여러 번** 반복할 수 있다. 태스크 1개를 구현한 뒤 리뷰를 돌려도 되고, 여러 태스크를 묶어 한 번에 리뷰해도 된다. 핵심은 **커밋 A와 커밋 B를 분리**하여 git 이력에 "구현 → 리뷰 수정" 경계를 남기는 것.
  1. 스프린트 브랜치가 없으면 생성 (`sprint/{sprint_id}`)
  2. 태스크 구현 → `npm run test:unit && npm run build` 통과
  3. **커밋 A (feat/fix)**: 기능 구현만 커밋
     - 메시지: `feat({scope}): ...`, `fix(...)`, 복수 태스크면 `feat: SH1, SH2 구현`
     - 이 커밋은 **리뷰 전 상태**
  4. pstack `thermo-nuclear-review` 실행 (작성자와 다른 모델의 검증 서브에이전트에 위임)
  5. **리뷰 보고서 작성** → `.spec/reviews/{sprint_id}-review.md`
     - 리뷰 대상, Critical/Warning/Suggestion 개수, 이슈별 증상·원인·수정·결정
     - 오탐(false positive)과 스킵한 Suggestion의 이유 포함
     - 새 안티패턴은 `common_antipatterns.md`로 승격 후 보고서에서 링크
     - 2차 리뷰가 발생하면 같은 파일에 섹션 추가 (삭제 금지)
  6. Critical / Warning 즉시 수정 (Suggestion은 판단)
  7. 스프린트 중 해결한 버그는 `.spec/bug-report/`에 기록
  8. `npm run test:unit && npm run build` 재통과 확인
  9. **커밋 B (review)**: 리뷰 수정 + 리뷰 보고서 파일
     - 메시지 예시:

       ```
       review: {주요 수정 요약} ({Critical}C/{Warning}W/{Suggestion}S)

       - {주요 수정 1}
       - {주요 수정 2}
       - 리뷰 보고서: .spec/reviews/{sprint_id}-review.md
       ```

  10. 필요 시 1~9 반복. 후속 개발/수정은 독립 커밋 (`feat: ...`, `fix: ...`)으로 이어짐.

  ⚠️ **메타데이터 문서(PRD/Task 상태/Changelog)는 이 단계에서 건드리지 않는다.** 리뷰 수정 커밋과 메타데이터 커밋은 분리된다.

- ⚠️ **스프린트 마무리 절차** (사용자가 "마무리" 요청 시에만 트리거)

  작업과 리뷰가 모두 끝나고 더 이상 변경할 것이 없다고 사용자가 판단한 시점에 실행한다. **메타데이터 업데이트 + push/PR**만 수행.
  1. 이 시점에 working tree가 clean해야 한다 (모든 코드 변경은 이미 커밋됨)
  2. **PRD 최신화** (아래 6개 필드 전부 — 하나라도 빠지면 안 됨)
     - `최종 업데이트` 날짜 → 오늘 (UTC 기준, pre-push hook 확인)
     - `버전` → 마이너 증가 (1.0.0 → 1.1.0)
     - `상태` → "스프린트 {id} 완료"
     - `7. 우선순위 및 로드맵` → 이전/P0/P1 갱신
     - `8. 변경 이력` → 행 추가
     - `5. 구현 현황` → 태스크 상태 반영
  3. **Task 파일** 상태·DoD 업데이트 (`.spec/tasks/TASK-*.md` frontmatter + 본문)
  4. **Changelog** → `.spec/history/{sprint_id}.md` 작성
     - 작업 주기 커밋 요약 (A 커밋들과 B 커밋들 구분)
     - 리뷰 보고서 링크 포함 (`.spec/reviews/{sprint_id}-review.md`)
  5. **커밋 (docs)**: `docs: finalize sprint {sprint_id}`
     - 메시지: PRD 버전 증가 + Task 상태 + Changelog 요약
  6. **Push → PR 생성**
     - PR 제목: 완료 태스크 요약
     - PR 본문: 완료/미완료 태스크 + 주요 변경사항 + 리뷰 보고서 링크
     - 커밋 이력: feat → review → (반복) → docs(finalize)
  7. **Merge**: 검증 서브에이전트 통과와 PR CI 통과 후 `gh pr merge --merge`로 merge 커밋을 남긴다 (squash 금지, feat/review 커밋이 main에 보이도록)
  8. 사용자 승인 단계는 없다. 사용자는 merge된 결과를 검토한다.

- **기본 원칙**: 커밋 경계 = 의사결정 경계
  - **feat / fix 커밋** = "이게 내가 만든 것"
  - **review 커밋** = "리뷰가 찾은 것 + 내가 고친 것"
  - **docs(finalize) 커밋** = "스프린트 메타데이터 확정"
  - 각 커밋은 독립적으로 revert 가능해야 한다
  - 리뷰 보고서는 리뷰 시점의 스냅샷이며, 이후 작업 커밋의 내용까지 포함하지 않는다는 점을 인지할 것
  - **스프린트 마무리 ≠ 스프린트 작업의 끝**. 마무리는 사용자 트리거로 시작되는 짧고 독립된 단계.

- PRD 로드맵 구조 (`7. 우선순위 및 로드맵`)
  - **이전 스프린트**: 직전 1개만 (이전 이력은 `.spec/history/`)
  - **P0 — 현재 스프린트**: 최대 4개
  - **P1 — 다음 스프린트**: 그 다음 우선순위
  - P2 이후는 각 태스크 파일의 우선순위 속성으로 관리
  - 스프린트 종료 시 승격: 완료→이전, 미완료→P0 잔류, P1에서 채움, P2 중 준비된 것→P1 승격

## 문서 위치

- `docs/`(공개, git 추적): ARCH와 ADR. 구조나 결정이 바뀌면 코드와 같은 커밋에서 갱신한다.
- `.spec/`(비공개, git 미추적): PRD, 태스크, 전략, history, 리뷰. 커리어 맥락은 여기에만 쓴다.
- 프레임워크, 저장소, 주요 의존성을 도입하거나 교체할 때는 같은 PR에 ADR을 추가한다.

## 디자인 반영 규칙

외부 디자인 도구(Stitch 등)의 산출물을 코드에 반영할 때 아래 절차를 따른다.

1. **매핑표 작성** (작업 시작 전 필수)
   - 디자인 HTML의 모든 요소를 나열한다
   - 각 요소에 대응하는 Svelte 컴포넌트 파일을 매핑한다
   - 하나의 HTML에 여러 컴포넌트가 포함될 수 있다 — 빠짐없이 식별한다
   - 매핑표를 사용자에게 보여주고 확인받은 후 작업을 시작한다

2. **전수 변환** (추정 금지)
   - 디자인 HTML의 모든 클래스를 CSS property-value로 변환한다
   - 현재 코드의 모든 대응 속성과 1:1 비교한다
   - "대략 맞겠지"로 넘어가지 않는다 — 모든 값을 명시적으로 확인한다
   - 변환할 수 없는 값(구조 차이, 라이브러리 한계)은 문서화한다

3. **검증** (Agent 결과를 맹신하지 않는다)
   - Agent 작업 완료 후 매핑표의 모든 항목에 체크 표시한다
   - 미처리 항목이 있으면 추가 반영한다
   - `npm run build && npm run test:unit` 통과 확인

4. **디자인 정본 관리**
   - 정본 HTML 파일은 `.stitch-html/`에 보관한다
   - 디자인 시스템 문서는 `.stitch-html/DESIGN.md`를 참조한다
   - variant(초안)와 정본(확정)을 혼동하지 않는다 — 사용자가 확인한 파일만 정본으로 취급한다

## 테스트

- `src/lib/services/` 또는 `src/lib/stores/` 파일 변경 시 대응하는 `.test.ts` 파일을 반드시 추가 또는 업데이트한다.
- vitest, AAA 패턴, 외부 의존성은 `vi.mock()`.
- 실제 발생했던 버그 케이스는 테스트에 포함 (regression test).

## Custom Commands(Claude Skills)

- `/sync` — 코드베이스 스캔 후 현재 아키텍처 파악
- `/catchup` — .spec/history 읽고 이전 작업 맥락 파악
- `/changelog` — 작업 완료 후 변경사항 자동 문서화
- `/generate-tests [파일경로]` — 지정 파일의 테스트 자동 생성
- `/code-reviewer` — 코드 리뷰 수행 (프로젝트 맞춤 체크리스트). 스프린트 작업 주기에서는 쓰지 않고 수시 점검용으로만 남긴다
