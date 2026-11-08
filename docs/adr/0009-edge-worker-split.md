# ADR-9: Edge Worker 분리

- **날짜**: 2026-03-18
- **문제**: 단일 Worker에서 Demo + BYOK 프록시 역할 혼재
- **결정**: `ropeman-demo` (서버키 + rate limit) + `ropeman-proxy` (BYOK pass-through) 분리
- **결과**: 독립 배포, CORS/secret 분리 관리
