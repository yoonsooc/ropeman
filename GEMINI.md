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

- 브라우저 전용 (SSR 없음, adapter-static)
- FileSystemHandle 한계 → MAX_FILES=2000, MAX_FILE_SIZE=500KB

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

- 스프린트 수행 규칙(사용자가 스프린트 실행을 요청했을 때만 적용)
  1. `.spec/PRD.md`의 '7. 우선순위 및 로드맵' 에 따라 `.spec/tasks` 폴더의 각 Task별 요구사항(md 파일)을 파악한다.
  2. Task 병렬 수행
     2-1. Task들을 Agent Team을 구성하여, 가능하면 병렬로 수행할 수 있도록, 충돌 발생이 가능한 지점을 파악하여 계획을 세운다.
     2-2. 각 Task는 '개발', '테스트', '코드 리뷰' 단계를 거친다.
  3. 각 Task별 최초 작업 시 상태를 'To-Do' -> 'In-Progress'로 변경
  4. 각 Task별 DoD를 모두 정상적으로 완료했을때만 결과를 상태를 'Done'으로 변경
  5. 스프린트 완료 후 `.spec/PRD.md`와 각 Task별 파일 내용(상태, DoD)을 업데이트한다.
  6. 각 스프린트는 최대 4개의 Task를 포함한다. 즉, 현재 스프린트에서 미완료된 Task를 포함하며, P1(다음 우선순위) 목록에서 가져와 4개를 구성한다.

- 스프린트 종료 시 PRD 로드맵 업데이트 규칙
  - PRD '7. 우선순위 및 로드맵'은 3개 섹션으로 관리한다:
    - **이전 스프린트**: 직전 스프린트 1개만 표시 (sprint_id + 완료/미완료 태스크). 이전 이력은 `.spec/history/`에서 관리.
    - **P0 — 현재 스프린트**: 다음에 실행할 스프린트 대상 (최대 4개)
    - **P1 — 다음 스프린트**: 그 다음 우선순위 대상
  - P2 이후 항목은 PRD 로드맵에 표시하지 않고, 각 태스크 파일의 '우선순위' 속성으로 관리한다.
  - 스프린트 종료 시 자동 승격:
    1. 완료된 P0 태스크를 '이전 스프린트'로 이동
    2. 미완료된 P0 태스크는 다음 '현재 스프린트'에 잔류
    3. P1 태스크에서 가져와 '현재 스프린트'를 최대 4개로 채움
    4. `.spec/tasks/` 전체를 스캔하여 P2 태스크 중 준비도가 높은 것(의존성 해소, 기반 기능 완료 등)을 P1으로 승격

- 스프린트 ID 규칙: `YYYY-MM-dd-{n}` (예: `2026-03-03-01`). 날짜 + 당일 순번(01부터). PRD 로드맵, history 파일명, changelog 모두 이 ID를 사용한다.
- 매 스프린트 완료 시: `/changelog` → `.spec/history/{sprint_id}.md`에 변경사항 기록. 당일 기존 파일은 무시하고 순번을 증가시킨다.

- 스프린트 마무리 시 반드시 사용자 승인을 받은 후 진행한다
  - 모든 태스크 구현 완료 후, 커밋/PR 생성 전에 사용자에게 결과를 보고하고 마무리 진행 여부를 확인받는다
  - 사용자가 승인하면 아래 PR 생성 규칙에 따라 진행한다

- 스프린트 마무리 시 PR 생성 규칙
  1. 스프린트 브랜치를 `sprint/{sprint_id}` 형식으로 생성한다 (예: `sprint/2026-03-12-01`)
  2. 변경사항을 커밋하고 remote에 push한다
  3. `gh pr create`로 main 브랜치를 base로 PR을 생성한다
  4. PR 제목: `sprint/{sprint_id}` 완료 태스크 요약
  5. PR 본문에 완료/미완료 태스크, 주요 변경사항을 포함한다

## File Ownership (멀티 에이전트 충돌 방지)

- `src/lib/stores/` — 스토어 변경은 한 에이전트만
- `src/lib/services/` — 서비스 변경은 한 에이전트만
- `src/lib/components/` — UI 변경은 한 에이전트만
- 같은 파일을 두 에이전트가 동시에 수정하지 않도록 Task에 파일 경로 명시

## Bug Report 규칙

- 스프린트 진행 중 버그를 발견하고 해결할 때마다 `.spec/bug-report/`에 기록한다.
- `.spec/bug-report/INDEX.md` — 버그 유형별 인덱스. 새 유형 추가 시 여기도 업데이트.
- 각 버그 문서(B001~)에는 **증상**, **원인 분류**, **증거**(에러 메시지, 스택 트레이스 등), **해결 방법**, **해결 이력** 포함.
- 기존 유형에 해당하는 버그는 해당 문서의 '해결 이력' 테이블에 날짜 + 문제 + 해결을 추가.
- 새로운 유형의 버그는 새 문서(B00N-xxx.md)를 생성하고 INDEX에 등록.
- `npm install` 후 이상 동작 발생 시 → B006 (의존성 오류) 먼저 의심. `node_modules/.vite` 삭제 후 재설치 시도.

## Custom Commands

.claude/commands 하위의 각 md 파일에 다음 동작들이 명시되어있음.

- `/sync` — 코드베이스 스캔 후 현재 아키텍처 파악
- `/catchup` — .spec/history 읽고 이전 작업 맥락 파악
- `/changelog` — 작업 완료 후 변경사항 자동 문서화
