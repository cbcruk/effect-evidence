# effect-evidence — 핸드오프 노트

> 상태: v0.4. 아래 "완료" 섹션까지 코드에 반영됨. 그 아래는 아직 열려 있는 것.

## 한 줄 요약
불필요하게 쓰인 useEffect를 **걷어낼 때 딸려오는 배선도**를 뽑는 도구.
판단을 돕는 증거 수집기가 아니다 — 제거 작업의 입력이다.

## 프레임 (여기서 자꾸 드리프트했으니 고정)
- 잘못된 useEffect는 "심판할 피고"가 아니라 "치울 쓰레기"다. 심판이 없으니 **증거(evidence)라는 개념 자체가 불필요**하다.
- 데이터플로우 / 좌표 / 원문 = 판단용 증거 ❌ → **제거 작업의 배선도** ✅.
  배관 뜯기 전 어디 연결됐나 보는 것이지, 배관이 유죄인지 심리하는 게 아니다.
- 그래서 엔진은 verdict도 evidence도 아닌 **리팩터 입력**을 emit한다.
- 이름은 `effect-evidence`로 남아 있다. 프레임과 안 맞지만 개명은 아직 안 했다.

## 가드레일 — 딱 하나만 남았다
과거엔 "사람이 판단한다" 하나로 두 개를 뭉쳐 정당화했다. reframe이 분리한다:

- **가드레일 A (삭제됨)**: "LLM이 reactivity를 결론짓지 마, 가리키기만."
  → 심판 프레임의 산물. 심판을 버리면 오심 걱정도 사라진다. **녹았다.**
  → LLM은 이제 best-effort로 **결론 내도 되고 제거 수(move)를 제안해도 된다.**
    틀린 제안은 오심이 아니라 그냥 틀린 리팩터 순서. 사람이 넘기면 끝.

- **가드레일 B (유일하게 유지, THE 가드레일)**: **제거를 자동 적용하지 마라.**
  → 프레임과 무관. effect 제거는 렌더 타이밍·중간 상태를 바꾼다(의미론 변경).
    치우는 방법이 다치(多値)다: 렌더 계산 / 이벤트 핸들러 / useSyncExternalStore / key 리셋.
    코드에 없는 **의도**가 방법을 정한다. 컴파일러조차 verdict 자격 다 사놓고 auto-fix 안 한다.
  → **판단은 자유롭게(A), 행위는 사람이(B).** A는 판단에, B는 행위에 붙는다.
  → 코드에서의 위치: `effect-evidence.mjs` 상단 주석. 출력은 read-only, 쓰기 경로 없음.

## L3는 레이어가 아니라 핸드오프다
- 심판 프레임에선 L3 = "가드레일 달린 판정 층" = 지어야 할 아티팩트였다.
- reframe 후 L3 = **배선도를 물려서 코딩 에이전트한테 "나쁜 거 걷어내라" 하는 리팩터 세션 그 자체.**
- 지을 건 **엔진 하나(L1 위치 + L2 배선도 수집)**뿐. 중간 "판정 층" 아티팩트는 통째로 사라진다.
- 엔진이 값어치하는 이유: 에이전트가 스스로 싸게 못 뽑는 교차참조를 준다
  (setter의 컴포넌트 전역 호출 위치, deps 차집합 등).

## 보수성의 방향이 바뀐다 (전과 반대)
- 전: L3가 *결론*에 보수적.
- 후: 사람이 제안 믿고 **빨리 걷어내므로**, **행위의 blast radius**에 보수적.
- 엔진은 이미 옳은 데이터를 뽑고 있다: `setTime: effect 밖 12곳`은
  심판 프레임에선 "판단 증거"였지만 제거 프레임에선 **"자르기 전 blast radius 경고"**다.
  파생 effect를 렌더로 옮길 때 그 값이 딴 데서도 쓰이면 double-source 충돌 → "빨리 자르면 안 됨" 신호.
  같은 데이터, **크게 띄울 줄만 바뀐다.** → v0.4에서 실제로 크게 띄웠다(⚠ 2줄 경고).

---

## 완료 (v0.4)

### 실행 가능화
`package.json` 없이 떠돌던 스크립트였다. 이제 `pnpm install` → `node effect-evidence.mjs <file.tsx>`.

### 모델/뷰 분리 — 됐다
- `collectEvidence(component) -> EffectEvidence[]` — 순수 데이터
- `collectFile(file) -> { file, components: [{name, loc, effects}] }` — 컴포넌트 그룹핑
- `renderText(model)` — 뷰 하나
- **`--json`** — 이 분리의 값어치. 에이전트가 텍스트 되파싱 없이 모델을 그대로 먹는다.

### 헤더/프레임 문구 교체 — 됐다
- 헤더: "effect 걷어낼 때 딸려오는 배선도 — 자르는 건 사람"
- 파일 상단 주석 블록도 심판 프레임이었어서 같이 교체, 가드레일 B를 근거와 함께 명시.

### 고친 버그 3개
- **`setTimeout`/`setInterval`이 setState로 오분류**: `/^set[A-Z]/`가 먼저 걸렸다.
  집계도 blast radius도 오염됐었다. `isSetter()`로 통일(전역/외부 callee 선배제).
- **컴포넌트 레벨 `function foo(){}`가 decl 테이블에 없음**: 바로 위에 있는데 "선언 못 찾음"이 떴다.
- **`r => ...` 파라미터 누락**: `field('parameters')`가 괄호 없는 단일 파라미터에서 null.
  `paramNode()` 폴백. 다만 이것만으론 부족했다 → 아래 `nested` 참조.

### 추가된 구분
- **`useLayoutEffect($CB)`** (deps 없는 형태) — 비대칭이라 조용히 누락되고 있었다.
- **지연 콜백 안의 setState**: `schedulerOf()`가 `setTimeout`/`setInterval`/`queueMicrotask`/
  `requestAnimationFrame`/`requestIdleCallback` + `.then`/`.catch`/`.finally`/`.addEventListener`를 본다.
  파생 상태가 아니므로 **blast radius 경고를 안 띄운다** — 진짜 후보에서 눈 뺏기니까.
  버리지 않고 라벨만: 여전히 옮겨야 할 수 있는 배선이다. 컴파일러도 스케줄 콜백은 면제한다.
- **`resolution: 'nested'`**: decl 테이블 0건 + 중첩 바인딩에 존재 = 그 바인딩 자신.
  스코프 해석 없이도 정확한 조합. 콜백 파라미터가 "선언 못 찾음" 노이즈로 뜨던 걸 없앴다.

## EffectEvidence 스키마 (v0.4 — `--json`이 emit하는 shape)
모델은 v0.1→v0.4 내내 안정. 추가된 건 전부 필드/태그였지 shape가 아니었다.

```
EffectEvidence {
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
  candidates?               // dup일 때 [{loc, verbatim, kindTag}] — loc/verbatim 단수로 안 담겨서 분리
  shadow: boolean           // 콜백 내부에서도 바인딩됨 (섀도잉 가능)
}

SideEffect {
  loc, verbatim
  kind: 'setState' | 'external'
  setter?                   // setState일 때 setter 이름
  state?                    // setState일 때 추정 state 이름
  scheduled?                // 'setTimeout' | 'then' | ... | null. non-null = 지연 쓰기, 파생 아님
  outsideCallSites?: Line[] // 이 setter가 effect 밖에서 호출되는 위치 = blast radius
}
```

`tally.reads`는 **출력된 줄 수**다(= `reads.length`). `nested`/`global`도 센다.
"진짜 컴포넌트 참조"만 원하면 `resolution`으로 필터해라 — 집계는 보여준 것의 중립 카운트라는 불변식을 유지했다.

## 알려진 한계 = 구멍이 아니라 이음새 (correctness 아니라 최적화)
LLM이 한 홉 best-effort로 메워도 됨. 정밀 도구는 나중에 *교체*로 끼운다.
- **스코프**: 진짜 해석 없음. `nested`/`shadow`는 값싼 근사.
  진짜 스코프 → exhaustive-deps 이식이 업그레이드 경로.
- **side effect 한 홉 안쪽**(호출한 로컬 함수 내부): `→ 추적 계속`으로만 가리킴. 실제 파일에서
  "외부 0"으로 과소평가되는 케이스 있었음(예: effect가 부른 로컬 함수가 DOM 조작). **여전히 그렇다.**
- **custom hook / memo 재귀**: 한 홉. reactivity 전파를 fixpoint로 안 돌림(그건 컴파일러 몫).
- **한 파일씩**: glob/다중 파일 미지원.
- **setter 인식이 이름 규약 기반**: `/^set[A-Z]/`. 규약 안 따르는 setter는 못 본다.

## 참고: 진짜 컴파일러 (react/react, Rust 재작성 중)
- `compiler/crates/react_compiler_validation/src/`:
  - `validate_no_derived_computations_in_effects.rs` — 우리 표적 그 자체.
    TypeOfValue { Ignored, FromProps, FromState, FromPropsAndState } 라티스를
    source_ids 따라 **fixpoint 전파**(MAX 100), Data Flow Tree 렌더해서 "You might not need an effect".
  - `validate_no_set_state_in_effects.rs` — effect 본문 setState(스케줄 콜백은 허용).
    → v0.4의 `scheduled` 라벨이 이걸 따라간 것.
  - `validate_exhaustive_dependencies.rs` — deps.
- 시사점: 컴파일러도 **탐지→사람이 수정→사람이 커밋**. auto-rewrite 안 함 = 가드레일 B의 근거.
- SSA(`react_compiler_ssa`)가 섀도잉/name-join을 구조적으로 없앰 — 우리 name-join은 그 값싼 근사.
