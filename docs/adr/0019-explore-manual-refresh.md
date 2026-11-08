# ADR-19: 공개 갤러리 — 수동 갱신 + explore KV namespace

- **날짜**: 2026-04-13
- **문제**: SH4 공개 갤러리(`/explore`)는 SEO + UX를 위해 사전 분석 결과가 필요. 클라이언트 매회 분석(옵션 X)은 인기 레포(React 등) 특성상 지연시간이 커 UX 최악. 사전 캐싱(옵션 Y)은 갱신 전략 필요
- **검토 대안**:
  - (X) 클라이언트 매회 분석 — 인프라 0, 항상 최신, **지연시간 최악 (실격)**
  - (Y1) Cloudflare Cron Trigger + Worker 자동 재분석 — 인프라 무료, **구현 비용 높음**: 현재 분석 파이프라인(parserWorker/semanticStore/aiService)이 브라우저 API에 묶여 있어 Worker 런타임 포팅에 상당한 리팩터링 필요
  - (Y2) GitHub Actions + headless Chrome(Playwright)으로 ropeman.dev 자동 방문 — 인프라 무료(public repo), 구현 중간, 추후 자동화 확장 용이
  - (Y3) **수동 갱신** — 로컬에서 직접 분석 → share slug를 갤러리 JSON에 붙여넣기. 인프라 0, 구현 0, 월 1회 15분 유지보수
- **결정**: Y3(수동 갱신) 채택. MVP 갤러리는 6~10개 레포면 충분, 월 1회 갱신으로 staleness 허용. 수요 증가 시 Y2로 자연스럽게 확장 가능
- **기각 이유**: Y1은 "무료"의 대가로 파이프라인 포팅 비용 발생 — 당시 우선순위(Ropeman 최소 마무리)에 배치. Y2는 갤러리 MVP 단계에선 과한 투자
- **인프라 구성**:
  - SH1의 `ROPEMAN_SHARE_STORE` KV는 14일 TTL → 갤러리용 재활용 불가
  - **별도 KV namespace `ROPEMAN_EXPLORE_STORE`** 생성, **TTL 무제한**, 고정 slug 사용 (`react`, `vue`, `svelte` 등)
  - `static/explore-curated.json` — 레포 메타(언어/설명/slug 매핑) + 갱신 날짜
  - `/explore/[slug]` → Edge Worker `GET /explore/{slug}` → KV → snapshot
- **결과**: 신규 개발은 KV namespace 1개 + Worker 엔드포인트 1개 + 수동 갱신 스크립트(`scripts/refresh-explore.ts` — 로컬 실행 가이드). 브라우저 분석 파이프라인 재사용
- **참조**: TASK-SH4-public-gallery.md
