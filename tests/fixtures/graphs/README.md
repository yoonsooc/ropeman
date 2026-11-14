# 정답 그래프 픽스처

추출기(호출 T1-5, import 해석 T1-6, 추론 관계 T1-8, graph.json 어댑터 T1-10, 참조 해석)를 바꿀 때마다 정답과 비교해 점수를 매기려고 둔 작은 저장소 여섯 개다.

| 저장소 | 파일 | 정답 관계 | 담은 경우 |
| --- | --- | --- | --- |
| `ts-monorepo/` | 24 (TS 19) | 79 | 워크스페이스 패키지(`@acme/core`), tsconfig `paths`(`@shared/*`, 앱 tsconfig가 base의 paths를 덮어씀), `$lib` 별칭, 배럴 `index.ts`, `export *`, `export { default as … }`, `export type`, default·namespace·type-only import, side-effect import, 동적 `import()`, 순환 import(`store.ts` ↔ `events.ts`), 배럴을 거친 호출, `new` 생성자 호출, 클래스 인스턴스 메서드 호출, 설치되지 않은 외부 패키지(`lodash-es`), `plugins.ts`와 `plugins/index.ts`가 함께 있는 경로 |
| `svelte-app/` | 16 (코드 14) | 51 | `.svelte` 컴포넌트가 TS 모듈을 import, 설정 없는 SvelteKit `$lib`, `$lib` 루트 배럴, `cart.svelte` → `cart.svelte.ts`, 컴포넌트 default import, 룬 |
| `py-shop/` | 10 (py 9) | 39 | 상대 import(`.`, `..`), 패키지 `__init__.py`를 거친 import, 자기 패키지 절대 import(`from shop import …`), 클래스 호출, `self.repo.save` 같은 속성 메서드 호출, 표준 라이브러리(`json`) |
| `go-shop/` | 22 (go 20) | 51 | 묶은 import와 묶지 않은 import, 빈 `import ()`, 별칭·`_`·`.` import, 이름이 패키지와 같은 파일이 없는 패키지(`web/api`는 `doc.go`와 `handlers.go`, `internal/ids`는 `gen.go`), `_test.go`와 `package x_test`, 폴더 이름과 모듈 경로가 다른 중첩 모듈(`tooling/go.mod`의 `example.com/shop/tools`), 표준 라이브러리와 외부 모듈, 폴더가 없는 모듈 안 경로(`legacy`), 중첩 모듈 폴더를 바깥 모듈 경로로 쓴 import(`example.com/shop/tooling/rules`, 연결 없음), `_`로 시작하는 파일과 생성 파일(`codec.pb.go`)을 건너뛴 대표 파일(`codec/wire.go`), 같은 패키지의 다른 파일 함수 호출, `_test.go`에서 본 패키지 함수, 받는 변수로 부른 메서드(`m.all()`), `.` import로 부른 함수, 표준 라이브러리 패키지 호출(`json.Marshal`), 이름이 둘인 메서드(`store.NewMemory().Put`, 연결 없음) |
| `rust-shop/` | 14 (rs 10) | 65 | 가상 워크스페이스, 이름의 `-`가 `_`인 크레이트(`shop-core` → `shop_core`), `[lib] name`·`path`로 바꾼 라이브러리(`cli_kit`, `src/kit.rs`), 그래서 쓸 수 없는 이름(`shop_cli`), `src/`를 함께 쓰는 `kit.rs`와 `main.rs`, `crate`·`self`·`super`·`super::super`, uniform path(`use model::Item`), 묶음 안의 묶음, `{self, X as Y}`, 글롭, `pub use`를 거친 이름, `pub(crate) use ::std::io`, 이름을 바꾼 의존성(`[target.'cfg(unix)'.dependencies]`의 `core-lib = { package = "shop-core" }`, `[dependencies.kit] package = "shop-cli"`), 인라인 `mod tests { use super::*; }`(관계 없음), `Self::`·`crate::util::slug`·`shop_core::pricing::Cart::new` 경로 호출, 트레이트 메서드 호출(`store.put`), `impl Trait for Type`(`fmt::Display`는 외부), 표준 타입 메서드(`self.items.len()`, 정답 없음) |
| `poly-shop/` | 27 | 55 | 언어마다 파일 둘이나 셋: Java(같은 `package`, import 폴더, `extends`·`implements`, 부모 메서드를 맨이름으로 호출), Kotlin(생성자를 부르는 상위 타입과 인터페이스, `object`), C#(base list, struct), Ruby(`<`, `Foo.new`, `self.m`), PHP(`$this->`, `Tax::rate`, 함수), Swift(class·struct·extension), Scala(`extends`·`with`, 개요가 멤버를 적지 않아 호출은 연결 없음), C++(base class, `.hpp`, `this` 없는 멤버 호출), C(다른 파일 함수), Python(부모 메서드 `self.describe`, `super().total`, `models.Order` 상속), TS(`extends`·`implements`, interface는 심볼이 아니라 연결 없음). 같은 이름(`Cart`, `Tax`)이 여러 언어에 있어 언어가 섞이지 않는지 본다 |

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

코드 지도(`src/lib/types/codeMap.ts`)와는 이렇게 대응한다. `poly-shop`은 `calls`·`inherits`·`implements`만 적는다.

| 종류 | 코드 지도 위치 |
| --- | --- |
| `imports_from` | `FileRecord.imports[].module` |
| `imports` | `FileRecord.imports[].specifiers[].target` |
| `re_exports` | `FileRecord.reexports[]`의 `module`과 `specifiers[].target` 둘 다 |
| `dynamic_import`, `calls`, `inherits`, `implements` | `FileRecord.refs[]`의 같은 `kind` |

## 정답을 정한 규칙

1. 모듈 대상은 문장이 가리키는 파일 그대로다. `import … from '@acme/core'`의 대상은 배럴 `packages/core/src/index.ts`다.
2. 이름 대상은 재수출을 끝까지 따라간 선언이다. `main.ts`가 배럴에서 가져온 `formatDate`의 대상은 `format.ts#formatDate`다. Python `__init__.py`를 거친 이름도 같다.
3. namespace import(`import * as math`)의 이름 대상은 그 파일이다.
4. 호출은 추출기(`src/lib/workers/refQueries.ts`)와 Graphify가 세는 것을 센다. Graphify 0.9.104도 `new_expression`과 JSX 요소를 호출 노드로 읽는다. 호출식(`f()`, `a.b()`) 외에 생성자 호출도 클래스를 부르는 호출이다. TS `new Logger()`와 Python `Order(items)`는 둘 다 클래스 선언(`logger.ts#Logger`, `models.py#Order`)을 가리킨다. TSX·JSX 컴포넌트 태그(`<Counter />`, `<ui.Button>`)도 그 컴포넌트를 부르는 호출이고, 소문자 HTML 태그(`<div>`)는 호출이 아니다. 지금 픽스처에는 TSX 파일이 없어서 태그 호출 정답은 없다. 내장 클래스(`new Map()`)는 규칙 5에 따라 정답이 없다.
5. 호출 대상이 저장소 안 선언이거나 외부 패키지에서 이름으로 가져온 것일 때만 정답에 넣는다. 내장 함수와 전역(`listeners.push`, `Array.isArray`, `print`), 룬(`$props`, `$state`), 매개변수나 지역 값으로 받은 함수(`listener(…)`, `fetchFn(…)`)는 정답이 없다. 이런 호출을 무언가에 연결하면 오탐이 된다. `store.ts`의 `this.values.set`은 이름만 보고 `Store.set`에 연결하면 틀리는 함정이다.
6. `.svelte` 마크업 안의 식(`{priceOf(i)}`, `{@render children()}`)은 범위 밖이다. 파서는 `<script>`만 읽는다.
7. `.svelte` 컴포넌트의 default import(`import Button from './Button.svelte'`)는 파일 관계(`imports_from`, `re_exports`)만 적는다. 컴포넌트는 심볼이 아니라서 코드 지도에 가리킬 대상이 없다.
8. 같은 종류·파일·줄·대상인 관계는 하나로 센다.
9. Go import는 패키지(폴더)를 가리키지만 위치의 모듈 대상은 하나라서, 정답은 그 패키지의 대표 파일이다. 패키지 이름과 같은 파일(`store/store.go`), 없으면 경로 순서로 `doc.go`도 생성 파일(`*.pb.go`, `*_gen.go`, `zz_generated*`)도 아닌 첫 파일(`web/api/handlers.go`, `internal/ids/gen.go`, `codec/wire.go`)이다. `_test.go`와 `_`·`.`로 시작하는 파일은 패키지에 들지 않는다. Go에는 가져온 이름이 없어서 `imports_from`만 적는다. 표준 라이브러리와 외부 모듈은 `ext:경로`(`ext:net/http`)다.
10. Rust `use`의 모듈 대상은 `{…}`나 `*` 앞의 경로가 가리키는 모듈 파일이고, 묶음이 없으면 경로의 마지막 모듈이다(`use crate::util::slug`는 `util.rs`, `use shop_core::model`은 `model.rs`). 이름 대상은 잎마다 하나다. 잎이 모듈이면 그 파일, 아니면 재수출(`pub use`)을 끝까지 따라간 선언이다(규칙 2). 외부 크레이트는 크레이트 이름(`ext:std`, `ext:std#fmt`)이다. 글롭은 이름 대상이 없다. `pub use`는 이름을 그 파일에 들여오기도 하므로 `imports_from`·`imports`로 적고 `re_exports`는 쓰지 않는다. `mod x;` 선언은 관계가 아니다.
11. 상속(`inherits`, `implements`)의 대상은 그 머리말이 적은 타입의 선언이다. 종류는 파서 규칙을 따른다(Swift·C# 클래스의 목록은 모두 `inherits`, Kotlin은 생성자를 부르면 `inherits`, Scala `with`와 Rust `impl Trait for`는 `implements`). 내장 타입(`Exception`, `Comparable<T>`, `Clone`, `Sendable`)은 규칙 5처럼 정답이 없다. 외부 패키지에서 이름으로 가져온 타입은 `ext:`다(`ext:std#fmt::Display`).
12. 표준 라이브러리 타입의 메서드를 저장소 값에서 부른 호출(`m.mu.Lock()`, `self.items.len()`, `t.Fatal`)은 규칙 5처럼 정답이 없다. 받는 값의 실제 타입이 정하는 대상은 그 타입의 선언이다(`store.NewMemory().Put`은 `Memory.Put`). 해석기가 받는 타입을 몰라 못 잇는 것이 정답에 그대로 남는다.

## 점수

`src/lib/services/codeMapScore.ts`의 `scoreCodeMap(map, truth)`가 종류마다 아래 값을 낸다.

- `precision`: 코드 지도가 연결한 관계 중 정답인 비율. 연결한 것이 없으면 `null`.
- `recall`: 정답 중 코드 지도가 같은 대상으로 연결한 비율.
- `siteRecall`: 정답 중 코드 지도에 그 줄의 위치(site)가 있는 비율. 대상 연결 여부는 보지 않는다. 호출 추출과 대상 해석을 따로 잴 수 있다.
- `misses`(놓친 정답), `falsePositives`(정답에 없는 연결).

후보가 여럿인 연결(INFERRED)은 후보마다 하나씩 센다.

## 기준선

`src/lib/services/codeMapScore.fixtures.test.ts`가 `?testDir=` 로더와 같은 스캐너로 파일을 읽고 지금 파서와 `buildCodeMap()`으로 코드 지도를 만든 뒤 `baseline.json`과 비교한다. 기록보다 낮아진 값이 있을 때만 실패한다.

2026-11-12 기록 (참조 위치 추출 T1-5와 import 해석기 T1-6 이후). `extract()`는 파서가 읽은 `refs`와 `isResolverConfig()`가 고른 설정 파일 원문을 `buildCodeMap()`에 넘긴다.

| 저장소 | `imports_from` precision / recall | `imports` precision / recall |
| --- | --- | --- |
| ts-monorepo | 1 / 1 | 1 / 0.6 |
| svelte-app | 1 / 1 | 1 / 0.35 |
| py-shop | 1 / 1 | 1 / 0.92 |
| go-shop | 1 / 1 | 해당 없음 |
| rust-shop | 1 / 1 | 1 / 1 |

- `go-shop`·`rust-shop` 줄은 2026-11-14에 Go·Rust import 해석과 함께 기록했다. 2026-11-14 리뷰 수정에서 정답 6개를 더했고 점수는 그대로 1이다. 두 정답은 해석 규칙(규칙 9, 10)을 정한 뒤 손으로 적었으므로, 이 1은 규칙대로 구현했다는 뜻이다. 실제 저장소에서 규칙이 맞는지는 PR에 적은 Graphify 비교로 따로 봤다.
- 처음 세 저장소 모두 import `siteRecall`은 1이다. 파서는 최상위 import 문을 시작 줄과 함께 모두 내보낸다. `.svelte` 안의 import도 파일 기준 줄이다.
- 놓친 `imports` 20개 중 6개는 TS 배럴을 거친 이름이다. 파서가 `export … from` 문을 내보내지 않아서 해석기가 따라갈 재수출 위치가 없다. 같은 이유로 `re_exports`의 `siteRecall`은 0이다. `__init__.py`의 import를 거친 Python 이름은 연결된다.
- 나머지 14개는 아래 파서 한계 때문이다.
- `calls`·`dynamic_import`의 `siteRecall`은 1이다. 2026-11-12에는 대상이 `pending`이라 recall이 0이었다.

T1-5와 T1-6이 넘어야 할 파서 한계도 있다. 파서는 interface, type 별칭, 함수가 아닌 `const`(`cart`), Python 모듈 변수(`ROUND`)를 심볼로 내보내지 않는다. 이런 이름을 가리키는 정답(`types.ts#Entity`, `shared/config.ts#AppConfig`, `cart.svelte.ts#cart`, `pricing.py#ROUND` 등)은 파서가 그 심볼을 만들기 전에는 연결할 수 없다.

2026-11-14 기록 (참조 해석 `refResolver.ts` 이후). 호출과 상속 precision / recall이다. precision은 모두 1이다.

| 저장소 | `calls` | `inherits` | `implements` |
| --- | --- | --- | --- |
| ts-monorepo | 1 / 0.73 (19/26) | 해당 없음 | 해당 없음 |
| svelte-app | 1 / 0.75 (9/12) | 해당 없음 | 해당 없음 |
| py-shop | 1 / 1 (14/14) | 해당 없음 | 해당 없음 |
| go-shop | 1 / 1 (23/23) | 해당 없음 | 해당 없음 |
| rust-shop | 1 / 1 (12/12) | 정답 없음 | 1 / 1 (3/3) |
| poly-shop | 1 / 0.94 (31/33) | 1 / 1 (15/15) | 1 / 0.86 (6/7) |

- ts-monorepo·svelte-app에서 놓친 호출 10개 중 6개는 배럴을 거친 이름이다(위 파서 한계). `@acme/core`·`api/index.ts`·`$lib` 배럴로 가져온 `Logger` 둘, `createId`, `formatDate`, `fetchUser`, `formatPrice`.
- 3개는 표준 타입의 메서드 이름이라 이름만으로 잇지 않은 것이다(`store.set`, `cart.add`, `cart.clear`). 대신 `this.values.set`을 `Store.set`에 잇는 함정도 피한다.
- `mod.register`는 `import()` 결과를 담은 변수라 대상 모듈을 모른다. poly-shop의 2개는 Scala 개요가 클래스·object 멤버를 적지 않아서이고, 놓친 `implements`는 TS interface다.
- 이 정답도 해석 규칙을 정한 뒤 손으로 적었으므로 precision 1은 규칙대로 구현했다는 뜻이다. 실제 저장소의 정확도는 `docs/ARCH.md`의 "참조 해석 실측"(표본 대조, Graphify 비교)에 있다.
- 언어별 수는 `SHOW_LANGUAGE_SCORES=1`, 놓친 관계와 오탐은 `SHOW_GRAPH_SCORES=1`을 붙여 같은 테스트를 돌리면 나온다.

추출기를 고쳐 점수가 오르면 기준선을 다시 기록하고 같은 PR에 넣는다. 참조 대상을 잇는 PR은 `calls`·`dynamic_import`의 recall과 precision을 새로 기록해야 한다. CI에서 `UPDATE_GRAPH_BASELINE`을 켜면 테스트가 실패한다.

```sh
UPDATE_GRAPH_BASELINE=1 npx vitest run src/lib/services/codeMapScore.fixtures.test.ts
```

정답을 고치거나 늘릴 때는 같은 테스트가 세 가지를 확인한다. 정답 줄에 `written`이 낱말로 있는지, 대상 파일이 파싱되고 그 파일에 대상 이름이 있는지, 같은 관계가 두 번 없는지다.
