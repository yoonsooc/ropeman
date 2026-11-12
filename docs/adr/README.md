# 아키텍처 결정 기록 (ADR)

결정 하나당 파일 하나를 둔다. 이미 내린 결정은 다시 쓰지 않고, 바뀌면 새 ADR을 추가한 뒤 이전 ADR 위에 대체 사실을 표시한다.

## 언제 쓰나

프레임워크, 저장소, 주요 의존성을 도입하거나 교체할 때는 같은 PR에 ADR을 넣는다. 구현 패턴이나 되돌리기 어려운 설계 결정도 근거를 남길 가치가 있으면 쓴다.

## 형식

파일명은 `NNNN-영문-슬러그.md`이고 번호는 이어서 붙인다.

```markdown
# ADR-N: 제목

- **날짜**: YYYY-MM-DD
- **문제**: 왜 결정이 필요했는가
- **검토 대안**:
  - (A) 대안과 장단점
  - (B) 대안과 장단점
- **결정**: 무엇을 골랐고 이유는 무엇인가
- **기각 이유**: 고르지 않은 대안을 뺀 이유
- **결과**: 실제로 달라진 것. 측정값이 있으면 쓴다
- **재검토 조건**: 어떤 사실이 확인되면 이 결정을 다시 볼 것인가
```

검토 대안, 기각 이유, 재검토 조건을 비워 두면 안 된다. 근거 기록이 없는 과거 결정은 추측으로 채우지 말고 기록이 없다고 쓴다.

## 목록

| 번호                                                 | 결정                                                 | 날짜       |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------- |
| [ADR-1](0001-state-raw-for-svelteflow.md)            | $state.raw for SvelteFlow 통합                       | -          |
| [ADR-2](0002-single-writer-effects.md)               | Single-Writer 패턴 for Effects                       | -          |
| [ADR-3](0003-untrack-effect-dependencies.md)         | untrack()로 의존성 차단                              | -          |
| [ADR-4](0004-dev-filesystem-middleware.md)           | Dev 전용 파일시스템 미들웨어                         | -          |
| [ADR-5](0005-state-raw-for-project-store.md)         | $state.raw for projectStore Maps                     | -          |
| [ADR-6](0006-fallback-file-handle.md)                | Fallback File Handle 래퍼                            | -          |
| [ADR-7](0007-prism-theme-css-injection.md)           | Prism 테마 동적 CSS 주입                             | -          |
| [ADR-8](0008-ai-track-adapter.md)                    | AI Track 어댑터 패턴                                 | 2026-03-19 |
| [ADR-9](0009-edge-worker-split.md)                   | Edge Worker 분리                                     | 2026-03-18 |
| [ADR-10](0010-close-brackets-stack.md)               | closeBrackets 스택 기반                              | 2026-03-18 |
| [ADR-11](0011-webgpu-background-download.md)         | WebGPU 다중 모델 + 백그라운드 다운로드               | 2026-03-24 |
| [ADR-12](0012-ai-error-classification.md)            | AI 에러 유형 분류 시스템                             | 2026-03-24 |
| [ADR-13](0013-skeleton-path-suffix-lookup.md)        | 코드 구조 요약 경로 매칭 (suffix lookup)             | 2026-04-03 |
| [ADR-14](0014-onboarding-tour-cutout.md)             | 온보딩 투어 cutout 패턴                              | 2026-04-03 |
| [ADR-15](0015-modal-tooltip-portal.md)               | 모달 내부 툴팁 포털 패턴                             | 2026-04-03 |
| [ADR-16](0016-docs-route-mdsvex.md)                  | SvelteKit 내장 /docs 라우트 + mdsvex                 | 2026-04-09 |
| [ADR-17](0017-html-export-svg-inline.md)             | HTML 내보내기 — SvelteFlow SVG 인라인                | 2026-04-13 |
| [ADR-18](0018-pdf-export-window-print.md)            | PDF 내보내기 — window.print() + @media print         | 2026-04-13 |
| [ADR-19](0019-explore-manual-refresh.md)             | 공개 갤러리 — 수동 갱신 + explore KV namespace       | 2026-04-13 |
| [ADR-20](0020-markdown-outline-and-include-paths.md) | Markdown 개요를 코드 구조 요약에 + 포함 경로 우선    | 2026-11-10 |
| [ADR-21](0021-skeleton-v2-local-code-map.md)         | 스켈레톤 v2는 로컬 코드 지도, AI 전송 형식은 v1 고정 | 2026-11-12 |
| [ADR-22](0022-astryx-tokens-without-package.md)      | astryx 토큰과 규칙만 도입, 패키지 미설치             | 2026-11-12 |
