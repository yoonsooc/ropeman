# PASEO 비교: Ropeman 추출과 Graphify `graph.json`을 같은 모델·프롬프트에 넣기

> 측정일 2026-11-13. 대상 PASEO 커밋 `e0f545fed`. 다시 돌리는 법은 끝의 "다시 돌리기"에 있다.
> Graphify는 Graphify Labs의 프로젝트이며 Ropeman은 Graphify와 관련이 없다. 여기서는 Graphify가 만든 `graph.json` 형식만 읽는다.

## 1. 무엇을 정하려는가

`graph.json`(Graphify가 저장소를 읽어 만드는 그래프 파일)을 Ropeman의 **주 입력**으로 쓸지, Ropeman 자체 추출을 주 입력으로 두고 `graph.json`은 **보조 입력**(선택해서 여는 어댑터 하나)으로 둘지를 정한다. 이 결정은 `graph.json` 입력 규칙(ast 층과 외부 노드만 읽고 LLM이 만든 semantic 층은 계층 입력에서 뺀다)의 마지막 미정 항목이다.

방법은 한 가지 변수만 바꾸는 실험이다. 같은 모델, 같은 프롬프트, 같은 폴더에 입력만 두 가지로 넣는다.

- **ropeman**: `packages/core`의 `extractDirectory`(파일 수 상한 없는 Node 추출)가 만든 코드 지도
- **graphify**: Graphify 0.9.104가 만든 `graph.json`을 `graphifyAdapter.ts`로 읽은 코드 지도

두 입력 모두 같은 타입(`CodeMap`)이 되고, 같은 함수(`folderView` → `renderPrompt`)가 프롬프트로 바꾼다. 그래서 프롬프트의 차이는 지도 내용의 차이뿐이다.

## 2. 사전 등록 (모델 호출 전에 적음)

이 절은 모델을 한 번도 부르기 전에 썼다. 각 실행 기록(`runs/*.json`)에는 호출 시각이 남는다.

### 2-1. 입력 준비

- PASEO를 직접 건드리지 않으려고 `git archive HEAD`로 복사본을 만들고 두 추출을 모두 그 복사본에서 돌린다.
- PASEO에 이미 있던 `graphify-out/graph.json`은 `packages/server`만 담고 있었다(코드 파일 1,305개, `.tsx` 0개). 저장소 전체를 비교하려고 복사본에서 `graphify update --no-cluster`(LLM 없음)와 `graphify cluster-only --no-label --no-viz`(군집만, 이름 붙이기 LLM 없음)로 새로 만들었다. `--no-cluster` 출력에는 `graph.schema_version`이 없어 어댑터가 거부하므로 두 번째 명령이 필요하다.
- Ropeman 추출은 복사본 안에 생긴 `graphify-out/`을 건너뛴다(빌드 산출물이라 저장소 내용이 아니다).

### 2-2. 모델에게 시키는 일

한 폴더의 "부분"(바로 아래 하위 폴더와 그 폴더에 바로 있는 파일)을 역할별 묶음으로 나누고 이름을 붙인다. 프롬프트에 들어가는 것은 결정론 추출 결과뿐이다.

- 부분마다: 경로, 파일 수, 심볼 수, 큰 파일부터 고른 최상위 클래스·함수 이름 최대 6개
- 부분 사이 관계: 종류(`imports`, `calls`, `references` 등), 개수, 근거 위치 최대 3개(`{path, line, to}`). EXTRACTED이고 대상이 파일 하나로 정해진 관계만 넣는다.
- 모델은 JSON으로 답한다: 묶음마다 이름(4단어 이하), 한 문장 요약, 구성 부분, 입력에서 그대로 옮긴 근거 위치 최대 3개.

파일 원문은 한 줄도 넣지 않는다. 경로, 개수, 심볼 이름, 줄 번호만 들어간다. 실제 값이 든 `.env` 경로가 부분 목록에 있으면 스크립트가 멈춘다.

### 2-3. 대상 폴더 (고른 규칙)

1. 저장소 루트
2. `packages` (모노레포의 패키지 목록)
3. `packages/server/src`
4. `packages/app/src` 아래에서 프롬프트가 두 조건 모두 6만 자 이하인 폴더 중 파일이 많은 두 개: `packages/app/src/hooks`, `packages/app/src/screens`. `packages/app/src` 자체는 graphify 쪽 프롬프트가 56만 자라서 뺐다.

### 2-4. 모델과 호출 조건

- 로컬 `claude -p` CLI(구독), 모델 `claude-sonnet-5-5`, `--effort medium` 고정
- 도구 없음(`--tools ""`), 설정 파일·MCP 없음, 시스템 프롬프트는 "You answer with JSON only." 한 줄, 빈 작업 폴더
- CLI가 온도(temperature)와 시드를 받지 않아서 고정하지 못한다. 그래서 조건마다 3번씩 돌려 실행 간 차이를 잰다.
- 조건을 번갈아 부른다(API가 느린 구간이 한쪽에만 몰리지 않게).
- 예산: 호출 30번(5폴더 × 2조건 × 3회), 입력 토큰 40만 이하, 정가 기준 5달러 이하. 스크립트의 `--max-calls`가 호출 수를 막는다.

### 2-5. 지표

입력 지표(LLM 없음):

| 지표           | 정의                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 파일·심볼 수   | 지도에 든 파일과 심볼(중첩 포함)                                                                                                                                                                                                        |
| import 위치    | import·re-export 문 수와 대상 종류별 개수(파일, 외부 패키지, 연결 못 함, 미해석)                                                                                                                                                        |
| 참조 위치      | 호출 등 참조 위치 수와 대상이 하나로 정해진 수                                                                                                                                                                                          |
| 파일 간 관계   | 대상 파일이 하나인 관계를 종류·확신도별로                                                                                                                                                                                               |
| 두 지도의 일치 | 둘 다 읽은 파일 수, 한쪽만 읽은 파일의 언어, 같은 줄에서 같은 파일을 가리키는 import 수                                                                                                                                                 |
| 디스크 확인    | 파일 간 EXTRACTED 관계를 경로·줄 순으로 정렬해 일정 간격으로 300개씩 뽑고, 원문의 그 줄이 관계처럼 읽히는지 본다. import(와 파일 대상 참조)는 `import`·`require`·`from`·`export` 낱말, 심볼 대상 참조는 대상 이름이 그 줄에 있어야 한다 |
| 추출 시간      | 디스크에서 지도를 만들기까지의 벽시계 시간                                                                                                                                                                                              |

출력 지표(폴더 × 조건마다 3회):

| 지표           | 정의                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구조 검사 통과 | JSON으로 읽히고, 모든 부분이 정확히 한 묶음에 있고, 없는 경로가 없고, 묶음 수가 2~8개이면서 부분 수보다 적고, 인용한 근거가 모두 입력에 있는 경우 |
| 엄격 JSON      | 답이 코드 펜스나 설명 없이 바로 JSON인 경우                                                                                                       |
| 근거           | 인용 수, 입력에 있는 인용 수, 인용한 묶음의 부분에 닿는 인용 수, 근거를 하나 이상 단 묶음 수                                                      |
| 토큰·시간      | CLI가 보고한 입력 토큰(캐시 포함)과 출력 토큰, 호출 벽시계 시간                                                                                   |
| 실행 간 일치   | 같은 조건 3회의 묶음을 두 개씩 비교한 조정 랜드 지수(ARI). 1이면 같은 분할, 0 근처면 우연 수준                                                    |
| 조건 간 일치   | ropeman 3회 × graphify 3회 9쌍의 ARI. 두 조건에 다 있는 부분만 센다                                                                               |
| 이름           | 묶음 이름 목록. 수치로 채점하지 않고 표로 나란히 둔다                                                                                             |

### 2-6. 판정 규칙

`graph.json`을 주 입력으로 올리려면 아래가 모두 성립해야 한다. 하나라도 아니면 보조 입력으로 둔다.

1. graphify 조건의 구조 검사 통과율이 ropeman 조건 이상이다.
2. graphify 입력의 디스크 확인 일치율이 ropeman 이상이다.
3. 입력이 결과를 바꾼다: 조건 간 ARI 평균이 두 조건의 실행 간 ARI 평균 중 낮은 쪽보다 0.1 넘게 낮다. 바꾸지 않는다면 입력을 바꿀 이유가 없다.
4. 3이 성립할 때, graphify 쪽 묶음이 근거를 더 많이 단다(근거를 단 묶음 비율이 더 높다).

토큰과 추출 시간은 판정에 넣지 않고 비용으로 따로 적는다.

## 3. 결과

모델 호출은 2026-11-12T15:38:01Z(UTC)에 시작했다. 30번 모두 성공했고 다시 부른 호출은 없다.

### 3-1. 결론

**`graph.json`은 보조 입력으로 둔다. 주 입력은 Ropeman 자체 추출이다.** 판정 규칙 네 개 중 두 개가 성립하지 않는다.

| 규칙                      | 결과                                                                                            | 성립                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. 구조 검사 통과율       | 두 조건 모두 15/15                                                                              | 성립 (같음)                  |
| 2. 디스크 확인 일치율     | ropeman 300/300(100%), graphify 577/600(96.2%)                                                  | 성립 안 함 (3-2의 주의 참고) |
| 3. 입력이 결과를 바꾸는가 | 5개 폴더 중 루트 하나만 기준을 넘는다. 루트의 차이는 호출 관계가 아니라 문서 파일 유무에서 온다 | 성립 안 함                   |
| 4. 근거를 단 묶음 비율    | 규칙 3이 성립하지 않아 판정에 쓰지 않는다                                                       | 해당 없음                    |

같은 폴더를 같은 모델이 나눌 때, 입력을 바꿔서 생기는 차이(조건 간 ARI)가 같은 입력으로 다시 돌릴 때 생기는 차이(실행 간 ARI)와 비슷하다. graphify 입력에는 호출·타입 참조 관계가 더 들어가지만 묶음과 이름은 눈에 띄게 달라지지 않았다. 대신 프롬프트가 1.2~2.4배 커졌다.

### 3-2. 입력 (LLM 없음)

|                                   | ropeman                                      | graphify                                                                        |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| 지도를 만드는 시간                | 7.2초 (`packages/core` CLI 3회: 6.57~6.85초) | `graphify update` 120.9초 + `cluster-only` 26.9초 = 147.8초 (1회), 어댑터 0.5초 |
| 최대 메모리                       | 936~1,024MB (CLI 3회)                        | 1,200MB (`update` 1회)                                                          |
| 파일                              | 5,730                                        | 5,588                                                                           |
| 심볼 (중첩 포함)                  | 31,486                                       | 50,753                                                                          |
| import 위치                       | 28,378                                       | 28,792                                                                          |
| ├ 프로젝트 파일로 연결            | 17,661                                       | 18,341                                                                          |
| ├ 외부 패키지로 연결              | 9,837                                        | 2,007                                                                           |
| ├ 연결 못 함                      | 58                                           | 8,444                                                                           |
| └ 미해석 (JS/TS·Python 밖의 언어) | 822                                          | 0                                                                               |
| 호출 위치                         | 448,394 (대상 미해석)                        | 43,160 (43,156개 대상 하나)                                                     |
| 파일 간 관계 (EXTRACTED)          | import 17,661                                | import 18,338, 호출 13,448, 타입 참조 7,094, 구현 198, 상속 176, 동적 import 76 |
| 파일 간 관계 (INFERRED)           | 0                                            | 호출 1,954, 간접 호출 701, import 2                                             |
| 디스크 확인: import 300개         | 300 일치                                     | 300 일치                                                                        |
| 디스크 확인: 참조 300개           | 해당 없음 (대상이 정해진 참조가 없다)        | 277 일치                                                                        |

- 두 지도의 일치: 둘 다 읽은 파일 5,455개. Ropeman만 읽은 파일은 Markdown 239, YAML 30, Dockerfile·TOML 각 2, 템플릿 `.env` 1, JSON 1개다. Graphify만 읽은 파일은 TypeScript 76, JavaScript 14, YAML 10, 기타 19, TSX 5, Kotlin 4, JSON 4, Bash 1개다. 같은 줄에서 같은 파일을 가리키는 import는 17,384개, Ropeman에만 있는 것 277개, Graphify에만 있는 것 641개다. 차이의 원인은 조사하지 않았다.
- Graphify 외부 패키지 수가 적고 "연결 못 함"이 많은 것은 어댑터 규칙 때문이다. `external: true` 노드의 이름은 Graphify가 만든 슬러그라서 모듈 이름으로 되돌릴 수 없고, 어댑터가 그 위치를 "연결 못 함"으로 둔다.
- **디스크 확인의 주의.** Graphify 참조가 일치하지 않은 23개 중 5개를 원문에서 열어 봤다. 4개는 타입 참조인데 메서드 시작 줄(`private receiveWorkspaceDelta(`)을 위치로 적어서 타입 이름이 다음 줄에 있었다. 1개는 `isSameDaemonInstance(...)` 호출의 대상을 `isSamePidLock`으로 적었는데, `daemon-instance.ts:38`이 `isSamePidLock as isSameDaemonInstance`로 내보내므로 Graphify가 맞다. 그래서 96.2%는 관계가 틀렸다는 뜻이 아니라 이 검사 규칙이 엄격하다는 뜻에 가깝다. 나머지 18개는 열어 보지 않았다. 규칙 2는 적은 대로 "성립 안 함"으로 두지만, 결론은 규칙 3만으로도 같다.
- **PASEO에 원래 있던 `graph.json`은 `packages/server`만 담고 있었다.** 파일 1,305개, `.tsx` 0개, 노드 20,091개다. 사용자가 가진 `graph.json`이 저장소 일부만 담고 있을 수 있다는 뜻이라, 주 입력으로 쓰려면 범위 검사가 따로 필요하다.

### 3-3. 출력 (폴더 × 조건마다 3회)

| 폴더                       | 조건     | 부분 | 관계 | 통과 | 묶음 수 | 근거 (입력에 있음/전체) | 근거 단 묶음 | 입력 토큰 | 출력 토큰 (평균) | 시간 (평균) | 실행 간 ARI (평균)      |
| -------------------------- | -------- | ---- | ---- | ---- | ------- | ----------------------- | ------------ | --------- | ---------------- | ----------- | ----------------------- |
| 루트                       | ropeman  | 26   | 9    | 3/3  | 6, 6, 6 | 34/34                   | 14/18        | 3,742     | 1,110            | 8.5초       | 0.93, 0.87, 0.83 (0.88) |
| 루트                       | graphify | 15   | 15   | 3/3  | 4, 5, 4 | 27/27                   | 9/13         | 4,656     | 847              | 7.1초       | 0.83, 1.00, 0.83 (0.89) |
| `packages`                 | ropeman  | 11   | 21   | 3/3  | 6, 4, 5 | 37/37                   | 15/15        | 6,459     | 1,041            | 8.1초       | 0.27, 0.56, 0.64 (0.49) |
| `packages`                 | graphify | 11   | 74   | 3/3  | 5, 5, 5 | 41/41                   | 15/15        | 15,643    | 1,116            | 8.1초       | 0.46, 0.24, 0.34 (0.35) |
| `packages/server/src`      | ropeman  | 7    | 20   | 3/3  | 4, 5, 5 | 37/37                   | 14/14        | 5,679     | 1,059            | 7.7초       | 0.62, 0.62, 1.00 (0.75) |
| `packages/server/src`      | graphify | 7    | 48   | 3/3  | 5, 4, 4 | 36/36                   | 13/13        | 10,687    | 1,029            | 7.6초       | 0.62, 0.32, 0.15 (0.36) |
| `packages/app/src/hooks`   | ropeman  | 110  | 68   | 3/3  | 7, 7, 8 | 61/61                   | 21/22        | 19,324    | 5,472            | 27.6초      | 0.62, 0.57, 0.67 (0.62) |
| `packages/app/src/hooks`   | graphify | 110  | 117  | 3/3  | 7, 7, 6 | 55/55                   | 20/20        | 28,392    | 4,304            | 22.4초      | 0.56, 0.91, 0.55 (0.67) |
| `packages/app/src/screens` | ropeman  | 27   | 23   | 3/3  | 6, 6, 7 | 32/32                   | 16/19        | 7,087     | 1,570            | 9.4초       | 0.54, 0.90, 0.62 (0.69) |
| `packages/app/src/screens` | graphify | 27   | 41   | 3/3  | 8, 6, 8 | 42/42                   | 19/22        | 10,389    | 1,841            | 11.9초      | 0.48, 0.96, 0.50 (0.65) |

- 30개 답이 모두 바로 읽히는 JSON이었고, 빠진 부분·겹친 부분·없는 경로·입력에 없는 근거가 하나도 없었다. 그래서 이 검사는 두 입력을 가르지 못했다.
- 입력 토큰은 같은 프롬프트를 세 번 보내도 거의 같다(최대 5개 차이). 출력 토큰과 시간은 부분이 110개인 `hooks`에서만 크다(모든 부분 경로를 답에 다시 적기 때문).

조건 간 일치 (ropeman 3회 × graphify 3회, 두 조건에 다 있는 부분만):

| 폴더                       | 공통 부분 | 조건 간 ARI 평균 | 실행 간 ARI 평균 (낮은 쪽) | 기준 (낮은 쪽 − 0.1) | 입력이 결과를 바꿈 |
| -------------------------- | --------- | ---------------- | -------------------------- | -------------------- | ------------------ |
| 루트                       | 12        | 0.62             | 0.88                       | 0.78                 | 예                 |
| `packages`                 | 11        | 0.51             | 0.35                       | 0.25                 | 아니오             |
| `packages/server/src`      | 7         | 0.63             | 0.36                       | 0.26                 | 아니오             |
| `packages/app/src/hooks`   | 110       | 0.65             | 0.62                       | 0.52                 | 아니오             |
| `packages/app/src/screens` | 27        | 0.69             | 0.65                       | 0.55                 | 아니오             |

- 루트에서만 결과가 달라졌다. 루트 부분 목록이 다르기 때문이다. Ropeman 쪽에는 `README.md`, `CHANGELOG.md`, `public-docs`, `skills` 같은 문서가 있어서 모델이 "Docs and Changelogs", "Agent Instructions and Skills" 묶음을 만든다. Graphify의 ast 층에는 Markdown이 없다(semantic 층은 A-10 규칙대로 뺐다). 그래서 남은 12개 공통 부분을 묶는 방식도 달라졌다.
- `packages`와 `packages/server/src`에서는 graphify 입력의 실행 간 일치가 더 낮았다(0.35 대 0.49, 0.36 대 0.75). 관계가 3.5배, 2.4배 많은데 묶음은 더 흔들렸다. 3회씩 세 쌍이라 표본이 작아서, 관계가 많을수록 흔들린다고 말할 근거는 되지 못한다.

묶음 이름 (각 조건 첫 실행):

| 폴더                       | ropeman                                                                                                                           | graphify                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 루트                       | Core Packages, Plugins and Examples, Build and Dev Tooling, Agent Instructions and Skills, Docs and Changelogs, Marketing Assets  | Core Packages, Plugins and Examples, Scripts and Demo Assets, Tooling and Config                                                                                 |
| `packages`                 | Shared Protocol, Daemon Connectivity, Server and Plugins, User Clients, Highlighting Library, Marketing Website                   | Shared Contracts, Daemon Server and Client, Plugin and Highlighting Libraries, User-Facing Apps, Native Audio and Website                                        |
| `packages/server/src`      | Core Server Application, Domain Services and Terminal, Shared Utilities and Resolution, Test Support                              | Core Server Application, Terminal and Task Domains, Forge Services, Shared Utilities and Process Helpers, Test Support                                           |
| `packages/app/src/screens` | New workspace flow, New workspace tests, Settings screens, Schedules screen, Workspace and agent views, Entry and session screens | New Workspace Flow, Workspace Picker, New Workspace Tests, Settings Screens, Projects Screens, Schedules Screen, Workspace and Agent Views, Sessions and Startup |

이름은 폴더 이름과 심볼 이름에서 거의 그대로 나온다. 두 조건의 이름이 같은 폴더에서 같은 낱말을 쓴다. 이름의 질은 채점하지 않았다.

### 3-4. 비용

- 호출 30번, 입력 토큰 336,182개, 출력 토큰 58,170개. CLI가 보고한 정가 환산 1.14달러(구독으로 냈다). 예산(호출 30, 입력 40만, 5달러) 안이다.
- 같은 폴더에서 graphify 프롬프트가 ropeman보다 1.24배(루트)~2.42배(`packages`) 크다. 늘어난 만큼은 호출·참조 관계와 그 근거다.
- CLI는 호출마다 작은 Haiku 보조 호출을 한 번 더 한다(`modelUsage`에 `claude-haiku-5-5`). 위 토큰 수는 Sonnet 호출만이고, 달러 금액에는 보조 호출이 들어 있다.

### 3-5. 하지 않은 것과 한계

- 모델 하나(`claude-sonnet-5-5`)만 썼다. `gemini` CLI로 같은 실험을 하지 않았다.
- Graphify 빌드 시간과 메모리는 한 번만 쟀다.
- 이름의 질은 사람도 모델도 채점하지 않았다. 표로 나란히 둘 뿐이다.
- 폴더 단위로 묶고 이름 붙이는 일만 쟀다. 호출 관계가 더 쓸모 있을 일(파일 안 드릴다운, LLM이 그린 관계를 코드 근거로 확인하는 T1-8)은 재지 않았다.
- Ropeman 호출 위치는 아직 대상을 해석하지 않는다(`pending`). 그래서 이 실험의 ropeman 조건에는 호출 관계가 아예 없다. Ropeman이 호출 대상을 해석하게 되면 결과가 바뀔 수 있다.

### 3-6. 권장

1. Ropeman 자체 추출을 주 입력으로 둔다. 폴더 계층과 이름에는 import 관계와 심볼 이름으로 충분했고, 추출이 20배 빠르며(7.2초 대 147.8초), Markdown·설정 파일까지 담는다.
2. `graph.json`은 지금 규칙(ast 층과 외부 노드, semantic 층 제외)대로 보조 입력으로 둔다. Ropeman에 아직 없는 호출·타입 참조 관계(EXTRACTED 2만 개 남짓)를 줄 수 있다.
3. 보조 입력으로 열 때는 범위를 보여 준다. PASEO의 기존 `graph.json`처럼 저장소 일부만 담은 파일이 있다.
4. 호출 관계가 필요해지는 작업(T1-8 등) 전에 Ropeman 쪽 호출 해석을 따로 재고 판단한다. 이 실험은 그 필요를 재지 않았다.

## 4. 다시 돌리기

```sh
# PASEO 복사본 (원본은 읽기만 한다)
git -C <paseo> archive HEAD | tar -x -C <copy>
# Graphify 0.9.104로 저장소 전체 graph.json (LLM 없음)
graphify update <copy> --no-cluster
graphify cluster-only <copy> --no-label --no-viz
# 입력 지표와 프롬프트만 (모델 호출 없음)
node scripts/paseo-comparison/run.mjs --repo <copy> --graph <copy>/graphify-out/graph.json \
  --out <out> --dry-run --folder . --folder packages --folder packages/server/src \
  --folder packages/app/src/hooks --folder packages/app/src/screens
# 모델 호출까지 (--dry-run 빼기). 이미 있는 runs/*.json은 다시 부르지 않는다
```

`<out>`에 `inputs.json`(입력 지표), `prompts/`(보낸 프롬프트 그대로), `runs/`(호출마다 답과 검사 결과), `summary.json`(위 표의 숫자)이 생긴다. 검사 함수의 테스트는 `scripts/paseo-comparison/comparison.test.ts`다.
