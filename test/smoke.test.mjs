// Regression smoke tests for effect-xray.
// Black-box: spawn the real CLI so the entry point, exit codes, text view, and --json
// contract are all under test. No test framework dependency — Node's built-in runner.
//
// Assertions key on stable content (setter names, tags, schema fields), not line numbers,
// so edits that shift lines don't break the suite. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'effect-xray.mjs');
const fixture = (name) => path.join(here, 'fixtures', name);

// Run the CLI. Returns { status, stdout, stderr }. Never throws on non-zero exit.
function run(args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('derived-state antipattern: setState-from-state is surfaced', () => {
  const { status, stdout } = run([fixture('Timer.tsx')]);
  assert.equal(status, 0);
  assert.match(stdout, /COMPONENT Timer/);
  assert.match(stdout, /setState → label/);
});

test('scheduled setState is labeled deferred and not flagged as a shared source', () => {
  const { stdout } = run([fixture('Timer.tsx')]);
  assert.match(stdout, /지연 쓰기 — 파생 아님/);
  // the deferred setTime is exempt: no "driven outside the effect" line for it
  assert.doesNotMatch(stdout, /setTime: effect 밖/);
});

test('setTimeout/clearTimeout are not misclassified as state setters', () => {
  const { stdout } = run([fixture('Timer.tsx')]);
  // setTimeout appears as an external touch, never as "setState → ..."
  assert.match(stdout, /setTimeout\(.*\)\s+\[외부\]/);
  assert.doesNotMatch(stdout, /setState → timeout/i);
  assert.match(stdout, /setTimeout\s+· JS 전역/);
  assert.match(stdout, /clearTimeout\s+· JS 전역/);
});

test('deps-less useLayoutEffect is detected', () => {
  const { stdout } = run([fixture('Timer.tsx')]);
  assert.match(stdout, /deps: \(없음\)/);
});

test('reactive read missing from deps shows up in depsDiff', () => {
  const { stdout } = run([fixture('Timer.tsx')]);
  assert.match(stdout, /deps가 주장하지 않는 reactive read: doubled/);
});

test('single unparenthesized arrow param stays a nested binding (no phantom read)', () => {
  const { stdout } = run([fixture('Timer.tsx')]);
  assert.match(stdout, /t\s+· 중첩 콜백 바인딩/);
});

test('setter also driven outside the effect is reported as a shared source', () => {
  const { stdout } = run([fixture('Blast.tsx')]);
  assert.match(stdout, /setTotal: effect 밖에서도 \d+곳 구동/);
});

test('component-level function decl resolves with a next-hop pointer', () => {
  const { stdout } = run([fixture('Blast.tsx')]);
  assert.match(stdout, /recompute\s+L\d+\s+function recompute/);
  assert.match(stdout, /→ 추적 계속/);
});

test('--json emits parseable output with the documented schema', () => {
  const { status, stdout } = run([fixture('Timer.tsx'), '--json']);
  assert.equal(status, 0);
  const model = JSON.parse(stdout);
  assert.equal(model.components.length, 1);
  const timer = model.components[0];
  assert.equal(timer.name, 'Timer');
  assert.equal(timer.effects.length, 4);
  const ev = timer.effects[0];
  for (const key of ['effect', 'reads', 'effects', 'tally', 'depsDiff']) {
    assert.ok(key in ev, `EffectEvidence missing "${key}"`);
  }
  for (const key of ['loc', 'endLine', 'deps', 'depsText']) {
    assert.ok(key in ev.effect, `effect missing "${key}"`);
  }
  for (const key of ['reads', 'stateReads', 'external', 'setState', 'scheduledSetState']) {
    assert.ok(key in ev.tally, `tally missing "${key}"`);
  }
});

test('file with no useEffect reports it cleanly and exits 0', () => {
  const { status, stdout } = run([fixture('None.tsx')]);
  assert.equal(status, 0);
  assert.match(stdout, /\(useEffect 없음\)/);
});

test('no file argument exits 1 with usage', () => {
  const { status, stderr } = run([]);
  assert.equal(status, 1);
  assert.match(stderr, /usage: effect-xray/);
});

test('missing file exits 1 with not-found', () => {
  const { status, stderr } = run([fixture('does-not-exist.tsx')]);
  assert.equal(status, 1);
  assert.match(stderr, /not found:/);
});
