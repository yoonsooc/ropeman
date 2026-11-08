# ADR-13: 코드 구조 요약 경로 매칭 (suffix lookup)

- **날짜**: 2026-04-03
- **문제**: 드릴다운 분석 시 AI가 반환한 `filePaths`(`src/lib/foo.ts`)와 클라이언트 `astMap` 키(`ropeman/src/lib/foo.ts`)의 루트 프리픽스 불일치로 `extractSubSkeleton`이 빈 결과 반환 → "No files in domain" 에러
- **결정**: `astKeysBySuffix` Map을 구축하여 정확한 매칭 후 suffix 매칭 fallback 적용 (key + slash 이후 substring 모두 등록)
- **결과**: 모든 드릴다운 분석이 정상 동작, 별도 AI 프롬프트 수정 없이 클라이언트 측에서 해결
