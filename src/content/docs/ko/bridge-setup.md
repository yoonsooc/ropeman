---
title: 브리지 서버 설정
description: 로컬 CLI를 Ropeman과 연동해 Ropeman 인프라를 거치지 않고 AI 분석을 수행하는 방법입니다.
category: guides
order: 6
---

브리지 모드는 내 컴퓨터에 설치한 AI CLI(Claude Code, Gemini CLI 등)를 Ropeman과 연결해 분석합니다. 요청은 **Ropeman 인프라를 거치지 않습니다**. 사내 보안 정책이 엄격하거나 이미 CLI를 구독 중이라면 이 모드를 쓰세요.

## 브리지 서버란

브리지 서버는 브라우저와 로컬 CLI 사이를 중계하는 **작은 로컬 HTTP 서버**입니다. 사용자의 PC에서 `localhost` 포트로 실행되며, Ropeman 웹 앱은 이 서버에 POST 요청을 보내고, 브리지 서버는 요청을 로컬 CLI로 전달해 응답을 돌려줍니다.

데이터 흐름은 다음과 같습니다.

```text
브라우저 (Ropeman) → 브리지 (localhost) → 로컬 CLI → AI 제공자
```

**Ropeman 서버는 이 흐름에 전혀 관여하지 않습니다.** 코드 구조 요약은 사용자의 CLI 인증으로 AI 제공사에 직접 전달됩니다.

## 사전 준비

다음 중 하나 이상의 로컬 CLI가 설치되어 있어야 합니다.

- [Claude Code](https://docs.claude.com/claude-code) — Anthropic Claude 기반 CLI
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) — Google Gemini 기반 CLI

CLI가 정상적으로 인증되고 터미널에서 동작하는지 먼저 확인하세요.

## 실행 (설치 불필요, 권장)

브리지는 npm에 `@ropeman/bridge`로 올라가 있어 **`npx`로 설치 없이 바로 실행**할 수 있습니다. Ropeman 앱의 AI 분석 창에서도 같은 명령을 보여 줍니다.

```bash
npx @ropeman/bridge
```

처음 실행 시 npx가 패키지를 일회성으로 다운로드합니다. 같은 명령을 반복해서 사용해도 캐시된 버전이 즉시 실행됩니다.

실행에 성공하면 터미널에 아래와 같은 메시지가 출력됩니다.

```text
Ropeman Bridge listening on http://localhost:9876
Detected CLIs: claude, gemini
```

### 옵션: 특정 CLI 또는 포트 지정

```bash
# Claude Code만 사용
npx @ropeman/bridge --cli claude

# Gemini CLI만 사용
npx @ropeman/bridge --cli gemini

# 포트 변경 (기본 9876)
npx @ropeman/bridge --port 9090
```

> Ropeman 앱의 AI 분석 창에서 **로컬 브리지** 카드를 보면 지금 설정에 맞는 `npx` 명령이 있습니다. 그대로 복사해 쓰세요.

### 대안: 전역 설치

같은 명령을 자주 사용하거나 오프라인 환경에서 작업한다면 npm 전역 설치도 가능합니다.

```bash
npm install -g @ropeman/bridge
ropeman-bridge
```

## Ropeman과 연결

1. 브리지 서버를 실행한 상태에서 [https://ropeman.dev](https://ropeman.dev)에 접속합니다.
2. AI 분석 창에서 **로컬 브리지** 카드를 고릅니다.
3. Ropeman이 자동으로 `http://localhost:9876`에 헬스 체크를 보냅니다. 연결이 성공하면 트랙 상태가 녹색으로 바뀝니다.
4. 폴더를 드롭하고 "분석" 버튼을 누르면 요청이 브리지 서버를 거쳐 로컬 CLI로 갑니다.

포트를 바꿨다면 로컬 브리지 카드의 **포트** 칸에 같은 번호(예: `9090`)를 넣으세요.

## 동작 확인

터미널에서 브리지 서버 로그를 확인하면 요청이 들어올 때마다 사용된 CLI와 요청 크기가 출력됩니다. 브라우저의 개발자 도구 네트워크 탭에서도 `localhost`로 향하는 POST 요청을 확인할 수 있습니다.

## 트러블슈팅

### 브리지에 연결되지 않을 때

- 브리지 서버가 실행 중인지 터미널에서 확인합니다.
- 다른 프로세스가 9876 포트를 선점했는지 확인합니다 (`lsof -i :9876`).
- VPN이나 방화벽이 localhost 요청을 차단하고 있지 않은지 확인합니다.

### CORS 에러

브리지 서버는 기본적으로 `https://ropeman.dev` 출처에서의 요청만 허용합니다. 다른 출처에서 사용해야 한다면 실행 시 `--origin` 옵션으로 허용 출처를 명시할 수 있습니다.

### "지원되는 CLI를 찾을 수 없습니다"

`claude` 또는 `gemini` 명령어가 PATH에 없다는 의미입니다. 터미널에서 각 CLI를 직접 실행해 설치 여부를 확인하고, 필요하면 `PATH`를 고친 뒤 브리지 서버를 다시 시작하세요.

### 응답이 느리거나 타임아웃

CLI 자체가 AI 제공사에 요청을 보내는 시간은 CLI 구독의 속도에 따릅니다. 대형 프로젝트는 Settings의 **코드 구조 요약 크기**를 줄여 요청을 가볍게 만들어 보세요.

더 넓은 보안 맥락은 [보안 문서](/docs/ko/security)를, 다른 AI 모드와의 비교는 [AI 모드 가이드](/docs/ko/ai-modes)를 참고하세요.
