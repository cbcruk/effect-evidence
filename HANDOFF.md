# effect-xray — 핸드오프 노트

> 상태: v0.6. 이름/프레임 `effect-xray` 고정 + 멀티파일 입력. L3가 실물 스킬(`effect-xray-refactor`)로 존재하고 eval까지 돌았다. 아래 "완료" 섹션까지 코드에 반영됨. 그 아래는 아직 열려 있는 것.

## 한 줄 요약
지금 이 useEffect가 **무엇에 배선돼 있는지 투시하는 엑스레이**.
판결(evidence)도, 제거 지시(removal)도 아니다 — 현재 구조를 드러낼 뿐, 뭘 할지는 읽는 사람.

## 프레임 (v0.5에서 다시 고정 — 이번엔 뿌리부터)
이전 프레임들이 왜 계속 드리프트했나: `evidence`(심판)도 `removal`(제거)도 **목적을 가진(teleological)** 프레임이라 도구를 끝점(판결/삭제)으로 기울게 만들었다. 끝을 가리키면 도구가 그 끝을 향해 판단하기 시작한다.

- **엑스레이는 목적이 없다(non-teleological).** "지금 뭐에 배선돼 있나"만 그린다.
  제거할지·유지할지·리팩터할지는 100% 하류(사람/에이전트)의 몫. 드리프트를 관리하는 게 아니라 **뿌리에서 없앤다.**
- 방사선사는 드러내고, 결정은 외과의가. 도구는 **렌즈**다.
- 산출물은 여전히 **배선도(wiring/blueprint)**다: reads / side effects / deps 불일치 / 공동 소스.
  단, 이건 *현재 있는 것의 회로도*(as-built schematic)이지 *지을 것의 설계도*가 아니다.

## 가드레일 — 이제 뼈대까지 은퇴했다
- **가드레일 A (v0.4에서 삭제)**: "LLM이 reactivity를 결론짓지 마." → 심판 프레임의 산물. 심판을 버리며 녹았다.
- **가드레일 B (v0.5에서 녹음)**: "제거를 자동 적용하지 마." → *제거* 프레임의 산물이었다.
  엑스레이는 제거를 **제안하지 않으므로** 자동 적용할 대상 자체가 없다. read-only는 지켜야 할 규율이 아니라
  **본성**이다. 심판 프레임이 남긴 가드레일 뼈대가 통째로 은퇴한다.
- 코드에서의 위치: `effect-xray.mjs` 상단 주석. 출력은 read-only, 쓰기 경로 없음.

## 강조는 유지한다 — 덤프가 아니라 회로도
엑스레이라고 모든 식별자를 균등하게 그리는 게 아니다. 좋은 회로도는 **하중을 받는 선**을 강조한다:
reactive read / deps가 주장하는 것 / effect 밖으로 새는 write. 이 편집적 선별이 도구의 값어치다.
(납작한 AST 덤프로 떨어지면 값어치가 사라진다.)

## 컴파일러와의 경계 — 겹치지 않는다
React 컴파일러는 **"이 effect가 불필요한가?"**(탐지)를 fixpoint 데이터플로우로 답한다.
엑스레이는 **"지금 뭐에 어떻게 배선돼 있나?"**(구조)를 답한다. 정밀도로 컴파일러를 추격하지 않는다 —
그 길은 열등한 복제다. 엑스레이의 고유 지대는 **구조의 가시화**와 **넓이**(공동 소스 등)다.
정밀 분석이 필요한 지점(스코프/reactivity 전파)은 나중에 컴파일러 패스로 *교체*해 끼운다.

## L3는 레이어가 아니라 핸드오프다
- 엑스레이를 읽고 → 코딩 에이전트/사람이 무엇을 할지 결정하는 **그 세션 자체**가 L3다.
- 지을 건 **엔진 하나(L1 위치 + L2 배선도)**뿐. 중간 "판정 층" 아티팩트는 없다.
- 엔진이 값어치하는 이유: 에이전트가 스스로 싸게 못 뽑는 교차참조를 준다
  (setter의 컴포넌트 전역 호출 위치, deps 차집합 등).
- L3는 이제 실물이다: `.claude/skills/effect-xray-refactor/`. 도구가 read-only 렌즈면,
  스킬은 **행위 층** — 코드를 편집하므로 규율(행동 보존·의도 추측 금지·하나씩·검증)이 거기 산다.

## L3 스킬 eval 결과 — 값어치가 어디에 있고, 어디엔 없나
스킬을 skill-creator 하네스로 벤치마크했다(with-skill vs no-skill, 서브에이전트). **핵심은 이 결과를 정직하게 새긴 것.**

- **셋업**: 명확한 케이스 3 + 함정 케이스 3(파생처럼 보이나 순진하게 const로 바꾸면 회귀: 흩어진 blast radius / props→state 편집 / 누적기). 각 케이스 with·without 2런.
- **결과: 두 라운드 모두 pass rate 100% 동점(Δ 0).** 프런티어 모델(Opus 4.8) baseline이 파생/비파생·key리셋·누적기 함정까지 이미 정확히 처리. **소형 파일·강한 모델에선 correctness 리프트가 없다.**
- **스킬이 이긴 유일한 지점**: 누적기 effect에서 baseline이 `prevQuery` 패턴으로 mount 시점 기록을 *조용히* 바꿨는데, 스킬은 "행동 보존 아니면 flag" 규율로 그 변경을 거부하고 파일을 그대로 뒀다. 정량 assertion(grep)으로는 둘 다 PASS라 이 nuance를 못 잡았다 — **정성으로만 드러났다.**
- **비용**: 스킬이 일관되게 +35~70% 토큰·시간.
- **결론 = 재포지셔닝**: 스킬은 "프런티어를 더 똑똑하게"가 아니다. 값어치는 **(a) 패턴을 확실히 모르는 약한/저가 모델, (b) setter 호출처가 흩어진 대형·낯선 파일의 blast-radius 열거(손읽기가 지는 곳), (c) 행동 보존 규율 강제**에 있다. 그래서 v2에서 description을 정직화하고 "calibrate effort"(사소한 케이스는 도구/검증 생략)를 넣어 사소·함정 케이스 각각 토큰 −13~14%로 줄였다 — 정답성·규율은 유지.
- **교훈**: eval의 값어치는 리프트를 증명한 게 아니라 **과대포장을 막은 것**이었다. "리프트 없음"도 결과다.

---

## 완료 (v0.6)

### 타입 안전 — JSDoc + checkJs (무빌드, v0.6.1)
TS 마이그레이션을 검토한 결과, **완전 TS(빌드)가 아니라 JSDoc + `// @ts-check`**를 골랐다. 이유:
이 도구의 정체성이 **단일 파일·무빌드·`bin`으로 바로 실행**이라, `dist/` 컴파일은 그 정체성과 블랙박스 테스트를 깬다.
JSDoc + `checkJs`는 그걸 하나도 안 건드리고 TS 이득의 대부분을 준다.
- `tsconfig.json`: `checkJs`/`strict`/`noEmit`. `typescript`·`@types/node`는 devDep(런타임 의존은 여전히 `@ast-grep/napi` 하나).
- `effect-xray.mjs` 상단에 모델 `@typedef`(EffectWiring/Read/SideEffect/Tally/Model) — HANDOFF 스키마가 이제 **컴파일러가 검사하는 타입**.
- ast-grep의 nullable 반환(`field`/`parent`/`getMatch` → `SgNode | null`, `getMatch('CB')`도)을 strict가 강제 → 가드 몇 군데를 실제로 단단히 했다(그게 이득이자 유일한 실작업이었다). `kind()`는 `string | number`라 `kindStr()`로 통일.
- `pnpm typecheck`(tsc) 단독, `pnpm test`는 `tsc && node --test`로 타입까지 게이트. 런타임·출력·`--json` shape 무변경.

### 멀티파일 입력 — 넓이는 "입력"만 넓혔다
- CLI가 여러 파일/글롭을 한 번에 받는다: `node effect-xray.mjs src/**/*.tsx` 또는 `'src/**/*.tsx'`(셸이 안 펴면 `fs.globSync`가 편다).
- 파일 목록은 dedupe + `.ts/.tsx` 필터 + 정렬. 명시적 없는 파일은 `not found` exit 1, 매칭 0건은 exit 1.
- **최상위 모델 shape 변경**: `{ file, components }` → **`{ files: [ { file, components } ] }`** (단일 파일도 `files` 배열 1건).
  per-file 모델(`{file, components}`)과 그 아래(EffectWiring 등)는 **불변** — 에이전트는 항상 `files`만 돌면 된다.
- **크로스파일 "공동 소스"는 일부러 안 한다.** 한 컴포넌트 안에선 스코프가 닫혀 name-join이 값싼 근사로 통하지만,
  파일을 넘으면 `setTime` 같은 이름이 서로 다른 state라 **가짜 배선을 만든다** — 이 도구가 피하는 규율 위반.
  진짜 크로스모듈 흐름(prop/컨텍스트로 넘어간 setter)은 **나중에 컴파일러 패스로 교체**. 지금은 파일별 xray를 배치할 뿐.

## 완료 (v0.5)

### 리네임 + 리프레임 — `effect-xray`
- 파일 `effect-evidence.mjs` → `effect-xray.mjs`, `package.json` name/bin/start, v0.5.0.
- 내부 `collectEvidence` → `collectWiring`, 문서 스키마 `EffectEvidence` → `EffectWiring`.
- 톤 조정(경고 → 사실):
  - 헤더: "useEffect 엑스레이 — 지금 이 effect가 무엇에 배선돼 있는지 투시한다. 뭘 할진 읽는 사람."
  - blast-radius `⚠ ... 충돌 가능 → 먼저 확인` → **사실 서술** "setter: effect 밖에서도 N곳 구동 — L… (이 상태의 공동 소스)".
  - depsDiff "deps에 없는 reactive read" → "deps가 주장하지 않는 reactive read".
  - **JSON 출력 shape는 그대로** — 키·필드 불변(소비자/스키마 테스트 안 깨짐). 바뀐 건 텍스트 뷰의 표현뿐.

### 회귀 방지 smoke-test (v0.4 말미에 추가, v0.5 갱신)
- `pnpm test` → Node 22 내장 러너(`node --test`), 새 의존성 없음. 실제 CLI를 스폰하는 블랙박스 12건.
- 어서션은 라인 번호가 아닌 **내용**(setter 이름·태그·스키마 필드) 기준.
- `node --test`에 `test/` 디렉터리를 인자로 주면 진입 모듈로 오해해 실패 → **인자 없는 자동 탐색** 사용.

### 실행 가능화 (v0.4)
`pnpm install` → `node effect-xray.mjs <file.tsx>` (`--json` 지원).

### 모델/뷰 분리 (v0.4)
- `collectWiring(component) -> EffectWiring[]` — 순수 데이터
- `collectFile(file) -> { file, components: [{name, loc, effects}] }` — 컴포넌트 그룹핑
- `renderText(model)` — 뷰 하나
- **`--json`** — 에이전트가 텍스트 되파싱 없이 모델을 그대로 먹는다.

### 고친 버그 3개 (v0.4)
- **`setTimeout`/`setInterval`이 setState로 오분류**: `/^set[A-Z]/`가 먼저 걸렸다. `isSetter()`로 통일(전역/외부 callee 선배제).
- **컴포넌트 레벨 `function foo(){}`가 decl 테이블에 없음**: 바로 위에 있는데 "선언 못 찾음"이 떴다.
- **`r => ...` 파라미터 누락**: `field('parameters')`가 괄호 없는 단일 파라미터에서 null. `paramNode()` 폴백.

### 구분 (v0.4)
- **`useLayoutEffect($CB)`** (deps 없는 형태) — 비대칭이라 조용히 누락되고 있었다.
- **지연 콜백 안의 setState**: `schedulerOf()`가 `setTimeout`/`setInterval`/`queueMicrotask`/
  `requestAnimationFrame`/`requestIdleCallback` + `.then`/`.catch`/`.finally`/`.addEventListener`를 본다.
  파생 상태가 아니므로 **공동-소스 표시를 안 띄운다** — 라벨만 남긴다(여전히 옮겨야 할 수 있는 배선).
- **`resolution: 'nested'`**: decl 테이블 0건 + 중첩 바인딩에 존재 = 그 바인딩 자신. 스코프 해석 없이 정확한 조합.

## 최상위 shape + EffectWiring 스키마 (v0.6 — `--json`이 emit하는 shape)
최상위는 v0.6에서 `{ files: [ { file, components } ] }`로 바뀌었다(멀티파일). 그 안쪽(EffectWiring)은 v0.1→v0.6 내내 안정 — 추가된 건 전부 필드/태그였지 shape가 아니었다.

```
{ files: [ { file: string, components: [ { name, loc, effects: EffectWiring[] } ] } ] }


EffectWiring {
  effect:   { loc, endLine, deps: string[] | null, depsText: string | null }
  reads:    Read[]
  effects:  SideEffect[]
  tally:    { reads, stateReads, external, setState, scheduledSetState }
  depsDiff: string[]        // reactive read인데 deps에 없는 것 (한 홉 기준)
}

Read {
  name
  resolution: 'found' | 'global' | 'nested' | 'notfound' | 'dup'
  //   nested = 중첩 콜백 바인딩. effect 밖 참조 아님
  loc?                      // found일 때 선언 위치
  verbatim?                 // found일 때 선언 원문 (hop decl은 callee+deps만, 본문 elide)
  kindTag?                  // param | useState | useReducer | useContext | useMemo | useCallback
                            //  | useRef | useEffectEvent | custom hook | function | const
  hopTo?                    // memo/custom hook/function — 다음 홉 라인
  candidates?               // dup일 때 [{loc, verbatim, kindTag}]
  shadow: boolean           // 콜백 내부에서도 바인딩됨 (섀도잉 가능)
}

SideEffect {
  loc, verbatim
  kind: 'setState' | 'external'
  setter?                   // setState일 때 setter 이름
  state?                    // setState일 때 추정 state 이름
  scheduled?                // 'setTimeout' | 'then' | ... | null. non-null = 지연 쓰기, 파생 아님
  outsideCallSites?: Line[] // 이 setter가 effect 밖에서 호출되는 위치 = 이 상태의 공동 소스
}
```

`tally.reads`는 **출력된 줄 수**다(= `reads.length`). `nested`/`global`도 센다.
"진짜 컴포넌트 참조"만 원하면 `resolution`으로 필터해라 — 집계는 보여준 것의 중립 카운트라는 불변식을 유지했다.

## 알려진 한계 = 구멍이 아니라 이음새 (correctness 아니라 최적화)
LLM이 한 홉 best-effort로 메워도 됨. 정밀 도구는 나중에 *교체*로 끼운다.
- **스코프**: 진짜 해석 없음. `nested`/`shadow`는 값싼 근사. 진짜 스코프 → exhaustive-deps 이식이 업그레이드 경로.
- **side effect 한 홉 안쪽**(호출한 로컬 함수 내부): `→ 추적 계속`으로만 가리킴. 로컬 함수가 DOM 조작하면 "외부 0"으로 과소평가되는 케이스 있음.
- **custom hook / memo 재귀**: 한 홉. reactivity 전파를 fixpoint로 안 돌림(그건 컴파일러 몫).
- **크로스파일 흐름**: 멀티파일 *입력*은 v0.6에서 됨(파일별 배치). 하지만 파일 경계를 넘는 배선
  (prop/컨텍스트로 넘어간 setter의 공동 소스)은 안 잇는다 — name-join으론 가짜, 진짜론 컴파일러 몫.
- **setter 인식이 이름 규약 기반**: `/^set[A-Z]/`. 규약 안 따르는 setter는 못 본다.

## 참고: 진짜 컴파일러 (react/react, Rust 재작성 중)
- `compiler/crates/react_compiler_validation/src/`:
  - `validate_no_derived_computations_in_effects.rs` — TypeOfValue 라티스를 source_ids 따라 **fixpoint 전파**(MAX 100), "You might not need an effect".
  - `validate_no_set_state_in_effects.rs` — effect 본문 setState(스케줄 콜백은 허용). → v0.4의 `scheduled` 라벨이 이걸 따라간 것.
  - `validate_exhaustive_dependencies.rs` — deps.
- 시사점: 컴파일러도 **탐지→사람이 수정→사람이 커밋**. auto-rewrite 안 함.
- SSA(`react_compiler_ssa`)가 섀도잉/name-join을 구조적으로 없앰 — 우리 name-join은 그 값싼 근사.
