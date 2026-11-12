# ADR-23: 전달은 Bridge가 먼저, Safari와 권한 거부는 로컬 모드로

- **날짜**: 2026-11-12
- **상태**: 제안(Proposed). 아래 "확인하지 못한 것"을 사람이 확인하면 확정한다
- **문제**: 피벗 뒤 스킬이 만든 지도를 사용자에게 보여 주는 길을 정해야 했다. 사용자는 2026-11-12에 Bridge(`ropeman serve`)를 기본으로 정했다. 브라우저에서 노드를 누르면 로컬 CLI가 이름을 붙이고, 파일을 누르면 Bridge가 그 파일만 읽어 넘긴다. 이 방식에는 확인되지 않은 전제가 셋 있었다.
  - 공개 https 페이지(ropeman.dev)에서 `ws://127.0.0.1`로 붙을 수 있는가. Chrome의 로컬 네트워크 접근 제한(Local Network Access, 공개 사이트가 사용자 기기나 사내망에 요청하려면 권한 창에서 허락받게 하는 기능)과 Safari의 혼합 콘텐츠 차단(https 페이지가 암호화되지 않은 `http:`/`ws:` 주소를 부르지 못하게 막는 규칙)이 어떻게 걸리는가.
  - Bridge가 같은 포트에서 뷰어를 `http://127.0.0.1:<port>`로 직접 서빙하면(로컬 모드) 권한 창 없이 붙는가. 그 페이지가 보안 컨텍스트(`window.isSecureContext`가 참이라 `crypto.subtle`, File System Access API 같은 기능을 쓸 수 있는 상태)인가.
  - Bridge가 파일을 읽어 넘겨도 안전한가. 지금까지 Bridge는 프롬프트를 CLI로 넘기기만 했다.
- **검토 대안**:
  - (A) Bridge 연결만. ropeman.dev가 `ws://127.0.0.1`로 붙는다. 사용자는 주소 하나만 알면 된다. Safari는 혼합 콘텐츠로 막고, Chrome은 권한 창을 띄우며 거부하면 끝난다.
  - (B) Bridge 연결 + 로컬 모드. (A)에 더해 Bridge가 같은 뷰어 번들을 `http://127.0.0.1:<port>/`에서 서빙한다. 페이지와 소켓이 같은 출처(scheme, host, port가 모두 같은 주소)라 혼합 콘텐츠도 권한 창도 없다. 대신 Bridge가 정적 파일 서버를 겸하고, 뷰어 번들을 Bridge 패키지에 실어야 한다.
  - (C) JSON 열기만. 스킬이 `ropeman.json`을 쓰고 사용자가 ropeman.dev에서 연다. 모든 브라우저에서 되지만 노드를 눌러도 로컬 CLI가 돌지 않고, 원문을 보려면 폴더를 다시 열어야 한다.
  - (D) wss(암호화된 WebSocket)로 Bridge를 연다. 로컬 인증서를 만들어 신뢰 저장소에 넣어야 한다. 설치 단계가 관리자 권한과 OS별 절차로 늘어난다.
- **결정**: (B). ropeman.dev는 Chromium 계열에서 `loopback-network` 권한을 받아 Bridge에 붙고, Safari와 권한을 거부한 사용자는 로컬 모드로 연다. JSON 열기는 오프라인·공유용으로 남긴다. 시제품(T2-0)에서 Bridge에 아래 셋을 넣었다.
  - Host 검사: 소켓 연결과 모든 HTTP 요청에서 `Host`가 `127.0.0.1:<port>`나 `localhost:<port>`가 아니면 403이다. 공격자 도메인을 127.0.0.1로 돌리는 DNS 리바인딩을 막는다.
  - `file.read`: `--root`로 준 디렉터리 안의 파일 하나를 내용, sha-256, 바이트 크기와 함께 돌려준다. 절대 경로, `..` 탈출, 루트 밖으로 풀리는 심볼릭 링크, 실제 `.env`(앱 `isEnvValueFile`과 같은 규칙), 일반 파일이 아닌 것(디렉터리, FIFO, 장치), 500,000바이트 초과, NUL 바이트가 든 파일(`binary`)을 이유 코드와 함께 거부한다. 열기 전에 `lstat`으로 일반 파일인지 보고, `O_NOFOLLOW|O_NONBLOCK`으로 연 뒤 `fstat`으로 다시 본다. 쓰는 쪽이 없는 FIFO를 막힘 모드로 열면 libuv 스레드 하나가 멈추고, 넷이면 스레드 풀 전체가 멈추기 때문이다. 연결 하나에 동시에 도는 읽기는 8개까지이고 넘으면 `busy`다. `--root`가 없으면 꺼져 있다.
  - 상위 디렉터리 경쟁: `O_NOFOLLOW`는 마지막 경로 성분만 지킨다. realpath와 open 사이에 상위 디렉터리를 루트 밖을 가리키는 심볼릭 링크로 바꾸면 open이 그 링크를 따라간다. 그래서 연 뒤에 요청 경로를 다시 realpath해서 루트 안인지 보고, 그 파일의 dev/ino가 연 파일과 같지 않으면 `changed`로 거부한다. 이 검사는 최선 노력(best-effort)이다. 같은 기계에서 루트 안에 쓸 수 있는 프로세스가 두 검사 사이에 링크를 다시 바꾸면 빠져나갈 수 있다. `openat` 계열로 성분마다 여는 방식은 Node에 없어서 쓰지 않았다.
  - 로컬 모드: `--viewer <dir>`이 그 디렉터리를 소켓과 같은 포트에서 서빙하고, 그 출처를 Origin 허용 목록에 더한다. `.`으로 시작하는 경로 성분(`.env`, `.git/`, `..`)은 요청 경로에서도, 심볼릭 링크를 푼 실제 경로에서도 404다. 그래서 `--viewer .`로 프로젝트를 띄워도 `.env`가 나가지 않는다. 파일은 경로가 아니라 `O_NOFOLLOW`로 연 fd에서 흘려보낸다. 토큰은 주소 해시(`#token=`)로 넘긴다. 해시는 서버로 가지 않는다. 콘솔에는 토큰 값을 따로 찍지 않고, 로컬 모드 주소에만 넣는다. Bridge 모드에서는 토큰이 어디 있는지(토큰 파일 경로, 또는 `--token`·환경 변수)만 알려 준다.
  - Host 검사의 대가: `Host`를 바꿔 쓰는 터널과 포트 포워딩(컨테이너 이름으로 붙는 Docker 포트 매핑, `<distro>.local`로 붙는 WSL 포워딩)은 403이다. 브라우저가 도는 기계에서 `127.0.0.1:<port>`나 `localhost:<port>`로 붙어야 한다. README에도 적었다.
- **기각 이유**:
  - (A)만으로는 Safari 사용자가 쓸 길이 없다. 아래 실측에서 Safari 18.5는 요청을 보내기도 전에 막았다.
  - (C)는 핵심 사용 순간(노드를 누르면 이름이 붙는다)을 못 만든다. 그래서 기본이 아니라 보조로 남긴다.
  - (D)는 로컬 모드가 같은 문제를 인증서 없이 풀기 때문에 설치 비용을 치를 이유가 없다.
- **결과**: 실측은 2026-11-12, macOS 15(Darwin 24.5), Bridge `c60d083`, 시제품 페이지 `bridge/probe/index.html`로 했다. https 경우는 공개 https 출처인 `htmlpreview.github.io`가 저장소의 시제품 페이지를 그대로 띄우게 했고, Bridge는 `--allow-origin https://htmlpreview.github.io`로 띄웠다. 이 출처는 GitHub에 올라온 아무 페이지나 띄우므로, 허용하면 그 모든 페이지가 Bridge에 붙어 CLI를 돌리고 `--root` 아래 파일을 읽을 수 있다. 그래서 측정에만 썼고 기본 허용 목록에 넣지 않는다. "연결"은 Bridge 환영 메시지까지 받은 것이고, "file.read"는 `README.md` 읽기(6,622B, 브라우저에서 다시 계산한 sha-256 일치)와 `.env`·`../outside.txt`·`/etc/hosts` 거부 넷을 모두 확인한 것이다.

  | 브라우저 (정확한 버전)                                    | https 페이지에서 `ws://127.0.0.1`, 권한 없음                                                                                                            | 권한 허락 뒤                                                                           | 로컬 모드 `http://127.0.0.1:<port>`                                           | `permissions.query` 이름 (`loopback-network` / `local-network` / `local-network-access`) |
  | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | Chrome for Testing 148.0.7778.96 (Playwright, headless)   | 막힘. `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`, Bridge에 요청 도달 없음                                                                        | `loopback-network`만 허락해도 연결·file.read 됨. 나머지 두 이름만 허락하면 여전히 막힘 | 권한 창 없이 연결·file.read 됨, 보안 컨텍스트 참                              | 셋 다 인식(`prompt`)                                                                     |
  | Chrome for Testing 148.0.7778.96 (Playwright, 창 모드)    | 권한 창이 뜨고 소켓이 CONNECTING으로 기다림(아무도 고르지 않은 25초 동안 계속 대기). 다른 한 번은 10.5초 뒤 열림(화면을 보던 사람이 허락한 것으로 추정) | 위와 같음                                                                              | (headless와 같다고 보고 따로 안 돌림)                                         | 셋 다 인식                                                                               |
  | Chrome for Testing 147.0.7727.15 (Playwright, headless)   | 막히지 않음. 권한 없이 연결·file.read 됨                                                                                                                | 해당 없음                                                                              | 연결·file.read 됨                                                             | 셋 다 인식                                                                               |
  | Chrome for Testing 145.0.7632.6 (Playwright, headless)    | 막히지 않음                                                                                                                                             | 해당 없음                                                                              | 연결·file.read 됨                                                             | 셋 다 인식                                                                               |
  | Safari 18.5 (실제 앱, `open -a Safari`)                   | 막힘. 8초 안에 `readyState` 3(CLOSED), close 이벤트 없음, Bridge에 요청 도달 없음. 혼합 콘텐츠 차단으로 판단                                            | 권한 개념 없음                                                                         | 연결·file.read 됨, 보안 컨텍스트 참, `crypto.subtle` 있음. `localhost`도 같음 | 셋 다 `TypeError`(모름)                                                                  |
  | Playwright WebKit 26.0 (Safari 아님, 대리 측정)           | 막힘. Safari 18.5와 같은 모양(`readyState` 3, Bridge에 요청 도달 없음)                                                                                  | 권한 개념 없음                                                                         | 연결·file.read 됨, 보안 컨텍스트 참                                           | 셋 다 `TypeError`                                                                        |
  | Playwright Firefox 146.0.1 (정식 Firefox 아님, 대리 측정) | 막히지 않음. 권한 창 없이 연결·file.read 됨                                                                                                             | 해당 없음                                                                              | 연결·file.read 됨, 보안 컨텍스트 참                                           | 셋 다 `TypeError`                                                                        |
  - 모든 경우에 https 페이지와 로컬 모드 페이지 모두 `isSecureContext`가 참이었다. `http://127.0.0.1`은 브라우저가 "잠재적으로 신뢰할 수 있는 출처"로 다루기 때문이다.
  - Chrome for Testing은 정식 Chrome의 단계적 출시 설정(field trial)을 받지 않는다. 그래서 147에서 안 막힌 것이 정식 147에서도 그렇다는 뜻은 아니다. 뷰어는 버전으로 판단하지 말고 `permissions.query({ name: 'loopback-network' })`의 상태와 실제 연결 결과로 판단해야 한다.
  - 권한 이름: `127.0.0.1`을 여는 것은 `loopback-network`이다. `local-network`와 `local-network-access`도 질의는 되지만 따로 허락해도 루프백은 열리지 않았다. 권한 안내 카드(T2-5)는 `loopback-network`를 본다.
  - `claude -p` 중계는 바뀐 서버에서 실제 CLI로 한 번 돌렸다(프롬프트 "Reply with exactly the word: pong"에 7.8초 뒤 `pong`을 돌려받았다).
  - 실제 SvelteKit 빌드를 로컬 모드로 서빙하려면 다음이 필요하다(이번에는 옮기지 않았다).
    - 정적 산출물: 지금은 `adapter-cloudflare`다. 루트 레이아웃이 `prerender = true`, `ssr = false`라 `adapter-static`(또는 Cloudflare 산출물의 정적 부분)으로 같은 번들을 만들 수 있다. Bridge 패키지가 이 번들을 싣는다.
    - SPA 대체 경로: 미리 렌더링되지 않은 주소(`/share/[slug]` 같은 동적 경로)는 `index.html`로 돌려야 한다. 지금 `viewer.ts`는 없는 파일에 404를 준다.
    - Worker 호출: demo·proxy·share·explore Worker의 `ALLOWED_ORIGINS`에 `http://127.0.0.1:<port>`가 없고 포트도 바뀐다. 로컬 모드에서는 AI 호출을 Bridge(로컬 CLI)로 보내고 Worker를 부르지 않거나, 기본 포트 하나만 허용 목록에 넣어야 한다.
    - 그 밖에 `.wasm` MIME은 이미 맞췄다(`application/wasm`). WebGPU 모델이 `SharedArrayBuffer`를 쓰게 되면 COOP/COEP 헤더가 필요하다.
  - 확인하지 못한 것(사람이 손으로 확인해야 한다):
    - 정식 Google Chrome과 Edge. 설치되어 있지 않다. 권한 창의 문구, "이번만 허용"과 "항상 허용"의 차이, 거부 뒤 다시 묻는지.
    - ego lite 0.6.2.9(Chromium 156 계열). 작업 공간 제어가 사용자에게 넘어가 있어 브라우저 명령이 멈췄다. 규칙대로 다시 시도하지 않았다.
    - 실제 Firefox. 설치되어 있지 않아 Playwright Firefox 146으로 대신했고, 거기서는 권한 창 없이 붙었다. 정식 Firefox가 로컬 네트워크 접근 제한을 켜면(설정 `network.lna.*`) 권한 창이 생길 수 있는데, 그 상태는 보지 못했다.
    - 권한 창 자체의 화면. 화면 기록 권한이 없어 창 모드 캡처가 바탕 화면만 찍혔다.
    - Safari 화면 캡처. 같은 이유로 결과는 페이지가 보고용 로컬 서버로 보낸 JSON으로만 남겼다.

- **재검토 조건**:
  - Safari가 https 페이지의 `ws://127.0.0.1`을 혼합 콘텐츠에서 빼면, 로컬 모드를 Safari 전용 경로에서 대체 경로로 내린다.
  - Chrome이 `loopback-network` 대신 다른 권한 이름을 쓰거나 루프백을 권한 없이 허용하면 T2-5 안내 카드를 고친다.
  - 로컬 모드 번들 크기 때문에 Bridge 패키지 설치가 눈에 띄게 느려지면, 번들을 첫 실행 때 받는 방식을 검토한다.
  - Bridge가 `--root` 밖 파일이나 실제 `.env`를 넘긴 사례가 하나라도 나오면 `file.read`를 다시 설계한다.
