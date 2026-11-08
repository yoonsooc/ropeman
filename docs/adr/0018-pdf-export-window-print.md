# ADR-18: PDF 내보내기 — window.print() + @media print

- **날짜**: 2026-04-13
- **문제**: E3 PDF 내보내기는 "오프라인 공식 문서" 용도. 구현 방식에 따라 번들 크기/폰트 호환성/한글 처리가 크게 달라짐
- **검토 대안**:
  - (A) `window.print()` + `@media print` CSS — 브라우저 내장 PDF 엔진 사용, 의존성 0
  - (B) jsPDF + html2canvas — 번들 ~300KB, 한글 폰트 임베딩 필요, 다이어그램은 이미지 캡처
- **결정**: 옵션 A 채택. `/print/[slug]` 또는 인쇄 전용 모드 CSS로 표지/목차/도메인 섹션/페이지 번호 구성, 사용자가 `Ctrl+P` 또는 Export 버튼으로 인쇄 대화상자 호출 → "PDF로 저장" 선택
- **기각 이유**: B는 한글 폰트 문제(glyph 누락), 이미지 캡처 기반이라 PDF 내 텍스트 선택/검색 불가, 번들 증가. A는 OS/브라우저 PDF 엔진이 한글/벡터 텍스트를 자연 처리
- **결과**: `pdfExporter.ts`는 인쇄 뷰 진입 + `window.print()` 래퍼만 담당. 레이아웃은 CSS로 완결. 번들 증가 0
- **참조**: TASK-E3-pdf-export.md
