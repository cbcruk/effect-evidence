---
name: effect-xray-refactor
description: >-
  Tool-grounded, behavior-preserving refactor of unnecessary useEffects in
  React/TSX, using effect-xray to map each effect's wiring before touching it.
  Reach for this when auditing or removing useEffect hooks in a large or
  unfamiliar component — where the same state is set in several places and a
  naive "convert to a derived value" would silently break a handler or drop
  data, or when you want the removal verified rather than eyeballed. Most
  useful when an effect's wiring isn't obvious from a quick read; for a single,
  plainly-derived effect in a small file, a direct edit is fine and you can
  skip this. It runs effect-xray, triages each effect off the blueprint
  (including where else the setter is driven), picks the right replacement, and
  changes one effect at a time with verification — never batch-ripping, never
  guessing intent the code doesn't state.
---

# effect-xray refactor session

This is the **action layer** for [effect-xray](../../../README.md). The tool is a
read-only lens: it x-rays a `useEffect` and shows what it's wired to, taking no
stance on what to do. This skill acts on that picture, and because it edits code,
the discipline the tool doesn't need lives here.

The work is careful because removing an effect changes render timing and
intermediate state, and the correct replacement is decided by **intent that isn't
in the code**. The job is never "delete the effects the tool flagged" — it's "read
the wiring, confirm intent, pick the right move, keep behavior, verify."

## Calibrate effort first

The full workflow below (run the tool, triage, verify) earns its cost when the
wiring is non-obvious: a big or unfamiliar component, a setter that's written in
several places, a `deps` mismatch, or anything where a wrong cut breaks something
elsewhere. **For a single, obviously-derived effect in a short file, skip the
ceremony and just make the edit** — running a tool to confirm what's already plain
is wasted motion. Scale up only when the picture isn't clear from reading.

## Workflow

### 1. Get the blueprint
```bash
node effect-xray.mjs 'src/**/*.tsx'        # or specific files; --json for structured data
```
If the CLI isn't at repo root, use the installed bin (`effect-xray`) or `npx effect-xray`.

### 2. Triage each effect off the blueprint signals

| Signal | Diagnosis | Direction |
|---|---|---|
| `setState`, all reads reactive, **external 0**, not scheduled, setter not driven elsewhere | Derived state | Render-time compute |
| `[외부]` touches (fetch / subscription / DOM) | External sync | Keep, or `useSyncExternalStore` |
| `setState` labeled `지연 쓰기` (timer / promise / event) | Deferred response | Keep, or move into the handler |
| `effect 밖에서도 N곳 구동` (setter also driven outside) | **Interactive state, not pure derived** | Not a plain derived const — reconcile the other writers first |
| functional update reading prior state (`setX(p => …p…)`) | **Accumulator** | Can't be derived from current props — keep the state |
| `deps가 주장하지 않는 …` (depsDiff) | Reactivity mismatch | Find out *why* before cutting — stale-closure bug and intentional exclusion look identical |

The blueprint is a strong lead, not proof. The tool resolves one hop and marks its
own uncertainty; confirm against the source before you cut. Its highest-value output
is the **setter's other call sites** — the cross-reference that's tedious to find by
hand in a big file and the usual reason a "safe" removal breaks something.

### 3. Pick the replacement, then apply — one effect at a time
Replacement recipes and how to choose (render-time compute / event handler /
`useSyncExternalStore` / `key` reset) are in
[`references/replacement-patterns.md`](references/replacement-patterns.md). Read it
when you need to choose for a specific effect.

Change one effect, then verify before the next: run the repo's checks
(`pnpm test`, `tsc --noEmit`, …) and re-run effect-xray to confirm the effect is
gone and no new `depsDiff` appeared on the ones you left. One-at-a-time keeps each
diff reviewable and each regression bisectable.

## The two rules that matter

- **Preserve behavior, or flag — never silently change it.** If the clean-looking
  removal shifts a semantics (an edit gets clobbered, a mount-time record is lost,
  an accumulation resets), that's not a cleanup, it's a bug. When the behavior-
  preserving move lives outside this file (e.g. a parent `key`), do the in-file
  part and record the rest as a recommendation rather than guessing.
- **Don't guess intent.** A `deps` mismatch, or a setter written in several places,
  means the code isn't telling you why. Ask, or leave it and flag it — don't assume
  the tidy answer. Effects that sync an external system usually aren't removable at
  all; a `setState` inside one doesn't make it derived.
