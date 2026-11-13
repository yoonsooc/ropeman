# Ropeman 스킬

`ropeman/`은 [Agent Skill](https://agentskills.io) 폴더다(`SKILL.md` 하나). 설치한 뒤 코딩 에이전트에게 "이 저장소 지도 그려줘"라고 하면, 에이전트가 `ropeman` 명령으로 지도를 만들고 단계마다 부분에 이름을 붙인다. 검증기가 거부한 이름은 고치고, 끝나면 로컬 주소를 알려 준다. 브라우저에서 폴더를 누르면 드릴다운하고, 파일을 누르면 원문이 열린다.

스킬은 셸 명령과 파일 쓰기만 쓴다. 서브에이전트, 훅, 특정 모델이 없어도 된다. Claude Code에서 확인했다. `SKILL.md` 폴더를 읽는 다른 에이전트도 같은 절차로 돌아야 하지만 아직 확인하지 않았다.

에이전트가 읽는 정본은 영어 `ropeman/SKILL.md`다. 이 문서는 사람이 읽는 안내라서 스킬 폴더 밖에 두었고, 스킬로 읽히지 않는다.

## 1. `ropeman` 명령 설치

스킬은 `ropeman`(`@ropeman/bridge` 패키지 0.3.0 이상, Node 22 이상)을 실행한다.

지금은 0.3.0이 npm에 없으므로 이 저장소를 받아서 설치한다.

```bash
npm ci && npm ci --prefix bridge
cd bridge && npm pack            # 앱, bridge, 뷰어를 빌드하고 ropeman-bridge-0.3.0.tgz를 만든다
npm install -g ./ropeman-bridge-0.3.0.tgz
ropeman --version                # 0.3.0
```

0.3.0을 배포한 뒤에는(배포 전) 이렇게 설치한다.

```bash
npm install -g @ropeman/bridge
```

## 2. 스킬 설치

`ropeman` 폴더를 에이전트가 스킬을 읽는 폴더에 복사한다. Claude Code는 다음과 같다.

```bash
cp -R skill/ropeman ~/.claude/skills/ropeman
```

스킬을 지원하지 않는 에이전트에는 `ropeman/SKILL.md` 내용을 대화에 붙여 넣으면 같은 절차를 따른다.

## 3. 쓰기

에이전트에게 "이 저장소 지도 그려줘"라고 한다. 저장소를 바꾸면 안 되면 그렇게 말한다. 그러면 에이전트가 결과를 `.ropeman/` 대신 저장소 밖에 쓴다.

에이전트가 따르는 절차(`SKILL.md`)는 다음과 같다.

1. `ropeman --version`으로 설치를 확인한다.
2. 출력 폴더를 정한다. 기본은 저장소 안의 숨은 폴더 `.ropeman`이고, 저장소를 바꾸면 안 되면 저장소 밖 폴더를 쓴다.
3. `ropeman map --root <저장소> --out <폴더>`를 실행한다. 저장소를 추출해 폴더로 묶은 지도 `ropeman.json`, 다음에 이름을 붙일 단계 `work.json`, 커버리지와 문제 목록(JSON)을 낸다.
4. `work.json`을 읽고 그 단계의 부분마다 이름, 한 문장 설명, 핵심 심볼을 `names.json`에 쓴다. 1단계는 저장소 최상위, 2단계는 그 안의 폴더다.
5. 3을 다시 실행한다. 문제가 있으면 코드(`name-missing`, `key-symbol-unknown` 등)대로 고치고, 없으면 다음 단계로 간다. 검증기를 통과하지 못한 단계는 지도에 폴더 이름으로 남는다.
6. `ropeman verify --root <저장소> --map <폴더>/ropeman.json`으로 위반이 0개인지 확인한다.
7. 커버리지(본 파일, 지도에 든 파일, 건너뛴 파일과 이유)와 최상위 이름을 알려 준다.
8. `ropeman serve --root <저장소> --out <폴더> --local`을 띄우고, 출력된 `http://127.0.0.1:9800/bridge#token=…` 주소를 알려 준다.
9. 브라우저에서 이름이 없는 더 깊은 폴더를 열면 serve가 대기열(`queue.json`)에 넣고, 화면은 다음 대화 때 에이전트가 이름을 붙인다고 알려 준다. 에이전트는 다음 메시지를 받으면 먼저 `ropeman queue --out <폴더>`로 대기열을 보고, 있으면 3~5를 다시 한다. 열린 화면에 이름이 바로 나타난다.

명령은 모두 정해진 인자만 받는다. 에이전트는 이름을 파일에 쓰고, 명령줄에 넣지 않는다. 서버의 보안 규칙은 `bridge/README.md`에 있다.

## 확인하지 않은 것

- Claude Code가 아닌 에이전트(Codex, Gemini CLI, Cursor 등)
- Windows
