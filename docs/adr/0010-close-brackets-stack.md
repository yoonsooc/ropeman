# ADR-10: closeBrackets 스택 기반

- **날짜**: 2026-03-18
- **문제**: 카운터 기반 `]]}}` 닫기 → JSON 구조 불일치
- **결정**: 열린 괄호를 스택에 push, pop 순서로 닫기
- **결과**: truncated AI 응답의 JSON 복구 성공률 대폭 향상
