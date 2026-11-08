# ADR-12: AI 에러 유형 분류 시스템

- **날짜**: 2026-03-24
- **문제**: AI API 에러 시 원시 에러 메시지만 표시되어 사용자 대응 어려움
- **결정**: `classifyAIError()`로 6가지 유형 분류 (TPM/rate_limit/quota/auth/network/unknown), 유형별 맞춤 메시지 + 액션 버튼 제공
- **결과**: 에러 토스트에서 "Skeleton 설정" / "모델 변경" / "API Key 확인" 등 바로가기 제공
