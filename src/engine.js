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
class FreshChoice { constructor(kind) { this.kind = kind; } }

// An atom asks for its face. In 'enumerate' mode we serve it from the
// trace or throw to branch; in 'sample' mode we draw it randomly.
function atomFace(kind) {
  if (CTX.mode === 'sample') {
    const r = Math.random();
    let cum = 0;
    for (const { face, prob } of kind.pmf) { cum += prob; if (r < cum) return face; }
    return kind.pmf[kind.pmf.length - 1].face;
  }
  const i = CTX.pointer++;
  if (i < CTX.trace.length) return CTX.trace[i];
  throw new FreshChoice(kind);          // first unassigned atom: branch here
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
  'size', 'shows', 'bounds', 'highest', 'lowest', 'sort', 'reduce',
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
  if (Array.isArray(x)) return makePool(new ArrayTemplate(x.map(pool)));
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
    const ls = activeLeaves(this._node).slice()
      .sort((a, b) => high ? b.face - a.face : a.face - b.face);
    return new PoolView(new Group(ls.slice(0, n)), this._root);
  }
  sort(dir = 'asc') {
    const ls = activeLeaves(this._node).slice()
      .sort((a, b) => dir === 'desc' ? b.face - a.face : a.face - b.face);
    return new PoolView(new Group(ls), this._root);
  }

  // --- selection (§4) ---
  at(i) {
    const ls = activeLeaves(this._node);
    const idx = i < 0 ? ls.length + i : i;
    const leaf = ls[idx];
    return new PoolView(new Group(leaf ? [leaf] : []), this._root);
  }
  label(name) {
    const groups = labelledGroups(this._root, name);
    const leaves = [];
    for (const g of groups) activeLeaves(g, leaves);
    return new PoolView(new Group(leaves), this._root);
  }

  // --- transforms ---
  addDice(arg, label) {
    checkLabel(label);
    if (typeof arg === 'number') {
      if (arg === 0) return this;
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
      added = new Factor(resolveDist(u, CTX.weight * CTX.scale));
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

function kindOf(x) {
  x = unwrap(x);
  if (x instanceof DieKind) return x;
  if (x instanceof Pool && x._template instanceof LeafTemplate) return x._template.kind;
  if (x instanceof PoolView) return activeLeaves(x._node)[0]?.kind;
  throw new Error('expected a die kind');
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
let _cutoff = EPSILON;
export function setCutoff(c) { const prev = _cutoff; _cutoff = c; return prev; }

// Reduce mode (§ optimization): when set to a monoid { map, combine, identity }
// over faces, outcomes track only that scalar (e.g. the total) instead of the
// full dice multiset. Convolution combines scalars (a 1-D fold), so a recursive
// pool collapses to ~range-of-values outcomes instead of thousands of multisets.
// Correct only when every read the caller will perform is a function of that one
// reduction — the display verifies this before turning it on.
let _RM = null;
export const SUM = { map: f => f, combine: (a, b) => a + b, identity: 0 };

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
  } else {
    for (const a of A) for (const b of B) out.push({
      aLeaves: a.aLeaves.length ? (b.aLeaves.length ? a.aLeaves.concat(b.aLeaves) : a.aLeaves) : b.aLeaves,
      gLeaves: a.gLeaves.length ? (b.gLeaves.length ? a.gLeaves.concat(b.gLeaves) : a.gLeaves) : b.gLeaves,
      _a: mergeSorted(a._a, b._a),
      _g: mergeSorted(a._g, b._g),
      prob: a.prob * b.prob,
    });
  }
  return mergeDist(out);
}
// reduce one resolved tree to a distribution outcome (reduced or flat)
function mkOutcome(root, prob) {
  if (_RM) {
    const a = activeLeaves(root);
    let v = _RM.identity;
    for (const l of a) v = _RM.combine(v, _RM.map(l.face));
    return { v, barred: a.length === 0, prob };
  }
  const { a, g } = flatten(root);
  return mkFlat(a, g, prob);
}
// flatten one resolved tree (with factors) into the distribution
function expand(root, prob) {
  const factors = collectFactors(root);
  let dist = [mkOutcome(root, prob)];
  for (const f of factors) dist = convolve(dist, f.dist);
  return dist;
}

function enumerate(thunk, scale) {
  const out = [];
  const stack = [{ trace: [], weight: 1 }];
  while (stack.length) {
    const { trace, weight } = stack.pop();
    if (weight * scale < _cutoff) continue;     // bound recursion by absolute mass
    CTX = { mode: 'enumerate', trace, pointer: 0, weight, scale };
    let root;
    try { root = thunk(); }
    catch (e) {
      if (e instanceof FreshChoice) {
        for (const { face, prob } of e.kind.pmf)
          stack.push({ trace: [...trace, face], weight: weight * prob });
        continue;
      }
      throw e;
    }
    for (const o of expand(root, weight)) out.push(o);
  }
  return mergeDist(out);
}

// memo for recursive sub-builders (§8): key = builder identity + base shape +
// args + scale. Scale-bounding truncates a factor's recursion to the depth its
// caller's weight actually needs (a perf feature, not just correctness), and
// dedupes siblings (identical scale). The memo persists across a batch (shared
// where scale matches) and is cleared per run by resetCaches().
const _memo = new Map();
let _fnSeq = 0;
const _fnIds = new WeakMap();
const fnId = fn => _fnIds.get(fn) ?? (_fnIds.set(fn, ++_fnSeq), _fnSeq);
export function resetCaches() { _memo.clear(); }
function builderKey(pool, scale) {
  const t = pool._template;
  const baseKey = t.base instanceof PoolView ? shapeKey(t.base._node)
    : (t.base && t.base.__pool__) ? 'P' + structKeyOf(t.base) : structKeyOf(t.base);
  return `${_RM ? 'R' : 'M'}|f${fnId(t.fn)}|${baseKey}|${JSON.stringify(t.args)}|s${scale.toExponential(10)}`;
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
  let d = [_RM ? { v: _RM.identity, barred: true, prob: 1 }
             : { aLeaves: EMPTY, gLeaves: EMPTY, _a: EMPTY, _g: EMPTY, prob: 1 }];
  const single = dieDist(t.kind);
  for (let i = 0; i < t.count; i++) d = convolve(d, single);
  return d;
}

function resolveDist(p, scale = 1) {
  p = unwrap(p);
  // fast path: a plain pool of independent dice (no ops/builder)
  if (p instanceof Pool && p._template instanceof LeafTemplate) return leafTemplateDist(p._template);
  const prev = CTX;
  const memoable = p instanceof Pool && p._template instanceof BuilderTemplate;
  let key;
  if (memoable) {
    key = builderKey(p, scale);
    const hit = _memo.get(key);
    if (hit) return hit;
    _memo.set(key, []);                    // tentative — breaks self-recursion
  }
  let dist;
  try { dist = enumerate(() => instantiate(p), scale); }
  finally { CTX = prev; }
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

// a lightweight view over a flat distribution outcome (active+ghost leaves)
function flatView(o) { return new PoolView(new Group(o.aLeaves.concat(o.gLeaves))); }

// Build a synthetic view with the given active faces — used by the display's
// reduced fast path to evaluate totals-only predicates on a value.
const _scalarKind = new DieKind([0]);
export function makeView(faces) {
  return new PoolView(new Group(faces.map(f => new Leaf(_scalarKind, f))));
}

// reducedProbability(pool, monoid) -> [{ value, prob, barred }] tracking only
// the monoid fold (e.g. SUM) — far fewer outcomes for recursive pools. Valid
// only when every downstream read is a function of that reduction.
export function reducedProbability(pool, monoid = SUM) {
  const prev = _RM;
  _RM = monoid;
  try {
    return resolveDist(pool).map(o => ({ value: o.v, prob: o.prob, barred: o.barred }));
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
  CTX = { mode: 'sample' };
  const root = instantiate(unwrap(p));
  CTX = null;
  const out = rawOutcome(root, 1);
  out.tree = serializeTree(root);
  return out;
}

// outcomeProbability(pool, groupBy?) -> full weighted enumeration.
// Sums to 1 including barred mass. groupBy is a caller-supplied,
// defaultless collapse (typically a reduce); omit for raw outcomes.
export function outcomeProbability(p, groupBy) {
  const dist = resolveDist(p);
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
  for (const o of resolveDist(p)) {
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
  for (let x = from; x <= to; x += step)
    rows.push({ x, ...classify(build(x), filter) });
  return rows;
}

// cumulativeProbability(pool, filter, {attempts}) -> closed form per category.
// Single-attempt marginal p_i (categories may overlap), then 1-(1-p_i)^k.
export function cumulativeProbability(p, filter, { attempts }) {
  const cats = normalizeFilter(filter);
  const single = cats.map(() => 0);
  for (const o of resolveDist(p)) {
    if (o.aLeaves.length === 0) continue;
    const view = flatView(o);
    cats.forEach((c, i) => { if (c.when(view)) single[i] += o.prob; });
  }
  const rows = [];
  for (let k = 1; k <= attempts; k++)
    rows.push({ attempts: k, p: single.map(pi => 1 - Math.pow(1 - pi, k)) });
  return rows;
}
