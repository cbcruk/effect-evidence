#!/usr/bin/env node
// effect-xray — 지금 이 useEffect가 무엇에 배선돼 있는지 투시하는 엑스레이.
// 판결(evidence)도, 제거 지시(removal)도 아니다. 지금 있는 구조를 드러낼 뿐 — 뭘 할지는 읽는 사람.
//
// 왜 판단하지 않나: effect를 어떻게 할지는 코드에 없는 '의도'가 정한다(렌더 계산 / 이벤트 핸들러 /
// useSyncExternalStore / key 리셋). 엑스레이는 드러내고, 결정은 사람·에이전트가. 그래서 출력은
// 본성상 read-only다 — 적용할 행위가 애초에 없다. (React 컴파일러도 같은 선: 탐지, 사람이 수정.)
//
// 규율: 좌표 + 원문은 최대로, 주장은 최소로. 강조는 reactivity 배선에만 — 덤프가 아니라 회로도.
// - 모든 "read"는 name-join으로 한 홉 해석해 선언 원문을 그대로 보여준다.
// - name-join은 틀릴 수 있다(섀도잉 / 리네임 / 중복). 그래서 숨기지 않는다: 0건 -> "선언 못 찾음",
//   2건+ -> "중복 N (스코프 확인)". 불확실성도 출력의 일부다.
// - effect 밖에서도 구동되는 setter는 사실로 함께 표시한다 — 그 상태의 공동 소스가 어디인지.
// - read가 hook 파생값(useMemo/useCallback/custom hook)으로 해석되면 reactivity를 계산하는 대신
//   "→ 추적 계속: L__" 포인터를 남긴다. 다음 홉은 사람 몫.

import { parse, Lang } from '@ast-grep/napi';
import fs from 'node:fs';

const FN_KINDS = new Set(['arrow_function', 'function_declaration', 'function_expression', 'method_definition']);
const WEB_GLOBALS = new Set(['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'history', 'location']);
const EXTERNAL_CALLEES = new Set(['fetch', 'addEventListener', 'removeEventListener', 'setInterval', 'setTimeout', 'queueMicrotask']);
const KNOWN_GLOBALS = new Set(['console', 'Number', 'String', 'Boolean', 'Object', 'Array', 'JSON', 'Math', 'Date',
  'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'RegExp', 'Symbol', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'history', 'location',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'fetch', 'structuredClone', 'undefined', 'NaN', 'Infinity']);

// setTimeout/setInterval/setImmediate look like setters by name but are globals, not state setters
const isSetter = (nm) => /^set[A-Z]/.test(nm) && !KNOWN_GLOBALS.has(nm) && !EXTERNAL_CALLEES.has(nm);

const line = (n) => n.range().start.line + 1;                       // 0-indexed -> 1-indexed
const oneLine = (t) => t.replace(/\s+/g, ' ').trim();
const sameNode = (a, b) => a && b && a.range().start.index === b.range().start.index && a.range().end.index === b.range().end.index;

function enclosingFn(node) {
  let p = node.parent();
  while (p) { if (FN_KINDS.has(p.kind())) return p; p = p.parent(); }
  return null;
}

// `r => r` has no `parameters` field — the single unparenthesized param lives in `parameter`.
// Missing it leaks every nested callback param out as a phantom read.
const paramNode = (fn) => fn.field('parameters') || fn.field('parameter');

// names bound by a pattern node (identifier / array_pattern / object_pattern / rename pairs)
function bindingNames(node, out = []) {
  if (!node) return out;
  const k = node.kind();
  if (k === 'identifier' || k === 'shorthand_property_identifier_pattern') { out.push(node); return out; }
  if (k === 'pair_pattern') { bindingNames(node.field('value'), out); return out; }   // {theme: t} -> t
  for (const c of node.children()) {
    if (['[', ']', '{', '}', ',', ':'].includes(c.kind())) continue;
    bindingNames(c, out);
  }
  return out;
}

// Build the component-level declaration table: name -> {declLine, declText, hopTo|null}
function declTable(component) {
  const table = new Map();
  const add = (name, entry) => {
    if (!table.has(name)) table.set(name, []);
    table.get(name).push(entry);
  };

  // params
  const params = paramNode(component);
  if (params) {
    const paramsText = oneLine(params.text());
    for (const nm of bindingNames(params)) {
      add(nm.text(), { declLine: line(component), declText: paramsText, kindTag: 'param', hopTo: null });
    }
  }

  // variable declarators whose *nearest* enclosing fn is the component (not a nested callback)
  for (const d of component.findAll({ rule: { kind: 'variable_declarator' } })) {
    if (!sameNode(enclosingFn(d), component)) continue;
    const nameNode = d.field('name');
    const init = d.field('value');
    const declStmt = d.parent() && d.parent().kind().endsWith('declaration') ? d.parent() : d;
    let declText = oneLine(declStmt.text());
    const dLine = line(d);

    // does the init require a further hop? (its reactivity depends on more code)
    let hopTo = null, kindTag = 'const';
    if (init && init.kind() === 'call_expression') {
      const callee = init.field('function');
      const cn = callee ? callee.text() : '';
      if (cn === 'useMemo' || cn === 'useCallback') { hopTo = dLine; kindTag = cn; }
      else if (cn === 'useState') kindTag = 'useState';
      else if (cn === 'useReducer') kindTag = 'useReducer';
      else if (cn === 'useRef') kindTag = 'useRef';
      else if (cn === 'useContext') kindTag = 'useContext';
      else if (cn === 'useEffectEvent') kindTag = 'useEffectEvent';
      else if (/^use[A-Z]/.test(cn)) { hopTo = dLine; kindTag = 'custom hook'; }  // reactivity lives inside the hook
    }
    // hop decls point the human to dLine anyway → elide the body, keep callee + dep array (the next-hop input)
    if (hopTo && init && init.kind() === 'call_expression') {
      const bn = bindingNames(nameNode)[0];
      const cn = init.field('function') ? init.field('function').text() : '?';
      const args = init.field('arguments');
      const arrays = args ? args.children().filter(c => c.kind() === 'array') : [];
      const deps = arrays.length ? ', ' + oneLine(arrays[arrays.length - 1].text()) : '';
      declText = `const ${bn ? bn.text() : '?'} = ${cn}(…${deps})`;
    }
    for (const nm of bindingNames(nameNode)) {
      add(nm.text(), { declLine: dLine, declText, kindTag, hopTo });
    }
  }

  // `function foo(){}` at component level — same binding, different node kind. Without this the
  // effect's read of a local helper reports "선언 못 찾음" while the decl sits right above it.
  for (const fn of component.findAll({ rule: { kind: 'function_declaration' } })) {
    if (!sameNode(enclosingFn(fn), component)) continue;
    const nm = fn.field('name');
    if (!nm) continue;
    const params = fn.field('parameters');
    add(nm.text(), {
      declLine: line(fn),
      declText: `function ${nm.text()}${params ? oneLine(params.text()) : '()'} { … }`,
      kindTag: 'function',
      hopTo: line(fn),   // body is elided → the human needs the next hop
    });
  }
  return table;
}

// names declared locally *inside* the callback (params + local decls) — don't send the human chasing these
function callbackLocals(cb) {
  const locals = new Set();
  const p = paramNode(cb);
  if (p) for (const nm of bindingNames(p)) locals.add(nm.text());
  for (const d of cb.findAll({ rule: { kind: 'variable_declarator' } })) {
    if (!sameNode(enclosingFn(d), cb)) continue;   // skip decls nested in deeper callbacks
    for (const nm of bindingNames(d.field('name'))) locals.add(nm.text());
  }
  // `function foo(){}` declared directly in the callback body binds `foo` in the callback scope
  for (const fn of cb.findAll({ rule: { kind: 'function_declaration' } })) {
    if (!sameNode(enclosingFn(fn), cb)) continue;
    const nm = fn.field('name');
    if (nm) locals.add(nm.text());
  }
  return locals;
}

// A setState inside a scheduled/deferred callback is NOT derived state — it's a response to
// something that happened later (timer, promise, event). The React compiler exempts these too.
// We label rather than drop: the call is still wiring you may have to move.
const SCHEDULER_CALLEES = new Set(['setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'requestIdleCallback']);
const SCHEDULER_PROPS = new Set(['then', 'catch', 'finally', 'addEventListener']);

function schedulerOf(node, cb) {
  let n = node;
  while (n && !sameNode(n, cb)) {
    const p = n.parent();
    if (!p) break;
    // is this function passed as an argument to a scheduling call?
    if (FN_KINDS.has(n.kind()) && p.kind() === 'arguments') {
      const call = p.parent();
      const callee = call && call.kind() === 'call_expression' ? call.field('function') : null;
      if (callee) {
        if (callee.kind() === 'identifier' && SCHEDULER_CALLEES.has(callee.text())) return callee.text();
        const prop = callee.kind() === 'member_expression' ? callee.field('property') : null;
        if (prop && SCHEDULER_PROPS.has(prop.text())) return prop.text();
      }
    }
    n = p;
  }
  return null;
}

// side-effect points inside the callback body
function sideEffects(cb) {
  const out = [];
  for (const call of cb.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function');
    if (!callee) continue;
    const ck = callee.kind();
    if (ck === 'identifier') {
      const nm = callee.text();
      // EXTERNAL first: setTimeout/setInterval also match /^set[A-Z]/ and are NOT setters
      if (EXTERNAL_CALLEES.has(nm)) {
        out.push({ line: line(call), text: oneLine(call.text()), tag: '외부' });
      } else if (isSetter(nm)) {
        const state = nm.slice(3, 4).toLowerCase() + nm.slice(4);
        out.push({ line: line(call), text: oneLine(call.text()), tag: `setState → ${state}`, setter: nm, scheduled: schedulerOf(call, cb) });
      }
    } else if (ck === 'member_expression') {
      const obj = callee.field('object');
      const objName = obj ? obj.text().split(/[.\[]/)[0] : '';
      const prop = callee.field('property') ? callee.field('property').text() : '';
      if (WEB_GLOBALS.has(objName) || prop === 'addEventListener' || prop === 'removeEventListener') {
        out.push({ line: line(call), text: oneLine(call.text()), tag: '외부' });
      }
    }
  }
  return out;
}

// every name bound ANYWHERE inside cb (incl. nested callbacks/blocks). Cheap; no scope resolution.
function nestedBindings(cb, directLocals) {
  const all = new Set();
  for (const fn of cb.findAll({ rule: { any: [{ kind: 'arrow_function' }, { kind: 'function_expression' }, { kind: 'function_declaration' }] } })) {
    const p = paramNode(fn);
    if (p) for (const nm of bindingNames(p)) all.add(nm.text());
  }
  for (const d of cb.findAll({ rule: { kind: 'variable_declarator' } })) {
    for (const nm of bindingNames(d.field('name'))) all.add(nm.text());
  }
  // names that are bound deeper but NOT direct locals of cb -> possible shadow at some usage site
  return new Set([...all].filter(n => !directLocals.has(n)));
}

// all call sites of each setState-setter across the whole component (line + source index).
// Mirrors the compiler's usage-count gate: a setter also called OUTSIDE the effect means the
// effect isn't this state's only source. We report locations, not a verdict.
function setterCallSites(component) {
  const map = new Map();
  for (const call of component.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function');
    if (callee && callee.kind() === 'identifier' && isSetter(callee.text())) {
      const nm = callee.text();
      if (!map.has(nm)) map.set(nm, []);
      map.get(nm).push({ line: line(call), start: call.range().start.index });
    }
  }
  return map;
}

function collectReads(cb, locals, shadowy) {
  const seen = new Set(); const reads = [];
  for (const id of cb.findAll({ rule: { kind: 'identifier' } })) {
    const nm = id.text();
    if (locals.has(nm)) continue;
    if (seen.has(nm)) continue;
    seen.add(nm); reads.push({ name: nm, shadow: shadowy.has(nm) });
  }
  return reads;
}

const EFFECT_PATTERNS = { any: [
  { pattern: 'useEffect($CB, $DEPS)' },
  { pattern: 'useEffect($CB)' },
  { pattern: 'useLayoutEffect($CB, $DEPS)' },
  { pattern: 'useLayoutEffect($CB)' },
] };

const REACTIVE_KINDS = new Set(['param', 'useState', 'useReducer', 'useContext', 'useMemo', 'useCallback', 'custom hook']);

// ---- model: collect ----
// collectWiring(component) -> EffectWiring[]. Pure data, no formatting.
// Agents consume this shape directly; renderText below is just one view of it.
function collectWiring(component) {
  const table = declTable(component);
  const setterMap = setterCallSites(component);
  const out = [];

  for (const eff of component.findAll({ rule: EFFECT_PATTERNS })) {
    if (!sameNode(enclosingFn(eff), component)) continue;   // belongs to a nested component

    const cb = eff.getMatch('CB');
    const depsNode = eff.getMatch('DEPS');
    const locals = callbackLocals(cb);
    const shadowy = nestedBindings(cb, locals);
    const rawReads = collectReads(cb, locals, shadowy);
    const fx = sideEffects(cb);
    const effRange = eff.range();

    let stateReads = 0;
    const reactiveReads = new Set();
    const reads = rawReads.map(({ name, shadow }) => {
      const hits = table.get(name) || [];
      if (hits.length === 0) {
        // bound in a nested callback and nowhere in the component → it IS that binding,
        // not a broken lookup. Cheap precision without real scope resolution.
        const resolution = KNOWN_GLOBALS.has(name) ? 'global' : shadow ? 'nested' : 'notfound';
        return { name, shadow, resolution };
      }
      if (hits.length > 1) {
        return {
          name, shadow, resolution: 'dup',
          candidates: hits.map(h => ({ loc: h.declLine, verbatim: h.declText, kindTag: h.kindTag })),
        };
      }
      const h = hits[0];
      if (h.kindTag === 'useState' || h.kindTag === 'useReducer') stateReads++;
      // reactive for deps purposes? exclude setters/dispatch, refs, effect events, shadowed reads
      if (!shadow && REACTIVE_KINDS.has(h.kindTag) && !isSetter(name) && name !== 'dispatch') reactiveReads.add(name);
      return { name, shadow, resolution: 'found', loc: h.declLine, verbatim: h.declText, kindTag: h.kindTag, hopTo: h.hopTo };
    });

    const effects = fx.map(s => {
      const base = { loc: s.line, verbatim: s.text, kind: s.setter ? 'setState' : 'external' };
      if (!s.setter) return base;
      const sites = setterMap.get(s.setter) || [];
      return {
        ...base,
        setter: s.setter,
        state: s.tag.replace('setState → ', ''),
        scheduled: s.scheduled,   // non-null → deferred write, not derived state
        // this state's other sources: same setter driven from elsewhere too. A fact about the
        // wire — if you move this write into render, those sites share the same state.
        outsideCallSites: sites
          .filter(c => c.start < effRange.start.index || c.start >= effRange.end.index)
          .map(c => c.line),
      };
    });

    const depNames = depsNode
      ? depsNode.findAll({ rule: { kind: 'identifier' } }).map(n => n.text())
      : null;

    out.push({
      effect: {
        loc: line(eff),
        endLine: eff.range().end.line + 1,
        deps: depNames,
        depsText: depsNode ? oneLine(depsNode.text()) : null,
      },
      reads,
      effects,
      tally: {
        reads: reads.length,
        stateReads,
        external: effects.filter(e => e.kind === 'external').length,
        setState: effects.filter(e => e.kind === 'setState').length,
        scheduledSetState: effects.filter(e => e.kind === 'setState' && e.scheduled).length,
      },
      depsDiff: depNames ? [...reactiveReads].filter(n => !depNames.includes(n)) : [],
    });
  }
  return out;
}

function componentName(comp) {
  if (comp && comp.field('name')) return comp.field('name').text();
  const p = comp && comp.parent();
  if (p && p.field && p.field('name')) return p.field('name').text();
  return '(anon)';
}

function collectFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lang = file.endsWith('.ts') ? Lang.TypeScript : Lang.Tsx;
  const root = parse(lang, src).root();

  const components = [];
  const seen = [];
  for (const eff of root.findAll({ rule: EFFECT_PATTERNS })) {
    const comp = enclosingFn(eff);
    if (seen.some(c => sameNode(c, comp))) continue;
    seen.push(comp);
    if (!comp) continue;
    components.push({ name: componentName(comp), loc: line(comp), effects: collectWiring(comp) });
  }
  return { file, components };
}

// ---- view: render ----
function renderText({ files }) {
  const out = [];
  out.push('# useEffect 엑스레이 — 지금 이 effect가 무엇에 배선돼 있는지 투시한다. 뭘 할진 읽는 사람.');

  for (const { file, components } of files) {
    out.push(`\n${'═'.repeat(64)}\n# ${file}`);
    if (components.length === 0) { out.push('(useEffect 없음)'); continue; }

    for (const comp of components) {
    out.push(`\n${'━'.repeat(64)}\nCOMPONENT ${comp.name}  (L${comp.loc})`);

    for (const ev of comp.effects) {
      out.push(`\n  effect @ L${ev.effect.loc}–L${ev.effect.endLine}   deps: ${ev.effect.depsText ?? '(없음)'}`);

      out.push('    reads:');
      for (const r of ev.reads) {
        const shadowTag = r.shadow ? '  ⚠섀도잉 가능(콜백 내부에서도 선언됨)' : '';
        const nm = r.name.padEnd(16);
        if (r.resolution === 'global') {
          out.push(`      ${nm} · JS 전역/브라우저 API${shadowTag}`);
        } else if (r.resolution === 'nested') {
          out.push(`      ${nm} · 중첩 콜백 바인딩 (effect 밖 참조 아님)`);
        } else if (r.resolution === 'notfound') {
          out.push(`      ${nm} ✗ 선언 못 찾음 (외부/모듈 또는 추적끊김)${shadowTag}`);
        } else if (r.resolution === 'dup') {
          out.push(`      ${nm} ⚠ 중복 선언 ${r.candidates.length}건 — 스코프 확인 필요:${shadowTag}`);
          for (const c of r.candidates) out.push(`      ${' '.repeat(16)}   L${c.loc} ${c.verbatim}`);
        } else {
          const hop = r.hopTo ? `   → 추적 계속: L${r.hopTo}` : '';
          out.push(`      ${nm} L${String(r.loc).padEnd(4)} ${r.verbatim}${hop}${shadowTag}`);
        }
      }

      out.push('    side effects:');
      if (ev.effects.length === 0) out.push('      (감지된 setState/외부 호출 없음)');
      for (const s of ev.effects) {
        const tag = s.kind === 'setState'
          ? `setState → ${s.state}${s.scheduled ? ` · ${s.scheduled} 콜백 안 (지연 쓰기 — 파생 아님)` : ''}`
          : '외부';
        out.push(`      L${String(s.loc).padEnd(4)} ${s.verbatim.slice(0, 60).padEnd(60)} [${tag}]`);
        if (s.kind !== 'setState' || s.scheduled) continue;
        if (s.outsideCallSites.length === 0) {
          out.push(`             └ ${s.setter}: effect 밖 구동 없음 (이 effect 안에서만)`);
        } else {
          out.push(`             └ ${s.setter}: effect 밖에서도 ${s.outsideCallSites.length}곳 구동 — ${s.outsideCallSites.map(l => 'L' + l).join(', ')}`);
          out.push(`               (이 상태의 공동 소스 — 렌더로 옮기면 그 지점들과 같은 상태를 공유하게 됨)`);
        }
      }

      const t = ev.tally;
      const sched = t.scheduledSetState ? ` (그중 지연 콜백 ${t.scheduledSetState})` : '';
      out.push(`    집계: read ${t.reads}건 (state/reducer로 해결 ${t.stateReads}) · 외부 접촉 ${t.external} · setState ${t.setState}${sched}`);
      if (ev.depsDiff.length) {
        out.push(`    deps가 주장하지 않는 reactive read: ${ev.depsDiff.join(', ')}   (의도적 제외일 수 있음 — 원문 확인)`);
      }
      }
    }
  }
  return out.join('\n');
}

// ---- cli ----
// Multiple files/globs in one shot. Cross-file "shared source" is NOT tracked: a bare
// setter name means different state in different files, so name-join across files would
// manufacture false wiring — the exact discipline this tool avoids. Real cross-module
// dataflow is a future compiler-pass swap-in. Here we just widen the input, per file.
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const patterns = argv.filter(a => !a.startsWith('-'));
if (patterns.length === 0) {
  console.error('usage: effect-xray <file.tsx | glob> [more…] [--json]');
  process.exit(1);
}

const isGlob = (p) => /[*?[\]{}]/.test(p);
const paths = [];
for (const p of patterns) {
  if (isGlob(p)) {
    for (const m of fs.globSync(p)) paths.push(m);
  } else {
    if (!fs.existsSync(p)) { console.error(`not found: ${p}`); process.exit(1); }
    paths.push(p);
  }
}
const files = [...new Set(paths)].filter(p => /\.tsx?$/.test(p)).sort();
if (files.length === 0) { console.error('no .ts/.tsx files matched'); process.exit(1); }

const model = { files: files.map(collectFile) };
console.log(json ? JSON.stringify(model, null, 2) : renderText(model));
