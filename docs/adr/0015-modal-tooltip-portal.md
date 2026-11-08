# ADR-15: 모달 내부 툴팁 포털 패턴

- **날짜**: 2026-04-03
- **문제**: SettingsModal info 툴팁이 모달 본문의 `overflow: auto`에 의해 잘림. 일반적인 CSS hover 툴팁(`position: absolute`)으로는 모달 영역을 벗어날 수 없음
- **결정**: 툴팁을 모달 body 밖으로 이동, `position: fixed` + JS로 hover 시 위치 계산(`getBoundingClientRect`). 별도 portal 라이브러리 없이 같은 컴포넌트 내에서 처리
- **결과**: 모달 overflow에 영향 없이 툴팁 표시, 화면 경계에 클램핑되어 잘림 방지
