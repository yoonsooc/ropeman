# ADR-29: 글자는 IBM Plex Sans 한 벌, 한글은 OS 글꼴에 이름을 붙여 쓴다

- **날짜**: 2026-11-17
- **문제**: 화면이 홍보용 랜딩처럼 보였다. 큰 Space Grotesk 제목, Inter 본문, 두 색 제목, 보라 강조의 조합이 AI가 만든 화면에서 흔한 모양이다. 방향은 애플리케이션 톤(조밀하고 회색, 장식 적음)으로 정했고, 그에 맞는 글꼴이 필요했다. 함께 정할 것이 둘 있었다. 한국 방문자가 많아서 한글을 어떻게 그릴지, 그리고 첫 화면의 글꼴 바이트다. 예전에는 한글을 시스템 글꼴 목록의 다음 이름으로 그려, 굵기와 크기가 라틴 글자와 따로 놀았다.
- **검토 대안**:
  - (A) 지금 그대로 Space Grotesk(제목)와 Inter(본문). 받는 바이트가 가장 많고 위 문제를 그대로 둔다.
  - (B) IBM Plex Sans 하나로 제목과 본문을 쓰고, 한글은 Noto Sans KR 웹 글꼴을 Google의 번호 묶음(`hangul` 슬라이스)으로 싣는다. 모든 OS에서 같은 한글이 나오지만, 한국어 페이지는 첫 화면에 쓰인 글자만큼 슬라이스를 여러 개 받는다.
  - (C) IBM Plex Sans 하나, 한글은 `@font-face`의 `local()`로 OS의 한국어 UI 글꼴(Apple SD Gothic Neo, 맑은 고딕, Noto Sans KR)에 `Ropeman Hangul`이라는 이름을 붙인다. 굵기마다 그 굵기의 글꼴을 가리키고, 한글 범위(`unicode-range`)에만 쓰고, `size-adjust: 94%`로 크기를 맞춘다. 한글 글꼴 파일은 받지 않는다.
  - (D) (C)에 더해 IBM Plex Sans `latin` 파일을 `<link rel="preload">`로 미리 받는다.
- **결정**: (C)를 골랐다.
  - 한국어 페이지가 받는 글꼴은 영어 페이지와 같다. 한글은 OS 글꼴이라 받을 것이 없다.
  - 굵기를 이름마다 맞춰 두어서, 브라우저가 한 글꼴을 인위로 굵게 그리지 않는다. macOS에서 `/ko`를 열어 확인했다(Chrome for Testing 148과 같은 버전의 headless shell, 2026-11-17). 같은 한글 문장을 `'Ropeman Hangul'`과 `'Apple SD Gothic Neo'`로 그린 너비의 비가 굵기 400·500·600·700 모두 0.94였다. `size-adjust: 94%`는 별칭에만 있으므로, 이 비는 별칭이 그렸다는 뜻이다. CDP `CSS.getPlatformFontsForNode`로는 제목(600)이 `AppleSDGothicNeo-SemiBold`, 본문(400)이 `AppleSDGothicNeo-Regular`, 라틴 글자가 IBM Plex Sans 웹 글꼴이었다. 글꼴 이름만으로는 별칭과 `--font-body`의 원래 가족 이름을 가를 수 없어서 너비로 가렸다.
  - `--font-body`에서 시스템 UI 글꼴(`-apple-system`, `Segoe UI`)을 한국어 글꼴 이름보다 앞에 둔다. IBM Plex Sans가 오기 전(`swap`)의 라틴 글자를 한국어 글꼴의 라틴 글리프가 아니라 시스템 UI 글꼴이 그리게 하려는 것이다. 시스템 UI 글꼴에는 한글이 없어서 한글은 그대로 뒤의 한국어 이름으로 떨어진다.
  - 측정(`wrangler pages dev`로 띄운 프로덕션 빌드, 캐시를 끈 첫 방문, 1440x900, 다크, 전송 바이트(헤더 포함), 3회 중앙값, 2026-11-17):

    |                                                         | 글꼴 `/` | 글꼴 `/ko` | 전체 `/` | 전체 `/ko` |
    | ------------------------------------------------------- | -------- | ---------- | -------- | ---------- |
    | 바꾸기 전(main, Space Grotesk + Inter + JetBrains Mono) | 112.0KB  | 112.0KB    | 535.7KB  | 536.9KB    |
    | 바꾼 뒤(IBM Plex Sans + JetBrains Mono, 아이콘 78개)    | 81.3KB   | 81.3KB     | 511.3KB  | 508.4KB    |

    본문 바이트(`responseBodySize`)로 잰 앞 단계 값은 글꼴 110.6KB에서 79.6KB였다. 그 뒤 헤더와 캔버스 도구 막대의 아이콘을 이 글꼴로 옮겨 아이콘이 71개에서 78개가 되었고, 아이콘 글꼴이 7,920바이트에서 8,580바이트로 늘었다. 전체 바이트에는 다시 찍은 히어로 이미지가 두 배 픽셀이라 약 18KB 늘어난 몫이 들어 있다.

  - preload는 하지 않는다. 첫 화면 글꼴은 IBM Plex Sans `latin` 한 파일(약 40KB)과 코드 글꼴, 아이콘 글꼴인데, 셋 다 CSS를 읽자마자 요청된다. preload를 걸면 앱 스크립트와 같은 시점에 회선을 나눠 써서 hydrate가 늦어진다(예전 측정에서 글꼴 요청이 hydrate를 약 1.1초 늦췄다, ARCH 7절). `font-display: swap`이라 글꼴이 늦어도 글자는 먼저 보인다.
- **기각 이유**:
  - (A) 방향을 바꾼 이유 그 자체이고, 바이트도 가장 많다.
  - (B) 한국어 첫 화면에 그 화면의 글자를 담은 슬라이스가 여러 개 더해진다(몇 KB인지는 재지 않았다). 한국 방문자의 첫 화면 속도를 우선으로 둔 결정과 맞지 않는다.
  - (D) 위 hydrate 측정 때문에 뺐다. 글꼴이 늦게 와서 생기는 글자 바뀜(swap)이 문제로 보이면 다시 잰다.
- **결과**:
  - Space Grotesk와 Inter 파일, 라이선스, `--font-display` 토큰을 지웠다. 제목도 `--font-body`이고 크기와 굵기로만 단계를 둔다. 척도에서 쓰지 않게 된 `--font-size-3xl`·`4xl`도 지웠다.
  - 반경을 2·4·6px로 줄였다. 강조색은 선택한 탭의 밑줄과 링크에만 쓴다.
  - 확인하지 못한 것: Windows(맑은 고딕)와 Linux(Noto Sans KR)에서 `local()` 이름이 맞는지, 굵기별 이름(`Malgun Gothic Bold`, `NotoSansKR-SemiBold`)이 실제 설치본과 같은지 보지 못했다. 이름이 맞지 않으면 그 굵기는 `--font-body`의 다음 이름(`Apple SD Gothic Neo`, `Malgun Gothic`, `Noto Sans KR`)으로 그려진다. 한글이 사라지지는 않지만 굵기가 인위로 그려질 수 있다. iOS Safari와 Android Chrome도 확인하지 않았다.
- **재검토 조건**:
  - Windows나 Linux에서 한글 굵기가 맞지 않는다는 사실이 확인되면 그 OS의 PostScript 이름을 더하거나 (B)를 다시 본다.
  - 사용자가 그린 로고나 브랜드가 다른 글꼴을 요구하면 글자 글꼴을 다시 고른다.
  - 실측에서 글꼴 swap이 눈에 띄는 레이아웃 이동(CLS)을 만들면 (D)를 다시 잰다.
