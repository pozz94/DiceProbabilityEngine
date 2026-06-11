// ================================================================
// ARCHITECTURE
//
// Everything is "WeightedOutcomes": an array of {dice: number[], prob: number}
// where dice[] preserves the physical left-to-right roll order.
//
// Pool is a lazy builder. pool._resolve(cutoff) returns WeightedOutcomes.
//
// pool[n]            → DieRef(n): a lazy reference to die n of this pool.
// dieRef.isMax/isMin → DieCondition: a lazy condition for use in .when().
// pool.when(cond, result)
//   → ConditionalPool: for each concrete outcome, if cond fires resolve to
//     result; otherwise pass the outcome through unchanged. Chain freely.
// pool.discard()     → LazyDiscard sentinel: when used as a .when() result,
//     marks the current outcome's dice as discarded.
//
// .morph(fn) is the lower-level escape hatch: iterates every concrete
// outcome, calls fn(Kept), merges results back into WeightedOutcomes.
//
// resolveToOutcomes(x) is the single conversion function that turns
// whatever the user returned (Kept, Pool, EmptyPool, number, null)
// into a WeightedOutcomes array.
// ================================================================

export const EPSILON = 1e-9;

// ----------------------------------------------------------------
// DieType
// ----------------------------------------------------------------
export class DieType {
  constructor(sides, name) {
    this.sides = sides;
    this.min = 1;
    this.max = sides;
    this.faces = Array.from({length: sides}, (_, i) => i + 1);
    this.faceProb = 1 / sides;
    this.pmf = new Map();
    for (let i = 1; i <= sides; i++) this.pmf.set(i, this.faceProb);
    this.name = name || `d${sides}`;
  }
  toString() { return this.name; }
}

// ----------------------------------------------------------------
// Custom die factory
// ----------------------------------------------------------------
export function customDie(faces, name) {
  const type = new DieType(faces.length, name || `d[${faces.join(',')}]`);
  type.faces = [...faces];
  type.min = Math.min(...faces);
  type.max = Math.max(...faces);
  type.pmf = new Map();
  for (const f of faces) type.pmf.set(f, (type.pmf.get(f) || 0) + 1/faces.length);
  type.faceProb = 1 / faces.length;
  return new Pool(type, 1);
}

// ----------------------------------------------------------------
// WeightedOutcomes helpers
// ----------------------------------------------------------------

// Precomputed factorials for multinomial coefficients (up to 200!).
const _fact = [1];
for (let i = 1; i <= 200; i++) _fact[i] = _fact[i-1] * i;

function rollPool(type, n) {
  if (n === 0) return [{dice: [], prob: 1}];
  const entries = type.pmf ? [...type.pmf.entries()] : type.faces.map(f => [f, type.faceProb]);
  const F = entries.length;

  // For uniform dice (all faces equally likely) or any dice with n > threshold,
  // enumerate multisets instead of all ordered combinations.
  // Multiset count = C(n+F-1, F-1) vs F^n — dramatically fewer for large n.
  const multisetCount = _fact[n + F - 1] / (_fact[n] * _fact[F - 1]);
  if (multisetCount < Math.pow(F, n)) {
    const outcomes = [];
    // counts[i] = how many dice show entries[i][0]
    const counts = new Array(F).fill(0);
    function rec(faceIdx, remaining) {
      if (faceIdx === F - 1) {
        counts[faceIdx] = remaining;
        // multinomial probability: n! / (c0! * c1! * ... * cF-1!) * prod(p_i ^ c_i)
        let prob = _fact[n];
        let dice = [];
        for (let i = 0; i < F; i++) {
          prob *= Math.pow(entries[i][1], counts[i]) / _fact[counts[i]];
          for (let j = 0; j < counts[i]; j++) dice.push(entries[i][0]);
        }
        outcomes.push({dice, prob});
        counts[faceIdx] = 0;
        return;
      }
      for (let c = 0; c <= remaining; c++) {
        counts[faceIdx] = c;
        rec(faceIdx + 1, remaining - c);
      }
      counts[faceIdx] = 0;
    }
    rec(0, n);
    return outcomes;
  }

  // Fallback: full ordered enumeration (needed when keep-high/keep-low is applied,
  // since those ops depend on which specific die rolled what).
  const outcomes = [];
  function recOrdered(depth, current, prob) {
    if (depth === n) { outcomes.push({dice: [...current], prob}); return; }
    for (const [f, p] of entries) { current.push(f); recOrdered(depth + 1, current, prob * p); current.pop(); }
  }
  recOrdered(0, [], 1);
  return outcomes;
}

function keepHighDice(dice, n, dir) {
  const indexed = dice.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0] || (a[1] - b[1]) * dir);
  const keep = new Set(indexed.slice(0, n).map(([, i]) => i));
  return dice.filter((_, i) => keep.has(i));
}

function keepLowDice(dice, n, dir) {
  const indexed = dice.map((v, i) => [v, i]);
  indexed.sort((a, b) => a[0] - b[0] || (a[1] - b[1]) * dir);
  const keep = new Set(indexed.slice(0, n).map(([, i]) => i));
  return dice.filter((_, i) => keep.has(i));
}

export function mergeGroups(a, b) {
  if (!a && !b) return undefined;
  const result = {...(a||{})};
  for (const [k, v] of Object.entries(b||{})) result[k] = (result[k]||0) + v;
  return result;
}

function mergeWeighted(parts) {
  const result = [];
  for (const {outcomes, weight} of parts) {
    if (weight < EPSILON) continue;
    for (const {dice, types, pools, groups, prob} of outcomes) {
      result.push({dice, types, pools, groups, prob: prob * weight});
    }
  }
  return result;
}

export function toPMF(outcomes) {
  const pmf = new Map();
  for (const {dice, prob} of outcomes) {
    const s = dice.reduce((a, b) => a + b, 0);
    pmf.set(s, (pmf.get(s) || 0) + prob);
  }
  return pmf;
}

export function groupContributions(outcomes) {
  const sums = {};
  for (const {prob, groups} of outcomes) {
    if (!groups) continue;
    for (const [name, val] of Object.entries(groups)) {
      sums[name] = (sums[name] || 0) + val * prob;
    }
  }
  return sums;
}

// ----------------------------------------------------------------
// resolveToOutcomes
// ----------------------------------------------------------------
function resolveToOutcomes(value, type, cutoff) {
  if (typeof value === 'function' && value.dice) {
    const out = value._toOutcome ? value._toOutcome() : {dice: value.dice, types: value._types, prob: 1};
    if (value._groups) out.groups = mergeGroups(value._groups, out.groups);
    return [out];
  }
  if (value instanceof SelfRefPlaceholder) return [{dice: ['__SELFREF__'], prob: 1}];
  if (value instanceof EmptyPool)          return [{dice: [], prob: 1}];
  if (value instanceof DiscardedPool)      return value._resolve(cutoff);
  if (value instanceof Pool)               return value._resolve(cutoff);
  if (value === null || value === undefined) return [{dice: [], prob: 1}];
  if (typeof value === 'number')           return [{dice: value === 0 ? [] : [value], prob: 1}];
  if (Array.isArray(value))               return value;
  return [{dice: [], prob: 1}];
}

function resolveAddIntent(intent, type, cutoff) {
  if (_mode === 'roll') {
    let allDice = [...intent.baseDice];
    let allTypes = [...(intent.baseTypes||[])];
    const basePools = intent._sourcePools ||
      [{dice: intent.baseDice.map((v,i) => ({v, t:(intent.baseTypes||[])[i]||type, discarded:false}))}];
    const extraPools = [];
    for (const {pool, name} of (intent.additions||[])) {
      const [out] = pool._resolve(cutoff);
      allDice = [...allDice, ...out.dice];
      allTypes = [...allTypes, ...(out.types||[])];
      const entry = {};
      if (name) entry.name = name;
      const outPools = out.pools || [];
      if (outPools.length >= 1) {
        entry.dice = outPools[0].dice || out.dice.map((v,i)=>({v,t:(out.types||[])[i],discarded:false}));
        if (outPools.length > 1) entry.pools = outPools.slice(1);
      } else {
        entry.dice = out.dice.map((v,i)=>({v,t:(out.types||[])[i],discarded:false}));
      }
      extraPools.push(entry);
    }
    return [{ dice: allDice, types: allTypes, pools: [...basePools, ...extraPools], prob: 1 }];
  }
  const SR = '__SELFREF__';
  let results = [{ dice: [...intent.baseDice], types: [...intent.baseTypes], groups: intent._baseGroups, prob: 1 }];
  for (const {pool: addPool, name: poolName} of (intent.additions||[])) {
    const addedOutcomes = addPool._resolve(cutoff);
    const next = [];
    for (const {dice:d1, types:t1, groups:g1, prob:p1} of results) {
      for (const {dice:d2, types:t2, groups:g2, prob:p2} of addedOutcomes) {
        const hasSR = d2.includes(SR);
        const bSum = hasSR ? 0 : d2.reduce((a,b) => a+b, 0);
        const addedGroups = poolName ? {[poolName]: bSum, ...(g2||{})} : (g2||undefined);
        next.push({
          dice: [...d1, ...(hasSR ? [SR] : d2)],
          types: [...t1, ...(hasSR ? [] : (t2||[]))],
          groups: mergeGroups(g1, addedGroups),
          prob: p1*p2
        });
      }
    }
    results = next;
  }
  return results;
}

// ----------------------------------------------------------------
// Kept: what fn receives inside .morph(kept => ...)
// ----------------------------------------------------------------
function makeKept(dice, type, cutoff) {
  const types = Array.isArray(type) ? type : dice.map(() => type);

  function kept() { return kept; }
  kept.dice = dice;
  kept._types = types;
  kept._cutoff = cutoff;
  kept._toOutcome = () => ({
    dice,
    types,
    pools: [{ dice: dice.map((v,i) => ({v, t:types[i], discarded:false})) }],
    prob: 1
  });

  Object.defineProperty(kept, 'size',    { get: () => dice.length });
  Object.defineProperty(kept, 'sum',     { get: () => dice.reduce((a, b) => a + b, 0) });
  Object.defineProperty(kept, 'highest', { get: () => Math.max(...dice) });
  Object.defineProperty(kept, 'lowest',  { get: () => Math.min(...dice) });

  Object.defineProperty(kept, 'isMax', { get: () => types.reduce((p, t) => p * (1/t.sides), 1) });
  Object.defineProperty(kept, 'isMin', { get: () => types.reduce((p, t) => p * (1/t.sides), 1) });

  Object.defineProperty(kept, 'die', { get: () => {
    const u = [...new Set(types.map(t => t.sides))];
    if (u.length > 1) throw new Error(`Pool is mixed (${types.map(t=>'d'+t.sides).join(',')}) — use kept[i].die instead`);
    return types[0];
  }});

  Object.defineProperty(kept, 'max', { get: () => {
    _logs.push(`⚠ Warning: .max on a pool is ambiguous. Did you mean .isMax (probability) or .highest (concrete value)?`);
    return undefined;
  }});
  Object.defineProperty(kept, 'min', { get: () => {
    _logs.push(`⚠ Warning: .min on a pool is ambiguous. Did you mean .isMin (probability) or .lowest (concrete value)?`);
    return undefined;
  }});

  Object.defineProperty(kept, 'leftmost',  { get: () => kept[0] });
  Object.defineProperty(kept, 'rightmost', { get: () => kept[dice.length - 1] });

  for (let i = 0; i < dice.length; i++) {
    kept[i] = new BranchValue(dice[i], types[i], dice, cutoff);
  }
  kept[-1] = kept[dice.length - 1];

  kept.at = (i) => kept[i];
  kept.discard = () => new DiscardedPool(dice, types);
  kept.addDice = (poolOrN, poolName) => {
    if (typeof poolOrN === 'number' && poolOrN === 0) return kept;
    if (Array.isArray(poolOrN)) return kept.addDice(coercePool(poolOrN), poolName);
    const p = typeof poolOrN === 'function' ? new LazyPool(poolOrN, types[0])
            : poolOrN instanceof LazyPool ? poolOrN
            : poolOrN instanceof Pool ? new LazyPool(() => poolOrN, poolOrN.type)
            : null;
    if (!p) throw new Error('kept.addDice() expects a Pool, array of Pools, or function');
    const ai = new AddIntent(dice, types, kept._groups);
    ai.additions = [{pool: p, name: poolName||null}];
    ai._sourcePools = kept._toOutcome ? kept._toOutcome().pools : null;
    return ai;
  };
  kept.addBonus = (n, poolName) => n ? kept.addDice(customDie([n], `+${n}`), poolName || `+${n}`) : kept;
  return kept;
}

// ----------------------------------------------------------------
// DieRef / DieCondition — pool[n].isMax / pool[n].isMin
// ----------------------------------------------------------------
export class DieRef {
  constructor(index) { this._index = index; }
  get isMax() { return new DieCondition(this._index, 'max'); }
  get isMin() { return new DieCondition(this._index, 'min'); }
}

export class DieCondition {
  constructor(index, type) { this._index = index; this._type = type; }
  test(dice, types) {
    const i = this._index < 0 ? dice.length + this._index : this._index;
    if (i < 0 || i >= dice.length) return false;
    const t = Array.isArray(types) ? types[i] : types;
    if (!t) return false;
    return this._type === 'max' ? dice[i] === t.max : dice[i] === t.min;
  }
}

// Sentinel returned by pool.discard() — ConditionalPool handles it specially.
class LazyDiscard {}

// ----------------------------------------------------------------
// TaggedProb
// ----------------------------------------------------------------
class TaggedProb {
  constructor(prob, face) { this.prob = prob; this.face = face; }
  valueOf() { return this.prob; }
  toString() { return String(this.prob); }
}

// ----------------------------------------------------------------
// BranchValue
// ----------------------------------------------------------------
class BranchValue {
  constructor(value, type, dice, cutoff) {
    this._value = value; this._type = type; this._dice = dice; this._cutoff = cutoff;
    this._parts = []; this._remaining = 1.0;
    this.die = type;
    this.isMax = new TaggedProb(1 / type.sides, type.max);
    this.isMin = new TaggedProb(1 / type.sides, type.min);
  }

  when(trigger, fnOrVal) {
    if (this._remaining <= 0) return this;
    if (typeof trigger === 'boolean') {
      _logs.push(`⚠ Warning: .when() received a boolean. Did you mean .when(kept[i].isMax)?`);
      return this;
    }
    let weight;
    if (trigger instanceof TaggedProb) {
      weight = (this._value === trigger.face) ? 1 : 0;
    } else if (typeof trigger === 'number') {
      weight = trigger === 0 ? 0 : Math.min(trigger, this._remaining);
    } else {
      weight = 0;
    }
    const effective = weight * this._remaining;
    this._remaining -= effective;
    if (effective > 0) this._parts.push({ fnOrVal, weight: effective });
    return this;
  }

  _resolveVal(fnOrVal) {
    const result = fnOrVal === null             ? new EmptyPool()
                 : typeof fnOrVal === 'function' ? fnOrVal()
                 : fnOrVal;
    return resolveToOutcomes(result, this._type, this._cutoff);
  }

  otherwise(fnOrVal) {
    if (this._remaining > 0) this._parts.push({ fnOrVal, weight: this._remaining });
    if (_mode === 'roll') {
      const matched = this._parts.find(p => p.weight === 1) || this._parts[this._parts.length - 1];
      return this._resolveVal(matched.fnOrVal);
    }
    const merged = [];
    for (const { fnOrVal: v, weight: w } of this._parts) {
      if (w <= 0) continue;
      for (const { dice, types, allDice, groups, prob } of this._resolveVal(v))
        merged.push({ dice, types, allDice, groups, prob: prob * w });
    }
    return merged;
  }
}

// ----------------------------------------------------------------
// Pool tree helpers
// ----------------------------------------------------------------
function flattenPools(pools) {
  const result = [];
  for (const pool of (pools || [])) {
    for (const d of (pool.dice || [])) result.push(d);
    if (pool.pools) result.push(...flattenPools(pool.pools));
  }
  return result;
}

function rebuildPools(pools, flat) {
  let idx = 0;
  function rebuild(pool) {
    const newDice = (pool.dice || []).map(() => flat[idx++]);
    const newSubPools = (pool.pools || []).map(rebuild);
    const entry = {};
    if (pool.name) entry.name = pool.name;
    entry.dice = newDice;
    if (newSubPools.length) entry.pools = newSubPools;
    return entry;
  }
  return pools.map(rebuild);
}

// ----------------------------------------------------------------
// Pool
// ----------------------------------------------------------------
export class Pool {
  constructor(type, n) {
    this.type = type;
    this._n = n;
    this._ops = [];
  }

  get size() {
    let s = this._n;
    for (const {op, args} of this._ops) {
      if (op === 'keepHigh' || op === 'keepLow') s = args[0];
    }
    return s;
  }

  addDice(poolOrN, poolOrName, maybeName) {
    // Conditional overload: addDice(DieCondition, pool, name?)
    // Adds pool to the current concrete outcome only when condition fires.
    if (poolOrN instanceof DieCondition) {
      const aw = new AddWhenPool(this, poolOrN, coercePool(poolOrName));
      if (maybeName) aw.poolName = maybeName;
      return aw;
    }
    const poolName = poolOrName;
    if (Array.isArray(poolOrN)) return this.addDice(coercePool(poolOrN), poolName);
    if (typeof poolOrN === 'function') { const c = new ConcatPool(this, new LazyPool(poolOrN, this.type)); c.poolName = poolName||null; return c; }
    if (poolOrN instanceof EmptyPool) return this;
    if (poolOrN instanceof Pool) { const c = new ConcatPool(this, poolOrN); c.poolName = poolName||null; return c; }
    if (typeof poolOrN === 'number') {
      if (poolOrN === 0) return this;
      if (poolName) {
        const extra = new Pool(this.type, Math.round(poolOrN));
        const c = new ConcatPool(this, extra);
        c.poolName = poolName;
        return c;
      }
      return new Pool(this.type, this._n + Math.round(poolOrN));
    }
    throw new Error('addDice expects a Pool, array of Pools, function, or number');
  }

  keepHigh(n, dir = 1) {
    const self = this[UNWRAP] ?? this;
    const p = Object.create(Object.getPrototypeOf(self));
    Object.assign(p, self);
    p._ops = [...(self._ops||[]), {op: 'keepHigh', args: [n, dir]}];
    p._keepN = n;
    return p;
  }

  keepLow(n, dir = 1) {
    const self = this[UNWRAP] ?? this;
    const p = Object.create(Object.getPrototypeOf(self));
    Object.assign(p, self);
    p._ops = [...(self._ops||[]), {op: 'keepLow', args: [n, dir]}];
    p._keepN = n;
    return p;
  }

  addBonus(n, poolName) {
    if (!n) return this;
    return this.addDice(customDie([n], `+${n}`), poolName || `+${n}`);
  }

  when(condition, result) {
    if (result === undefined) return new ConditionalBuilder(this, condition);
    return new ConditionalPool(this, condition, result);
  }

  discard() {
    return new LazyDiscard();
  }

  morph(fn) {
    return new ThenPool(this, fn);
  }

  _applyKeepOps(pools) {
    if (!this._ops || !this._ops.some(o => o.op === 'keepHigh' || o.op === 'keepLow')) return pools;
    let flat = flattenPools(pools);
    for (const {op, args} of this._ops) {
      if (op === 'keepHigh' || op === 'keepLow') {
        const indexed = flat.map((d, i) => ({...d, i}));
        indexed.sort(op === 'keepHigh'
          ? (a, b) => b.v - a.v || (a.i - b.i) * (args[1]||1)
          : (a, b) => a.v - b.v || (a.i - b.i) * (args[1]||1));
        const keepIdx = new Set(indexed.slice(0, args[0]).map(x => x.i));
        flat = flat.map((d, i) => ({...d, discarded: !keepIdx.has(i)}));
      }
    }
    return rebuildPools(pools, flat);
  }

  _sample() {
    const rolledDice = Array.from({length: this._n}, () => sampleDie(this.type));
    const rolledTypes = Array.from({length: this._n}, () => this.type);
    const pairs = rolledDice.map((v, i) => ({v, t: rolledTypes[i], discarded: false}));
    const basePools = [{dice: pairs}];
    const markedPools = this._applyKeepOps(basePools);
    const flat = flattenPools(markedPools);
    const kept = flat.filter(d => !d.discarded);
    return [{
      dice: kept.map(d => d.v),
      types: kept.map(d => d.t),
      pools: markedPools,
      prob: 1
    }];
  }

  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') return this._sample();
    let outcomes = rollPool(this.type, this._n);
    for (const {op, args} of this._ops) {
      if (op === 'keepHigh') {
        outcomes = outcomes.map(({dice, prob}) => ({dice: keepHighDice(dice, ...args), prob}));
      } else if (op === 'keepLow') {
        outcomes = outcomes.map(({dice, prob}) => ({dice: keepLowDice(dice, ...args), prob}));
      }
    }
    return outcomes;
  }

  toPMF(cutoff = EPSILON) { return toPMF(this._resolve(cutoff)); }
}

// pool[0]..pool[15] and pool[-1] return DieRef(n) for use in .when() conditions.
for (let i = 0; i < 16; i++) {
  Object.defineProperty(Pool.prototype, String(i), {
    get() { return new DieRef(i); }, configurable: true, enumerable: false,
  });
}
Object.defineProperty(Pool.prototype, '-1', {
  get() { return new DieRef(-1); }, configurable: true, enumerable: false,
});

// ----------------------------------------------------------------
// Global mode + sampling
// ----------------------------------------------------------------
export let _mode = 'stats';
export let _logs = [];
export let _pendingKeys = new Map();
export let _resolvedCache = new Map();
export let _lazyPoolId = 0;

export function resetEngineState() {
  _mode = 'stats';
  _pendingKeys.clear();
  _resolvedCache.clear();
  _lazyPoolId = 0;
}

function samplePMF(entries) {
  const r = Math.random();
  let cum = 0;
  for (const [v, p] of entries) { cum += p; if (r < cum) return v; }
  return entries[entries.length - 1][0];
}

function sampleDie(type) {
  return samplePMF([...type.pmf.entries()]);
}

function poolStructureKey(pool) {
  if (pool instanceof ConditionalPool) return `when(${poolStructureKey(pool._source)})`;
  if (pool instanceof AddWhenPool)     return `addWhen(${poolStructureKey(pool._source)})`;
  if (pool instanceof ThenPool)        return `morph(${poolStructureKey(pool._source)})`;
  if (pool instanceof ConcatPool)      return `cat(${poolStructureKey(pool._a)},${poolStructureKey(pool._b)})`;
  if (pool instanceof EmptyPool)       return `empty`;
  if (pool instanceof LazyPool)        return `lazy`;
  return `pool(d${pool.type.sides},n${pool._n},[${pool._ops.map(o=>o.op+o.args).join(',')}])`;
}

// ----------------------------------------------------------------
// AddIntent
// ----------------------------------------------------------------
class AddIntent extends Pool {
  constructor(baseDice, baseTypes, baseGroups) {
    const type = (baseTypes && baseTypes[0]) || new DieType(6);
    super(type, baseDice.length);
    this.baseDice = baseDice;
    this.baseTypes = baseTypes || [];
    this.additions = [];
    this._baseGroups = baseGroups || undefined;
  }
  _add(pool, name) {
    const ai = new AddIntent(this.baseDice, this.baseTypes, this._baseGroups);
    const lazy = pool instanceof LazyPool ? pool : new LazyPool(() => pool, pool.type);
    ai.additions = [...this.additions, {pool: lazy, name: name||null}];
    return ai;
  }
  addDice(poolOrN, poolName) {
    const p = typeof poolOrN === 'function' ? new LazyPool(poolOrN, this.type)
            : poolOrN instanceof Pool ? poolOrN
            : customDie([poolOrN]);
    return this._add(p, poolName);
  }
  addBonus(n, name) { return n ? this.addDice(customDie([n], `+${n}`), name||`+${n}`) : this; }
  _resolve(cutoff = EPSILON) { return resolveAddIntent(this, this.type, cutoff); }
  toPMF(cutoff = EPSILON) { return toPMF(this._resolve(cutoff)); }
}

// ----------------------------------------------------------------
// LazyPool
// ----------------------------------------------------------------
class LazyPool extends Pool {
  constructor(fn, type) {
    super(type || new DieType(6), 0);
    this._fn = fn;
    this._cache = null;
    this._id = ++_lazyPoolId;
  }
  _materialize() {
    if (!this._cache) this._cache = this._fn();
    return this._cache;
  }
  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') return this._materialize()._resolve(cutoff);
    const structKey = poolStructureKey(this._materialize());
    if (_pendingKeys.has(structKey)) return _pendingKeys.get(structKey)._resolve();
    const placeholder = new SelfRefPlaceholder(this.type);
    _pendingKeys.set(structKey, placeholder);
    const raw = this._materialize()._resolve(cutoff);
    _pendingKeys.delete(structKey);
    const hasSelfRef = raw.some(({dice}) => dice.includes('__SELFREF__'));
    return hasSelfRef ? fixPointWithGroups(raw, this.type) : raw;
  }
  get size() { return this._materialize().size; }
  addDice(x, y, z) { return this._materialize().addDice(x, y, z); }
  keepHigh(n, dir=1) { return this._materialize().keepHigh(n, dir); }
  keepLow(n, dir=1) { return this._materialize().keepLow(n, dir); }
  morph(fn) { return this._materialize().morph(fn); }
}

// ----------------------------------------------------------------
// ConditionalPool — pool.when(condition, result)
// For each concrete outcome: if condition fires, resolve to result;
// otherwise pass the outcome through unchanged.
// ----------------------------------------------------------------
class ConditionalPool extends Pool {
  constructor(source, condition, result) {
    super(source.type, source.size);
    this._source = source;
    this._condition = condition;
    this._result = result;
  }

  _test(dice, types) {
    const c = this._condition;
    if (c instanceof DieCondition) return c.test(dice, types);
    if (typeof c === 'function')   return c(dice, types);
    return false;
  }

  _applyResult(dice, types, srcPools, cutoff) {
    if (this._result instanceof LazyDiscard) {
      if (_mode === 'roll') {
        return [{
          dice:  [],
          types: [],
          pools: [{dice: dice.map((v, i) => ({v, t: types[i], discarded: true}))}],
          prob:  1,
        }];
      }
      return [{dice: [], prob: 1}];
    }
    return resolveToOutcomes(this._result, this.type, cutoff);
  }

  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') {
      const [{dice, types, pools: srcPools}] = this._source._resolve();
      const eff = Array.isArray(types) ? types : dice.map(() => this.type);
      if (this._test(dice, eff)) return this._applyResult(dice, eff, srcPools, cutoff);
      return [{dice, types: eff, pools: srcPools, prob: 1}];
    }

    const parts = [];
    for (const {dice, types, pools: srcPools, prob, groups} of this._source._resolve(cutoff)) {
      if (prob < EPSILON) continue;
      const eff = Array.isArray(types) ? types : dice.map(() => this.type);
      const resolved = this._test(dice, eff)
        ? this._applyResult(dice, eff, srcPools, cutoff)
        : [{dice, types: eff, pools: srcPools, groups, prob: 1}];
      parts.push({outcomes: resolved, weight: prob});
    }
    const raw = mergeWeighted(parts);
    const hasSelfRef = raw.some(({dice}) => dice.includes('__SELFREF__'));
    return hasSelfRef ? fixPointWithGroups(raw, this.type) : raw;
  }
}

// ----------------------------------------------------------------
// AddWhenPool — pool.addWhen(condition, extra)
// Adds the extra pool's dice ON TOP of the current concrete outcome
// when condition fires, rather than replacing the outcome.
// ----------------------------------------------------------------
class AddWhenPool extends Pool {
  constructor(source, condition, extra) {
    super(source.type, source.size);
    this._source = source;
    this._condition = condition;
    this._extra = extra;
  }

  _test(dice, types) {
    const c = this._condition;
    if (c instanceof DieCondition) return c.test(dice, types);
    if (typeof c === 'function')   return c(dice, types);
    return false;
  }

  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') {
      const [{dice, types, pools: srcPools}] = this._source._resolve();
      const eff = Array.isArray(types) ? types : dice.map(() => this.type);
      if (!this._test(dice, eff)) return [{dice, types: eff, pools: srcPools, prob: 1}];
      const [{dice: xd, types: xt, pools: xPools}] = resolveToOutcomes(this._extra, this.type, cutoff);
      let newPools;
      if (this.poolName) {
        const entry = {name: this.poolName};
        if (xPools && xPools.length) { entry.dice = xPools[0].dice || []; if (xPools.length > 1) entry.pools = xPools.slice(1); }
        newPools = [...(srcPools||[]), entry];
      } else {
        newPools = [...(srcPools||[]), ...(xPools||[])];
      }
      return [{dice: [...dice, ...xd], types: [...eff, ...(Array.isArray(xt) ? xt : xd.map(() => this.type))], pools: newPools, prob: 1}];
    }

    const parts = [];
    for (const {dice, types, pools: srcPools, prob, groups} of this._source._resolve(cutoff)) {
      if (prob < EPSILON) continue;
      const eff = Array.isArray(types) ? types : dice.map(() => this.type);
      if (!this._test(dice, eff)) {
        parts.push({outcomes: [{dice, types: eff, pools: srcPools, groups, prob: 1}], weight: prob});
        continue;
      }
      const xOutcomes = resolveToOutcomes(this._extra, this.type, cutoff);
      const combined = xOutcomes.map(({dice: xd, types: xt, prob: xp, groups: xg}) => ({
        dice:   [...dice, ...xd],
        types:  [...eff, ...(Array.isArray(xt) ? xt : xd.map(() => this.type))],
        prob:   xp,
        groups: (groups || xg) ? {...(groups||{}), ...(xg||{})} : undefined,
      }));
      parts.push({outcomes: combined, weight: prob});
    }
    const raw = mergeWeighted(parts);
    const hasSelfRef = raw.some(({dice}) => dice.includes('__SELFREF__'));
    return hasSelfRef ? fixPointWithGroups(raw, this.type) : raw;
  }
}

// ----------------------------------------------------------------
// ThenPool
// ----------------------------------------------------------------
class ThenPool extends Pool {
  constructor(source, fn) {
    super(source.type, source.size);
    this._source = source;
    this._fn = fn;
  }

  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') {
      const [{dice, types, pools}] = this._source._resolve();
      const kept = makeKept(dice, types || dice.map(() => this.type), cutoff);
      if (pools && pools.length) kept._toOutcome = () => ({dice, types, pools, prob: 1});
      const result = this._fn(kept);
      return resolveToOutcomes(result, this.type, cutoff);
    }
    const sourceOutcomes = this._source._resolve(cutoff);
    const parts = [];
    for (const {dice, prob, groups: sourceGroups} of sourceOutcomes) {
      if (prob < EPSILON) continue;
      const kept = makeKept(dice, this.type, cutoff);
      kept._groups = sourceGroups;
      const result = this._fn(kept);
      const resolved = resolveToOutcomes(result, this.type, cutoff);
      parts.push({outcomes: resolved, weight: prob});
    }
    const raw = mergeWeighted(parts);
    const hasSelfRef = raw.some(({dice}) => dice.includes('__SELFREF__'));
    return hasSelfRef ? fixPointWithGroups(raw, this.type) : raw;
  }
}

// ----------------------------------------------------------------
// ConcatPool
// ----------------------------------------------------------------
class ConcatPool extends Pool {
  constructor(a, b) {
    super(a.type, 0);
    this._a = a;
    this._b = b;
  }
  get size() { return this._a.size + this._b.size; }
  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') {
      const [a] = this._a._resolve();
      const [b] = this._b._resolve();
      const bPools = b.pools || [];
      let newPools;
      if (this.poolName) {
        const entry = { name: this.poolName };
        if (bPools.length >= 1) {
          entry.dice = bPools[0].dice || [];
          if (bPools.length > 1) entry.pools = bPools.slice(1);
        }
        newPools = [...(a.pools||[]), entry];
      } else {
        newPools = [...(a.pools||[]), ...bPools];
      }
      if (this._ops && this._ops.length) newPools = this._applyKeepOps(newPools);
      const flat = flattenPools(newPools);
      const kept = flat.filter(d => !d.discarded);
      return [{
        dice: kept.map(d => d.v),
        types: kept.map(d => d.t),
        pools: newPools,
        prob: 1
      }];
    }
    const aOut = this._a._resolve(cutoff);
    const bOut = this._b._resolve(cutoff);
    const result = [];
    for (const {dice: da, prob: pa, groups: ga} of aOut) {
      for (const {dice: db, prob: pb, groups: gb} of bOut) {
        const groups = {...(ga||{}), ...(gb||{})};
        if (this.poolName) {
          const bSum = db.reduce((a,b) => a+b, 0);
          groups[this.poolName] = (groups[this.poolName] || 0) + bSum;
        }
        result.push({
          dice: [...da, ...db],
          prob: pa * pb,
          groups: Object.keys(groups).length ? groups : undefined
        });
      }
    }
    return result;
  }
}

// ----------------------------------------------------------------
// Special pool types
// ----------------------------------------------------------------
class EmptyPool extends Pool {
  constructor() { super(new DieType(6), 0); }
  _resolve() { return [{dice: [], prob: 1}]; }
}

class DiscardedPool extends Pool {
  constructor(dice, types) {
    super((types&&types[0]) || new DieType(6), 0);
    this._dice = dice;
    this._types = types || [];
  }
  _resolve(cutoff = EPSILON) {
    if (_mode === 'roll') {
      return [{
        dice: [],
        types: [],
        pools: [{ dice: this._dice.map((v, i) => ({v, t: this._types[i], discarded: true})) }],
        prob: 1
      }];
    }
    return [{dice: [], prob: 1}];
  }
}

class SelfRefPlaceholder extends Pool {
  constructor(type) { super(type || new DieType(6), 0); }
  _resolve() { return [{dice: ['__SELFREF__'], prob: 1}]; }
}

// ----------------------------------------------------------------
// ConditionalBuilder — returned by pool.when(cond) (single-arg form)
// Captures a condition then applies the next chained operation:
//   false/null/undefined  → skip (return pool unchanged)
//   DieCondition          → runtime conditional via AddWhenPool or ConditionalPool
//   other truthy          → apply unconditionally
// ----------------------------------------------------------------
class ConditionalBuilder {
  constructor(pool, cond) {
    this._pool = pool;
    this._cond = cond;
  }

  _isFalsy() { return this._cond === false || this._cond === null || this._cond === undefined; }

  keepHigh(n) {
    if (this._isFalsy()) return this._pool;
    return this._pool.keepHigh(n);
  }

  keepLow(n) {
    if (this._isFalsy()) return this._pool;
    return this._pool.keepLow(n);
  }

  addDice(extra, name) {
    if (this._isFalsy()) return this._pool;
    if (this._cond instanceof DieCondition) return this._pool.addDice(this._cond, extra, name);
    return this._pool.addDice(extra, name);
  }

  addBonus(n, name) {
    if (this._isFalsy()) return this._pool;
    if (this._cond instanceof DieCondition)
      return this._pool.addDice(this._cond, new Pool(this._pool.type, 0).addBonus(n, name));
    return this._pool.addBonus(n, name);
  }

  discard() {
    if (this._isFalsy()) return this._pool;
    if (this._cond instanceof DieCondition) return this._pool.when(this._cond, this._pool.discard());
    return this._pool.when(() => true, this._pool.discard());
  }

  when(cond, result) {
    if (result !== undefined) {
      if (this._isFalsy()) return this._pool;
      return this._pool.when(cond, result);
    }
    // Single-arg chaining: combine conditions
    if (this._isFalsy() || cond === false || cond === null || cond === undefined)
      return new ConditionalBuilder(this._pool, false);
    if (this._cond instanceof DieCondition) return new ConditionalBuilder(this._pool, this._cond);
    if (cond instanceof DieCondition)       return new ConditionalBuilder(this._pool, cond);
    return new ConditionalBuilder(this._pool, true);
  }
}

// ----------------------------------------------------------------
// PMF arithmetic for fixPoint
// ----------------------------------------------------------------
function convolvePMF(a, b) {
  const out = new Map();
  for (const [va, pa] of a)
    for (const [vb, pb] of b)
      out.set(va + vb, (out.get(va + vb) || 0) + pa * pb);
  return out;
}

function addPMF(a, b) {
  const out = new Map(a);
  for (const [v, p] of b) out.set(v, (out.get(v) || 0) + p);
  return out;
}

// Solve X = A + B⊛X via geometric series (for recursive pool expressions)
function fixPoint(outcomes) {
  const normalOutcomes = [];
  const selfrefOutcomes = [];
  for (const {dice, prob} of outcomes) {
    const selfrefIdx = dice.indexOf('__SELFREF__');
    if (selfrefIdx === -1) {
      normalOutcomes.push({dice, prob});
    } else {
      const baseDice = dice.filter((_, i) => i !== selfrefIdx);
      selfrefOutcomes.push({baseDice, prob});
    }
  }
  if (selfrefOutcomes.length === 0) return toPMF(normalOutcomes);
  let A = toPMF(normalOutcomes);
  let B = new Map();
  let totalSelfRefProb = 0;
  for (const {baseDice, prob} of selfrefOutcomes) {
    const s = baseDice.reduce((a, b) => a + b, 0);
    B.set(s, (B.get(s) || 0) + prob);
    totalSelfRefProb += prob;
  }
  let X = new Map();
  let Bk = new Map([[0, 1]]);
  let power = 1;
  for (let k = 0; k < 200; k++) {
    if (power < 1e-15) break;
    X = addPMF(X, convolvePMF(Bk, A));
    Bk = convolvePMF(Bk, B);
    power *= totalSelfRefProb;
  }
  return X;
}

function fixPointWithGroups(raw, type) {
  const pmf = fixPoint(raw);
  const gs = {};
  let totalSRProb = 0;
  for (const {dice, prob, groups} of raw) {
    if (dice.includes('__SELFREF__')) { totalSRProb += prob; continue; }
    if (!groups) continue;
    for (const [k, v] of Object.entries(groups)) gs[k] = (gs[k]||0) + v * prob;
  }
  const scale = totalSRProb < 1 ? 1 / (1 - totalSRProb) : 1;
  const hasGroups = Object.keys(gs).length > 0;
  const scaledGs = hasGroups ? Object.fromEntries(Object.entries(gs).map(([k,v]) => [k, v * scale])) : undefined;
  return [...pmf.entries()].map(([v, p]) => ({
    dice: v === 0 ? [] : [v],
    prob: p,
    groups: scaledGs
  }));
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------
// Wrap a Pool so it can also be called as a function:
//   d6(3)  →  3 dice of the same type  (i.e. d6.addDice(2))
// The Proxy target must itself be a function for the apply trap to fire.
const UNWRAP = Symbol('callablePool.unwrap');

function callablePool(p) {
  const fn = function(n = 1) {
    return n === 1 ? p : p.addDice(n - 1);
  };
  return new Proxy(fn, {
    apply(_target, _thisArg, args) { return fn(...args); },
    get(_target, prop, _receiver)  { return prop === UNWRAP ? p : Reflect.get(p, prop, p); },
    has(_target, prop)             { return prop in p; },
    getPrototypeOf()               { return Object.getPrototypeOf(p); },
  });
}

export function die(sides, name) {
  return callablePool(new Pool(new DieType(sides, name), 1));
}

export function pool(x, n) {
  if (Array.isArray(x)) {
    if (x.length === 0) return new EmptyPool();
    return x.map(p => pool(p)).reduce((acc, p) => new ConcatPool(acc, p));
  }
  // Unwrap CallablePool proxies to get the underlying Pool instance.
  if (x && x[UNWRAP]) return x[UNWRAP];
  if (x instanceof Pool) return x;
  if (x instanceof DieType) return new Pool(x, n || 1);
  if (!x) return new EmptyPool();
  return new EmptyPool();
}

export const coercePool = pool;

export function poolBuilder(fn) {
  return function(base, ...rest) {
    const p = pool(base);
    return new LazyPool(() => fn(p, ...rest));
  };
}

function defaultKey(args) {
  return args.map(a =>
    a instanceof Pool ? `pool(${a.type.sides},${a._n})` :
    typeof a === 'function' ? 'fn' :
    String(a)
  ).join('|');
}

export function memoize(fn, keyFn) {
  const cache = new Map();
  return function(...args) {
    const key = keyFn ? keyFn(...args) : defaultKey(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

export function pmfStats(pmf) {
  const sorted = [...pmf.entries()].sort((a, b) => a[0] - b[0]);
  let mean = 0, tot = 0;
  for (const [v, p] of sorted) { mean += v * p; tot += p; }
  mean /= tot;
  let variance = 0;
  for (const [v, p] of sorted) variance += p * (v - mean) ** 2;
  let cum = 0, median = sorted[0][0], mode = sorted[0][0], modeP = 0, firstMedian = true;
  for (const [v, p] of sorted) {
    cum += p;
    if (p > modeP) { modeP = p; mode = v; }
    if (firstMedian && cum >= 0.5 - 1e-9) { median = v; firstMedian = false; }
  }
  function pct(q) {
    let c = 0;
    for (const [v, p] of sorted) { c += p; if (c >= q - 1e-9) return v; }
    return sorted[sorted.length - 1][0];
  }
  return {
    mean, median, mode, stddev: Math.sqrt(variance),
    min: sorted[0][0], max: sorted[sorted.length - 1][0],
    p10: pct(0.1), p25: pct(0.25), p75: pct(0.75), p90: pct(0.9),
    sorted
  };
}

export function stats(p) {
  _mode = 'stats';
  p = coercePool(p);
  const outcomes = p._resolve();
  const pmf = toPMF(outcomes);
  const s = pmfStats(pmf);
  s.outcomes = outcomes;
  s.groups = groupContributions(outcomes);
  const namedSum = Object.values(s.groups).reduce((a,b)=>a+b,0);
  if (namedSum > 0.001) {
    const baseContrib = +(s.mean - namedSum).toFixed(6);
    if (Math.abs(baseContrib) > 0.001) {
      s.groups = {base: baseContrib, ...s.groups};
    }
  }
  s.groupStarts = {};
  for (const {dice, prob, groups} of outcomes) {
    if (!groups || prob < EPSILON) continue;
    const total = dice.reduce((a,b)=>a+b,0);
    for (const name of Object.keys(groups)) {
      if (s.groupStarts[name] === undefined || total < s.groupStarts[name])
        s.groupStarts[name] = total;
    }
  }
  s.groupParent = {};
  const gNames = Object.keys(s.groups);
  for (const child of gNames) {
    let bestParent = null;
    for (const parent of gNames) {
      if (parent === child) continue;
      let parentWithoutChild = false;
      let childWithoutParent = false;
      for (const {prob, groups} of outcomes) {
        if (!groups || prob < EPSILON) continue;
        if (groups[parent] !== undefined && groups[child] === undefined) parentWithoutChild = true;
        if (groups[child] !== undefined && groups[parent] === undefined) childWithoutParent = true;
        if (parentWithoutChild && childWithoutParent) break;
      }
      if (parentWithoutChild && !childWithoutParent) {
        if (!bestParent || (s.groupStarts[parent] ?? 0) > (s.groupStarts[bestParent] ?? 0))
          bestParent = parent;
      }
    }
    if (bestParent) s.groupParent[child] = bestParent;
  }
  return s;
}

export function roll(p) {
  p = coercePool(p);
  _mode = 'roll';
  const outcomes = p._resolve();
  _mode = 'stats';
  const {dice, pools} = outcomes[0];

  function fmtDice(arr) {
    return (arr||[]).map(({v, t, discarded}) => ({
      name: t ? t.name : null, rolled: v, discarded: !!discarded
    }));
  }

  function buildPool(q) {
    const entry = {};
    if (q.name) entry.name = q.name;
    if (q.dice) entry.dice = fmtDice(q.dice);
    if (q.pools && q.pools.length) entry.pools = q.pools.map(buildPool);
    return entry;
  }

  return {
    pools: (pools||[]).map(buildPool),
    total: dice.reduce((a,b) => a+b, 0)
  };
}
