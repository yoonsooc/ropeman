# ADR-8: AI Track 어댑터 패턴

- **날짜**: 2026-03-19
- **문제**: aiService와 semanticAnalysisService에 동일 track 분기 중복 (AP-3)
- **결정**: `aiAdapter.ts`로 단일 `callAI({ system, user, signal })` 진입점 추출
- **결과**: 새 provider 추가 시 aiAdapter만 수정, ~210줄 중복 제거
