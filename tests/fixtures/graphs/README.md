# 정답 그래프 픽스처

추출기(호출 T1-5, import 해석 T1-6, 추론 관계 T1-8, graph.json 어댑터 T1-10)를 바꿀 때마다 정답과 비교해 점수를 매기려고 둔 작은 저장소 세 개다.

| 저장소 | 파일 | 정답 관계 | 담은 경우 |
| --- | --- | --- | --- |
| `ts-monorepo/` | 24 (TS 19) | 76 | 워크스페이스 패키지(`@acme/core`), tsconfig `paths`(`@shared/*`, 앱 tsconfig가 base의 paths를 덮어씀), `$lib` 별칭, 배럴 `index.ts`, `export *`, `export { default as … }`, `export type`, default·namespace·type-only import, side-effect import, 동적 `import()`, 순환 import(`store.ts` ↔ `events.ts`), 배럴을 거친 호출, 클래스 인스턴스 메서드 호출, 설치되지 않은 외부 패키지(`lodash-es`), `plugins.ts`와 `plugins/index.ts`가 함께 있는 경로 |
| `svelte-app/` | 16 (코드 14) | 50 | `.svelte` 컴포넌트가 TS 모듈을 import, 설정 없는 SvelteKit `$lib`, `$lib` 루트 배럴, `cart.svelte` → `cart.svelte.ts`, 컴포넌트 default import, 룬 |
| `py-shop/` | 10 (py 9) | 39 | 상대 import(`.`, `..`), 패키지 `__init__.py`를 거친 import, 자기 패키지 절대 import(`from shop import …`), 클래스 호출, `self.repo.save` 같은 속성 메서드 호출, 표준 라이브러리(`json`) |

- 각 저장소는 `?testDir=<절대 경로>`로 앱에서 그대로 열린다. 저장소 안에는 로더가 건너뛰는 이름(`tests`, `fixtures`, `docs`, 점으로 시작하는 이름 등, `scripts/vite-dev-fs-plugin.js`의 `SKIP_PATTERNS`)을 쓰지 않는다.
- `<저장소>.truth.json`이 정답이고 `baseline.json`이 지금 추출기의 기록이다. 둘 다 저장소 폴더 밖에 있어서 로더가 읽지 않는다.
- 저장소 코드는 lint, prettier, svelte-check 대상에서 뺐다. 포매터가 줄을 옮기면 정답의 줄 번호가 틀어진다.

## 정답 형식

```json
{ "kinds": ["imports_from", "imports", "re_exports", "dynamic_import", "calls"],
  "edges": [{ "kind": "calls", "from": "apps/web/src/main.ts", "line": 13, "written": "log.info", "to": "packages/core/src/logger.ts#Logger.info" }] }
```

- `from`은 관계가 적힌 파일의 저장소 기준 경로, `line`은 문장이나 호출이 시작하는 줄이다.
- `to`는 파일이면 `경로`, 심볼이면 `경로#부모.이름`(SymbolId에서 root를 뗀 것), 외부면 `ext:모듈` 또는 `ext:모듈#이름`이다.
- `written`은 그 줄에 보이는 글자(모듈 이름, 가져온 이름, 호출식)다. 비교에는 쓰지 않고, 줄 번호가 맞는지 테스트가 확인하는 데 쓴다.
- `kinds`에 적은 종류는 빠짐없이 적는다. 적지 않은 종류(`references`, `inherits` 등)는 채점하지 않는다.

코드 지도(`src/lib/types/codeMap.ts`)와는 이렇게 대응한다.

| 종류 | 코드 지도 위치 |
| --- | --- |
| `imports_from` | `FileRecord.imports[].module` |
| `imports` | `FileRecord.imports[].specifiers[].target` |
| `re_exports` | `FileRecord.reexports[]`의 `module`과 `specifiers[].target` 둘 다 |
| `dynamic_import`, `calls` | `FileRecord.refs[]`의 같은 `kind` |

## 정답을 정한 규칙

1. 모듈 대상은 문장이 가리키는 파일 그대로다. `import … from '@acme/core'`의 대상은 배럴 `packages/core/src/index.ts`다.
2. 이름 대상은 재수출을 끝까지 따라간 선언이다. `main.ts`가 배럴에서 가져온 `formatDate`의 대상은 `format.ts#formatDate`다. Python `__init__.py`를 거친 이름도 같다.
3. namespace import(`import * as math`)의 이름 대상은 그 파일이다.
4. 호출은 문법상 호출식만 센다. TS `new Logger()`는 호출이 아니고, Python `Order(items)`는 클래스 `Order`를 부르는 호출이다.
5. 호출 대상이 저장소 안 선언이거나 외부 패키지에서 이름으로 가져온 것일 때만 정답에 넣는다. 내장 함수와 전역(`listeners.push`, `Array.isArray`, `print`), 룬(`$props`, `$state`), 매개변수나 지역 값으로 받은 함수(`listener(…)`, `fetchFn(…)`)는 정답이 없다. 이런 호출을 무언가에 연결하면 오탐이 된다. `store.ts`의 `this.values.set`은 이름만 보고 `Store.set`에 연결하면 틀리는 함정이다.
6. `.svelte` 마크업 안의 식(`{priceOf(i)}`, `{@render children()}`)은 범위 밖이다. 파서는 `<script>`만 읽는다.
7. `.svelte` 컴포넌트의 default import(`import Button from './Button.svelte'`)는 파일 관계(`imports_from`, `re_exports`)만 적는다. 컴포넌트는 심볼이 아니라서 코드 지도에 가리킬 대상이 없다.
8. 같은 종류·파일·줄·대상인 관계는 하나로 센다.

## 점수

`src/lib/services/codeMapScore.ts`의 `scoreCodeMap(map, truth)`가 종류마다 아래 값을 낸다.

- `precision`: 코드 지도가 연결한 관계 중 정답인 비율. 연결한 것이 없으면 `null`.
- `recall`: 정답 중 코드 지도가 같은 대상으로 연결한 비율.
- `siteRecall`: 정답 중 코드 지도에 그 줄의 위치(site)가 있는 비율. 대상 연결 여부는 보지 않는다. 호출 추출과 대상 해석을 따로 잴 수 있다.
- `misses`(놓친 정답), `falsePositives`(정답에 없는 연결).

후보가 여럿인 연결(INFERRED)은 후보마다 하나씩 센다.

## 기준선

`src/lib/services/codeMapScore.fixtures.test.ts`가 `?testDir=` 로더와 같은 스캐너로 파일을 읽고 지금 파서와 `buildCodeMap()`으로 코드 지도를 만든 뒤 `baseline.json`과 비교한다. 기록보다 낮아진 값이 있을 때만 실패한다.

2026-11-12 기록 (import 해석기 T1-6 이후). `extract()`는 `isResolverConfig()`가 고른 설정 파일 원문을 `buildCodeMap()`에 넘긴다.

| 저장소 | `imports_from` precision / recall | `imports` precision / recall |
| --- | --- | --- |
| ts-monorepo | 1 / 1 | 1 / 0.6 |
| svelte-app | 1 / 1 | 1 / 0.35 |
| py-shop | 1 / 1 | 1 / 0.92 |

- 세 저장소 모두 import `siteRecall`은 1이다. 파서는 최상위 import 문을 시작 줄과 함께 모두 내보낸다. `.svelte` 안의 import도 파일 기준 줄이다.
- 놓친 `imports` 20개 중 6개는 TS 배럴을 거친 이름이다. 파서가 `export … from` 문을 내보내지 않아서 해석기가 따라갈 재수출 위치가 없다. 같은 이유로 `re_exports`의 `siteRecall`은 0이다. `__init__.py`의 import를 거친 Python 이름은 연결된다.
- 나머지 14개는 아래 파서 한계 때문이다. `refs`는 아직 비어 있어 `calls`·`dynamic_import`는 0이다.

T1-5와 T1-6이 넘어야 할 파서 한계도 있다. 파서는 interface, type 별칭, 함수가 아닌 `const`(`cart`), Python 모듈 변수(`ROUND`)를 심볼로 내보내지 않는다. 이런 이름을 가리키는 정답(`types.ts#Entity`, `shared/config.ts#AppConfig`, `cart.svelte.ts#cart`, `pricing.py#ROUND` 등)은 파서가 그 심볼을 만들기 전에는 연결할 수 없다.

추출기를 고쳐 점수가 오르면 기준선을 다시 기록하고 같은 PR에 넣는다. 지금 기준선은 import 위치만 지키고 호출·재수출·동적 import와 precision은 지키지 못하므로, 호출 추출(T1-5)과 import 해석기(T1-6) PR은 반드시 기준선을 다시 기록해야 한다. CI에서 `UPDATE_GRAPH_BASELINE`을 켜면 테스트가 실패한다.

```sh
UPDATE_GRAPH_BASELINE=1 npx vitest run src/lib/services/codeMapScore.fixtures.test.ts
```

정답을 고치거나 늘릴 때는 같은 테스트가 세 가지를 확인한다. 정답 줄에 `written`이 낱말로 있는지, 대상 파일이 파싱되고 그 파일에 대상 이름이 있는지, 같은 관계가 두 번 없는지다.
