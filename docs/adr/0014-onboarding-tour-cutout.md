# ADR-14: 온보딩 투어 cutout 패턴

- **날짜**: 2026-04-03
- **문제**: 투어 하이라이트 영역을 만드는 데 SVG mask 또는 별도 overlay 모두 복잡하고 성능 저하
- **결정**: `position: fixed` + `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` 트릭으로 cutout 생성 — 작은 투명 박스의 box-shadow가 화면 전체를 dim 처리
- **결과**: SVG 없이 cutout 효과 구현, transition으로 부드러운 이동, 대형 요소(뷰포트 60%+)는 cutout 없이 overlay만 사용 (`.no-cutout` 클래스)
