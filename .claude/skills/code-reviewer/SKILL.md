---
name: code-reviewer
description: Project-specific code review for Ropeman. Reviews changed files against domain knowledge (Svelte 5 runes, AI tracks, Edge Workers, file limits) and reports Critical/Warning/Suggestion issues. Use before opening a PR, after implementing a feature, or when reviewing a diff.
---

# Code Reviewer (Ropeman)

Ropeman 프로젝트 맞춤 코드 리뷰 스킬. 변경된 파일을 프로젝트 도메인 지식(Svelte 5 runes, AI provider, Edge Workers, MAX_FILES 등)에 따라 검토합니다.

## 수행 절차

### 1. 변경 파일 수집

- 리뷰 대상은 리뷰하는 변경(diff나 PR)에 든 소스 파일이다 (빌드 산출물 제외)
- 커밋 전 변경: `git diff --stat HEAD`와 `git status -u`(untracked 파일)
- 브랜치나 PR: `git diff --stat main...HEAD` 또는 `gh pr diff <번호> --name-only`

### 2. Agent로 리뷰 위임

`Explore` 서브에이전트에 리뷰를 위임합니다. 이유: 메인 컨텍스트에 리뷰 노이즈가 쌓이지 않고, 여러 파일을 병렬 검토 가능.

프롬프트에 포함할 내용:

- 리뷰 대상 파일 목록 (신규/수정 분리)
- `references/code_review_checklist.md`의 체크리스트 항목
- `references/common_antipatterns.md`의 알려진 안티패턴
- 보고 형식: **Critical / Warning / Suggestion** 3단계, 파일명 + 라인 넘버 포함
- 응답 길이 제한 (보통 300~500단어)

### 3. 이슈 분류 및 수정

| 심각도         | 처리                                       |
| -------------- | ------------------------------------------ |
| **Critical**   | 즉시 수정 (타입 안전성, 보안, 데이터 손실) |
| **Warning**    | 이 변경에서 수정, 미루면 이유를 PR에 적음  |
| **Suggestion** | 판단 후 수정 또는 스킵                     |

수정 후 리뷰어 에이전트를 **다시 호출하지 않음**. 대신 아래 4단계로 검증.

### 4. 재검증

- `npx vitest run` — 전체 단위 테스트 통과
- `npm run build` — 빌드 성공
- 둘 다 통과해야 리뷰 완료

실패 시: 이슈 재분석 → 수정 → 재실행. 절대 `--no-verify`로 우회하지 않음.

### 5. 안티패턴 기록

리뷰 중 **새로운 유형의 안티패턴**을 발견하면 `references/common_antipatterns.md`에 추가합니다. 형식:

```markdown
## AP-{N}: {패턴 이름}

**증상**: 어떤 코드가 문제인가
**원인**: 왜 발생하는가
**해결**: 어떻게 고치는가
**관련 PR**: #N (또는 커밋)
```

한 번이라도 동일 패턴이 반복되면 반드시 기록해서 다음 변경에서 예방합니다. 기존 항목의 `관련 스프린트` 값은 기록 당시의 날짜 표시로 남겨 둡니다.

## 참조 문서

- [`references/code_review_checklist.md`](references/code_review_checklist.md) — 항목별 체크리스트 (구조, Svelte 5 runes, AI track, Edge, 성능, UX, 빌드, 문서)
- [`references/coding_standards.md`](references/coding_standards.md) — 코딩 규약 상세
- [`references/common_antipatterns.md`](references/common_antipatterns.md) — 프로젝트에서 발견된 안티패턴 카탈로그

## `simplify` 스킬과의 관계

Claude Code에는 내장 `simplify` 스킬이 있습니다 ("변경된 코드의 재사용성/품질/효율성 검토 후 수정"). 역할 분담:

- **`code-reviewer`**: Ropeman 도메인 지식 기반 리뷰 (프로젝트 규칙, 안티패턴, Svelte 5 패턴) — 변경(PR) 단위
- **`simplify`**: 범용 코드 간소화 (중복 제거, 과도한 추상화 정리)
- **`security-audit`**: 배포 전이나 큰 변경 뒤의 심층 보안 감사 (OWASP API Top 10, 공격면 맵, 위협 시나리오). `.claude/skills/security-audit/` 참조.

함께 쓸 때는 **`code-reviewer` 먼저 실행** → 이슈 수정 → 필요 시 `simplify`로 추가 정리 → 배포 전 `security-audit`로 심층 점검.

## 안티 사용 사례

- **단일 파일 수정 후** — `code-reviewer` 과잉, 직접 검토가 빠름
- **오타/포매팅** — `lint` + `prettier`가 커버
- **PR 자동 리뷰** — CI 파이프라인으로 처리 (이 스킬은 로컬 사전 검토용)
