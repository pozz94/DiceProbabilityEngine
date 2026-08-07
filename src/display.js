// ================================================================
// display — website-only rendering layer (NOT published to npm).
//
// Thin wrappers over the engine's pure data functions. Presentation
// (title, label, color, mode, axis) is read only here; the data
// functions receive only pool / over / the filter `when` predicates,
// so presentation can never influence a probability (Display spec).
// ================================================================

import {
  Pool, PoolView, pool, die, poolBuilder, max, min,
  roll, outcomeProbability, classify, scalingProbability, cumulativeProbability,
  resetCaches, sweep, setKeepGhosts, reducedProbability, makeView, MONOID_BY_ID,
} from './engine.js';
import * as std from './std.js';
import {
  esc, renderError, renderRollBlock, renderStatBlock,
  renderScalingBlock, renderCumulativeBlock,
} from './render.js';

export let _displayResults = [];
export let _logs = [];

const DEFAULT_AXIS = std.total;                 // value-axis default lives here, not the engine
const PALETTE = ['#60c8f0', '#a3e635', '#facc15', '#f97316', '#ef4444', '#a78bfa', '#34d399'];

// ---- §1 filter normalisation (presentation side keeps label/color) ----
// category := predicate | { when, label?, color? };  filter := category | category[]
function categories(filter, { passFail = false } = {}) {
  if (filter == null) return [];
  if (passFail && typeof filter === 'function') {
    return [
      { when: filter, label: 'pass', color: '#a3e635' },
      { when: v => !filter(v), label: 'fail', color: '#ef4444' },
    ];
  }
  const list = Array.isArray(filter) ? filter : [filter];
  return list.map((c, i) => {
    const cat = typeof c === 'function' ? { when: c } : c;
    return {
      when: cat.when,
      label: cat.label ?? `set ${i + 1}`,
      color: cat.color ?? PALETTE[i % PALETTE.length],
    };
  });
}
// the data layer sees only the `when` predicates
const predicates = cats => cats.map(c => ({ when: c.when }));

// Classify pre-resolved outcomes by first matching category. A miss has no
// active dice (total 0), so with `excludeBarred=false` a `total === 0`
// predicate catches misses (weapon/danger charts); with `excludeBarred=true`
// it mirrors the engine's classify (barred partitioned out) for the pass/fail
// legend. Leftovers go to `other`. Takes raw so the pool is resolved once.
function classifyRaw(raw, cats, excludeBarred = false) {
  const masses = cats.map(() => 0);
  let other = 0;
  for (const o of raw) {
    if (excludeBarred && o.barred) continue;
    const i = cats.findIndex(c => c.when(o.view));
    if (i < 0) other += o.prob; else masses[i] += o.prob;
  }
  return { p: masses, other };
}

// ---- value-axis distribution stats over pre-resolved outcomes ----
function statsFromRaw(raw, axis) {
  let barred = 0;
  const pmf = new Map();           // by axis value (the bars) — a miss is value 0
  const repByValue = new Map();    // a representative resolved view per value
  for (const o of raw) {
    if (o.barred) barred += o.prob;
    // a barred miss has no active dice; it reduces to 0 → show it at x=0
    const v = o.barred ? 0 : axis(o.view);
    pmf.set(v, (pmf.get(v) || 0) + o.prob);
    if (!repByValue.has(v)) repByValue.set(v, o.view);
  }
  const sorted = [...pmf.entries()].sort((a, b) => a[0] - b[0]);
  let mean = 0;
  for (const [v, pr] of sorted) mean += v * pr;
  let variance = 0;
  for (const [v, pr] of sorted) variance += pr * (v - mean) ** 2;
  let cum = 0, median = sorted[0]?.[0] ?? 0, mode = sorted[0]?.[0] ?? 0, modeP = 0, gotMed = false;
  for (const [v, pr] of sorted) if (pr > modeP) { modeP = pr; mode = v; }
  const pct = q => {
    let c = 0;
    for (const [v, pr] of sorted) { c += pr; if (c >= q - 1e-9) return v; }
    return sorted[sorted.length - 1]?.[0] ?? 0;
  };
  for (const [v, pr] of sorted) { cum += pr; if (!gotMed && cum >= 0.5 - 1e-9) { median = v; gotMed = true; } }
  return {
    sorted, repByValue, barred,
    mean, median, mode, stddev: Math.sqrt(variance),
    min: sorted[0]?.[0] ?? 0, max: sorted[sorted.length - 1]?.[0] ?? 0,
    p10: pct(0.1), p25: pct(0.25), p75: pct(0.75), p90: pct(0.9),
  };
}

// ---- what does this chart need to look at? ----
// Charts used to be resolved by guessing that the axis and filters were
// functions of a single fold (sum/max/min) and then re-running them against a
// synthetic one-die view holding that number. The guess was made by probing,
// and probing cannot be made sound: it silently halved `count(v === 100)` on
// 2d100, and silently zeroed any filter reading discarded dice. Both were found
// by testing, not by reading, so the whole mechanism is gone.
//
// What survives is the one question probing *can* answer exactly: whether a
// function ever calls a given method. A call is the entire signal — no
// value-invariance is assumed — which makes the check below sound.

// Does anything this chart reads look at the *discarded* dice? When the answer
// is no, the engine can stop distinguishing outcomes by their ghosts, which is
// exact (nothing can tell those outcomes apart) rather than an approximation.
function readsDiscarded(fns) {
  let reads = false;
  const probe = {};
  const self = () => probe;
  probe.reduce = (r, s) => [1, 2, 3, 4, 5, 6].reduce(r, s);
  probe.reduceDiscarded = (r, s) => { reads = true; return [1, 2].reduce(r, s); };
  probe.count = (p) => probe.reduce((a, c) => (p(c) ? a + 1 : a), 0);
  for (const m of ['shows', 'highest', 'lowest', 'sort', 'sample', 'shuffle', 'at', 'label', 'is', 'addDice', 'discard', 'when']) probe[m] = self;
  for (const r of ['total', 'sum', 'maxed', 'floored', 'product'])
    Object.defineProperty(probe, r, { get: () => probe.reduce((a, c) => a + c, 0), configurable: true });
  Object.defineProperty(probe, 'size', { get: () => 1, configurable: true });
  Object.defineProperty(probe, 'bounds', { get: () => ({ min: 0, max: 0, span: 0 }), configurable: true });
  for (let i = 0; i < 8; i++) Object.defineProperty(probe, String(i), { get: self, configurable: true });
  for (const fn of fns) { try { fn(probe); } catch { return true; } }   // can't tell → keep them
  return reads;
}

// resolve `body` with ghost tracking off when no read needs it
function withGhostPolicy(fns, body) {
  const prev = setKeepGhosts(readsDiscarded(fns));
  try { return body(); } finally { setKeepGhosts(prev); }
}

// ---- reduced resolution: which single fold, if any, is all this chart reads? ----
// Same capability probe, but the answer is established by *identity*, never by
// behaviour. std exports its three monoid reducers as tagged singletons, so
// seeing `SUM_REDUCER` passed to reduce proves the caller is summing — there is
// nothing to guess. A hand-written reducer, `count`, `product`, a per-die read,
// two different folds mixed, or a look at the discarded dice all yield null and
// the chart resolves exactly.
//
// This is deliberately narrower than the probe it replaces. That one inferred
// "behaves like a sum on 30 sample views", which was wrong for
// `count(v === 100)` on 2d100 and for anything reading ghosts.
function foldOf(fns) {
  let seen = null, ok = true;
  const probe = {};
  const reject = () => { ok = false; return probe; };
  probe.reduce = (r, s) => {
    const tag = r && r.__fold;
    if (!tag || (seen && seen !== tag)) ok = false; else seen = tag;
    return [1, 2, 3, 4, 5, 6].reduce(r, s);
  };
  probe.reduceDiscarded = reject;
  probe.count = reject;
  for (const m of ['shows', 'highest', 'lowest', 'sort', 'sample', 'shuffle', 'at', 'label', 'is', 'addDice', 'discard', 'when']) probe[m] = reject;
  for (const [name, fn] of [['total', std.total], ['sum', std.sum], ['maxed', std.maxed], ['floored', std.floored]])
    Object.defineProperty(probe, name, { get: () => fn(probe), configurable: true });
  for (const name of ['product']) Object.defineProperty(probe, name, { get: reject, configurable: true });
  Object.defineProperty(probe, 'size', { get: reject, configurable: true });
  Object.defineProperty(probe, 'bounds', { get: reject, configurable: true });
  for (let i = 0; i < 8; i++) Object.defineProperty(probe, String(i), { get: reject, configurable: true });

  for (const fn of fns) { try { fn(probe); } catch { return null; } }
  return ok && seen ? MONOID_BY_ID[seen] ?? null : null;
}

// The escape hatch: a chart may declare its own reduction when detection is too
// narrow — `display({ …, reduce: "sum" })`. Declaring it is an assertion by the
// author, which is sound in the way a guess is not.
function reductionFor(declared, fns) {
  if (declared) {
    const m = MONOID_BY_ID[String(declared).toLowerCase()];
    if (!m) throw new Error(`reduce must be one of sum, max, min — got ${JSON.stringify(declared)}`);
    return m;
  }
  return foldOf(fns);
}

// resolve one pool to raw outcomes: reduced when a single fold covers every
// read (one synthetic die carrying the folded value), else the full multiset
function resolveRaw(pool, M) {
  if (!M) return outcomeProbability(pool);
  return reducedProbability(pool, M).map(d => ({
    prob: d.prob, barred: d.barred, view: makeView(d.barred ? [] : [d.value]),
  }));
}

// ================================================================
// The four display functions. Each takes a single options object,
// `over`'s shape selecting the engine data function (Display §2).
// ================================================================

export function display({ pool: p, filter, axis = DEFAULT_AXIS, title, mode, reduce } = {}) {
  try {
    const target = typeof p === 'function' ? p() : p;
    const cats = categories(filter, { passFail: true });
    const fns = [axis, ...cats.map(c => c.when)];
    const raw = withGhostPolicy(fns, () => resolveRaw(target, reductionFor(reduce, fns)));
    const s = statsFromRaw(raw, axis);
    if (cats.length) {
      // A miss reduces to 0, so it lands in the category its predicate selects
      // (e.g. fail under `total > 0`) — consistent with the 0-bar's fail dot and
      // with displayScaling. So pass + fail sums to 1 (no orphaned barred mass).
      const c = classifyRaw(raw, cats, false);
      s.categories = cats.map((cat, i) => ({ label: cat.label, color: cat.color, mass: c.p[i] }));
      s.uncategorized = c.other;
      // per-value dot colour: a miss reduces to 0 (statsFromRaw buckets it
      // there with a representative view), so its dot is the fail colour.
      s.dotByValue = new Map();
      for (const [v, view] of s.repByValue) {
        const idx = cats.findIndex(cat => cat.when(view));
        if (idx >= 0) s.dotByValue.set(v, cats[idx].color);
      }
    }
    _displayResults.push({ kind: 'stat', s, title: title || null, mode });
    return s;
  } catch (e) { _logs.push(`⚠ display(): ${e.message}`); }
}

export function displayRoll({ pool: p, axis = DEFAULT_AXIS, title } = {}) {
  try {
    const ref = typeof p === 'function' ? p() : p;
    const result = roll(ref);
    _displayResults.push({ kind: 'roll', result, axis, poolRef: ref, title: title || null });
  } catch (e) { _logs.push(`⚠ displayRoll(): ${e.message}`); }
}

export function displayScaling({ pool: build, over, filter, axis = DEFAULT_AXIS, title, mode, reduce } = {}) {
  try {
    const cats = categories(filter, { passFail: true });
    // two shapes: a numeric sweep (pool: x => pool, over: {from,to,step}) or
    // a discrete comparison (pool: [poolA, poolB, …] or [{label, pool}, …]).
    let items;
    if (Array.isArray(build)) {
      const labels = over && over.labels;
      items = build.map((it, i) => ({
        x: (it && it.pool) ? (it.label ?? labels?.[i] ?? i) : (labels?.[i] ?? i),
        pool: (it && it.pool) ? it.pool : it,
      }));
    } else {
      const { from, to, step = 1 } = over || {};
      items = sweep(from, to, step).map(x => ({ x, pool: build(x) }));
    }
    const fns = [axis, ...cats.map(c => c.when)];
    const M = reductionFor(reduce, fns);          // same axis/filters for every item
    const rows = withGhostPolicy(fns, () => items.map(({ x, pool }) => {
      const raw = resolveRaw(pool, M);
      const st = statsFromRaw(raw, axis);
      const row = { x, mean: st.mean, stddev: st.stddev };
      if (cats.length) { const c = classifyRaw(raw, cats); row.p = c.p; row.other = c.other; }
      return row;
    }));
    _displayResults.push({ kind: 'scaling', rows, categories: cats, title: title || null, mode });
  } catch (e) { _logs.push(`⚠ displayScaling(): ${e.message}`); }
}

export function displayCumulative({ pool: p, over, filter, title, mode } = {}) {
  try {
    const target = typeof p === 'function' ? p() : p;
    const cats = categories(filter);
    const rows = withGhostPolicy(cats.map(c => c.when), () =>
      cumulativeProbability(target, predicates(cats), { attempts: (over || {}).attempts || 10 }));
    // single-attempt marginal p_i is the k=1 row (Display legend "%/attempt")
    _displayResults.push({ kind: 'cumulative', rows, single: rows[0]?.p ?? [], categories: cats, title: title || null, mode });
  } catch (e) { _logs.push(`⚠ displayCumulative(): ${e.message}`); }
}

// ================================================================
// Editor sugar (website-only): ambient scope + prototype promotion.
// These never change semantics — spellings over engine + stdlib.
// ================================================================
let _promoted = false;
export function promote() {
  if (_promoted) return; _promoted = true;
  const def = (proto, name, value) =>
    Object.defineProperty(proto, name, { value, writable: true, configurable: true, enumerable: false });
  const get = (proto, name, getter) =>
    Object.defineProperty(proto, name, { get: getter, configurable: true, enumerable: false });
  // reductions: fluent on concrete views only (templates have no faces)
  for (const r of ['total', 'sum', 'maxed', 'floored', 'product'])
    get(PoolView.prototype, r, function () { return std[r](this); });
  def(PoolView.prototype, 'count', function (pred) { return std.count(this, pred); });
  // builder patterns: fluent on both templates and views
  for (const proto of [Pool.prototype, PoolView.prototype]) {
    def(proto, 'keepHigh', function (n) { return std.keepHigh(this, n); });
    def(proto, 'keepLow', function (n) { return std.keepLow(this, n); });
    def(proto, 'addBonus', function (n, label) { return std.addBonus(this, n, label); });
    def(proto, 'advantage', function (e) { return std.advantage(this, e); });
    def(proto, 'disadvantage', function (e) { return std.disadvantage(this, e); });
  }
}

function fmtVal(v) {
  if (v instanceof Pool) return `[pool size=${v.size}]`;
  if (v instanceof PoolView) return `[pool ${std.total(v)} | ${v.size} dice]`;
  if (typeof v === 'number') return String(+v.toFixed(6)).replace(/\.?0+$/, '');
  if (v && v.dice && v.ghosts) {
    const act = v.dice.map(d => `[${d.name || '?'}]→${d.face}`).join(' ');
    const gh = v.ghosts.map(d => `~~[${d.name || '?'}]→${d.face}~~`).join(' ');
    return `${v.barred ? '(barred) ' : ''}${act}${gh ? ' ' + gh : ''}`;
  }
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ================================================================
// Interactive controls — declared in the sandbox, returning their
// current value (so they feed straight into poolBuilder args). Changing
// one re-runs the script. Values persist across control-driven re-runs
// (keyed by label) and reset to defaults on an explicit Run.
// ================================================================
let _controls = [];                 // declared this run, in order
const _controlValues = new Map();   // key -> current value (persists)
let _rerun = () => {};
let _rerunPending = false;
function scheduleRerun() {
  if (_rerunPending) return;
  _rerunPending = true;
  requestAnimationFrame(() => { _rerunPending = false; _rerun(); });
}
const ctrlValue = (key, dflt) => (_controlValues.has(key) ? _controlValues.get(key) : dflt);

export function slider(label, opts = {}) {
  const { min = 0, max = 10, step = 1, value = min } = opts;
  const key = 's:' + label;
  const cur = ctrlValue(key, value);
  _controls.push({ type: 'slider', key, label, min, max, step, value: cur });
  return cur;
}
export function select(label, options = [], opts = {}) {
  const norm = options.map(o => (o && typeof o === 'object' && 'value' in o) ? o : { label: String(o), value: o });
  const key = 'o:' + label;
  const cur = ctrlValue(key, 'value' in opts ? opts.value : norm[0]?.value);
  _controls.push({ type: 'select', key, label, options: norm, value: cur });
  return cur;
}
export function toggle(label, value = false) {
  const key = 't:' + label;
  const cur = ctrlValue(key, value);
  _controls.push({ type: 'toggle', key, label, value: cur });
  return cur;
}

function renderControls() {
  const bar = document.getElementById('controls-bar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.style.display = _controls.length ? '' : 'none';
  for (const c of _controls) {
    const w = document.createElement('label');
    w.className = 'control';
    if (c.type === 'slider') {
      w.innerHTML = `<span class="ctrl-label">${esc(c.label)}</span>`
        + `<input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">`
        + `<span class="ctrl-val">${c.value}</span>`;
      const input = w.querySelector('input'), out = w.querySelector('.ctrl-val');
      input.addEventListener('input', () => {
        out.textContent = input.value;
        _controlValues.set(c.key, Number(input.value));
        scheduleRerun();
      });
    } else if (c.type === 'select') {
      w.innerHTML = `<span class="ctrl-label">${esc(c.label)}</span><select>`
        + c.options.map((o, i) => `<option value="${i}"${o.value === c.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')
        + `</select>`;
      const sel = w.querySelector('select');
      sel.addEventListener('change', () => {
        _controlValues.set(c.key, c.options[sel.value].value);
        scheduleRerun();
      });
    } else {
      w.innerHTML = `<input type="checkbox"${c.value ? ' checked' : ''}><span class="ctrl-label">${esc(c.label)}</span>`;
      const cb = w.querySelector('input');
      cb.addEventListener('change', () => { _controlValues.set(c.key, cb.checked); scheduleRerun(); });
    }
    bar.appendChild(w);
  }
}

// the sandbox runtime: engine + stdlib + display, ambient dice/reductions in
// scope. Shared by the playground (runCode) and the docs page (runSnippet).
function makeRuntime() {
  return {
    pool, die, poolBuilder, max, min,
    roll, outcomeProbability, classify, scalingProbability, cumulativeProbability,
    display, displayRoll, displayScaling, displayCumulative,
    slider, select, toggle,             // interactive controls
    ...std,                             // d2..d100, total, sum, count, keepHigh, ...
    console: { log: (...a) => _logs.push(a.map(fmtVal).join(' ')) },
  };
}

// Run a snippet in isolation and return its display results + logs, without
// touching the playground's global output bar. The docs page uses this to
// render a live chart beside each code sample; controls resolve to their
// default value (no live re-run wiring outside the playground).
export function runSnippet(src) {
  promote();
  resetCaches();
  const sR = _displayResults, sL = _logs, sC = _controls, sV = new Map(_controlValues);
  _displayResults = []; _logs = []; _controls = []; _controlValues.clear();
  try {
    const fn = new Function('__rt', `with (__rt) {\n${src}\n}`);
    fn(makeRuntime());
    return { results: _displayResults, logs: _logs, error: null };
  } catch (e) {
    return { results: [], logs: _logs, error: e.message };
  } finally {
    _displayResults = sR; _logs = sL; _controls = sC;
    _controlValues.clear(); for (const [k, v] of sV) _controlValues.set(k, v);
  }
}

// The charts are made of empty divs (bar tooltips live in data-attributes), so
// there is nothing for a screen reader to read after a run. Summarise instead —
// on #run-status rather than on #output-scroll itself, which would re-announce
// on every tick of a cutoff/control slider.
function announce(msg) {
  const el = document.getElementById('run-status');
  if (el) el.textContent = msg;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// getEditorValue: () => string, injected by editor.js to avoid circular deps.
// fromControl=true skips clearing control values (a control nudged the re-run).
export function runCode(getEditorValue, fromControl = false) {
  _rerun = () => runCode(getEditorValue, true);
  promote();
  const src = getEditorValue().trim();

  const outputEl = document.getElementById('output-scroll');
  outputEl.innerHTML = '';
  resetCaches();        // fresh per run; pools within this run share sub-distributions
  _displayResults = [];
  _logs = [];
  _controls = [];
  if (!fromControl) _controlValues.clear();   // explicit Run resets controls to defaults
  if (!src) { renderControls(); announce('Editor is empty'); return; }

  // runtime: engine + stdlib + display, with ambient dice/reductions in scope
  const rt = makeRuntime();

  try {
    // Run user code inside `with(rt)` so ambient names (d6, total, count,
    // advantage, …) are in scope, yet a user `const advantage = slider(...)`
    // *shadows* them instead of colliding (non-strict, hence no `with` ban).
    const fn = new Function('__rt', `with (__rt) {\n${src}\n}`);
    fn(rt);
  } catch (e) {
    if (!fromControl) renderControls();   // don't rebuild the bar mid-drag
    renderError(outputEl, e.message + (e.stack ? '\n' + e.stack.split('\n').slice(1, 4).join('\n') : ''));
    announce('Error: ' + e.message);
    return;
  }

  if (!fromControl) renderControls();     // bar persists across control-driven re-runs

  if (_displayResults.length === 0 && _logs.length === 0) {
    outputEl.innerHTML = '<div class="empty-state"><div class="big" aria-hidden="true">∅</div><div>No output — use display() or console.log()</div></div>';
    announce('No output — use display() or console.log()');
    return;
  }

  if (_logs.length > 0) {
    const block = document.createElement('div');
    block.className = 'result-block';
    block.innerHTML = `<div class="result-label">CONSOLE</div><div class="log-block">${
      _logs.map(l => `<div class="log-line" style="${l.startsWith('⚠') ? 'color:var(--accent3)' : ''}">${esc(l)}</div>`).join('')
    }</div>`;
    outputEl.appendChild(block);
  }

  _displayResults.forEach((r, i) => {
    if (r.kind === 'roll') renderRollBlock(outputEl, r.result, r.axis, r.title || `Roll ${i + 1}`, r.poolRef);
    else if (r.kind === 'scaling') renderScalingBlock(outputEl, r.rows, r.categories, r.title || `Scaling ${i + 1}`, { mode: r.mode });
    else if (r.kind === 'cumulative') renderCumulativeBlock(outputEl, r.rows, r.single, r.categories, r.title || `Cumulative ${i + 1}`, { mode: r.mode });
    else renderStatBlock(outputEl, r.s, r.title || `Distribution ${i + 1}`, { mode: r.mode });
  });

  const summary = [];
  if (_displayResults.length) summary.push(plural(_displayResults.length, 'result'));
  if (_logs.length) summary.push(plural(_logs.length, 'console line'));
  announce(`Run complete — ${summary.join(', ')}`);
}
