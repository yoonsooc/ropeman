---
name: sprint
description: Run or finalize a Ropeman sprint — pick tasks from the PRD roadmap, track Task status, and on "마무리" update the PRD's six fields, Task files and changelog, then open and merge the finalize PR. Use only when the user asks to run a sprint or to finalize one (스프린트 실행, 스프린트 마무리).
---

# 스프린트 실행과 마무리 (Ropeman)

일상 작업 주기(단위 브랜치, 커밋 A/B, 리뷰 보고서)는 `CLAUDE.md`에 있다. 이 스킬은 사용자가 스프린트 실행이나 마무리를 요청했을 때만 쓴다.

## 실행 규칙

1. `.spec/PRD.md`의 '7. 우선순위 및 로드맵'과 `.spec/tasks/`의 Task md 파일로 대상을 파악한다.
2. 가능하면 에이전트를 나눠 Task를 병렬로 수행한다. 각 Task는 개발 → 테스트 → 코드 리뷰 순서.
3. Task 상태: 작업 시작 시 `In-Progress`, DoD를 전부 충족하면 `Done`.
4. 스프린트는 최대 4개 Task. 미완료 Task가 있으면 포함하고 P1에서 가져와 4개를 채운다.

## 마무리 절차 ("마무리" 요청 시에만)

작업과 리뷰가 모두 끝난 뒤 메타데이터 갱신과 push·PR만 한다. 마무리는 스프린트 작업의 끝이 아니라 사용자 요청으로 시작하는 짧고 독립된 단계다.

1. working tree가 clean해야 한다(모든 코드 변경은 이미 커밋됨).
2. **PRD 6개 필드를 전부 갱신한다.** 하나라도 빠지면 안 된다.
   - `최종 업데이트` → 오늘(UTC, pre-push 훅이 확인)
   - `버전` → 마이너 증가(1.0.0 → 1.1.0)
   - `상태` → "스프린트 {id} 완료"
   - `7. 우선순위 및 로드맵` → 이전/P0/P1 갱신
   - `8. 변경 이력` → 행 추가
   - `5. 구현 현황` → 태스크 상태 반영
3. Task 파일의 상태와 DoD를 갱신한다(`.spec/tasks/TASK-*.md` frontmatter와 본문).
4. Changelog `.spec/history/{sprint_id}.md`: 작업 주기 커밋 요약(A 커밋과 B 커밋 구분), 리뷰 보고서 링크(`.spec/reviews/{sprint_id}-review.md`).
5. `sprint/{sprint_id}` 브랜치에 커밋 `docs: finalize sprint {sprint_id}`(PRD 버전, Task 상태, changelog 요약). `.spec`은 git 밖이므로 빈 커밋이어도 된다.
6. Push → PR. 제목은 완료 태스크 요약, 본문은 완료/미완료 태스크, 주요 변경사항, 리뷰 보고서 링크. 커밋 이력은 feat → review → (반복) → docs(finalize).
7. 검증 통과와 PR CI 통과 후 `gh pr merge --merge`(squash 금지). 사용자 승인 단계는 없다.

## PRD 로드맵 구조 (`7. 우선순위 및 로드맵`)

- **이전 스프린트**: 직전 1개만(그 전 이력은 `.spec/history/`)
- **P0 — 현재 스프린트**: 최대 4개
- **P1 — 다음 스프린트**: 그다음 우선순위
- P2 이후는 각 태스크 파일의 우선순위 속성으로 관리한다.
- 스프린트 종료 시 승격: 완료 → 이전, 미완료 → P0 잔류, P1에서 채움, P2 중 준비된 것 → P1.
