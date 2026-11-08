# ADR-16: SvelteKit 내장 /docs 라우트 + mdsvex

- **날짜**: 2026-04-09
- **문제**: 신규 기능(GitHub URL, 공유 링크, CI 연동 등) 추가에 따른 사용자 학습 자료 필요. Help 모달(4탭)만으로는 깊이 있는 정보 제공 불가. 검색 엔진 노출(SEO)도 강화 필요
- **검토 대안**: (A) SvelteKit 내장 `/docs` 라우트 + mdsvex, (B) Starlight 별도 도메인(docs.ropeman.dev), (C) Mintlify SaaS
- **결정**: 옵션 A 채택 — 같은 코드베이스 + 동일 디자인 시스템(Stitch) + 단일 배포 파이프라인 + Svelte 공식 사이트가 검증한 방식
- **기각 이유**: B는 디자인 불일치/별도 배포 부담, C는 SaaS 락인 + 유료화 우려
- **결과**: `src/routes/docs/[...slug]/+page.svelte` + `src/content/docs/{ko,en}/*.md` 구조. ropeman.dev/docs 통합 SEO. 검색은 향후 Algolia DocSearch 무료 신청 (오픈소스 한정)
- **참조**: TASK-D2-docs-site.md
