---
title: Ropeman이 다른 점
description: 다른 코드 지도 도구와 Ropeman이 다르게 하는 일을, 저장소에서 그 근거가 되는 파일과 함께 정리했습니다.
category: intro
order: 1.5
---

코드 지도 도구는 몇 갈래가 있습니다. 저장소 전체를 큰 그래프 하나로 그리는 뷰어, 모델이 코드를 읽고 쓴 위키, 에이전트에게 코드 사실 저장소를 주는 메모리 서버입니다. Ropeman은 파서가 뽑은 사실로 지도를 폴더 단계 하나씩 그리고, 검증기가 확인한 이름만 붙입니다. 아래 절마다 Ropeman이 하는 일을 적고, 저장소에서 그것을 보여 주는 코드나 결정 기록을 링크했습니다.

## 1. 모델이 보는 것

추출에는 모델을 쓰지 않습니다. Ropeman이 폴더를 훑고, 브라우저에서는 Web Worker가, `ropeman` 명령에서는 Node가 tree-sitter 파서로 파일마다 심볼, import, 호출을 읽습니다. 모델에 보내는 프롬프트는 모두 이 결과로 만들고, 함수 본문과 주석은 어느 프롬프트에도 들어가지 않습니다.

- 브라우저 앱의 코드 구조 요약에는 파일 경로, 심볼 이름과 종류, import가 들어갑니다. Markdown이면 제목과 frontmatter 값, Dockerfile이면 명령 줄도 들어갑니다([`src/lib/services/skeletonExtractor.ts`의 `toWireFile`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/skeletonExtractor.ts), [`src/lib/types/skeleton.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/skeleton.ts)).
- 스킬을 쓰면 `work.json`과 일꾼 프롬프트는 그것도 빼고 부분마다 파일 수, 경로 표본, 선언한 심볼 이름을 주고, 부분 사이의 import 수를 셉니다([`bridge/src/naming.ts`의 `summarizePart`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/naming.ts)). 일꾼 프롬프트는 모델에게 파일 내용을 보지 못한다고 알려 줍니다.

스킬은 에이전트가 `work.json`을 보고 이름을 붙이게 하고, 경로와 심볼만으로 부분의 역할을 알 수 없을 때만 소스 파일을 열게 합니다([`skill/ropeman/SKILL.md`](https://github.com/yoonsooc/ropeman/blob/main/skill/ropeman/SKILL.md)). Ropeman은 실제 `.env` 파일을 읽지 않습니다. 추출은 이 파일에 언어를 주지 않아서 어떤 파서도 열지 않고([`src/lib/utils/languageDetector.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/utils/languageDetector.ts)), 이 파일로 가는 링크도 따라가지 않습니다([`packages/core/src/walk.ts`](https://github.com/yoonsooc/ropeman/blob/main/packages/core/src/walk.ts)). serve는 열기를 거부하고([`bridge/src/fileRead.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/fileRead.ts)), 일꾼 프롬프트에는 그 경로도 넣지 않습니다. `.env.example` 같은 템플릿 파일은 다른 파일처럼 읽습니다.

## 2. 이름은 코드와 대조해 검사합니다

에이전트나 일꾼은 부분마다 라벨, 한 문장 설명, 핵심 심볼을 6개까지 씁니다. Ropeman은 검증기를 통과한 이름만 남깁니다([`src/lib/services/mapVerifier.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/mapVerifier.ts)). 검증기는 단계의 파일이 저마다 정확히 한 부분에 들어갔는지, 핵심 심볼이 그 부분의 파일에 선언되어 있는지, 경로가 추출기가 찾은 파일인지, 관계의 근거가 코드의 관계와 파일, 줄, 종류, 대상까지 같은지 봅니다. 위반은 모두 코드와 필드 위치를 붙여 알려 줍니다. 코드 목록은 [`src/lib/types/mapVerification.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/mapVerification.ts)에 있습니다.

이름이 검사에 실패한 단계는 폴더 이름을 그대로 둡니다. 그래서 `ropeman map`이 쓴 `ropeman.json`은 늘 검사를 통과합니다. `ropeman verify --root <저장소> --map <파일>`은 어떤 지도든 같은 검사를 돌립니다.

관계에는 출처가 붙습니다. EXTRACTED는 파서가 정한 관계이고, INFERRED는 모델이 제안했거나 이름으로만 맞춘 관계입니다. 스킬이 만드는 지도에서 부분 사이 관계는 모두 코드가 정한 관계에서 나옵니다([`src/lib/services/codeRelations.ts`의 `fileRelations`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/codeRelations.ts)). 모델도 관계를 제안하는 브라우저 앱에서는 뷰어가 INFERRED 관계를 점선으로 그립니다([`src/lib/services/semanticGraphBuilder.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/semanticGraphBuilder.ts)).

## 3. 한 단계씩 보고, 파일은 모두 어딘가에 들어갑니다

전체 그래프 뷰어는 모든 파일을 한 번에 그리고 묶음은 배치에 맡깁니다. Ropeman은 폴더마다 단계를 하나 만듭니다. 단계의 부분은 하위 폴더 하나하나와, 그 폴더에 바로 든 파일 묶음 하나입니다. 하위 폴더 하나만 있고 직접 든 파일이 없는 폴더는 단계를 만들지 않습니다. 그런 폴더가 이어지면 사슬 전체가 노드 하나가 되고, 제목은 사슬의 경로입니다([ADR-30](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0030-collapse-single-child-folder-chains.md), [`packages/core/src/groupedMap.ts`](https://github.com/yoonsooc/ropeman/blob/main/packages/core/src/groupedMap.ts)의 `chainEnd`).

지도는 Ropeman이 파싱한 파일과, 파싱하려다 건너뛴 파일을 이유와 함께 모두 적습니다([`src/lib/types/coverage.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/coverage.ts)). `ropeman map`의 보고는 Ropeman이 파싱하지 않는 언어의 파일 수도 셉니다. 파싱한 파일이 이 목록에서 빠지거나, 그 파일을 다루는 단계의 어느 부분에도 들어가지 않은 지도는 검증기가 거부합니다. 폴더를 누르면 그 단계가 열리고, 파일을 누르면 소스를 봅니다.

## 4. 이름은 내 에이전트가 붙입니다

스킬은 셸 명령과 파일 쓰기만 쓰는 Markdown 파일 하나라서, 셸 명령을 실행하는 코딩 에이전트라면 따라 할 수 있습니다. 에이전트가 `names.json`에 이름을 쓰면 `ropeman map`이 적용하고 검사합니다. 더 깊은 폴더를 열면 `ropeman serve`가 헤드리스 일꾼 CLI로 이름을 붙입니다. Claude Code가 설치되어 있으면 `claude -p`, serve를 `--cli gemini`로 띄우면 Gemini CLI입니다. 일꾼은 에이전트가 쓴 요약과, 그 폴더가 위 단계에서 받은 이름을 받습니다. 일꾼 CLI가 없으면 폴더는 대기열에 들어가고, 에이전트가 다음 대화에서 이름을 붙입니다([ADR-25](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0025-agent-names-the-map.md)).

이 경로에서 Ropeman은 API 키가 필요 없고, 모델 제공자를 직접 부르지 않습니다. 일꾼 CLI는 자기 로그인으로 돕니다. 브라우저 앱은 따로 데모, 내 API 키, 브라우저에서 도는 모델 중에서 고릅니다([AI 모드 가이드](/docs/ko/ai-modes)).

## 5. 내 컴퓨터에서 돕니다

`ropeman serve`는 `127.0.0.1`에서만 듣습니다([`bridge/src/bridge.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/bridge.ts)). 연결마다 토큰을 요구하고 Origin과 Host를 확인합니다([`bridge/src/auth.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/auth.ts)). `--local`을 주면 serve가 뷰어도 직접 띄우므로, 브라우저가 ropeman.dev에서 내 컴퓨터로 가는 연결을 막아도 페이지가 열립니다. 지도, 이름, 소스는 내 컴퓨터에 남고 Ropeman 서버를 거치지 않습니다.

브라우저 앱은 폴더를 브라우저 안에서 읽고 파싱합니다. GitHub 저장소는 예외로, 파일을 디스크가 아니라 GitHub에서 브라우저로 내려받습니다([`src/lib/services/githubLoader.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/services/githubLoader.ts)). 데모 모드와 Anthropic·OpenAI 키를 쓸 때는 코드 구조 요약이 Ropeman의 Worker를 거치고, 공유 링크를 만들면 다이어그램과 파일 경로가 저장됩니다. 모드마다 무엇을 보내는지는 [보안 및 데이터 흐름](/docs/ko/security)에 있습니다.

## 6. 다시 그려도 이름이 남습니다

같은 코드에서는 추출이 같은 단계를 만들고, 노드 id는 경로에서 나옵니다(`dir:<경로>`, `files:<경로>`). 그래서 코드를 고친 뒤 `ropeman map`을 다시 돌려도 `names.json`의 항목이 그대로 그 부분에 맞습니다. 부분이 바뀐 단계는 검사에 실패해 다시 이름을 붙일 때까지 폴더 이름으로 보입니다. serve가 도는 동안에는 순회한 폴더를 감시하다가 파일이 바뀌면 다시 추출하고, 열린 페이지에 지도를 다시 받으라고 알립니다. 이름은 여전히 검사를 통과하는 단계에 그대로 남습니다([`bridge/src/mapSession.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/mapSession.ts)).

## 7. 이미 있는 그래프 파일을 읽을 수 있습니다

저장소에 Graphify의 `graph.json`이 있으면 `ropeman map`이 자체 추출과 함께 선택지로 보여 줍니다. 사용자가 고를 때만(`--input`) 그 파일을 쓰고, 고른 입력은 다음 실행을 위해 기록합니다. 그래프에서는 코드 사실만 읽고, LLM이 만든 층과 군집은 읽지 않습니다. 그래프로 만든 지도도 같은 검증기를 거칩니다. Ropeman은 Graphify를 설치하거나 실행하지 않고, 스킬도 에이전트에게 그러지 말라고 적습니다. Ropeman이 확인한 형식은 Graphify의 `graph.json` 하나이고, 다른 형식은 이유와 함께 거부합니다([ADR-28](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0028-graph-file-as-chosen-input.md), [`bridge/src/mapInput.ts`](https://github.com/yoonsooc/ropeman/blob/main/bridge/src/mapInput.ts)). 저장소 하나에서 두 입력을 비교한 결과는 [측정 기록](https://github.com/yoonsooc/ropeman/blob/main/docs/measurements/2026-11-13-paseo-graphify-comparison.md)에 있습니다.

## 8. 사람과 에이전트가 같은 파일을 씁니다

`ropeman.json`은 버전이 있는 형식입니다([ADR-24](https://github.com/yoonsooc/ropeman/blob/main/docs/adr/0024-ropeman-map-format.md), [`src/lib/types/ropemanMap.ts`](https://github.com/yoonsooc/ropeman/blob/main/src/lib/types/ropemanMap.ts)). 브리지 뷰어가 이 파일을 그리고, [ropeman.dev/open](https://ropeman.dev/open)은 설치 없이 열고, `ropeman verify`는 검사합니다. `ropeman map`은 그 옆에 에이전트가 아직 이름 붙일 부분을 담은 `work.json`을 씁니다. [갤러리](https://ropeman.dev/explore)의 지도는 스킬을 돌려 만들었고, 올리기 전에 모두 `ropeman verify`를 통과했습니다([`scripts/explore/pipeline.mjs`](https://github.com/yoonsooc/ropeman/blob/main/scripts/explore/pipeline.mjs)).
