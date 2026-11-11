# Security Audit — YYYY-MM-DD (sprint-NN)

**감사 일시**: YYYY-MM-DD
**감사자**: Claude Code (security-audit 스킬)
**대상 브랜치/커밋**: `sprint/YYYY-MM-DD-NN` / commit `<hash>`
**모드**: Full run / 경량 모드 (Phase 3 생략)
**참조**:

- 공격면 맵: `.claude/skills/security-audit/references/attack_surface_map.md`
- False positive: `.claude/skills/security-audit/references/known_false_positives.md`
- 이전 감사: `.spec/reviews/security-<prev-date>.md`

---

## Executive Summary

3줄 이내로 요약. Critical/High 개수, 주요 변경, 이전 감사 대비 추세.

- Critical: **N개** (신규 N / 미해결 이월 N)
- High: **N개**
- Medium: **N개**
- Low / Info: **N개**

---

## Phase 1 — Automated (10~15분)

### Dependency CVEs

```
# bun pm audit 출력
...
```

```
# edge-proxy npm audit 출력
...
```

```
# bridge npm audit 출력
...
```

```
# osv-scanner 출력 (선택)
...
```

**요약**: 발견된 고위험 CVE N개. 상세는 Findings Register 참조.

### Secret Leak Scan

Phase 1 secret patterns로 검색한 결과:

| Pattern                       | Hits | 검토 결과                |
| ----------------------------- | ---- | ------------------------ |
| `sk-...`                      | N    | False positive N, 실제 N |
| `AIza...`                     | N    | ...                      |
| `ghp_...`                     | N    | ...                      |
| `-----BEGIN PRIVATE KEY-----` | N    | ...                      |

실제 유출 의심 항목: (없음 / 파일:라인)

### Risky API Inventory

| Pattern                | Hits | Safe (known FP)     | 신규 검토 필요 |
| ---------------------- | ---- | ------------------- | -------------- |
| `{@html}`              | 8    | 8 (모두 등록됨)     | 0              |
| `eval(`                | 0    | —                   | —              |
| `child_process`        | 1    | 1 (bridge intended) | 0              |
| `path.join` with input | N    | ...                 | ...            |

### 외부 CDN / SRI

- `src/app.html` 외부 로드 3개 (fonts.googleapis, fonts.gstatic, cloudflareinsights): SRI 없음
- 변경 사항: (이전 감사 대비)

---

## Phase 2 — Agent Findings (15~25분)

각 Agent의 원본 출력을 그대로 첨부. 보고서 Findings Register에서 통합 관리.

### Agent A — Edge Worker Auditor

> Output:
> (Agent A의 보고 전문 붙여넣기)

### Agent B — SPA Auditor

> Output:
> (Agent B의 보고 전문 붙여넣기)

### Agent C — Infra / CI Auditor

> Output:
> (Agent C의 보고 전문 붙여넣기)

---

## Phase 3 — Threat Scenarios (10~20분, 선택 가능)

### 재검토 결과 (기존 seed)

| ID  | 제목                  | 이전 상태 | 현재 상태 | 변경 사유 |
| --- | --------------------- | --------- | --------- | --------- |
| S-1 | demo Gemini 쿼터 소진 | Active    | ...       | ...       |
| S-2 | Explore 스냅샷 오염   | Active    | ...       | ...       |
| ... |                       |           |           |           |

### 신규 시나리오

(형식은 threat_scenarios_seed.md의 템플릿 따름)

---

## Findings Register

**본 보고서의 핵심**. Critical/High는 즉시 TASK-\*.md로 승격.

| ID   | Severity | Area        | File:Line                              | Title                       | Owner | Due         | Status |
| ---- | -------- | ----------- | -------------------------------------- | --------------------------- | ----- | ----------- | ------ |
| F-01 | Critical | Edge / demo | edge-proxy/src/demo.ts:73              | Upstream error leak         | —     | sprint-NN+1 | Open   |
| F-02 | High     | SPA         | src/lib/services/apiKeyValidator.ts:30 | Google API key in URL query | —     | sprint-NN+1 | Open   |
| F-03 | Medium   | Infra       | edge-proxy/wrangler.share.toml:18      | KV id placeholder           | —     | sprint-NN   | Open   |
| ...  |          |             |                                        |                             |       |             |        |

**Status 종류**: Open / In-Progress / Mitigated / WontFix / Moved-to-FP

---

## False Positives Confirmed

이번 감사에서 `known_false_positives.md`에 추가 또는 Strike 카운트를 올린 항목.

| FP ID | File:Line               | Source      | 판정 이유              | Strike (before → after) |
| ----- | ----------------------- | ----------- | ---------------------- | ----------------------- |
| FP-7  | wrangler.\*.toml [vars] | Secret Grep | public ALLOWED_ORIGINS | 1 → 2                   |
| ...   |                         |             |                        |                         |

---

## Diff vs Previous Audit

이전 감사(`.spec/reviews/security-<prev-date>.md`) 대비 변경점.

### 새로 열린 Findings

- F-XX: ...

### Mitigated (해결됨)

- F-YY: 이전 High, 현재 Closed. 커밋 `<hash>`에서 수정.

### Status 변화 없음 (이월)

- F-ZZ: 3회째 이월, 우선순위 재평가 필요

### Attack Surface 변화

- 신규 워커/엔드포인트/의존성: ...
- 제거된 공격면: ...

---

## Action Items (다음 스프린트 권장)

1. Critical/High 수정 (Owner 배정 + Due date)
2. Medium 중 Quick Win으로 분류된 항목 P1 편입 제안
3. 중장기 (CSP, Dependabot, Bridge sanitization 등) 별도 스프린트 제안
4. 체크리스트 문서 업데이트 사항 (attack_surface_map.md, known_false_positives.md)

---

## 감사 메타

- **소요 시간**: Phase 1 NN분 / Phase 2 NN분 / Phase 3 NN분 / 정리 NN분 = 총 NN분
- **도구 실행 환경**: macOS / Ubuntu / (CI)
- **false positive 승격**: N건
- **LLM hallucination 배제**: Read 도구로 실증한 항목 N건
