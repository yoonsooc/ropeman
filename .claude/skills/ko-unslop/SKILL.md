---
name: ko-unslop
description: Rewrite Korean UI copy and docs so they read like a person wrote them, and keep Ropeman's en/ko terms consistent. Use when writing or reviewing Korean strings in i18nStore, README-KO.md, or Korean docs. Not for LLM analysis output shown in the product.
---

# Korean unslop

Edit Korean text in place. Keep meaning, placeholders (`{n}`, `{track}`) and keys. Do not add facts. English text uses the installed `humanizer` skill; agent-facing English uses pstack `unslop`.

Run `node .claude/skills/ko-unslop/scan.mjs <file>...` before and after. It flags the regex-detectable patterns below by line. A hit is a prompt to look, not an automatic fix; a pattern inside a quoted product name or an option label stays.

## Patterns

| #   | Pattern                                                                       | Before                                         | After                                           |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| 1   | "~하는 것이 중요합니다"                                                       | 키를 확인하는 것이 중요합니다                  | 키를 확인하세요                                 |
| 2   | "~를 통해" for an ordinary verb                                               | CLI를 통해 분석합니다                          | CLI로 분석합니다                                |
| 3   | Filler adjectives (다양한, 효율적인, 원활한, 강력한, 손쉽게)                  | 다양한 언어를 지원합니다                       | Python, Go 등 14개 언어를 지원합니다            |
| 4   | Over-nominalization (명사화)                                                  | 확인을 진행합니다 / 분석 수행                  | 확인합니다 / 분석합니다                         |
| 5   | Translationese "~에 대해", "~가 가능합니다"                                   | 아키텍처에 대해 질문하세요 / 중단이 가능합니다 | 아키텍처를 물어보세요 / 중단할 수 있습니다      |
| 6   | Double passive "~되어지다"                                                    | 저장되어집니다                                 | 저장됩니다 (or name the actor)                  |
| 7   | Empty emphasis (안심하셔도, 절대, 어떠한 경우에도, 완벽하게, 100%)            | 안심하셔도 됩니다. 절대 전송되지 않습니다      | 전송하지 않습니다                               |
| 8   | "단순히 X가 아니라 Y", "X뿐만 아니라 Y"                                       | 단순한 트리가 아니라 역할 지도입니다           | 역할별로 묶은 다이어그램을 보여줍니다           |
| 9   | Arrow and dash chains (→, —, ->) in prose                                     | 폴더 열기 — 선택하면 파싱 → 분석               | 폴더를 고르면 파싱을 시작합니다                 |
| 10  | Unexplained term or English label leaking into Korean (pill, Settings, Share) | 우측 하단 pill의 Share 버튼                    | 오른쪽 아래 분석 상태 표시의 공유 버튼          |
| 11  | Noun-ending fragments where a sentence is meant                               | 요청 한도 초과. 잠시 후 재시도                 | 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요 |
| 12  | Mixed register in one surface                                                 | 쓸 수 없어요 / 지원하지 않습니다               | 쓸 수 없습니다 / 지원하지 않습니다              |

Rules that need judgment, not regex:

- Name the mechanism instead of the feeling. "보안이 적용된 중계 서버" says nothing; "Ropeman 프록시를 거치며 키를 저장하지 않습니다" says what happens.
- UI register is 합니다/하세요. Short labels (buttons, badges) are noun phrases or verb stems: "다시 분석", "폴더 열기".
- A Korean string that names a UI element uses that element's Korean label, not the English one.
- Keep a status label a label: "분석 완료" is fine. Pattern 11 applies to sentences.
- Drop "~해주세요" softeners where "~하세요" reads naturally, and keep one form per surface.

## Terms

One concept, one word per language. Use these in i18nStore values, READMEs and docs.

| Concept                                            | en                                                | ko                               |
| -------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| Curated example gallery (`/explore`)               | Explore                                           | 갤러리                           |
| Free server-backed mode                            | Demo                                              | 데모                             |
| Bring-your-own-key mode                            | API Key (BYOK) as a label, "API key" in sentences | API 키 (BYOK)                    |
| Local CLI mode                                     | Local Bridge, short: Bridge                       | 로컬 브리지, short: 브리지       |
| In-browser model mode                              | WebGPU (card title: Browser AI)                   | WebGPU (card title: 브라우저 AI) |
| AI vendor (Google, Anthropic, OpenAI)              | provider                                          | 제공자                           |
| Metadata sent to AI (symbols, signatures, imports) | code summary                                      | 코드 구조 요약                   |
| Role-based tree                                    | semantic tree                                     | 시맨틱 트리                      |
| Open a node's inner structure                      | drill down                                        | 드릴다운                         |
| Project directory the user opens                   | folder                                            | 폴더                             |
| Settings dialog                                    | Settings                                          | 설정                             |
| Share action                                       | Share                                             | 공유하기 (button), 공유 (noun)   |

Keep existing English label casing ("Open Folder", "Additional Excluded Directories") and the Korean label "추가 제외 디렉토리". The in-app docs under `src/content/docs/` cite them by name, so rename a label only together with those docs. Count nouns use the plural placeholder `{n} {n|symbol|symbols}`, which `i18nStore.t()` resolves with `Intl.PluralRules`.
