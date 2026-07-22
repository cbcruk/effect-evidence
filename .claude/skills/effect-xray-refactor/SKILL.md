---
name: effect-xray-refactor
description: >-
  Drive a disciplined refactor session that removes unnecessary useEffects from
  React/TSX code, using the effect-xray wiring tool as the input. Use this
  whenever the user wants to clean up, remove, audit, or refactor useEffect
  hooks, fix a derived-state antipattern, act on "you might not need an effect",
  untangle effect dependencies, or asks what an effect is wired to before
  editing it. The skill runs effect-xray to get each effect's wiring blueprint,
  triages the effects, proposes the right replacement (render-time compute /
  event handler / useSyncExternalStore / key reset), and applies changes one at
  a time behind a human gate with verification — never batch-ripping and never
  guessing the intent the code doesn't state.
---

# effect-xray refactor session

This is the **action layer** for [effect-xray](../../../README.md). The tool itself
is a read-only lens: it x-rays a `useEffect` and shows what it's wired to, taking
no stance on what to do. This skill is what *does* something with that picture —
it drives the removal/refactor, and because it edits code, **the discipline the
tool doesn't need now lives here.**

The core reason this is careful work: removing an effect changes render timing and
intermediate state. The correct replacement — render-time compute, an event
handler, `useSyncExternalStore`, or a `key` reset — is decided by **intent that
isn't in the code**. So the job is never "delete effects the tool flagged." It's
"read the wiring, infer intent with the human, pick the right move, verify."

## Workflow

### 1. Get the blueprint

Run effect-xray over the target file(s). Read the text view yourself for orientation,
and keep the `--json` for precise per-effect data.

```bash
node effect-xray.mjs 'src/**/*.tsx'          # or specific files
node effect-xray.mjs src/Foo.tsx --json      # structured, per-effect
```

If the CLI isn't at repo root, use the installed bin (`effect-xray`) or `npx effect-xray`.

### 2. Triage each effect

Every effect falls into one of a few buckets. Use the blueprint signals — don't
re-derive them by eye. The mapping:

| Blueprint signal | Likely diagnosis | Default direction |
|---|---|---|
| `setState` whose reads are all reactive (state/props/derived), **no external**, **not scheduled** | Derived state computed in an effect | Move to render-time compute (see replacement patterns) |
| `[외부]` touches (fetch / subscription / DOM / addEventListener) | Syncing with an external system | Usually legitimate — keep, or convert to the proper external-sync pattern |
| `setState` labeled `지연 쓰기` (setTimeout / .then / event callback) | A response to something later, not derived | Keep, or move into the handler that owns the event |
| `deps가 주장하지 않는 reactive read` (depsDiff non-empty) | Reactivity mismatch | Understand *why* first — a stale closure bug and an intentional exclusion look identical here |
| `→ 추적 계속` on a read | Reactivity lives one hop away (memo / custom hook / local fn) | Follow the hop before deciding; the effect may be fine |

The high-value target is row 1: a `setState` that only reads reactive values and
touches nothing external is the classic "you might not need an effect." But confirm
it against the source — the tool resolves one hop and says so; it does not prove it.

### 3. Check the blast radius before cutting

The blueprint reports whether a setter is **also driven outside the effect**
("effect 밖에서도 N곳 구동"). That's not a warning, it's a fact you must act on: if
you move this effect's write into render, those other call sites become a competing
source of truth for the same state. Reconcile them first, or the refactor trades a
derived-state bug for a double-source bug. When outside call sites exist, go slow
and handle them in the same change.

### 4. Propose the plan, then gate on the human

Before editing anything, lay out the plan: which effects you'd remove, the
replacement technique for each, why, and the blast-radius reconciliation. Effect
removal is a semantics change, and the right move depends on intent — so the human
confirms the plan before code changes. If intent is genuinely ambiguous (e.g. a
depsDiff that could be a bug or a deliberate exclusion), ask rather than assume.

### 5. Apply one effect at a time, and verify

Change one effect, then verify before the next:

- typecheck / lint / tests / build, whatever the repo has (`pnpm test`, `tsc --noEmit`, etc.)
- re-run effect-xray on the file to confirm the effect is gone and **no new
  `depsDiff`** appeared on the effects you left. A refactor that removes one effect
  but introduces a stale-dep mismatch in another isn't done.

Applying one at a time keeps each diff reviewable and each regression bisectable.
A batch rip-out is the failure mode this skill exists to prevent.

## What not to do

- **Don't guess intent.** If the source doesn't say why an effect exists and the
  blueprint doesn't settle it, ask. The four replacement techniques are not
  interchangeable — picking wrong changes behavior.
- **Don't remove effects that sync with an external system** just because they
  contain a `setState`. Fetches, subscriptions, and DOM writes are usually the
  legitimate use of an effect.
- **Don't skip the blast-radius reconciliation.** A shared setter is the most
  common way a "safe" removal breaks something elsewhere.
- **Don't batch.** One effect, verify, next.

## Replacement techniques

The four ways to replace an unnecessary effect, with before/after recipes and how
to choose between them, are in
[`references/replacement-patterns.md`](references/replacement-patterns.md). Read it
when you reach step 4 and need to pick a technique for a specific effect.

## Background

effect-xray deliberately stops at one-hop, single-file, name-based resolution — it
gives cheap, honest cross-references and marks its own uncertainty. It does **not**
prove an effect is unnecessary; the React compiler's fixpoint dataflow does that.
So treat the blueprint as a strong lead, not a verdict, and confirm against the
source before you cut. See the repo `HANDOFF.md` for the full frame.
