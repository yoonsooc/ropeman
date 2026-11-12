---
name: design-import
description: Bring an external design tool's output (Stitch HTML and similar) into Ropeman's Svelte components — mapping table first, exhaustive class-to-CSS conversion, checklist verification, canonical file management. Use when applying a design HTML or mockup from a design tool to the code (디자인 반영).
---

# 디자인 반영 규칙 (Ropeman)

외부 디자인 도구(Stitch 등)의 산출물을 코드에 반영할 때 아래 절차를 따른다.

1. **매핑표 작성** (작업 시작 전 필수)
   - 디자인 HTML의 모든 요소를 나열한다.
   - 각 요소에 대응하는 Svelte 컴포넌트 파일을 매핑한다. 하나의 HTML에 여러 컴포넌트가 들어 있을 수 있으니 빠짐없이 식별한다.
   - 매핑표를 사용자에게 보여주고 확인받은 뒤 작업을 시작한다.

2. **전수 변환** (추정 금지)
   - 디자인 HTML의 모든 클래스를 CSS property-value로 변환한다.
   - 현재 코드의 모든 대응 속성과 1:1로 비교한다. "대략 맞겠지"로 넘어가지 않고 모든 값을 명시적으로 확인한다.
   - 변환할 수 없는 값(구조 차이, 라이브러리 한계)은 문서화한다.

3. **검증** (에이전트 결과를 맹신하지 않는다)
   - 에이전트 작업이 끝나면 매핑표의 모든 항목에 체크 표시한다. 미처리 항목은 추가로 반영한다.
   - `npm run build && npm run test:unit` 통과를 확인한다.

4. **디자인 정본 관리**
   - 정본 HTML은 `.stitch-html/`에 보관하고, 디자인 시스템 문서는 `.stitch-html/DESIGN.md`를 참조한다.
   - variant(초안)와 정본(확정)을 혼동하지 않는다. 사용자가 확인한 파일만 정본으로 취급한다.
