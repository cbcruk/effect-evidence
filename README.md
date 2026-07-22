# effect-xray

> 지금 이 `useEffect`가 **무엇에 배선돼 있는지** 투시하는 엑스레이.

판결(evidence)도, 제거 지시(removal)도 아니다 — **현재 구조를 드러낼 뿐, 뭘 할지는 읽는 사람**의 몫이다.
effect를 어떻게 다룰지(렌더 계산 / 이벤트 핸들러 / `useSyncExternalStore` / key 리셋)는 코드에 없는 *의도*가 정한다.
그래서 이 도구는 아무것도 고치지 않는다. 출력은 본성상 read-only다.

- **엑스레이는 드러내고, 결정은 사람·에이전트가 한다.** 도구는 렌즈다.
- 강조는 **reactivity 배선**에만 — reactive read / deps가 주장하는 것 / effect 밖으로 새는 write. 덤프가 아니라 회로도.
- 좌표 + 원문은 최대로, 주장은 최소로. name-join이 틀릴 수 있는 지점(중복·섀도잉·못 찾음)은 **숨기지 않고 출력한다**.

## 설치

```bash
pnpm install
```

의존성은 `@ast-grep/napi` 하나. Node 22+ 필요(내장 test runner·`fs.globSync` 사용).

## 사용법

```bash
# 한 파일
node effect-xray.mjs src/components/Timer.tsx

# 여러 파일 / 글롭 (셸이 안 펴면 도구가 fs.globSync로 편다)
node effect-xray.mjs 'src/**/*.tsx'
node effect-xray.mjs a.tsx b.tsx c.tsx

# 에이전트용 JSON
node effect-xray.mjs 'src/**/*.tsx' --json
```

`.ts` / `.tsx`를 받는다. 파일 목록은 dedupe + 정렬돼 결정적으로 출력된다.

## 출력 읽는 법

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT C  (L3)

  effect @ L12–L14   deps: [items]
    reads:
      setTotal         L4    const [total, setTotal] = useState(0);
      recompute        L7    function recompute() { … }   → 추적 계속: L7
    side effects:
      L13   setTotal(recompute())                                        [setState → total]
             └ setTotal: effect 밖에서도 1곳 구동 — L17
               (이 상태의 공동 소스 — 렌더로 옮기면 그 지점들과 같은 상태를 공유하게 됨)
    집계: read 2건 (state/reducer로 해결 1) · 외부 접촉 0 · setState 1
```

- **reads** — effect 콜백이 읽는 이름을 한 홉 해석해 선언 원문으로 보여준다.
  - `→ 추적 계속: L__` — 값이 hook 파생(`useMemo`/`useCallback`/custom hook)이거나 로컬 함수라 reactivity가 그 안에 산다. 다음 홉은 사람 몫.
  - `· JS 전역/브라우저 API` · `· 중첩 콜백 바인딩` · `✗ 선언 못 찾음` · `⚠ 중복 선언 N건` — 해석의 확신도를 그대로 표시(불확실성도 출력이다).
- **side effects** — `[setState → x]` / `[외부]`. setState가 `setTimeout`/`.then` 등 지연 콜백 안이면 `지연 쓰기 — 파생 아님`으로 라벨(파생 상태가 아니므로 공동-소스 표시를 안 띄운다).
  - `└ setter: effect 밖에서도 N곳 구동` — 같은 setter가 effect 밖에서도 호출된다는 **사실**. 이 상태의 공동 소스가 어디인지 알려줄 뿐, 경고가 아니다.
- **집계** — 보여준 read 줄 수(중립 카운트) / state·reducer로 해결된 수 / 외부 접촉 / setState.
- **deps가 주장하지 않는 reactive read** — reactive인데 deps 배열엔 없는 것(의도적 제외일 수 있음 — 원문 확인).

## `--json` 스키마

에이전트가 텍스트 되파싱 없이 모델을 그대로 먹도록 `--json`을 지원한다. 최상위는:

```
{ files: [ { file: string, components: [ { name, loc, effects: EffectWiring[] } ] } ] }
```

단일 파일도 `files` 1건으로 온다. `EffectWiring` 필드 정의는 [`HANDOFF.md`](./HANDOFF.md) 참조.

## 테스트 · 타입체크

```bash
pnpm test        # tsc(타입체크) + node --test
pnpm typecheck   # 타입체크만
```

실제 CLI를 스폰하는 블랙박스 smoke-test. 어서션은 라인 번호가 아닌 내용 기준이라 라인이 밀려도 안 깨진다.
소스는 `.mjs`이되 JSDoc + `// @ts-check`로 타입 검사한다 — **빌드 단계는 없고**, `.mjs`는 그대로 실행된다(`typescript`/`@types/node`는 devDep).

## 하지 않는 것 (구멍이 아니라 이음새)

정밀 분석은 나중에 컴파일러 패스로 *교체*해 끼운다. 지금은 값싼 한 홉 근사로, LLM이 best-effort로 메워도 되는 것들:

- **크로스파일 흐름** — 멀티파일 *입력*은 되지만, 파일 경계를 넘는 배선(prop/컨텍스트로 넘어간 setter의 공동 소스)은 안 잇는다. 파일 넘어 이름으로 이으면 가짜 배선이 되기 때문(진짜론 크로스모듈 dataflow = 컴파일러 몫).
- **진짜 스코프 해석 없음** — `nested`/`shadow`는 값싼 근사.
- **side effect 한 홉 안쪽** — 호출한 로컬 함수 내부는 `→ 추적 계속`으로만 가리킨다.
- **setter 인식은 이름 규약** — `/^set[A-Z]/`.

## 컴파일러와의 경계

React 컴파일러는 **"이 effect가 불필요한가?"**(탐지)를 fixpoint dataflow로 답한다.
effect-xray는 **"지금 뭐에 어떻게 배선돼 있나?"**(구조)를 답한다. 정밀도로 컴파일러를 추격하지 않는다 — 고유 지대는 구조의 가시화다.

더 깊은 설계·프레임 노트는 [`HANDOFF.md`](./HANDOFF.md).
