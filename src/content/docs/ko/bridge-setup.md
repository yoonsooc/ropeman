---
title: 브리지 서버 설정
description: 내 컴퓨터의 Claude Code나 Gemini CLI를 Ropeman과 연결해, Ropeman 서버를 거치지 않고 분석하는 방법입니다.
category: guides
order: 6
---

**로컬 브리지** 모드는 내 컴퓨터에 설치한 AI CLI(**Claude Code** 또는 **Gemini CLI**)로 분석합니다. 브라우저는 내 컴퓨터에서 도는 작은 브리지 서버에 연결하고, 브리지가 CLI를 실행하며, CLI는 자기 로그인으로 제공자를 호출합니다. 이 경로에 Ropeman 서버는 없습니다.

이미 CLI를 구독 중이거나, CLI 로그인을 그대로 쓰고 싶거나, 데모나 API 키 모드보다 데이터 경로를 엄격하게 관리해야 한다면 이 모드를 쓰세요. 데스크톱에서만 쓸 수 있고, 휴대폰과 태블릿에서는 카드가 비활성화됩니다.

## 브리지가 하는 일

브리지(npm 패키지 `@ropeman/bridge`)는 `127.0.0.1`에서 WebSocket 서버를 여는 작은 Node 프로세스입니다. 기본 포트는 `9800`입니다. Ropeman이 요청을 보내면 브리지는 WebSocket으로 프롬프트와 코드 구조 요약을 받아 CLI를 실행하고(`claude -p` 또는 `gemini -p`), CLI가 끝나면 답을 한 번에 돌려줍니다.

브리지는 연결을 받기 전에 세 가지를 확인합니다.

- `127.0.0.1`에서만 열리므로 같은 네트워크의 다른 컴퓨터는 접근할 수 없습니다.
- 브라우저 연결은 `https://ropeman.dev`와 로컬 개발 서버(`localhost`의 5173, 5174, 4173 포트, `127.0.0.1`의 5173, 4173 포트)에서 온 것만 받습니다. `--allow-origin`으로 출처를 더할 수 있습니다.
- 모든 연결에 브리지가 시작할 때 출력한 토큰이 있어야 합니다.

브리지가 디스크에 쓰는 파일은 토큰 파일 하나입니다. CLI가 따로 남기는 기록(세션 기록 등)은 CLI마다 다릅니다.

## 사전 준비

- Node.js 18 이상
- 다음 중 하나 이상을 설치하고 로그인해 둡니다.
  - [Claude Code](https://docs.claude.com/en/docs/claude-code)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- 터미널

CLI가 터미널에서 혼자 잘 도는지 먼저 확인하세요.

```bash
claude --version
# 또는
gemini --version
```

## 실행 (설치 불필요)

`npx`로 실행하면 처음 한 번 패키지를 내려받고, 전역 설치 없이 바로 실행합니다.

```bash
npx @ropeman/bridge
```

`--cli`를 주지 않으면 브리지는 `claude`, `gemini` 순서로 찾아 먼저 찾은 것을 씁니다. 실행하면 아래처럼 출력합니다. 토큰 값은 컴퓨터마다 다릅니다.

```text
[09:41:02] Using CLI: claude
[09:41:02] Ropeman Bridge server starting on ws://127.0.0.1:9800
[09:41:02] Bridge server ready on ws://127.0.0.1:9800
[09:41:02] Token: 3q2-7wEXAMPLEtokenEXAMPLEtokenEX
[09:41:02] Allowed origins: https://ropeman.dev, http://localhost:5173, ...
```

`Token:` 뒤의 값을 복사하세요. Ropeman을 쓰는 동안 터미널은 켜 둡니다.

### 토큰

브리지는 아래 순서로 처음 찾은 토큰을 씁니다.

1. 명령줄의 `--token <값>`
2. 환경 변수 `ROPEMAN_BRIDGE_TOKEN`
3. 파일 `~/.ropeman/bridge-token`

셋 다 없으면 처음 실행할 때 `~/.ropeman/bridge-token`을 만들고 다음부터 그 파일을 다시 씁니다. 그래서 브리지를 다시 켜도 토큰이 바뀌지 않습니다. 브리지는 시작할 때마다 이 파일 권한을 소유자 전용(`0600`)으로 맞춥니다. 새 토큰이 필요하면 파일을 지우세요. `--token`이나 환경 변수로 직접 준 토큰은 16자 이상이어야 하고, 짧으면 브리지가 시작하지 않습니다. 명령줄 인자는 같은 컴퓨터의 다른 사용자가 `ps`로 볼 수 있으니 `--token`보다 환경 변수나 토큰 파일을 쓰세요.

### 옵션

| 옵션                     | 하는 일                                       |
| ------------------------ | --------------------------------------------- |
| `--port <번호>`          | 열 포트 (기본 `9800`)                         |
| `--cli <claude\|gemini>` | 실행할 CLI (기본: 자동 감지)                  |
| `--token <값>`           | 저장된 토큰 대신 이 토큰을 씁니다             |
| `--allow-origin <url>`   | 이 출처의 연결도 받습니다. 여러 번 줄 수 있음 |

```bash
# Gemini CLI도 설치돼 있지만 Claude Code를 쓸 때
npx @ropeman/bridge --cli claude

# 다른 포트로 열 때
npx @ropeman/bridge --port 9900
```

### 대안: 전역 설치

브리지를 자주 쓴다면 전역으로 설치해도 됩니다.

```bash
npm install -g @ropeman/bridge
ropeman-bridge
```

## Ropeman과 연결

1. [ropeman.dev](https://ropeman.dev)에서 프로젝트 폴더를 엽니다.
2. 헤더의 **분석** 버튼을 누릅니다. 헤더의 AI 배지나 **설정 → AI 연결**을 눌러도 같은 **AI 아키텍처 분석** 창이 열립니다.
3. **로컬 브리지** 카드를 눌러 펼칩니다.
4. **CLI 도구**는 **자동 감지**로 두면 브리지가 고른 CLI를 쓰고, **Claude Code**나 **Gemini CLI**를 고르면 그 CLI를 씁니다.
5. **포트**가 브리지 포트와 같은지 확인합니다. `--port`를 주지 않았다면 `9800`입니다. 바꾼 포트는 페이지를 새로 고치면 기본값으로 돌아갑니다.
6. 복사한 토큰을 **토큰** 칸에 붙여 넣습니다. 토큰은 이 브라우저에 저장돼 다음에도 씁니다.
7. **연결**을 누릅니다. 브리지가 연결을 받으면 카드에 **연결됨**이 표시됩니다.
8. **브리지로 시작**을 누릅니다.

토큰 칸 아래에는 지금 고른 포트와 CLI에 맞는 `npx` 명령이 나옵니다. 그대로 복사해 쓰면 됩니다.

이제 요청은 브라우저에서 `127.0.0.1`의 브리지로, 브리지에서 CLI로, CLI에서 그 CLI의 제공자로 갑니다.

## 동작 확인

- 로컬 브리지가 사용 중인 모드이면 헤더 배지에 **브리지**가 표시됩니다.
- 연결하면 브리지 터미널에 `Client connected from 127.0.0.1`이 찍힙니다. 요청마다 `Running claude CLI for [chat] id=1 (prompt: … chars)`와 `✓ CLI done id=1 (…s, response: … chars)`가 차례로 찍힙니다.

## 트러블슈팅

### 연결을 눌러도 카드가 "연결 안 됨"으로 남을 때

브라우저는 브리지가 꺼진 경우와 브리지가 연결을 거절한 경우를 구분하지 못합니다. 브리지 터미널을 확인하세요.

- 새 로그가 없다면 브리지가 꺼져 있거나 다른 포트에서 돌고 있습니다. 터미널에 찍힌 포트와 카드의 **포트** 값을 비교하세요.
- `Rejected connection: missing or wrong token`이 찍혔다면 카드의 토큰이 틀렸습니다. `Token:` 값을 다시 복사하세요. `~/.ropeman/bridge-token`을 지웠거나 `ROPEMAN_BRIDGE_TOKEN`을 바꿨다면 토큰도 바뀌었습니다.
- `Rejected connection from origin ... (not allowed)`가 찍혔다면 브리지가 허용하지 않는 출처에서 Ropeman을 열었습니다. 그 출처를 `--allow-origin`으로 더해 브리지를 다시 켜세요.

  ```bash
  npx @ropeman/bridge --allow-origin https://your-origin.example
  ```

### "Cannot start: Token must be at least 16 characters."

`--token`이나 `ROPEMAN_BRIDGE_TOKEN`으로 준 토큰이 짧습니다. 더 긴 토큰을 쓰거나, 둘 다 지워 토큰 파일을 쓰세요.

### "Port 9800 is already in use"

다른 프로세스가 그 포트를 쓰고 있습니다. 그 프로세스를 끄거나, 다른 포트(`--port 9900`)로 브리지를 켜고 카드의 **포트** 칸에 같은 번호를 넣으세요.

### CLI를 찾지 못할 때

`PATH`에 `claude`도 `gemini`도 없으면 브리지는 시작할 때 `Warning: No CLI tool detected`를 출력합니다. 이때 분석하면 `No CLI tool available`이나 `CLI 'claude' not found` 오류가 납니다. 설치 여부를 확인하세요.

```bash
which claude
which gemini
```

둘 중 하나를 설치하거나 `PATH`를 고친 뒤 브리지를 다시 켜세요. Windows에서는 설치 후 터미널을 새로 열어야 `PATH` 변경이 적용됩니다.

### 응답이 느리거나 시간이 초과될 때

브리지는 CLI 실행을 120초에 끊고, Ropeman은 브리지 요청을 5분 기다립니다. 요약이 크면 CLI도 느려집니다. **설정 → 코드 구조 요약 크기 제한**을 줄여 다시 시도하세요.

더 넓은 보안 맥락은 [보안 문서](/docs/ko/security)를, 다른 AI 모드와의 비교는 [AI 모드 가이드](/docs/ko/ai-modes)를 보세요.
