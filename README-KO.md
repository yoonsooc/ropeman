# Ropeman

> 코드베이스의 아키텍처를 다이어그램으로 봅니다. 파싱은 브라우저에서 하고, AI가 코드를 역할별로 묶습니다.

**배포 URL**: [https://ropeman.dev](https://ropeman.dev)

[English](./README.md)

## 개요

Ropeman은 브라우저에서 코드베이스를 파싱하고, AI에게 파일을 역할별로 묶어 달라고 요청합니다. 메인 캔버스에는 그 묶음과 묶음 사이의 의존 관계가 나오므로, 파일 트리보다 아키텍처를 먼저 보게 됩니다.

폴더를 열면 다이어그램이 나옵니다. 묶음을 더블클릭하면 그 안으로 드릴다운하고, AI가 그 묶음의 하위 구조를 요청 시점에 분석합니다.

### 특징

- 메인 캔버스는 역할 다이어그램입니다. 파일 트리는 옆 패널에 있습니다.
- 드릴다운은 재귀적입니다. 단계마다 묶음 하나를 AI가 새로 분석합니다.
- 소스 코드는 브라우저에 남습니다. AI가 받는 것은 스켈레톤이라고 부르는 코드 구조 요약뿐입니다. 심볼, 시그니처, import, 그리고 Markdown 파일이면 frontmatter의 name과 description, 제목, 파일 링크가 들어갑니다.
- 데모 모드는 설치와 가입이 필요 없습니다. 사이트를 열고 폴더를 열면 다이어그램이 나옵니다.

## 주요 기능

- 스켈레톤을 아키텍처 다이어그램으로 바꾸는 AI 분석
- 어느 노드든 재귀적으로 드릴다운
- 네 가지 AI 모드 (아래 설명)
- 브라우저 안의 WASM AST 파싱. AI에는 스켈레톤만 갑니다
- 14개 언어: Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala
- 공개 GitHub 저장소를 clone 없이 URL로 불러오기
- 구문 강조와 분할 뷰를 갖춘 코드 뷰어
- 코드 스니펫 분석: 코드를 붙여 넣고 바로 분석
- Cache API에 분석 결과를 저장해 세션이 바뀌어도 유지
- Orama 기반 전문 검색

## 기술 스택

| 영역            | 기술                               |
| --------------- | ---------------------------------- |
| 프레임워크      | SvelteKit + Svelte 5 (runes)       |
| 그래프 렌더링   | @xyflow/svelte (SvelteFlow)        |
| 그래프 레이아웃 | @dagrejs/dagre                     |
| AST 파싱        | web-tree-sitter (WASM, Web Worker) |
| 검색            | @orama/orama                       |
| WebGPU AI       | @mlc-ai/web-llm                    |
| Edge Proxy      | Cloudflare Workers                 |
| 테스트          | Vitest + Playwright                |
| 빌드            | Vite v6                            |
| 배포            | Cloudflare Pages                   |

## 시작하기

```bash
git clone https://github.com/nkinba/ropeman.git
cd ropeman
npm install
npm run dev
```

[http://localhost:5173](http://localhost:5173)을 Chrome이나 Edge에서 여세요. 폴더 열기는 File System Access API를 쓰는데, 이 API를 온전히 지원하는 것은 Chromium 계열 브라우저뿐입니다.

### 스크립트

| 명령어                      | 설명                         |
| --------------------------- | ---------------------------- |
| `npm run dev`               | 개발 서버 실행               |
| `npm run build`             | 프로덕션 빌드                |
| `npm run test:unit`         | 단위 테스트 (Vitest)         |
| `npm run test:e2e`          | E2E 테스트 (Playwright)      |
| `npm run lint`              | ESLint 실행                  |
| `npm run format`            | Prettier 포맷팅              |
| `npm run deploy`            | Pages 앱을 Cloudflare에 배포 |
| `npm run deploy:edge:demo`  | 엣지 데모 Worker 배포        |
| `npm run deploy:edge:proxy` | 엣지 프록시 Worker 배포      |

## AI 모드

Ropeman에는 AI 모드가 네 가지 있습니다.

1. **데모**는 무료이고 설정이 필요 없습니다. 요청은 Ropeman 엣지 프록시를 거쳐 Google Gemini 무료 등급으로 가며, 프록시가 요청 횟수를 제한합니다. 무료 등급에서는 Google이 입력을 서비스 개선에 쓸 수 있습니다.
2. **API 키 (BYOK)** 는 내 Google Gemini, Anthropic, OpenAI 키를 씁니다. 키는 브라우저(localStorage)에만 저장합니다. Gemini 요청은 Google로 바로 가고, Anthropic과 OpenAI 요청은 브라우저 제약 때문에 Ropeman 엣지 프록시를 거칩니다. 프록시는 키를 저장하지 않습니다.
3. **로컬 브리지**는 작은 브리지 서버로 내 컴퓨터의 AI CLI(Claude Code 또는 Gemini CLI)에 연결합니다. 브리지가 스켈레톤을 CLI에 넘기고, CLI가 그것을 자기 제공자에게 보냅니다. 소스 파일은 내 컴퓨터에 남습니다.
4. **브라우저 AI**는 web-llm으로 브라우저 안에서 WebGPU 모델을 돌립니다. 처음 한 번 모델을 내려받은 뒤에는 오프라인으로 분석합니다. 실험 기능입니다.

로컬 브리지를 쓰려면 `npx @ropeman/bridge`를 실행하세요. 0.2 이상은 시작할 때 토큰을 출력합니다. 이 토큰을 Ropeman의 로컬 브리지 카드에 있는 토큰 칸에 붙여 넣어야 브리지가 연결을 받습니다. 브리지는 `127.0.0.1`에서만 열리고, 브라우저 연결은 `https://ropeman.dev`, 로컬 개발 서버, `--allow-origin`으로 추가한 출처에서 온 것만 받습니다. 토큰을 어디에 저장하는지와 다른 옵션은 [bridge/README.md](bridge/README.md)에 있습니다.

## 아키텍처

```
src/lib/
  stores/       # Svelte 5 rune 싱글턴 (모듈 레벨)
  services/     # 순수 함수, AI 어댑터, 캐싱
  components/   # Svelte 5 컴포넌트 ($props 패턴)
  workers/      # Web Worker (AST 파서, web-llm)
  types/        # TypeScript 인터페이스
  utils/        # 유틸리티 (언어 감지 등)

edge-proxy/
  src/          # Cloudflare Workers (demo, proxy, shared)
```

### 데이터 흐름

1. 사용자가 폴더를 엽니다 (File System Access API).
2. Parser Worker(web-tree-sitter WASM)가 파일마다 AST 스켈레톤을 뽑습니다.
3. AI 어댑터가 고른 AI 모드로 스켈레톤을 보냅니다.
4. 응답을 시맨틱 노드와 엣지로 바꿔 SvelteFlow로 그립니다.
5. Cache API에 결과를 저장해, 프로젝트를 다시 열면 AI 호출 없이 보여 줍니다.

## 캐싱

| 데이터           | 스토리지          | 키                 |
| ---------------- | ----------------- | ------------------ |
| 시맨틱 분석 결과 | Cache API         | `ropeman/semantic` |
| 채팅 응답        | IndexedDB (Orama) | `ropeman-cache`    |
| WebGPU 모델      | Cache API         | `webllm/*`         |

## 단축키

| 단축키         | 동작                        |
| -------------- | --------------------------- |
| `Ctrl+K`       | 검색                        |
| `Ctrl+Shift+D` | 테마 전환                   |
| `Ctrl+Shift+V` | 사이드바 전환 (파일/시맨틱) |
| `Ctrl+B`       | 사이드바 열고 닫기          |
| `Ctrl+W`       | 탭 닫기                     |
| `Ctrl+\`       | 분할 뷰 켜고 끄기           |
| `Esc`          | 모달 닫기                   |

## 브라우저 요구사항

- Chromium 계열 브라우저(Chrome, Edge)를 권장합니다. File System Access API를 온전히 지원합니다.
- Firefox와 Safari에서는 폴더를 끌어다 놓는 방법으로만 읽을 수 있습니다.
- 브라우저 AI 모드는 WebGPU를 지원하는 브라우저가 필요합니다.

## 라이선스

[MIT](LICENSE) © 2026 Yoonsoo Chang
