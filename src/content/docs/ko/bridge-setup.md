---
title: 브리지 설정
description: ropeman serve로 내 컴퓨터의 폴더 지도를 만들고 ropeman.dev/bridge에서 엽니다. 폴더 안의 부분에는 내 Claude Code나 Gemini CLI가 이름을 붙입니다.
category: guides
order: 6
---

**브리지 모드**는 내 컴퓨터에 있는 폴더의 지도를 보여 줍니다. `ropeman serve`(npm 패키지 `@ropeman/bridge`)가 폴더를 읽고, [ropeman.dev/bridge](https://ropeman.dev/bridge) 페이지가 `ws://127.0.0.1:9800`으로 serve에 연결합니다. 폴더를 누르면 그 안의 하위 폴더와 파일이 바로 보이고, 이어서 내 컴퓨터의 CLI(**Claude Code** 또는 **Gemini CLI**)가 각 부분에 이름을 붙입니다. 파일을 누르면 소스가 열립니다.

브리지 모드는 메인 앱과 다른 페이지에서 씁니다. 메인 앱의 AI 모드(데모, API 키, WebGPU)는 [AI 모드 가이드](/docs/ko/ai-modes)를 보세요.

## 내 컴퓨터 밖으로 나가는 것

폴더를 열면 serve가 그 폴더 안 부분들의 구조를 CLI에 보냅니다. 파일 경로, `function parseArgs` 같은 선언된 심볼 이름, 부분별 파일 수와 부분 사이의 import 수가 들어갑니다. 파일 내용과 `.env` 값은 CLI에 보내지 않습니다. CLI는 이 구조를 자기 로그인으로 그 CLI의 제공자에게 보냅니다. 이 경로에 Ropeman 서버는 없습니다.

파일을 열면 serve가 `127.0.0.1`로 그 파일을 페이지에 보냅니다. 실제 값이 든 `.env` 파일, 바이너리 파일, 500 KB가 넘는 파일은 보내지 않습니다.

## 사전 준비

- Node.js 22 이상
- Claude Code나 Gemini CLI를 설치하고 로그인해 둡니다. CLI가 없어도 지도는 볼 수 있고, 폴더는 폴더 이름을 그대로 씁니다.
- Chrome, Edge, Firefox 중 하나. Safari는 ropeman.dev에서 serve에 연결하지 못하므로 [로컬 모드](#로컬-모드로-쓰기)로 serve를 켜세요.

## serve 실행

지도를 만들 폴더에서 serve를 실행하세요.

```bash
cd ~/code/your-project
npx @ropeman/bridge serve --root .
```

`npx`는 처음 한 번 패키지를 내려받습니다. `--cli`를 주지 않으면 serve는 `claude`, `gemini` 순서로 찾아 먼저 찾은 것을 씁니다. 실행하면 아래처럼 출력합니다.

```text
[09:41:02] Using CLI: claude
[09:41:02] Allowed origins: https://ropeman.dev, http://localhost:5173, ...
[09:41:02] Bridge server ready on ws://127.0.0.1:9800
[09:41:02] Open https://ropeman.dev/bridge and paste the token (stored in /Users/you/.ropeman/bridge-token).
[09:41:02] Map and file.read root: /Users/you/code/your-project
[09:41:02] Safari, or the browser blocked the connection? Start again with --local.
```

serve는 토큰 값을 찍지 않고 어디 있는지만 알려 줍니다. 그래서 토큰이 터미널 로그에 남지 않습니다. 토큰은 파일에서 복사하세요.

```bash
cat ~/.ropeman/bridge-token
```

페이지를 쓰는 동안 터미널은 켜 둡니다.

## ropeman.dev에서 연결

1. [ropeman.dev/bridge](https://ropeman.dev/bridge)를 엽니다.
2. **포트**는 `9800`으로 둡니다. `--port`로 serve를 켰다면 같은 번호를 넣습니다.
3. **토큰** 칸에 토큰을 붙여 넣습니다.
4. **연결**을 누릅니다.
5. 브라우저가 ropeman.dev가 이 기기의 앱에 접근해도 되는지 물으면 **허용**을 고릅니다.

serve가 연결을 받으면 지도가 나옵니다. 페이지는 토큰을 저장하지 않고 메모리에만 둡니다. 새로고침하면 토큰을 다시 붙여 넣으세요.

## 브라우저 접근 허용

`https://ropeman.dev` 페이지가 `127.0.0.1`에 연결하면 브라우저는 이를 로컬 네트워크 요청으로 봅니다. 브라우저마다 처리가 다릅니다.

- **Chrome과 Edge**는 Chrome의 로컬 네트워크 접근 권한(`loopback-network`)으로 한 번 묻습니다. **허용**을 고르세요. 묻는 창이 열려 있는 동안 페이지는 답을 기다린다고 표시합니다.
- **Firefox**는 최근 버전부터 같은 방식으로 묻기 시작했습니다. 묻지 않는 버전은 바로 연결합니다.
- **Safari**는 보안 페이지가 `ws://127.0.0.1`에 연결하는 것을 아예 막습니다. [로컬 모드](#로컬-모드로-쓰기)를 쓰세요.

### 차단한 권한 되돌리기

**차단**을 골랐거나 정책이 요청을 막았다면 페이지가 그렇다고 알려 줍니다. 다시 허용하려면 아래처럼 합니다. 메뉴 이름은 영어판 기준입니다.

- **Chrome.** 주소창 왼쪽의 사이트 컨트롤 아이콘을 누르고 **Site settings**(사이트 설정)를 엽니다. **Loopback network**(이전 버전은 **Local network access**)를 **Allow**로 바꾸거나 **Reset permissions**를 누른 뒤 페이지를 새로 고칩니다. 주소창에 `chrome://settings/content/siteDetails?site=https://ropeman.dev`를 붙여 넣어도 됩니다.
- **Edge.** 주소창 왼쪽의 자물쇠 아이콘을 누르고 **Permissions for this site**를 엽니다. 같은 설정을 바꾸고 페이지를 새로 고칩니다. 주소창에 `edge://settings/content/siteDetails?site=https://ropeman.dev`를 붙여 넣어도 됩니다.
- **Firefox.** 주소창 왼쪽의 권한 아이콘을 누르고, 차단된 **Device apps and services** 항목을 지운 뒤 페이지를 새로 고칩니다.

모든 버전에서 이 메뉴 이름을 확인하지는 못했습니다. 브라우저 버전과 언어에 따라 다를 수 있습니다.

## 로컬 모드로 쓰기

로컬 모드에서는 serve가 같은 뷰어를 직접 내줍니다. 페이지와 serve의 출처가 같아서 브라우저가 권한을 묻지 않고, 페이지는 다른 호스트에 요청을 보내지 않습니다. Safari에서도 됩니다.

1. `Ctrl+C`로 serve를 끕니다.
2. `--local`을 붙여 다시 켭니다.

   ```bash
   npx @ropeman/bridge serve --root . --local
   ```

3. serve가 출력한 주소 `http://127.0.0.1:9800/bridge#token=…`를 엽니다.

serve가 토큰을 출력하는 곳은 이 주소뿐입니다. 토큰은 `#` 뒤에 있고, 브라우저는 이 부분을 서버에 보내지 않습니다. 그 탭에서는 새로고침해도 계속 연결됩니다.

## 옵션

| 옵션                     | 하는 일                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `--root <폴더>`          | 이 폴더의 지도를 만들고 변경을 지켜보며, 페이지가 그 안의 파일을 읽게 합니다          |
| `--port <번호>`          | 열 포트 (기본 `9800`)                                                                 |
| `--cli <claude\|gemini>` | 폴더에 이름을 붙일 CLI (기본: 자동 감지)                                              |
| `--token <값>`           | 저장된 토큰 대신 이 토큰을 씁니다                                                     |
| `--allow-origin <url>`   | 이 출처의 연결도 받습니다                                                             |
| `--local`                | `http://127.0.0.1:<포트>/bridge`에서 뷰어를 내줍니다 ([로컬 모드](#로컬-모드로-쓰기)) |
| `--viewer <폴더>`        | 대신 이 폴더를 `http://127.0.0.1:<포트>/`에서 내줍니다                                |

`--root`가 없으면 serve는 지도도 없고 파일도 읽지 않습니다.

serve는 아래 순서로 처음 찾은 토큰을 씁니다.

1. 명령줄의 `--token <값>`
2. 환경 변수 `ROPEMAN_BRIDGE_TOKEN`
3. 파일 `~/.ropeman/bridge-token`

파일은 처음 실행할 때 만들고 다음부터 다시 씁니다. serve는 시작할 때마다 이 파일 권한을 소유자 전용(`0600`)으로 맞춥니다. 새 토큰이 필요하면 파일을 지우세요. 직접 정한 토큰은 16자 이상이어야 합니다. 명령줄 인자는 같은 컴퓨터의 다른 사용자가 `ps`로 볼 수 있으니 `--token`보다 환경 변수나 토큰 파일을 쓰세요.

## serve가 받는 연결

serve는 내 CLI를 실행하고 `--root` 안의 파일을 읽습니다. 그래서 아래 네 가지를 모두 통과한 연결만 받습니다.

- `127.0.0.1`에서만 열립니다. 같은 네트워크의 다른 컴퓨터는 접근할 수 없습니다.
- `Host` 헤더가 `127.0.0.1:<포트>`나 `localhost:<포트>`여야 합니다. 자기 도메인을 `127.0.0.1`로 가리키게 한 사이트는 그 도메인을 `Host`로 보내므로 거절됩니다. 같은 검사로 `Host`를 바꾸는 터널과 포트 포워딩(컨테이너 이름으로 접근하는 Docker 포트 매핑 등)도 거절됩니다.
- 브라우저 연결은 `https://ropeman.dev`와 로컬 개발 서버에서 온 것만 받습니다. `--allow-origin`으로 출처를 더할 수 있습니다. 내가 관리하는 출처만 더하세요. 다른 사람의 페이지를 올리는 출처를 더하면 그 페이지 모두가 내 CLI를 실행하고 내 파일을 읽을 수 있습니다.
- 모든 연결에 토큰이 있어야 합니다.

`claude`는 도구, MCP 서버, 저장된 세션 없이 빈 임시 폴더에서 실행됩니다. Gemini CLI는 셸, 편집, 쓰기, 웹 가져오기 도구와 MCP 서버, 확장 없이 같은 빈 폴더에서 실행됩니다. 자세한 내용은 [bridge/README.md](https://github.com/yoonsooc/ropeman/blob/main/bridge/README.md)에 있습니다.

## 트러블슈팅

### 페이지가 연결하지 못할 때

연결에 실패하면 페이지가 어떤 경우인지 알려 줍니다.

- **브라우저가 권한을 막았습니다.** [권한을 되돌린](#차단한-권한-되돌리기) 뒤 페이지를 새로 고치세요.
- **권한 확인 창에 답하지 않았습니다.** **연결**을 다시 누르고 **허용**을 고르세요.
- **그 포트에서 아무것도 듣고 있지 않습니다.** serve가 꺼져 있거나 다른 포트에서 돌고 있습니다. serve를 켜고, **포트** 값이 터미널에 찍힌 포트와 같은지 확인하세요.
- **serve가 연결을 거부했습니다.** 토큰이 틀렸거나 serve가 그 페이지 주소를 허용하지 않은 경우입니다. 어느 쪽인지는 serve를 실행한 터미널에 나옵니다.
  - `Rejected connection: missing or wrong token`: `cat ~/.ropeman/bridge-token`으로 토큰을 다시 복사하세요. 토큰 파일을 지웠거나 `ROPEMAN_BRIDGE_TOKEN`을 바꿨다면 토큰도 바뀌었습니다.
  - `Rejected connection from origin "..." (not allowed)`: 카드에 나온 페이지 주소를 `--allow-origin`에 넣어 serve를 다시 실행하세요. 예: `npx @ropeman/bridge serve --root . --allow-origin https://preview.example.com`
- **연결되지 않았고, 브라우저가 이유를 알려 주지 않습니다.** Firefox와 Safari에는 페이지가 읽을 수 있는 권한이 없습니다. 이때 페이지는 포트를 따로 확인하지 않습니다. 그 확인 때문에 브라우저가 한 번 더 물을 수 있어서입니다. serve가 그 포트에서 돌고 있는지, 토큰이 맞는지, 사이트를 차단하지 않았는지, serve 터미널에 무엇이 찍혔는지 확인하세요. 그래도 연결되지 않으면 [로컬 모드](#로컬-모드로-쓰기)를 쓰세요.

### "Port 9800 is already in use"

다른 프로세스가 그 포트를 쓰고 있습니다. 그 프로세스를 끄거나, 다른 포트(`--port 9900`)로 serve를 켜고 **포트** 칸에 같은 번호를 넣으세요.

### "Cannot start: Token must be at least 16 characters."

`--token`이나 `ROPEMAN_BRIDGE_TOKEN`으로 준 토큰이 짧습니다. 더 긴 토큰을 쓰거나, 둘 다 지워 토큰 파일을 쓰세요.

### CLI를 찾지 못할 때

`PATH`에 `claude`도 `gemini`도 없으면 serve는 시작할 때 `Warning: No CLI tool detected`를 출력합니다. 지도는 그대로 볼 수 있고, 페이지는 이름을 붙일 CLI가 없다고 알려 줍니다. 설치 여부를 확인하세요.

```bash
which claude
which gemini
```

둘 중 하나를 설치하거나 `PATH`를 고친 뒤 serve를 다시 켜세요. Windows에서는 설치 후 터미널을 새로 열어야 `PATH` 변경이 적용됩니다.

### 폴더 이름이 그대로 남을 때

페이지가 이름 붙이기가 멈춘 이유를 알려 줍니다.

- **CLI가 이름 붙이기를 끝내지 못했습니다.** CLI가 실패했거나 180초를 넘겼습니다. CLI가 터미널에서 혼자 실행되고 로그인돼 있는지 확인하세요.
- **CLI가 붙인 이름이 두 번 다 검사를 통과하지 못했습니다.** Ropeman은 이름을 코드와 대조합니다. 모든 부분에 이름이 하나씩 있어야 하고, 핵심 심볼은 그 부분의 파일에 선언돼 있어야 합니다. 통과하지 못하면 serve가 이유를 붙여 한 번 더 묻고, 그래도 통과하지 못하면 폴더 이름을 그대로 씁니다.

두 경우 모두 지도와 파일 보기는 계속 쓸 수 있습니다.

### 페이지가 serve에 지도가 없다고 할 때

serve를 `--root` 없이 켰습니다. serve를 끄고, 지도를 만들 폴더에서 `--root .`를 붙여 다시 켜세요.

더 넓은 보안 맥락은 [보안 문서](/docs/ko/security)를, 메인 앱의 AI 모드는 [AI 모드 가이드](/docs/ko/ai-modes)를 보세요.
