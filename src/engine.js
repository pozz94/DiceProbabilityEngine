// ================================================================
// dicescript — engine
//
// Pure, presentation-free, no global/prototype mutation on import.
// Holds only primitives + the pure data functions.
//
// Implementation model (Engine spec §6): poolBuilder is an *effect
// boundary*. We realise it by **re-executing** the builder body once
// per joint assignment of the dice it reads. A global enumeration
// context (CTX) feeds each atom its face from a trace; the first
// atom not yet in the trace throws `FreshChoice`, and the enumerator
// branches over its faces (weighted), extending the trace. Because a
// resumption fixes every atom it touches, every read inside the body
// returns a concrete value and `&&`/`>`/`when` operate on plain
// booleans (§6, §7). Recursion (explosion, §8) is bounded by a
// probability cutoff: an always-exploding branch's weight decays
// geometrically and is pruned below EPSILON.
// ================================================================

export const EPSILON = 1e-12;

// ----------------------------------------------------------------
// §1 Dice — kinds and the `die(...)` constructor
// ----------------------------------------------------------------

let _leafSeq = 0;        // leaf identity (§2) — provenance, never value
const nextLeafId = () => ++_leafSeq;

// A DieKind is the *fifth* property (§4 `is`): value-independent face set.
// Kind equality is face-multiset equality; name is irrelevant.
export class DieKind {
  constructor(faces, name) {
    this.faces = [...faces];
    this.name = name ?? null;
    // distinct face -> probability, for weighting (repeated faces = weight, §1)
    const m = new Map();
    for (const f of this.faces) m.set(f, (m.get(f) || 0) + 1 / this.faces.length);
    this.pmf = [...m.entries()].map(([face, prob]) => ({ face, prob }));
    this.choices = this.pmf.map(({ face, prob }) => ({ value: face, prob }));  // for decide()
    // bounds exist only for ordered-numeric faces (§4)
    this.numeric = this.faces.every(f => typeof f === 'number');
    this.min = this.numeric ? Math.min(...this.faces) : undefined;
    this.max = this.numeric ? Math.max(...this.faces) : undefined;
    // canonical multiset signature for kind equality
    this._sig = JSON.stringify([...this.faces].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0));
    // short interned id: kinds with identical face multisets share it, so it
    // serves as a fast key for outcome-merge signatures (§ resolver).
    this._id = _kindIds.get(this._sig) ?? (_kindIds.set(this._sig, ++_kindSeq), _kindSeq);
  }
  equals(other) { return other instanceof DieKind && this._sig === other._sig; }
}
let _kindSeq = 0;
const _kindIds = new Map();   // _sig -> short id

// `die(n, name?)` faces 1..n; `die([faces], name?)` explicit faces (§1).
export function die(spec, name) {
  const faces = Array.isArray(spec)
    ? spec
    : Array.from({ length: spec }, (_, i) => i + 1);
  const kind = new DieKind(faces, name ?? (Array.isArray(spec) ? null : `d${spec}`));
  return makePool(new LeafTemplate(kind));
}

// ----------------------------------------------------------------
// §3/§4 Per-die sentinels for shows(max|min)
// ----------------------------------------------------------------
export const max = Symbol('max');   // resolved against each die's own bounds
export const min = Symbol('min');

// ----------------------------------------------------------------
// Concrete resolved tree — produced inside a resumption.
//   Leaf:  one atom (a die) with a rolled face and an active flag.
//   Group: a provenance node (§2 node identity); may carry a label.
// Leaves are shared mutable objects: a discard on a view flips the
// shared atom's `active` flag and the parent sees it (§1 live views).
// ----------------------------------------------------------------
class Leaf {
  constructor(kind, face) {
    this.kind = kind;
    this.name = kind.name;
    this.id = nextLeafId();
    this.face = face;
    this.active = true;   // false => ghost (discarded, §10)
  }
}
class Group {
  constructor(children, label) {
    this.children = children;   // Node[]
    this.label = label ?? null; // node identity (provenance), or null
  }
}

// A Factor is an independent sub-distribution folded in at resolution
// (a nested poolBuilder, §5 disjoint provenance → product). It is opaque
// to reads until expanded (§ resolver), so traversals skip it.
class Factor { constructor(dist) { this.dist = dist; } }

const isLeaf = n => n instanceof Leaf;

function activeLeaves(node, out = []) {
  if (node instanceof Factor) return out;
  if (isLeaf(node)) { if (node.active) out.push(node); return out; }
  for (const c of node.children) activeLeaves(c, out);
  return out;
}
function ghostLeaves(node, out = []) {
  if (node instanceof Factor) return out;
  if (isLeaf(node)) { if (!node.active) out.push(node); return out; }
  for (const c of node.children) ghostLeaves(c, out);
  return out;
}
// every leaf (active + ghost), skipping unexpanded factors
function leavesOf(node, out = []) {
  if (node instanceof Factor) return out;
  if (isLeaf(node)) { out.push(node); return out; }
  for (const c of node.children) leavesOf(c, out);
  return out;
}
function collectFactors(node, out = []) {
  if (node instanceof Factor) { out.push(node); return out; }
  if (isLeaf(node)) return out;
  for (const c of node.children) collectFactors(c, out);
  return out;
}
// collect groups carrying `label` anywhere in the subtree (§4 label access)
function labelledGroups(node, label, out = []) {
  if (node instanceof Factor || isLeaf(node)) return out;
  if (node.label === label) out.push(node);
  for (const c of node.children) labelledGroups(c, label, out);
  return out;
}

// ----------------------------------------------------------------
// Enumeration context (the effect handler's runtime)
// ----------------------------------------------------------------
let CTX = null;
// A choice point — a weighted categorical the resolver branches over. Both a
// die's face and a random dice-selection (§ sample) go through it: in
// 'enumerate' mode we serve the value from the trace or throw to branch over
// every option; in 'sample' mode we draw one at random.
class Choice { constructor(pmf) { this.pmf = pmf; } }  // pmf: [{ value, prob }]
function decide(pmf) {
  if (CTX.mode === 'sample') {
    const r = Math.random();
    let cum = 0;
    for (const o of pmf) { cum += o.prob; if (r < cum) return o.value; }
    return pmf[pmf.length - 1].value;
  }
  const i = CTX.pointer++;
  if (i < CTX.trace.length) return CTX.trace[i];
  // Branching *is* this throw. Record it so enumerate() can tell the difference
  // between "the branch propagated" and "user code caught it" — a try/catch in a
  // builder body used to swallow it silently, dropping every branch below.
  CTX.branched = true;
  throw new Choice(pmf);                 // first undecided choice: branch here
}
const atomFace = kind => decide(kind.choices);

// Enumerating a random *selection* or *ordering* over distinguishable dice costs
// C(n,k) / n! branches, each one a full re-execution of the builder body. Past
// these limits the page would hang, so the ops refuse instead.
const MAX_SELECTION_BRANCHES = 512;
const MAX_SHUFFLE_DICE = 5;
function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

// ----------------------------------------------------------------
// Multiset branching
//
// Reading n dice of one kind as n independent atoms makes the enumerator walk
// every *ordered* assignment: f^n re-executions of the builder body, merged
// only at the end (d6(8) = 1,679,616). The dice are exchangeable, so a
// symmetric read can only tell how many dice show each face — branch over
// those compositions instead: C(n+f-1, f-1), weighted multinomially
// (d6(8) = 1,287). The distribution is identical; only the number of
// re-executions changes.
//
// The body is handed the pool in canonical face order, so a read that depends
// on *which* die sits where (at/[i], sample) would see something the ordered
// path would not. Those reads raise NeedsOrder and the resolution restarts
// with per-atom branching — correct, just back to the old cost.
// ----------------------------------------------------------------
let _multiset = true;
export function setMultisetBranching(on) { const prev = _multiset; _multiset = on; return prev; }

const MULTISET_BUDGET = 200000;      // past this, fall back to per-atom branching
const _msPmf = new Map();            // kind._id + 'x' + n -> pmf | null
function multisetPmf(kind, n) {
  const key = kind._id + 'x' + n;
  if (_msPmf.has(key)) return _msPmf.get(key);
  const faces = kind.pmf, f = faces.length;
  if (f === 0 || binomial(n + f - 1, f - 1) > MULTISET_BUDGET) { _msPmf.set(key, null); return null; }
  const fact = [1];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1] * i;
  const out = [], counts = new Array(f).fill(0);
  // n! * Π p_i^c_i / c_i!  — the multinomial weight of this face-count vector
  (function rec(i, left, w) {
    if (i === f - 1) {
      counts[i] = left;
      out.push({ value: counts.slice(), prob: w * Math.pow(faces[i].prob, left) / fact[left] });
      return;
    }
    for (let c = 0; c <= left; c++) {
      counts[i] = c;
      rec(i + 1, left - c, w * Math.pow(faces[i].prob, c) / fact[c]);
    }
  })(0, n, fact[n]);
  _msPmf.set(key, out);
  return out;
}

// raised by a positional read when the pool it addresses came from a multiset
// branch; resolveDist catches it and re-runs the resolution ordered.
//
// Drawing the slot lazily instead (branching only over the distinct faces left)
// was tried and rejected: it was wrong on derived views — reading a position
// after keepHigh, and the nimble-attack idiom, both diverged from ordered
// enumeration — and, decisively, it made no difference to the charts it was
// meant to speed up (Weapon comparison: 6527 ms drawn vs 6581 ms ordered).
// The cost there is the outcome space of a recursive explosion, not the
// arrangement branching.
class NeedsOrder {}
function requireOrder() {
  if (CTX && CTX.mode === 'enumerate' && CTX.multisetUsed) throw new NeedsOrder();
}

// index subsets of size k from 0..total-1 (for enumerating a random selection)
function subsets(total, k) {
  const out = [], idx = [];
  (function rec(start) {
    if (idx.length === k) { out.push(idx.slice()); return; }
    for (let i = start; i <= total - (k - idx.length); i++) { idx.push(i); rec(i + 1); idx.pop(); }
  })(0);
  return out;
}
// k distinct indices chosen uniformly at random, in draw order (partial Fisher–Yates)
function randomIndices(total, k) {
  const idx = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (total - i));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx.slice(0, k);
}
// all orderings of [0 .. n-1]
function permutations(n) {
  const res = [], used = new Array(n).fill(false), cur = [];
  (function rec() {
    if (cur.length === n) { res.push(cur.slice()); return; }
    for (let i = 0; i < n; i++) if (!used[i]) { used[i] = true; cur.push(i); rec(); cur.pop(); used[i] = false; }
  })();
  return res;
}

// ----------------------------------------------------------------
// Instantiation — turn a template / view into a concrete node,
// sampling fresh atoms via atomFace. Re-instantiating a *view* gives a
// fresh pool of the same shape (kinds + labels), re-rolled — this is
// what lets a nested poolBuilder explosion fold in a fresh sub-attack.
// ----------------------------------------------------------------
function instantiate(x) {
  if (x instanceof Pool) return x._template._instantiate();
  if (x instanceof PoolView) return reinstantiate(x._node);  // fresh, same shape
  if (x instanceof Template) return x._instantiate();
  if (Array.isArray(x)) return new Group(x.map(instantiate));
  if (x == null) return new Group([]);
  if (typeof x === 'number') return new Group([]); // bare 0-count etc.
  throw new Error('cannot instantiate ' + typeof x);
}
function reinstantiate(node) {
  if (isLeaf(node)) return new Leaf(node.kind, atomFace(node.kind));
  // drop ghosts and already-resolved factors: not part of the shape forward
  const kids = node.children
    .filter(c => !(c instanceof Factor) && (isLeaf(c) ? c.active : true))
    .map(reinstantiate);
  return new Group(kids, node.label);
}
// structural shape key (kinds only, value-free) — used to memoize a
// sub-builder's distribution across sibling outcomes (§8): the explosion
// re-rolls fresh, so its distribution depends on shape, not rolled value.
function shapeKey(node) {
  if (node instanceof Factor) return '';
  if (isLeaf(node)) return node.active ? 'L' + node.kind._sig : '';
  return '(' + node.children.map(shapeKey).join(',') + ')';
}

// ----------------------------------------------------------------
// Templates — the lazy, value-free description the user composes.
// ----------------------------------------------------------------
class Template {
  _instantiate() { throw new Error('abstract'); }
  // a fresh concrete view; op-chains compose on the view so a selection
  // (lowest/highest) carries through to a following discard (§1 live views)
  _toView() { return new PoolView(this._instantiate()); }
}
class LeafTemplate extends Template {
  constructor(kind, count = 1) { super(); this.kind = kind; this.count = count; }
  _instantiate() {
    // n dice of one kind are exchangeable, so a symmetric read can only observe
    // the face *counts*. Branch over those (C(n+f-1,f-1) compositions) instead
    // of every ordered assignment (f^n). See multisetPmf.
    if (this.count > 1 && _multiset && CTX && CTX.mode === 'enumerate' && !CTX.ordered) {
      const pmf = multisetPmf(this.kind, this.count);
      if (pmf) {
        CTX.multisetUsed = true;
        const counts = decide(pmf);
        const faces = this.kind.pmf, kids = [];
        for (let i = 0; i < counts.length; i++)
          for (let c = 0; c < counts[i]; c++) kids.push(new Leaf(this.kind, faces[i].face));
        return new Group(kids);
      }
    }
    const kids = Array.from({ length: this.count },
      () => new Leaf(this.kind, atomFace(this.kind)));
    return new Group(kids);
  }
}
class ArrayTemplate extends Template {
  constructor(items) { super(); this.items = items; }
  _instantiate() { return new Group(this.items.map(instantiate)); }
}
class BuilderTemplate extends Template {
  constructor(fn, base, args) { super(); this.fn = fn; this.base = base; this.args = args; }
  _instantiate() {
    const view = new PoolView(instantiate(this.base));
    const result = this.fn(view, ...this.args);
    if (result instanceof PoolView) return result._root;
    if (result instanceof Pool || result instanceof Template || Array.isArray(result))
      return instantiate(result);
    if (result == null) return new Group([]);
    throw new Error('a poolBuilder body must return a pool');
  }
}
class OpTemplate extends Template {       // a recorded view-op (addDice, discard…)
  constructor(parent, op) { super(); this.parent = parent; this.op = op; }
  _toView() { return this.op(this.parent._toView()); }   // op: view => view
  _instantiate() { return this._toView()._root; }
}

// Structural active-leaf count (§4): how many dice are *present*, never
// what they show. Computed by instantiating once in sample mode — the
// count is deterministic for keep/discard/addDice even though faces are
// random. (A value-dependent discard would make it sample-dependent,
// which §4 documents as the caller's concern.)
function structuralSize(x) {
  if (typeof x === 'number') return x;
  if (Array.isArray(x)) return x.reduce((a, it) => a + structuralSize(it), 0);
  x = unwrap(x);
  if (x instanceof PoolView) return x.size;
  const prev = CTX;
  CTX = { mode: 'sample' };
  try { return activeLeaves(instantiate(x)).length; }
  finally { CTX = prev; }
}

// ----------------------------------------------------------------
// Reserved pool-member names (§4) — a label may not collide with one.
// Closed, versioned vocabulary; collision throws at construction.
// ----------------------------------------------------------------
const RESERVED = new Set([
  'size', 'shows', 'bounds', 'highest', 'lowest', 'sort', 'sample', 'shuffle', 'reduce',
  'reduceDiscarded', 'is', 'discard', 'addDice', 'when',
]);
function checkLabel(label) {
  if (label != null && RESERVED.has(label))
    throw new Error(`label "${label}" collides with a reserved pool member`);
  return label;
}

// ----------------------------------------------------------------
// Pool — the user-facing template handle. Callable for poolsOf copies
// (§1: die(6)(10)). Reads/ops on a template defer to a PoolView at
// instantiation, so the same surface works at top level and in stdlib.
// ----------------------------------------------------------------
export class Pool {
  constructor(template) { this._template = template; }
  get size() { return structuralSize(this); }

  addDice(arg, label) {
    checkLabel(label);
    return makePool(new OpTemplate(this._template, v => v.addDice(arg, label)));
  }
  lowest(n) { return makePool(new OpTemplate(this._template, v => v.lowest(n))); }
  highest(n) { return makePool(new OpTemplate(this._template, v => v.highest(n))); }
  sample(n) { return makePool(new OpTemplate(this._template, v => v.sample(n))); }
  shuffle() { return makePool(new OpTemplate(this._template, v => v.shuffle())); }
  sort(dir) { return makePool(new OpTemplate(this._template, v => v.sort(dir))); }
  discard() { return makePool(new OpTemplate(this._template, v => v.discard())); }
}

// callable proxy: die(6)(10) => 10 copies of the kind (§1 poolsOf)
function makePool(template) {
  const p = new Pool(template);
  const fn = function (n = 1) {
    if (template instanceof LeafTemplate)
      return makePool(new LeafTemplate(template.kind, template.count * n));
    // generic poolsOf: n copies of this template
    return makePool(new ArrayTemplate(Array.from({ length: n }, () => template)));
  };
  return new Proxy(fn, {
    apply: (_t, _this, args) => fn(...args),
    get: (_t, prop) => prop === '__pool__' ? p : Reflect.get(p, prop, p),
    has: (_t, prop) => prop in p,
    getPrototypeOf: () => Pool.prototype,
  });
}
const unwrap = x => (x && x.__pool__) ? x.__pool__ : x;

export function pool(x, n) {
  x = unwrap(x);
  if (x instanceof Pool) return n && n > 1 ? x(n) : x;
  // `el => pool(el)`, never a bare `pool`: map passes the index as the second
  // argument, which `pool` reads as the copy count (so entry 2 became 2 copies).
  if (Array.isArray(x)) return makePool(new ArrayTemplate(x.map(el => pool(el))));
  if (x instanceof PoolView) return x;
  if (x instanceof DieKind) return makePool(new LeafTemplate(x, n || 1));
  if (x == null) return makePool(new ArrayTemplate([]));
  return x;
}
export const coercePool = pool;

// ----------------------------------------------------------------
// PoolView — a concrete pool *inside a resumption*: every read returns
// a value, every condition is a boolean. Also the value handed to
// predicates (classify/filter) and to roll output. A sub-pool is a
// live view sharing the parent's atoms (§1).
// ----------------------------------------------------------------
export class PoolView {
  // _node: the node this view addresses; _root: the whole pool's root.
  constructor(node, root) {
    this._node = node;
    this._root = root ?? node;
  }

  // --- structural reads (§4) ---
  get size() { return activeLeaves(this._node).length; }

  get bounds() {
    const ls = activeLeaves(this._node);
    if (!ls.every(l => l.kind.numeric))
      throw new Error('bounds requires ordered-numeric dice');
    const lo = ls.reduce((a, l) => a + l.kind.min, 0);
    const hi = ls.reduce((a, l) => a + l.kind.max, 0);
    return { min: lo, max: hi, span: hi - lo };
  }

  is(kindSpec) {
    const ls = activeLeaves(this._node);
    const want = (Array.isArray(kindSpec) ? kindSpec : null);
    if (want) {
      if (want.length !== ls.length) return false;
      const have = ls.map(l => l.kind);
      const pool = [...have];
      for (const k of want.map(kindOf)) {
        const i = pool.findIndex(h => h.equals(k));
        if (i < 0) return false;
        pool.splice(i, 1);
      }
      return true;
    }
    const k = kindOf(kindSpec);
    return ls.every(l => l.kind.equals(k));
  }

  // --- outcome reads (§4) ---
  reduce(reducer, seed) {
    if (typeof reducer !== 'function') throw new Error('reduce requires a reducer');
    return activeLeaves(this._node).reduce((acc, l) => reducer(acc, l.face), seed);
  }
  reduceDiscarded(reducer, seed) {
    return ghostLeaves(this._node).reduce((acc, l) => reducer(acc, l.face), seed);
  }

  shows(spec) {
    const ls = activeLeaves(this._node);
    if (ls.length === 0) return false;
    const test = Array.isArray(spec)
      ? (l) => spec.some(s => faceMatches(l, s))
      : (l) => faceMatches(l, spec);
    return ls.every(test);
  }

  highest(n) { return this._rank(n, true); }
  lowest(n) { return this._rank(n, false); }
  _rank(n, high) {
    const ls = requireNumeric(activeLeaves(this._node).slice(), high ? 'highest' : 'lowest')
      .sort((a, b) => high ? b.face - a.face : a.face - b.face);
    // clamp: a negative n would reach slice(0, -k) and select from the *end*
    // instead of nothing — keepHigh(2d6, 3) silently kept one die.
    const k = Math.max(0, Math.min(n, ls.length));
    return new PoolView(new Group(ls.slice(0, k)), this._root);
  }
  sort(dir = 'asc') {
    const active = requireNumeric(activeLeaves(this._node).slice(), 'sort')
      .sort((a, b) => dir === 'desc' ? b.face - a.face : a.face - b.face);
    // a whole-pool reorder: the result *is* the reordered pool (new root), so
    // returning it from a builder / a following [i] reflect the new order.
    const root = keepLabels(new Group([...active, ...ghostLeaves(this._node)]), this._root);
    return new PoolView(root, root);
  }
  // n active dice chosen uniformly at random (without replacement) — a fresh
  // source of randomness, independent of position and value. Each of the
  // C(size, n) subsets is equally likely (a live view, like highest/lowest).
  sample(n) {
    const ls = activeLeaves(this._node);
    const k = Math.max(0, Math.min(n, ls.length));
    if (k === ls.length) return new PoolView(new Group(ls.slice()), this._root);
    // A real roll picks genuinely at random — even a uniform pool — so a
    // displayRoll highlights a random die, not always the leftmost.
    if (CTX && CTX.mode === 'sample') {
      const pick = randomIndices(ls.length, k);
      return new PoolView(new Group(pick.map(i => ls[i])), this._root);
    }
    // Distribution: a uniform pool is exchangeable, so the first k are
    // distribution-equivalent to a random k — take them with no C(size,k)
    // branching. Genuine subset enumeration only for distinguishable dice.
    const uniform = ls.every(l => l.kind._id === ls[0].kind._id);
    // "take the first k" is only exchangeable-equivalent to a random k if the
    // dice were branched individually; under a multiset branch the pool is in
    // face order, so the first k would be the k lowest
    if (uniform) requireOrder();
    if (uniform || !CTX) return new PoolView(new Group(ls.slice(0, k)), this._root);
    if (binomial(ls.length, k) > MAX_SELECTION_BRANCHES)
      throw new Error(`sample(${n}) over ${ls.length} distinguishable dice needs ` +
        `${binomial(ls.length, k)} branches — too many to enumerate. Use dice of one kind, ` +
        `or pick by position/value (at / highest / lowest) instead of at random.`);
    const combos = subsets(ls.length, k);
    const chosen = decide(combos.map(idx => ({ value: idx, prob: 1 / combos.length })));
    return new PoolView(new Group(chosen.map(i => ls[i])), this._root);
  }
  // the active dice in a uniformly random order (a live view). On a uniform
  // pool order is meaningless, so it's a no-op (no permutation branching).
  shuffle() {
    const ls = activeLeaves(this._node);
    if (ls.length <= 1 || ls.every(l => l.kind._id === ls[0].kind._id))
      return new PoolView(new Group(ls.slice()), this._root);
    let order;
    if (CTX && CTX.mode === 'sample') {
      order = ls.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
    } else {
      // n! orderings, each re-running the whole builder body: 4 dice ≈ 0.2 s,
      // 5 ≈ 11 s, 6 does not finish. Refuse rather than freeze the page — and
      // note that unless the body makes an order-dependent read, the work is
      // wasted anyway (outcomes merge on an order-free signature).
      if (ls.length > MAX_SHUFFLE_DICE)
        throw new Error(`shuffle() over ${ls.length} distinguishable dice needs ` +
          `${ls.length}! orderings — too many to enumerate. Shuffling only matters ` +
          `if the pool is then read by position; on dice of one kind it is already a no-op.`);
      const perms = permutations(ls.length);
      order = decide(perms.map(p => ({ value: p, prob: 1 / perms.length })));
    }
    const root = keepLabels(new Group([...order.map(i => ls[i]), ...ghostLeaves(this._node)]), this._root);
    return new PoolView(root, root);
  }

  // --- selection (§4) ---
  at(i) {
    const ls = activeLeaves(this._node);
    // which die is "first" is only meaningful if the dice were branched
    // individually; on one die it is unambiguous either way
    if (ls.length > 1) requireOrder();
    const idx = i < 0 ? ls.length + i : i;
    const leaf = ls[idx];
    return new PoolView(new Group(leaf ? [leaf] : []), this._root);
  }
  label(name) {
    const groups = labelledGroups(this._root._labelSource ?? this._root, name);
    const leaves = [];
    for (const g of groups) activeLeaves(g, leaves);
    return new PoolView(new Group(leaves), this._root);
  }

  // --- transforms ---
  addDice(arg, label) {
    checkLabel(label);
    if (typeof arg === 'number') {
      // root view, like every other addDice path — returning `this` handed back
      // a sub-view when called on one (p.at(0).addDice(0))
      if (arg === 0) return new PoolView(this._root, this._root);
      // N more dice of the pool's prevailing kind
      const k = activeLeaves(this._node)[0]?.kind ?? new DieKind([0]);
      arg = makePool(new LeafTemplate(k, arg));
    }
    const u = unwrap(arg);
    let added;
    // A nested poolBuilder is an independent sub-pool (§5 disjoint
    // provenance → product). During enumeration, fold it in as a Factor
    // (its own memoized distribution, convolved later) instead of inlining
    // its atoms — that is what keeps recursion from blowing up (§8).
    if (CTX && CTX.mode === 'enumerate' && u instanceof Pool && u._template instanceof BuilderTemplate) {
      added = new Factor(resolveDist(u, CTX.remaining - 1));
    } else {
      added = instantiate(arg);
    }
    if (label != null) added = new Group([added], label);
    const newRoot = new Group([...childrenOf(this._root), added]);
    return new PoolView(newRoot, newRoot);
  }

  // §10 nullary; removes the receiver's active dice, returns the root.
  discard() {
    for (const l of activeLeaves(this._node)) l.active = false;
    return new PoolView(this._root, this._root);
  }

  // §7 when(cond, transform) ≡ cond ? transform(pool) : pool
  when(cond, transform) {
    return cond ? transform(this) : this;
  }
}

// positional access (§4): p[0] is the sub-pool of the first active die,
// p[-1] the last — the bracket spellings of .at(i). Negative indexes count
// from the end. Defined as non-enumerable getters so they don't leak.
for (let i = 0; i < 64; i++)
  Object.defineProperty(PoolView.prototype, String(i), {
    get() { return this.at(i); }, configurable: true, enumerable: false,
  });
for (const i of [-1, -2, -3])
  Object.defineProperty(PoolView.prototype, String(i), {
    get() { return this.at(i); }, configurable: true, enumerable: false,
  });

function childrenOf(node) { return isLeaf(node) ? [node] : node.children; }

// sort()/shuffle() rebuild a flat root, so labelled groups vanish from it and
// label() found nothing afterwards. Leaves are shared objects, so the tree from
// before the reorder still names the right dice — carry it as the lookup source.
function keepLabels(newRoot, oldRoot) {
  newRoot._labelSource = oldRoot._labelSource ?? oldRoot;
  return newRoot;
}

function kindOf(x) {
  x = unwrap(x);
  if (x instanceof DieKind) return x;
  if (x instanceof Pool && x._template instanceof LeafTemplate) return x._template.kind;
  if (x instanceof PoolView) return activeLeaves(x._node)[0]?.kind;
  throw new Error('expected a die kind');
}
// Ranking subtracts faces, which is NaN on symbolic dice — the comparator then
// returns nothing meaningful and highest/lowest/sort hand back an arbitrary die.
// Refuse, as `bounds` already does (§4: ordering exists only for numeric faces).
function requireNumeric(leaves, what) {
  if (!leaves.every(l => l.kind.numeric))
    throw new Error(`${what} requires ordered-numeric dice`);
  return leaves;
}

function faceMatches(leaf, spec) {
  if (spec === max) return leaf.kind.numeric && leaf.face === leaf.kind.max;
  if (spec === min) return leaf.kind.numeric && leaf.face === leaf.kind.min;
  return leaf.face === spec;
}

// ----------------------------------------------------------------
// §6 poolBuilder — the effect boundary.
// ----------------------------------------------------------------
export function poolBuilder(fn) {
  return (base, ...args) => makePool(new BuilderTemplate(fn, base, args));
}

// ----------------------------------------------------------------
// Resolution — re-execute the body once per joint assignment of the
// atoms it *reads* (§6, branching on the first fresh atom), then merge
// outcomes by face-multiset signature and convolve independent factors.
// Merging collapses permutations (so reads, all symmetric, are stable)
// and keeps each recursion level polynomial; the memo shares a recursive
// sub-builder's distribution across sibling outcomes (§8); `scale` is the
// absolute weight budget that bounds recursion depth.
// ----------------------------------------------------------------

// A distribution outcome is FLAT and value-free: the active/ghost Leaf arrays
// plus precomputed *sorted key arrays* (_a/_g) — the kind+face multiset every
// symmetric read depends on (total/count/shows/maxed/bounds/is). Carrying the
// sorted keys lets convolve merge them in O(n) and lets mergeDist key off a
// join without re-walking a tree; the Group is built only for final outcomes.
function leafKey(l) { return l.kind._id + ':' + l.face; }
const EMPTY = [];
function mergeSorted(x, y) {
  if (!x.length) return y;
  if (!y.length) return x;
  const out = new Array(x.length + y.length);
  let i = 0, j = 0, k = 0;
  while (i < x.length && j < y.length) out[k++] = x[i] <= y[j] ? x[i++] : y[j++];
  while (i < x.length) out[k++] = x[i++];
  while (j < y.length) out[k++] = y[j++];
  return out;
}
function flatten(root) {           // active + ghost leaves of a tree (skip factors)
  const a = [], g = [];
  (function rec(n) {
    if (n instanceof Factor) return;
    if (isLeaf(n)) { (n.active ? a : g).push(n); return; }
    for (const c of n.children) rec(c);
  })(root);
  return { a, g };
}
function mkFlat(aLeaves, gLeaves, prob) {
  return {
    aLeaves, gLeaves, prob,
    _a: aLeaves.length ? aLeaves.map(leafKey).sort() : EMPTY,
    _g: gLeaves.length ? gLeaves.map(leafKey).sort() : EMPTY,
  };
}
const sigOf = o => o._g.length ? o._a.join(',') + '||' + o._g.join(',') : o._a.join(',');

// Resolution cutoff: branches/outcomes below this absolute probability are
// pruned. The default is exact-ish; a renderer that only needs a few
// significant figures can loosen it (setCutoff), then restore it.
//
// Mass is conserved: a truncated recursion resolves to the identity (see
// identityDist), so the chain stops contributing rather than annihilating the
// branch that called it. Until that was fixed, a fully-pruned sub-resolution
// returned an empty distribution and `convolve(parent, [])` deleted the parent's
// own mass — nimble d2(6) summed to 0.984375 and its +vicious variant to 0.96875.
//
// REMAINING INACCURACY — truncation *bias*, not mass loss. A factor is resolved
// at `CTX.weight * CTX.scale`, the joint weight of the single branch requesting
// it, while the chain it feeds continues with a much higher conditional
// probability: on 6×d2 the budget decays like (1/64)^k though the explosion only
// decays like (1/2)^k. So the chain is cut early and long tails are
// under-represented. The mean of nimble d2(6) still moves with the cutoff:
//
//   1e-9 -> 12.625      1e-12 -> 13.469      1e-15 -> 13.680
//
// Note `setCutoff(0)` does not terminate. Passing the inherited CTX.scale
// instead is NOT the fix: sibling calls then share a memo key, hit the tentative
// entry, and the recursion collapses to one level. Bounding recursion by the
// chain's conditional continuation probability would fix it properly.
let _cutoff = EPSILON;
export function setCutoff(c) { const prev = _cutoff; _cutoff = c; return prev; }

// Reduced resolution. When set to a monoid over faces, an outcome carries only
// that scalar instead of the whole dice multiset, so convolution is a 1-D fold
// and a deep recursion stops multiplying the multiset space — which is what
// makes unrolling an explosion affordable (an 8-deep exploding d12 with vicious
// d4s spans ~75,000 multisets but only a few hundred totals).
//
// The engine does not decide when this applies. It is valid only if every read
// the caller performs is that same fold, and the caller establishes that by
// reference equality against the tagged stdlib reducers (see foldOf in
// display.js) or by being told outright. An earlier version guessed by probing
// predicate behaviour and shipped two silent wrong answers.
let _RM = null;
export const SUM = { id: 'sum', map: f => f, combine: (a, b) => a + b, identity: 0 };
export const MAX = { id: 'max', map: f => f, combine: (a, b) => (a > b ? a : b), identity: -Infinity };
export const MIN = { id: 'min', map: f => f, combine: (a, b) => (a < b ? a : b), identity: Infinity };
export const MONOID_BY_ID = { sum: SUM, max: MAX, min: MIN };

// Discarded dice stay in the outcome signature so reduceDiscarded can read
// them. When nothing does, every distinct set of dropped dice is a distinct
// outcome for no reason: d10(8).keepLow(2) carries 24,310 outcomes of which
// only 55 are distinguishable. The caller probes its reads and turns tracking
// off (see readsDiscarded in display.js) — merging them is then exact, not an
// approximation, because no read can tell them apart.
let _keepGhosts = true;
export function setKeepGhosts(on) { const prev = _keepGhosts; _keepGhosts = on; return prev; }

function mergeDist(list) {
  const m = new Map();
  for (const o of list) {
    if (o.prob < _cutoff) continue;
    const s = _RM ? (o.barred ? 'B' : 'v' + o.v) : sigOf(o);
    const e = m.get(s);
    if (e) e.prob += o.prob; else m.set(s, o);
  }
  return [...m.values()];
}
// convolve two distributions (independent product)
function convolve(A, B) {
  const out = [];
  if (_RM) {
    for (const a of A) for (const b of B)
      out.push({ v: _RM.combine(a.v, b.v), barred: a.barred && b.barred, prob: a.prob * b.prob });
    return mergeDist(out);
  }
  for (const a of A) for (const b of B) out.push({
    aLeaves: a.aLeaves.length ? (b.aLeaves.length ? a.aLeaves.concat(b.aLeaves) : a.aLeaves) : b.aLeaves,
    gLeaves: a.gLeaves.length ? (b.gLeaves.length ? a.gLeaves.concat(b.gLeaves) : a.gLeaves) : b.gLeaves,
    _a: mergeSorted(a._a, b._a),
    _g: mergeSorted(a._g, b._g),
    prob: a.prob * b.prob,
  });
  return mergeDist(out);
}
// reduce one resolved tree to a flat distribution outcome
function mkOutcome(root, prob) {
  if (_RM) {
    const act = activeLeaves(root);
    let v = _RM.identity;
    for (const l of act) v = _RM.combine(v, _RM.map(l.face));
    return { v, barred: act.length === 0, prob };
  }
  const { a, g } = flatten(root);
  return mkFlat(a, _keepGhosts ? g : EMPTY, prob);
}
// The distribution of "no dice at all", with certainty — the identity of
// convolve. A recursion that has been truncated resolves to this: the chain
// stops contributing, which is what truncation means. Returning an *empty*
// distribution instead would mean the chain is impossible, and convolving that
// into the parent deletes the parent's own mass along with it.
const identityDist = () => (_RM
  ? [{ v: _RM.identity, barred: true, prob: 1 }]
  : [{ aLeaves: EMPTY, gLeaves: EMPTY, _a: EMPTY, _g: EMPTY, prob: 1 }]);

// flatten one resolved tree (with factors) into the distribution
function expand(root, prob) {
  const factors = collectFactors(root);
  let dist = [mkOutcome(root, prob)];
  for (const f of factors) dist = convolve(dist, f.dist);
  return dist;
}

function enumerate(thunk, remaining, ordered = false) {
  const out = [];
  const stack = [{ trace: [], weight: 1 }];
  while (stack.length) {
    const { trace, weight } = stack.pop();
    // Pruning is *relative to this resolution*, never to the caller's weight.
    // That is what lets a sub-distribution be memoised by shape and reused by
    // every branch that asks for it, instead of once per branch weight.
    if (weight < _cutoff) continue;
    CTX = { mode: 'enumerate', trace, pointer: 0, weight, remaining, branched: false, ordered, multisetUsed: false };
    const ctx = CTX;
    let root;
    try { root = thunk(); }
    catch (e) {
      if (e instanceof Choice) {
        for (const { value, prob } of e.pmf)
          stack.push({ trace: [...trace, value], weight: weight * prob });
        continue;
      }
      throw e;
    }
    // Returned normally, yet a branch was raised — the body caught it. Every
    // branch below that point is silently missing, so fail instead of charting
    // a plausible-looking wrong distribution.
    if (ctx.branched)
      throw new Error('a poolBuilder body must not catch exceptions: ' +
        'the dice branch by throwing, so a try/catch around a roll discards outcomes');
    for (const o of expand(root, weight)) out.push(o);
  }
  return mergeDist(out);
}

// Memo for recursive sub-builders (§8). The key is the builder's *shape*
// (identity + base shape + args) plus how many levels of unrolling are still
// allowed. A level is what changes; the shape is what stays the same.
//
// Keying on `remaining` rather than on an absolute depth is what makes the
// memo survive iterative deepening: the distribution of a shape with 5 levels
// left is the same object whether the top-level budget was 8 or 32, so raising
// the budget only ever *adds* entries. Nothing is recomputed.
//
// This replaced a budget that decayed by the joint weight of the single branch
// requesting a factor. That coupled recursion depth to branch weight, so on a
// 6×d2 pool the budget fell like (1/64)^k while the explosion chain only fell
// like (1/2)^k — the chain was cut at depth 6, and (being keyed by that weight)
// every branch resolved its own copy: 4561 resolutions across 142 keys for just
// 56 distinct shapes.
const _memo = new Map();
let _fnSeq = 0;
const _fnIds = new WeakMap();
const fnId = fn => _fnIds.get(fn) ?? (_fnIds.set(fn, ++_fnSeq), _fnSeq);
export function resetCaches() { _memo.clear(); }
function builderKey(pool, remaining) {
  const t = pool._template;
  const baseKey = t.base instanceof PoolView ? shapeKey(t.base._node)
    : (t.base && t.base.__pool__) ? 'P' + structKeyOf(t.base) : structKeyOf(t.base);
  return `${_RM ? 'R' + _RM.id : 'M'}${_keepGhosts ? 'g' : ''}|f${fnId(t.fn)}|${baseKey}|${JSON.stringify(t.args)}|r${remaining}`;
}
function structKeyOf(x) {
  x = unwrap(x);
  if (x instanceof Pool) {
    const t = x._template;
    if (t instanceof LeafTemplate) return 'L' + t.kind._sig + 'x' + t.count;
    if (t instanceof BuilderTemplate) return 'B' + fnId(t.fn);
    return 'T';
  }
  return Array.isArray(x) ? '[' + x.map(structKeyOf).join(',') + ']' : String(typeof x);
}

// independent identical dice → convolve into a multiset distribution
// (C(n+f-1,f-1) outcomes, not f^n): merging during the product avoids
// the per-atom enumeration blow-up for plain pools like d6(8).
function dieDist(kind) {
  if (_RM) return kind.pmf.map(({ face, prob }) =>
    ({ v: _RM.combine(_RM.identity, _RM.map(face)), barred: false, prob }));
  return kind.pmf.map(({ face, prob }) => {
    const leaf = new Leaf(kind, face);
    return { aLeaves: [leaf], gLeaves: EMPTY, _a: [leafKey(leaf)], _g: EMPTY, prob };
  });
}
function leafTemplateDist(t) {
  let d = identityDist();
  const single = dieDist(t.kind);
  for (let i = 0; i < t.count; i++) d = convolve(d, single);
  return d;
}

// ----------------------------------------------------------------
// Iterative deepening (§8). An explosion has no finite depth, so it has to be
// unrolled to *some* number of levels and cut. Rather than guess that number,
// unroll further until the distribution stops moving: the tail of a chain that
// continues with probability q shrinks like q^k, so successive budgets converge
// geometrically and the loop stops as soon as the change is under tolerance.
//
// `_hitBottom` records whether any chain actually reached the cut. If none did,
// the result is already exact and there is nothing to deepen.
// ----------------------------------------------------------------
const UNROLL_START = 4;
let _unrollTol = 1e-12, _unrollMax = 4096;
export function setUnrollTolerance(t) { const prev = _unrollTol; _unrollTol = t; return prev; }
export function setUnrollCap(n) { const prev = _unrollMax; _unrollMax = n; return prev; }
let _hitBottom = false;

// total variation between two distributions, keyed by outcome signature
function tvDistance(a, b) {
  const key = o => (_RM ? (o.barred ? 'B' : 'v' + o.v) : sigOf(o));
  const m = new Map();
  for (const o of a) m.set(key(o), (m.get(key(o)) || 0) + o.prob);
  for (const o of b) m.set(key(o), (m.get(key(o)) || 0) - o.prob);
  let d = 0;
  for (const v of m.values()) d += Math.abs(v);
  return d / 2;
}

function resolveTop(p) {
  let dist = null, prev = null;
  for (let budget = Math.min(UNROLL_START, _unrollMax); budget <= _unrollMax; budget *= 2) {
    _hitBottom = false;
    dist = resolveDist(p, budget);
    if (!_hitBottom) break;                       // nothing was cut: exact
    if (prev && tvDistance(prev, dist) < _unrollTol) break;
    prev = dist;
  }
  return dist;
}

function resolveDist(p, remaining) {
  p = unwrap(p);
  // fast path: a plain pool of independent dice (no ops/builder)
  if (p instanceof Pool && p._template instanceof LeafTemplate) return leafTemplateDist(p._template);
  // out of unrolling budget: the chain stops here, contributing no dice
  if (remaining <= 0) { _hitBottom = true; return identityDist(); }
  const prev = CTX;
  const memoable = p instanceof Pool && p._template instanceof BuilderTemplate;
  let key;
  if (memoable) {
    key = builderKey(p, remaining);
    const hit = _memo.get(key);
    if (hit) return hit;
    // tentative — breaks a re-entry that does not consume a level. The identity,
    // not an empty list: such a builder has to stop contributing, not annihilate
    // the branch that called it.
    _memo.set(key, identityDist());
  }
  let dist;
  try {
    try { dist = enumerate(() => instantiate(p), remaining); }
    catch (e) {
      if (!(e instanceof NeedsOrder)) throw e;
      // the body read the pool positionally — redo it with per-atom branching
      dist = enumerate(() => instantiate(p), remaining, true);
    }
  } finally { CTX = prev; }
  // Truncated to nothing: every branch fell below the cutoff. That is the
  // recursion terminating, so it contributes no dice — it does not make the
  // caller's outcome impossible.
  if (dist.length === 0) dist = identityDist();
  if (memoable) _memo.set(key, dist);
  return dist;
}

// A resolved raw outcome from a concrete tree (sample mode / roll).
function rawOutcome(root, prob) {
  const active = activeLeaves(root);
  const ghosts = ghostLeaves(root);
  return {
    prob,
    barred: active.length === 0,
    dice: active.map(describe),
    ghosts: ghosts.map(describe),
    view: new PoolView(root),
  };
}
const describe = l => ({ name: l.name, face: l.face, kind: l.kind, id: l.id });

// A view over a flat distribution outcome (active+ghost leaves), handed to user
// predicates. The leaves MUST be copied: dieDist interns one Leaf per (kind,
// face) and convolve concatenates those references, so outcomes share leaf
// objects — a predicate calling discard() on a shared leaf would flip it for
// every other outcome that contains it, corrupting the rest of the enumeration.
function copyLeaf(l) {
  const c = new Leaf(l.kind, l.face);
  c.active = l.active;
  return c;
}
function flatView(o) {
  return new PoolView(new Group(o.aLeaves.map(copyLeaf).concat(o.gLeaves.map(copyLeaf))));
}

// A synthetic view holding the given faces — how a reduced outcome is presented
// back to a caller's axis/filter, as a single die showing the folded value.
const _scalarKind = new DieKind([0]);
export function makeView(faces) {
  return new PoolView(new Group(faces.map(f => new Leaf(_scalarKind, f))));
}

// reducedProbability(pool, monoid) -> [{ value, prob, barred }] carrying only
// the fold. Valid only when every read the caller will perform is that same
// fold; the caller is responsible for establishing that (see foldOf).
export function reducedProbability(pool, monoid = SUM) {
  const prev = _RM;
  _RM = monoid;
  try {
    return resolveTop(pool).map(o => ({ value: o.v, prob: o.prob, barred: o.barred }));
  } finally { _RM = prev; }
}

function rawFromFlat(o) {
  return {
    prob: o.prob,
    barred: o.aLeaves.length === 0,
    dice: o.aLeaves.map(describe),
    ghosts: o.gLeaves.map(describe),
    view: flatView(o),
  };
}

// Presentation-ready provenance tree (roll order + node labels preserved):
// leaves carry name/face/discarded; groups carry their label. Unlabeled
// groups stay in the tree so a renderer can flatten or nest as it likes.
function serializeTree(node) {
  if (node instanceof Factor) return null;
  if (isLeaf(node)) return { leaf: true, name: node.name, face: node.face, discarded: !node.active };
  return { label: node.label, children: node.children.map(serializeTree).filter(Boolean) };
}

// ================================================================
// §11 Data functions (pure)
// ================================================================

// roll(pool) -> one raw resolved outcome (active dice, ghosts, barred).
// Carries `tree`: the labeled provenance structure in roll order.
export function roll(p) {
  let root;
  CTX = { mode: 'sample' };
  try { root = instantiate(unwrap(p)); }
  finally { CTX = null; }               // a throw used to leave CTX in sample mode
  const out = rawOutcome(root, 1);
  out.tree = serializeTree(root);
  return out;
}

// outcomeProbability(pool, groupBy?) -> full weighted enumeration.
// Sums to 1 including barred mass. groupBy is a caller-supplied,
// defaultless collapse (typically a reduce); omit for raw outcomes.
export function outcomeProbability(p, groupBy) {
  const dist = resolveTop(p);
  if (!groupBy) return dist.map(rawFromFlat);
  const m = new Map();
  for (const o of dist) {
    const key = groupBy(flatView(o));
    const prev = m.get(key);
    if (prev) prev.prob += o.prob;
    else m.set(key, { value: key, prob: o.prob, barred: o.aLeaves.length === 0 });
  }
  return [...m.values()];
}

// ---- §11 filter normalisation ----
// category := predicate | { when, label?, color? };  filter := category | category[]
function normalizeFilter(filter) {
  const list = Array.isArray(filter) ? filter : [filter];
  return list.map(c => typeof c === 'function' ? { when: c } : c);
}

// classify(pool, filter) -> { p:[...], barred, uncategorized }; sums to 1.
// Barred mass is partitioned out before predicates run (§11). Each
// non-barred outcome lands in its first matching category.
export function classify(p, filter) {
  const cats = normalizeFilter(filter);
  const masses = cats.map(() => 0);
  let barred = 0, uncategorized = 0;
  for (const o of resolveTop(p)) {
    if (o.aLeaves.length === 0) { barred += o.prob; continue; }
    const view = flatView(o);
    const i = cats.findIndex(c => c.when(view));
    if (i < 0) uncategorized += o.prob; else masses[i] += o.prob;
  }
  return { p: masses, barred, uncategorized };
}

// scalingProbability(build, {from,to,step=1}, filter) -> classify per x.
export function scalingProbability(build, { from, to, step = 1 }, filter) {
  const rows = [];
  for (const x of sweep(from, to, step))
    rows.push({ x, ...classify(build(x), filter) });
  return rows;
}

// from, from+step, … up to `to`. Multiplying out beats `x += step`, which
// accumulates error and drops or duplicates the endpoint on fractional steps.
export function sweep(from, to, step = 1) {
  if (!(step > 0) || !(to >= from)) return to === from ? [from] : [];
  const n = Math.floor((to - from) / step + 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => from + i * step);
}

// cumulativeProbability(pool, filter, {attempts}) -> closed form per category.
// Single-attempt marginal p_i (categories may overlap), then 1-(1-p_i)^k.
export function cumulativeProbability(p, filter, { attempts }) {
  const cats = normalizeFilter(filter);
  const single = cats.map(() => 0);
  for (const o of resolveTop(p)) {
    if (o.aLeaves.length === 0) continue;
    const view = flatView(o);
    cats.forEach((c, i) => { if (c.when(view)) single[i] += o.prob; });
  }
  const rows = [];
  for (let k = 1; k <= attempts; k++)
    rows.push({ attempts: k, p: single.map(pi => 1 - Math.pow(1 - pi, k)) });
  return rows;
}
