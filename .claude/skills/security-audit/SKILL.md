# Security Audit (Ropeman)

스프린트 종료 시 Ropeman 프로젝트의 보안 태세를 점검하기 위한 **재사용 가능한 감사 프로세스**다. 유료 도구 없이 Claude Code 내장 기능(Agent/Grep/Bash) + OSS(`bun pm audit`, `osv-scanner`)만으로 40~70분 내 실행된다.

`code-reviewer`가 PR 단위의 도메인 리뷰라면, 이 스킬은 **스프린트 단위의 심층 보안 감사**로 역할이 분리된다.

## 언제 실행하나

- 스프린트 종료 직전 (마무리 커밋 직후, 배포 전)
- 신규 Worker / KV namespace / 외부 API 연동이 추가된 직후
- Cloudflare Pages / Worker 배포 스크립트가 변경된 직후
- 의존성 대규모 업데이트 후

## 실행 절차 (Phase 1 → 2 → 3)

**경량 모드**: 취업/다른 작업과 충돌 시 Phase 3을 생략해 30~40분으로 단축. 단 2회 연속 skip 시 다음 감사는 반드시 Full run.

### Phase 1 — 자동 탐지 (10~15분)

기계가 판단 가능한 패턴만 Bash + Grep으로 수집. 결과는 원본 그대로 보고서에 붙여넣는다.

1. **의존성 CVE 스캔**

   ```sh
   # 루트 (SvelteKit 앱)
   bun pm audit 2>&1 | tee /tmp/security-audit-deps-root.txt

   # edge-proxy (Cloudflare Workers)
   (cd edge-proxy && npm audit --production) 2>&1 | tee /tmp/security-audit-deps-edge.txt

   # bridge (로컬 CLI)
   (cd bridge && npm audit --production) 2>&1 | tee /tmp/security-audit-deps-bridge.txt

   # 선택: osv-scanner (설치돼 있으면 더 포괄적)
   osv-scanner --lockfile=bun.lock --lockfile=bridge/package-lock.json 2>&1 \
     | tee /tmp/security-audit-osv.txt || true
   ```

2. **시크릿 누출 패턴 Grep**

   Claude Grep 도구로 `references/owasp_checklist.md`의 "Phase 1 secret patterns" 섹션 패턴을 순회. git 이력 포함 조사는 `git log --all -p | grep -iE "<pattern>"`으로 수동 보강.

3. **위험 API 인벤토리**

   `references/owasp_checklist.md`의 "Phase 1 risky API patterns" 섹션 — `{@html}`, `eval(`, `new Function(`, `innerHTML`, `child_process`, `exec(`, `spawn(`, `path.join`, `../` 리터럴 등.

4. **CSP / SRI / 외부 리소스 인벤토리**

   ```sh
   # app.html과 layout의 외부 CDN 참조 전수
   grep -rnE 'https?://(fonts\.googleapis|fonts\.gstatic|cdn\.|.*\.workers\.dev)' src/
   ```

### Phase 2 — Agent 맞춤 리뷰 (15~25분)

Task 도구로 **Explore subagent 3개를 병렬 dispatch**. 각 agent 프롬프트는 `references/owasp_checklist.md`의 "Phase 2 agent prompt seeds" 섹션을 **반드시 그대로 포함**한다. 컨텍스트로 `references/attack_surface_map.md`와 `references/known_false_positives.md`를 함께 주입한다 (중복 지적 억제).

- **Agent A "Edge Worker Auditor"**: `edge-proxy/src/*.ts`
- **Agent B "SPA Auditor"**: `src/**/*.{ts,svelte}`
- **Agent C "Infra/CI Auditor"**: `.github/workflows/`, `wrangler*.toml`, `bridge/src/`, `bun.lock`, `package.json`

각 Agent 출력을 보고서의 Phase 2 섹션에 그대로 붙여넣는다.

### Phase 3 — 위협 모델 시나리오 (10~20분, 선택 가능)

자동 스캐너가 놓치는 **비즈니스 로직 결함**에만 집중. `references/threat_scenarios_seed.md`의 기존 시나리오 중 여전히 유효한 것을 재활용 + 신규 3~5개 추가. 템플릿:

```
## S-N: <제목>
- 전제: <공격자가 알고 있는 상태>
- 스텝: <공격 순서>
- 영향: <피해 범위 — 비용/데이터/신뢰>
- 완화: <권장 조치>
- 우선순위: Critical/High/Medium/Low
```

## 산출물

`templates/report_template.md`를 복사해 `.spec/reviews/security-YYYY-MM-DD.md`로 저장 후 각 섹션을 채운다.

- **Findings Register** 표가 핵심 산출물. Severity(Critical/High/Medium/Low) + Owner + Due 컬럼 필수.
- Critical/High는 즉시 티켓(TASK-\*.md)으로 승격.
- Medium은 다음 스프린트 P1에 편입 고려.
- Low + False Positive는 `known_false_positives.md`로 이관.

## Findings 처리 규칙

| Severity | 처리                                                    |
| -------- | ------------------------------------------------------- |
| Critical | 스프린트 종료 블로커. 즉시 수정 후 재검증.              |
| High     | 스프린트 종료 후 1주 내 수정. Task 생성.                |
| Medium   | 다음 스프린트 P1 후보.                                  |
| Low      | 누적 관리. 3회 연속 safe 판정 시 permanent safe로 승격. |

**실증 의무**: Findings Register에 등재하기 전 반드시 해당 라인을 Read 도구로 확인해 LLM hallucination을 차단한다.

## False Positive 관리

`references/known_false_positives.md`에 `파일:라인 — 이유 — 재평가 조건` 3요소로 기록. 해당 파일이 변경되면 다음 감사에서 자동 재검토 대상으로 복귀한다.

## 관련 스킬 / 문서

- `.claude/skills/code-reviewer/` — PR 단위 도메인 리뷰. 보안은 표면만.
- `.claude/skills/code-reviewer/references/common_antipatterns.md` — AP-8 (boundary validation) 등을 본 스킬이 교차 참조.
- `docs/adr/` — ADR-9 (Edge Worker 분리), ADR-19 (Explore KV 수동 갱신) 등 보안 관련 아키텍처 결정.

## Anti 사용 사례

- **매 PR마다 실행** — 과잉. PR은 `code-reviewer` 담당.
- **Phase 1만 실행하고 종료** — Agent 리뷰 없이는 비즈니스 로직 결함 발견 불가. 최소 Phase 1 + 2는 수행.
- **외부 유료 도구 도입 시도** — 취업 최우선 원칙 위반. OSS + Claude 내장만 사용.
