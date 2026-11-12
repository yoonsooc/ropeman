# Graphify graph.json 픽스처

`src/lib/services/graphifyAdapter.ts`(Graphify `graph.json`을 코드 지도로 읽는 어댑터)의 테스트 입력이다. 어댑터 규칙은 `docs/ARCH.md`의 "스켈레톤 v2 (코드 지도)" 절에 있다.

Graphify 이름은 호환 설명에만 쓴다. Ropeman은 Graphify 프로젝트와 관련이 없다. 아래 파일은 Graphify가 이 저장소의 픽스처를 읽고 낸 출력이며, Graphify 코드는 들어 있지 않다.

| 파일                  | 내용                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hand.graph.json`     | 손으로 쓴 작은 그래프. 한 줄에 대상 둘, 같은 이름의 대상 둘, `also_seen`, AMBIGUOUS, 외부 노드, package.json 의존성, `deferred` import(TS와 Python), 줄 없는 `dynamic_import`, semantic 층, 부모 없는 심볼, `reverse_import`, 호출이 접힌 `contains`를 하나씩 담았다 |
| `<저장소>.graph.json` | `tests/fixtures/graphs/<저장소>`를 Graphify 0.9.104로 읽은 출력이다(`schema_version` 1). prettier가 줄바꿈만 바꿨다. LLM 단계 없이 AST 추출만 돌았다                                                                                                                 |

## 다시 만들기

저장소 폴더 안에 `graphify-out/`이 생기지 않도록 복사본에서 돌린다.

```sh
tmp=$(mktemp -d)
for repo in ts-monorepo svelte-app py-shop; do
  cp -R tests/fixtures/graphs/$repo "$tmp/$repo"
  graphify update "$tmp/$repo"
  cp "$tmp/$repo/graphify-out/graph.json" tests/fixtures/graphify/$repo.graph.json
done
```

`graphify update --no-cluster`는 `graph.schema_version`이 없는 다른 모양을 쓰므로 어댑터가 거부한다. 군집을 만드는 기본 실행을 쓴다.

## 점수 (2026-11-12, Graphify 0.9.104)

`graphifyAdapter.test.ts`가 어댑터 결과를 `tests/fixtures/graphs/`의 정답으로 채점한다. 값은 precision / recall / siteRecall이다(정의는 `tests/fixtures/graphs/README.md`).

| 저장소      | `imports_from` | `imports`    | `re_exports` | `dynamic_import` | `calls`         |
| ----------- | -------------- | ------------ | ------------ | ---------------- | --------------- |
| ts-monorepo | 1 / 0.94 / 1   | 1 / 0.9 / 1  | 1 / 0.93 / 1 | 1 / 1 / 1        | 1 / 0.73 / 0.77 |
| svelte-app  | 1 / 0.3 / 1    | 1 / 0.29 / 1 | 1 / 1 / 1    | 정답 없음        | 1 / 0.25 / 0.25 |
| py-shop     | 1 / 0.69 / 1   | 1 / 0.92 / 1 | 채점 안 함   | 정답 없음        | 1 / 0.86 / 0.93 |

놓친 관계를 graph.json에서 찾아본 결과다.

- svelte-app: Graphify는 `$lib/…` import를 모두 외부 노드 하나(`ref_lib`)로 보낸다. 어댑터는 `ref_lib`를 가리키는 import 관계 14개를 연결 못 한 대상(`unresolved`)으로 둔다. `$lib`에서 가져온 함수의 호출도 Graphify 출력에 없다.
- py-shop: `__init__.py`의 `from .service import OrderService`는 같은 파일 쌍에 `imports_from`과 `re_exports`를 함께 만든다. 노드 쌍마다 관계가 하나만 남아서 `imports_from` 3개가 사라졌다(`--no-cluster` 출력에는 있다). `if __name__ == '__main__': main()`과 `json.dumps` 호출은 Graphify 추출에 처음부터 없다.
- ts-monorepo: `store.ts` ↔ `events.ts` 순환 import의 한쪽은 `reverse_import` 표시만 남고 줄이 없다. `formatDate` 안의 두 번째 `pad()` 호출(같은 쌍, 다른 줄)은 `--no-cluster` 출력에도 없다. 같은 쌍의 호출은 한 번만 나온다. 배럴을 거친 `new Logger()` 두 곳과 `math.clamp`, `store.set`, `mod.register` 같은 속성 호출도 Graphify 출력에 없다.
