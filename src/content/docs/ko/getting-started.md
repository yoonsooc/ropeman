---
title: 시작하기
description: Ropeman이 무엇인지, 30초 만에 첫 아키텍처 다이어그램을 만드는 방법을 안내합니다.
category: intro
order: 1
---

Ropeman은 임의의 코드베이스를 브라우저에서 분석하여 **AI 기반 의미론적 아키텍처 다이어그램**으로 시각화하는 웹 애플리케이션입니다. 파일 트리가 아닌, 프로젝트의 역할과 의존 관계를 한눈에 보여줍니다.

## Ropeman이란

낯선 저장소를 열었을 때 가장 먼저 필요한 것은 **"이 프로젝트가 전체적으로 무엇을 하는가"** 에 대한 지도입니다. Ropeman은 다음과 같은 방식으로 이 질문에 답합니다.

- **Semantic-First** — 메인 캔버스는 파일 트리가 아닌 역할 기반 다이어그램입니다. LLM이 코드 구조를 분석해 "인증 계층", "API 레이어", "렌더링 엔진" 같은 의미 단위로 묶어 보여줍니다.
- **재귀적 드릴다운** — 다이어그램의 어떤 영역이든 더블클릭하면 AI가 하위 구조를 다시 분석해 새로운 다이어그램을 생성합니다. 원하는 깊이까지 파고들 수 있습니다.
- **100% Local-First** — 원본 소스 코드는 절대 브라우저를 떠나지 않습니다. 브라우저 안에서 WASM 기반 AST 파싱이 이루어지고, AI에는 **코드 구조 요약(메타데이터)** 만 전달됩니다.
- **Zero Friction** — 회원가입, 설치, CLI 없이 URL에 접속해 폴더를 드롭하기만 하면 됩니다.

## 코딩 에이전트에서 쓰기

Ropeman의 기본 사용법은 코딩 에이전트에서 Ropeman 스킬로 쓰는 것입니다. Node 22 이상이 필요합니다. 먼저 `ropeman` 명령을 설치합니다.

```bash
npm install -g @ropeman/bridge@0.7.0
```

그다음 에이전트가 스킬을 읽는 폴더에 스킬을 저장합니다. 내 에이전트에 맞는 줄을 실행하세요.

```bash
# Claude Code (테스트함)
curl --create-dirs -fsSLo ~/.claude/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Codex (테스트 안 함)
curl --create-dirs -fsSLo ~/.agents/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Gemini CLI (테스트 안 함)
curl --create-dirs -fsSLo ~/.gemini/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
# Cursor (테스트 안 함)
curl --create-dirs -fsSLo ~/.cursor/skills/ropeman/SKILL.md https://raw.githubusercontent.com/yoonsooc/ropeman/bridge-v0.7.0/skill/ropeman/SKILL.md
```

스킬은 Claude Code에서 테스트했습니다. Codex, Gemini CLI, Cursor는 각자의 문서에 따르면 이 폴더에서 스킬을 읽지만, Ropeman은 이들에서 아직 테스트하지 않았습니다. 다른 에이전트라면 그 에이전트가 스킬을 읽는 폴더에 `ropeman/SKILL.md`로 저장하세요. 스킬을 지원하지 않는 에이전트라면 `SKILL.md` 내용을 대화에 붙여 넣으세요. [홈 화면](/)의 설정 안내에도 같은 명령이 있습니다.

설치가 끝나면 에이전트에게 "map this repo"(이 저장소 지도 그려 줘)라고 요청합니다. 에이전트가 지도를 만들고 위 두 단계에 이름을 붙여 코드와 맞는지 검사한 뒤, `ropeman serve`를 띄우고 열어 볼 `http://127.0.0.1:9800/bridge#token=…` 주소를 알려 줍니다.

하위 폴더 하나만 가진 폴더는 건너뜁니다. 이어진 폴더는 경로를 제목으로 단 카드 하나로 보이고, 드릴다운하면 고를 것이 있는 단계가 바로 열립니다.

### 이미 있는 그래프 파일 쓰기

`ropeman map`은 기본으로 Ropeman이 직접 저장소를 읽습니다. 다른 도구가 이미 그 저장소의 그래프 파일을 만들어 두었다면, 그 파일로 지도를 만들 수도 있습니다. 이 기능은 `@ropeman/bridge` 0.6.0 이상에서 쓸 수 있습니다.

`ropeman map`은 `graphify-out/graph.json`과 `.graphicle/graph.json`에서 그래프 파일을 찾습니다. 파일이 있어도 알아서 바꾸지 않습니다.

- 터미널에서 실행하면 어느 입력을 쓸지 묻습니다. 첫 번째 선택지가 Ropeman 자체 추출이고 기본값입니다.
- 에이전트가 실행하면 지도를 쓰지 않고 선택지만 보여 줍니다. 에이전트가 선택지를 알려 주고, 고른 답을 `--input`으로 넘깁니다.

선택지에는 그래프 파일마다 크기, 바뀐 시각, 만든 도구, 디스크의 코드 파일 중 몇 개를 담았는지가 나옵니다. 지도에는 그래프에 든 파일만 나오므로, 90%보다 적게 담은 그래프에는 경고가 붙습니다. 직접 고르려면 파일 경로나 `ropeman`을 넘기세요.

```bash
ropeman map --root . --out .ropeman --input graphify-out/graph.json
ropeman map --root . --out .ropeman --input ropeman
```

고른 입력은 `--out` 폴더에 남아서 다음 실행도 같은 입력을 씁니다. Ropeman은 Graphify나 다른 도구를 설치하거나 실행하지 않습니다. 읽는 형식은 Graphify의 `graph.json` 하나이고, 다른 형식은 이유와 함께 거부합니다. 이렇게 정한 이유는 [ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md)에 있습니다.

### 작업 폴더

에이전트와 Ropeman은 폴더 하나를 같이 씁니다. 이 폴더를 작업 폴더라고 부릅니다. 기본 위치는 저장소 안의 `.ropeman`이고, 저장소를 바꾸고 싶지 않다고 하면 에이전트가 저장소 밖의 폴더를 고릅니다. 작업 폴더가 저장소 안에 있으면 `ropeman map`이 그 안에 `.gitignore`를 넣어 git이 커밋하지 않게 합니다.

작업 폴더의 파일은 파일마다 쓰는 쪽이 하나입니다. 아래 그림은 파일마다 누가 쓰고 다음에 누가 읽는지 보여 줍니다.

<figure class="work-folder-diagram">
<svg viewBox="0 0 430 562" role="img" aria-labelledby="wf-title wf-desc">
<title id="wf-title">작업 폴더의 파일마다 누가 쓰는지</title>
<desc id="wf-desc">ropeman map이 ropeman.json, work.json, input.json을 씁니다. 에이전트가 work.json을 읽고 names.json과 brief.md를 쓴 뒤, 문제가 없어질 때까지 ropeman map을 다시 돌립니다. ropeman serve --detach가 ropeman.json을 보여 주고 serve.json, serve.lock, serve.log를 씁니다. 이름 없는 폴더를 열면 일꾼이 brief.md를 참고해 이름을 붙이고 naming-log.jsonl에 남깁니다. 일꾼이 없으면 serve가 queue.json에 넣습니다. ropeman inbox가 둘을 읽어 에이전트의 다음 차례에 넘기고 inbox-read.json을 씁니다.</desc>
<defs><marker id="wf-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="wf-head"/></marker></defs>
<rect class="wf-box" x="10" y="8" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="29">ropeman map</text>
<text class="wf-verb" x="22" y="48">씀</text>
<text class="wf-file" x="72" y="48">ropeman.json · work.json</text>
<text class="wf-verb" x="22" y="66"></text>
<text class="wf-file" x="72" y="66">input.json</text>
<text class="wf-note" x="152" y="66">(입력을 고른 뒤)</text>
<path class="wf-arrow" d="M160 74V107" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="95">work.json: 이름 붙일 부분</text>
<rect class="wf-box wf-you" x="10" y="108" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="129">에이전트</text>
<text class="wf-verb" x="22" y="148">읽음</text>
<text class="wf-file" x="72" y="148">work.json</text>
<text class="wf-verb" x="22" y="166">씀</text>
<text class="wf-file" x="72" y="166">names.json · brief.md</text>
<path class="wf-arrow" d="M310 148H332V34H311" marker-end="url(#wf-head)"/>
<text class="wf-note" x="338" y="60">names.json을</text>
<text class="wf-note" x="338" y="74">고쳐 map을</text>
<text class="wf-note" x="338" y="88">다시 실행,</text>
<text class="wf-note" x="338" y="102">문제가 없을</text>
<text class="wf-note" x="338" y="116">때까지</text>
<path class="wf-arrow" d="M160 174V207" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="195">문제 없음</text>
<rect class="wf-box" x="10" y="208" width="300" height="84" rx="6"/>
<text class="wf-actor" x="22" y="229">ropeman serve --detach</text>
<text class="wf-verb" x="22" y="248">보여 줌</text>
<text class="wf-file" x="72" y="248">ropeman.json</text>
<text class="wf-verb" x="22" y="266">씀</text>
<text class="wf-file" x="72" y="266">serve.json · serve.lock</text>
<text class="wf-verb" x="22" y="284"></text>
<text class="wf-file" x="72" y="284">serve.log</text>
<path class="wf-arrow" d="M160 292V325" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="313">이름 없는 폴더를 열면</text>
<rect class="wf-box" x="10" y="326" width="145" height="102" rx="6"/>
<text class="wf-actor" x="22" y="347">일꾼</text>
<text class="wf-verb" x="22" y="366"></text>
<text class="wf-file" x="72" y="366">claude -p</text>
<text class="wf-verb" x="22" y="384">읽음</text>
<text class="wf-file" x="72" y="384">brief.md</text>
<text class="wf-verb" x="22" y="402">씀</text>
<text class="wf-file" x="72" y="402">naming-log</text>
<text class="wf-verb" x="22" y="420"></text>
<text class="wf-file" x="72" y="420">.jsonl</text>
<rect class="wf-box" x="165" y="326" width="145" height="48" rx="6"/>
<text class="wf-actor" x="177" y="347">일꾼 없음</text>
<text class="wf-verb" x="177" y="366">씀</text>
<text class="wf-file" x="227" y="366">queue.json</text>
<path class="wf-arrow" d="M82.5 428V461" marker-end="url(#wf-head)"/>
<path class="wf-arrow" d="M237.5 374V461" marker-end="url(#wf-head)"/>
<rect class="wf-box" x="10" y="462" width="300" height="66" rx="6"/>
<text class="wf-actor" x="22" y="483">ropeman inbox</text>
<text class="wf-verb" x="22" y="502">읽음</text>
<text class="wf-file" x="72" y="502">queue.json · naming-log.jsonl</text>
<text class="wf-verb" x="22" y="520">씀</text>
<text class="wf-file" x="72" y="520">inbox-read.json</text>
<path class="wf-arrow" d="M160 528V557" marker-end="url(#wf-head)"/>
<text class="wf-note" x="168" y="549">에이전트의 다음 차례</text>
</svg>
</figure>

1. `ropeman map`이 저장소를 읽고 지도인 `ropeman.json`을 씁니다. 한 단계의 이름이 검사를 통과하기 전까지 그 단계의 부분은 폴더 이름을 그대로 씁니다. 이름을 붙여야 할 부분 목록인 `work.json`도 씁니다. [이미 있는 그래프 파일 쓰기](#이미-있는-그래프-파일-쓰기)처럼 입력을 고르면 고른 입력을 `input.json`에 남깁니다.
2. 에이전트가 `work.json`을 읽고 `names.json`을 씁니다. 부분마다 이름, 설명, 핵심 심볼이 들어갑니다. `brief.md`도 씁니다. 알고 싶은 것, 프로젝트 용어, 이름 규칙, 위 단계 이름이 들어갑니다.
3. 에이전트가 `ropeman map`을 다시 실행합니다. Ropeman이 `names.json`을 적용하고 이름마다 코드와 맞는지 검사한 뒤 `ropeman.json`과 `work.json`을 다시 씁니다. 한 단계의 이름은 모두 통과해야 남습니다. 에이전트는 `ropeman map`이 문제가 없다고 할 때까지 2단계와 3단계를 되풀이합니다.
4. 에이전트가 `ropeman serve --detach`를 실행합니다. 이 명령은 serve를 백그라운드로 띄우는 동안 `serve.lock`을 잡고, serve의 출력을 `serve.log`에 씁니다. serve는 `ropeman.json`의 지도를 보여 주고 자기 정보를 `serve.json`에 남깁니다.
5. 아직 이름이 없는 폴더를 열면 serve가 헤드리스 일꾼에게 그 폴더의 부분에 이름을 붙이게 합니다. 일꾼은 `claude -p`이고, serve를 `--cli gemini`로 실행했으면 Gemini CLI입니다. 일꾼은 `brief.md`의 앞 4,000바이트를 맥락으로 받습니다. serve는 결과를 하나씩 `naming-log.jsonl`에 씁니다. 일꾼이 없으면 serve가 그 폴더를 에이전트 몫으로 `queue.json`에 넣습니다.
6. 다음 메시지를 보내면 에이전트가 먼저 `ropeman inbox`를 실행합니다. 대기열의 폴더와 지난번 이후에 생긴 기록 줄을 받고, 어디까지 읽었는지 `inbox-read.json`에 남깁니다. 에이전트는 대기열의 폴더에 2단계와 3단계로 이름을 붙입니다.

| 파일               | 쓰는 쪽                                    | 읽는 쪽                                  |
| ------------------ | ------------------------------------------ | ---------------------------------------- |
| `ropeman.json`     | `ropeman map`                              | serve, `ropeman verify`, `ropeman inbox` |
| `work.json`        | `ropeman map`                              | 에이전트                                 |
| `input.json`       | `ropeman map`(입력을 고른 뒤)              | `ropeman map`, `ropeman verify`, serve   |
| `names.json`       | 에이전트                                   | `ropeman map`                            |
| `brief.md`         | 에이전트                                   | serve의 일꾼                             |
| `naming-log.jsonl` | serve                                      | `ropeman inbox`                          |
| `queue.json`       | serve                                      | `ropeman map`, serve, `ropeman inbox`    |
| `inbox-read.json`  | `ropeman inbox`                            | `ropeman inbox`                          |
| `serve.json`       | serve(오래된 파일은 `ropeman stop`이 지움) | serve, `ropeman stop`                    |
| `serve.lock`       | `ropeman serve --detach`                   | `ropeman serve --detach`                 |
| `serve.log`        | `ropeman serve --detach`                   | serve가 시작하지 않을 때 직접 읽음       |

직접 고쳐도 되는 것과 안 되는 것:

- 이름을 바꾸려면 에이전트에게 요청하세요. 에이전트가 `names.json`을 고치고 `ropeman map`을 실행합니다. `names.json`을 직접 고친 뒤 `ropeman map --root <저장소> --out <작업 폴더>`를 실행해도 됩니다. 이름은 그 단계의 이름이 모두 검사를 통과해야 남습니다.
- 일꾼이 붙이는 이름을 바꾸고 싶으면 `brief.md`에 이름 규칙 같은 내용을 더하세요. 일꾼은 폴더에 이름을 붙일 때마다 이 파일을 읽으므로, 다음에 여는 폴더부터 바뀝니다.
- 입력을 바꾸려면 `ropeman map`을 다른 `--input`으로 실행하세요. `input.json`은 고치지 마세요.
- 나머지 파일은 고치지 마세요. `ropeman map`은 실행할 때마다 `ropeman.json`과 `work.json`을 새로 쓰고, serve와 `ropeman inbox`는 각자 자기 기록을 씁니다.
- 작업 폴더를 지우려면 먼저 `ropeman stop --out <작업 폴더>`로 serve를 멈추세요. 그래야 serve가 지운 폴더를 보며 계속 돌지 않습니다.

아래 퀵스타트는 설치 없이 브라우저에서 쓰는 방법입니다.

## 30초 퀵스타트 (데모 모드)

가장 빠른 길은 설정이 필요 없는 데모 모드입니다.

1. **접속** — [https://ropeman.dev](https://ropeman.dev)를 Chrome 또는 Edge 등 Chromium 기반 브라우저에서 엽니다. Firefox와 Safari에서는 드래그 앤 드롭으로 제한적 사용이 가능합니다.
2. **폴더 열기** — 분석하고 싶은 프로젝트 디렉토리를 랜딩 페이지에 드래그하거나 "폴더 열기" 버튼으로 선택합니다. 파일 시스템 접근은 **로컬에서만** 이루어집니다.
3. **파싱 대기** — 브라우저 내부 파서가 각 파일의 구조를 추출합니다. 파일 수에 따라 수 초 안에 완료됩니다.
4. **AI 분석 실행** — 기본으로 선택된 데모 트랙에서 "분석" 버튼을 누르면 LLM이 아키텍처 다이어그램을 만듭니다.
5. **탐색** — 원하는 노드를 더블클릭해 하위 구조를 드릴다운하거나, 파일을 더블클릭해 코드 뷰어로 확인합니다.

## GitHub URL로 바로 분석하기

로컬에 프로젝트가 없어도, 공개 GitHub 저장소의 URL을 입력하면 바로 분석할 수 있습니다.

1. 랜딩 페이지의 URL 입력란에 GitHub 저장소 주소를 붙여넣습니다 (예: `https://github.com/owner/repo`).
2. "분석" 버튼을 클릭하면 저장소의 파일 구조를 자동으로 가져와 파싱합니다.
3. 이후 과정은 로컬 폴더를 열었을 때와 동일합니다 — AI 분석, 드릴다운, 코드 보기 모두 사용 가능합니다.

비공개 저장소는 지원되지 않으며, 공개 저장소만 분석할 수 있습니다.

## 대규모 프로젝트 팁

프로젝트가 크거나 모노레포에서 일부 디렉토리를 분석 대상에서 빼고 싶다면 Settings → **추가 제외 디렉토리** textarea에 디렉토리 이름을 1줄 1개씩 입력하세요 (예: `target`, `third_party`, `generated`). 기본 제외 목록(`node_modules`, `.git` 등)에 사용자 지정 패턴이 병합됩니다. 변경은 textarea에서 포커스를 빼는 순간(blur) 저장되고 다음 프로젝트 로드부터 적용됩니다.

사이드바 영역이 좁다고 느껴지면 파일 탐색기 오른쪽 경계를 드래그해 **너비를 조절**할 수 있습니다. 설정은 브라우저에 저장됩니다.

## 분석 진행 상태와 취소

분석은 페이지를 이동해도 계속 진행됩니다. 화면 우측 하단의 **진행 상태 pill**은 어느 라우트에서든 표시되며, 빨간색 **취소** 버튼으로 중단할 수 있습니다. 실수 방지를 위해 확인 다이얼로그가 한 번 뜨며, "다시 묻지 않기"로 이후 생략할 수 있습니다.

드릴다운을 여러 영역에 동시에 실행하면 요청이 각각 별도의 pill로 표시됩니다. 3개를 넘어서면 "N개 분석 중" 그룹 배지로 자동 병합되고, 배지의 펼치기(^) 아이콘으로 개별 요청을 확인·취소할 수 있습니다. 탭이 비활성 상태일 때 분석이 끝나면 **브라우저 알림**으로 결과를 통지합니다(권한 허용 시).

## 지원 언어

총 **14개 프로그래밍 언어**를 지원합니다 — Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, Swift, Kotlin, C#, Scala. 단일 프로젝트 내에서 여러 언어가 섞여 있어도 한 번에 분석할 수 있습니다.

파일별 언어는 확장자 기반으로 자동 감지되며, 지원되지 않는 파일은 건너뜁니다.

## 다음 단계

- 다른 AI 모델을 쓰려면 [AI 모드 가이드](/docs/ko/ai-modes)에서 API 키와 WebGPU 모드를 살펴보세요.
- `ropeman serve`를 직접 켜서 내 컴퓨터 폴더의 지도를 열려면 [브리지 설정](/docs/ko/bridge-setup)을 보세요.
- 보안이 걱정된다면 [보안 및 데이터 흐름](/docs/ko/security) 문서를 먼저 읽어보시기 바랍니다.
- 단축키를 익히면 탐색이 훨씬 빨라집니다. [키보드 단축키](/docs/ko/keyboard-shortcuts) 참고.
- 문제가 생겼다면 [자주 묻는 질문](/docs/ko/faq) 또는 [문제 해결](/docs/ko/troubleshooting)을 확인하세요.
