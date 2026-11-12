# Graphify graph.json 픽스처

`src/lib/services/graphifyAdapter.ts`(Graphify `graph.json`을 코드 지도로 읽는 어댑터)의 테스트 입력이다. 어댑터 규칙은 `docs/ARCH.md`의 "스켈레톤 v2 (코드 지도)" 절에 있다.

Graphify 이름은 호환 설명에만 쓴다. Ropeman은 Graphify 프로젝트와 관련이 없다. 아래 파일은 Graphify가 이 저장소의 픽스처를 읽고 낸 출력이며, Graphify 코드는 들어 있지 않다.

| 파일                     | 내용                                                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hand.graph.json`        | 손으로 쓴 작은 그래프. 한 줄에 대상 둘, 같은 이름의 대상 둘, `also_seen`, AMBIGUOUS, 외부 노드, package.json 의존성, `deferred` import(TS와 Python), 줄 없는 `dynamic_import`, semantic 층, 부모 없는 심볼, `reverse_import`, 호출이 접힌 `contains`를 하나씩 담았다 |
| `<저장소>.graph.json`    | `tests/fixtures/graphs/<저장소>`를 Graphify 0.9.104로 읽은 출력이다(`schema_version` 1). prettier가 줄바꿈만 바꿨다. LLM 단계 없이 AST 추출만 돌았다                                                                                                                 |
| `ids/`, `ids.graph.json` | SymbolId 비교용 작은 저장소와 그 Graphify 0.9.104 출력이다. 오버로드, getter/setter, 함수 안 함수, 클래스 안 클래스, 이름이 같은 메서드, 데코레이터 메서드, Svelte 컴포넌트, 한 줄에 호출 둘을 담았다. 정답 파일은 없다                                              |

## 다시 만들기

저장소 폴더 안에 `graphify-out/`이 생기지 않도록 복사본에서 돌린다.

```sh
tmp=$(mktemp -d)
for repo in ts-monorepo svelte-app py-shop; do
  cp -R tests/fixtures/graphs/$repo "$tmp/$repo"
  graphify update "$tmp/$repo"
  cp "$tmp/$repo/graphify-out/graph.json" tests/fixtures/graphify/$repo.graph.json
done
cp -R tests/fixtures/graphify/ids "$tmp/ids"
graphify update "$tmp/ids"
cp "$tmp/ids/graphify-out/graph.json" tests/fixtures/graphify/ids.graph.json
npx prettier --write tests/fixtures/graphify/*.graph.json
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

## 한 줄에 대상이 둘일 때

어댑터는 한 함수가 한 줄에서 부르는 대상을 이름별로 나눈다. 이름이 다르면 호출 위치(site) 둘, 이름이 같으면 한 위치의 후보 여럿이다. 이 규칙은 두 가지 근거에 기대고 있다.

- Graphify 0.9.104는 원본 호출 하나마다 `calls` 관계 하나를 내고, 이미 낸 (호출한 쪽, 대상) 쌍은 건너뛴다. `graphify/extract.py`의 `_emit_call`(5549행 근처, 5595행에서 `existing_pairs` 확인)과 언어별 멤버 호출 해석(5307행, 6317행 근처의 `existing_pairs.add`)이 그렇게 되어 있다. 그래서 한 줄에 같은 줄 번호의 `calls`가 둘 있으면 원본에 호출이 둘 있었다는 뜻이다.
- PASEO에서 한 함수가 한 줄에서 EXTRACTED 대상 둘 이상을 부르는 줄 232개를 원문과 손으로 맞춰 보았다. 모두 호출 두 개가 따로 적혀 있었다(`applySkills(targets, nonDestructivePlan(status))`).

`ids/src/calls.ts`가 회귀 테스트 입력이다. 10행 `wrap(plan())`은 `calls` 둘로, 14행 `wrap(1) + wrap(2)`는 쌍이 같아서 `calls` 하나로 나온다. `graphifyAdapter.test.ts`가 이 세 위치를 확인한다. Graphify 버전이 바뀌면 위 행 번호와 이 동작을 다시 확인한다.

## SymbolId 일치 (2026-11-12, Graphify 0.9.104)

T1-12에서 Graphify 지도와 Ropeman 지도를 비교하려면 같은 심볼이 같은 SymbolId(`경로#부모.이름~n`)를 가져야 한다. 그래야 점수 차이가 id 불일치가 아니라 추출 품질 차이임을 알 수 있다. `codeMapScore.fixtures.test.ts`가 파일마다 실제 파서(`fileFromAst`)의 id와 어댑터의 id를 `id 종류` 단위로 비교한다.

| 저장소      | 파서 id 중 어댑터에도 있는 것 | 어댑터에만 있는 것 |
| ----------- | ----------------------------- | ------------------ |
| ts-monorepo | 26 / 26                       | 9                  |
| svelte-app  | 13 / 13                       | 11                 |
| py-shop     | 15 / 15                       | 0                  |
| ids         | 15 / 16                       | 6                  |

`ids`에서 빠진 하나는 `Box.size~2`(setter)다. Graphify는 노드 id를 파일과 이름으로 만들어서, 한 범위에서 이름이 같은 선언(getter와 setter, 오버로드)을 노드 하나로 합친다. 어댑터가 되살릴 정보가 graph.json에 없다. 오버로드 `parse`는 양쪽 모두 하나라서 일치한다.

어댑터에만 있는 심볼은 모두 파서가 내지 않는 종류이고, 테스트가 아래 이유 중 하나로 설명되지 않는 심볼을 실패로 본다.

- 화살표 함수가 아닌 바인딩(`const log = …`, Svelte `let { data } = $props()`). 파서는 화살표 함수 바인딩만 낸다.
- TS `interface`와 `type` 별칭. 파서는 내지 않고, Graphify는 클래스(`_callable_class`)로 표시한다. 어댑터에서는 `class`로 보인다.
- 함수 안의 함수, 클래스 안의 클래스(그 메서드 포함). 파서는 최상위 선언과 클래스 본문만 읽는다.
- 데코레이터가 붙은 Python 메서드(`@property def size`). 파서는 클래스 본문의 `decorated_definition`을 건너뛴다. 파서 쪽 누락이다.
