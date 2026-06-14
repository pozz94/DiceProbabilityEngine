# DiceScript — Engine Specification

The **engine** is the core of DiceScript: pool semantics and the pure data functions. It is
the npm package `dicescript`. It is presentation-free and side-effect-free — it returns
resolved outcomes and probabilities, never anything about rendering, and it mutates no host
globals on import.

The same source runs in two evaluation modes against one definition: **roll mode** (sample
once, return a concrete result) and **probability mode** (enumerate the outcome space,
return a distribution). The defining constraint is that *the author writes the roll once*
and both modes fall out of it.

The engine holds only **primitives** — things not expressible in terms of other engine
pieces, plus what the data functions require. Named conveniences expressible over these
primitives (`d6`, `total`, `keepHigh`, `addBonus`, …) live in the **Standard Library**;
rendering lives in the **Display** layer (website-only, not published).

---

## 1. The unit is the pool, not the die

The atomic value is a **pool**: an ordered collection of dice. A single die is a pool of
size 1; there is no separate "die" type. Every operation, read, and identity rule is defined
on pools, and the size-1 case is not special.

So `shows(6)` on a pool of 1 and on a pool of 10 are the same read over different counts
(§4). Indexing a pool yields a sub-pool: `p[0]` is the pool of the first element, itself a
pool of 1.

A **sub-pool is a live view into its parent**, not a detached copy: it shares the parent's
atoms by leaf identity (§2). Reads on a view see those atoms; a *mutating* op on a view (only
`discard`, §10) acts on the shared atoms and **returns the root pool** the view belongs to.
This is what lets selection and removal compose — `p.lowest(2).discard()` removes those two
from `p` and yields `p`.

### Pools nest; array literals are input syntax

Pools form a **tree** (§2): a member may itself be a pool, so a recursive result (an
explosion folding in a whole nested attack, §8) slots in as a *subtree* keeping its internal
structure. The leaves of the tree are the size-1 atoms.

A bare array literal — `[die(6), die(6)]` — is the canonical syntax for composite
construction. Every pool-accepting API (`poolBuilder`, `addDice`) **coerces** such input
into a pool, and coercion builds the identity tree: `[die(6), die(6)]` → two leaf atoms,
`[nimbleAttack(...), die(6)]` → a nested tree. To get a methoded pool directly: a die
(already a pool: `die(6).discard()`), or the constructor `pool(die(6), die(6))`. The engine
never extends host prototypes; a host page may add sugar on top, but that is out of scope.

### Dice are constructed by `die(...)`

The engine has one die constructor and **no named-die aliases** (those are stdlib):

- `die(n, name?)` — faces `1..n` (`die(6)` is a standard six-sided die).
- `die([f0, f1, …], name?)` — arbitrary explicit faces, equiprobable
  (`die([1,3,5,7,9,11])`). Faces need not be consecutive or distinct, and **repeated faces
  encode weighting**: `die([1,1,1,2])` rolls 1 three-quarters of the time. Faces need not be
  numeric (§4, `reduce`).

The optional **`name`** is display metadata carried on the atom into resolved outcomes, so a
renderer can label and distinguish dice. It is orthogonal to everything probabilistic: it is
**not** leaf identity (§2 — `[die(6,"dmg"), die(6,"dmg")]` is two independent dice that share
a name; names may repeat, identities may not), **not** a node label (§4 — role in a pool),
and does **not** touch faces. *(Forward-compat: if per-die metadata grows past a name, the
trailing string becomes a trailing options object `die(6, {name})`.)*

**poolsOf — calling for copies.** A die (and by the same rule any pool) is **callable to
produce N copies**: `die(6)(10)` is a pool of ten d6, each copy a fresh leaf identity (§2);
a name propagates to all copies. Making this an engine property lets stdlib aliases be true
aliases (`d6 = die(6,"d6")` ⇒ `d6(10)`), so stdlib adds names without behavior.

---

## 2. Identity is provenance, not value — two kinds

Identity is **provenance**, assigned where a pool enters the construction, never derived from
rolled value, and never changed by transformation, reordering, or filtering. It is the
single load-bearing decision: correlation, memoization, and reads all rest on it.

Because pools nest, separate two things both loosely called "identity":

- **Leaf identity** — an atom (a die). This *is* a random variable: it drives the sample
  space, §5 correlation, and the memo key (§8). Only atoms have it; it does **not** nest.
- **Node identity** — a provenance label grouping leaves (`"bonus"`, `"vicious"`,
  `"explosion"`). **Not** a random variable; an address and display grouping, no probability
  of its own. Node identities **nest**, forming the tree whose leaves are atoms.

So `p.explosion` and `p.explosion.vicious` are nodes (subtrees); the dice beneath are leaves.
Distinct paths keep same-named groups at different depths separate — a parent's `p.vicious`
and a recursive child's `p.explosion.vicious` are different nodes over different leaves.

Two hard rules:

- **Value identity is forbidden.** Two `die(6)` atoms showing the same face are independent
  samples. Keying on value would correlate independent atoms (the inverse of the §5 bug).
- **Identity survives reordering.** Selection and ordering ops may rearrange contents. A pool
  stays referable by *what it is* (provenance / label path), not *where its contents sit*;
  positional access (`p[0]`) is a fragile convenience, label access (§4) the durable handle.

---

## 3. Outcome reads vs. structural reads

A read either depends on the rolled sample or it does not, and the distinction is
load-bearing for probability mode:

| Read depends on… | When known | Treatment |
|---|---|---|
| the rolled sample | after sampling | enumerated / weighted (**outcome read**) |
| construction only | at bind time | evaluated once, **prunes** the tree (**structural / build-time**) |

The author does **not** classify reads by hand — the engine separates them by observing
whether a read touches the sample (§6). An **outcome read** (`reduce`, `shows`, `highest`,
`sort`) is a deterministic shadow of the dice; treating one as an independent random variable
loses the correlations of §5. A **structural read** (`bounds`, `is`, a parameter like
`advantage < 0`) is concrete the instant arguments bind and prunes once.

---

## 4. Reads over a pool

All reads cover the pool's **active** dice (§10), recursively over the active leaves of the
node read from.

### Reducing to a value (outcome): `reduce` / `reduceDiscarded`

The engine has **no built-in result accessor** — no `.total`, no `.outcome`. A scalar result
is always a *reduction*; the engine hosts only the fold, and every *named* reduction
(`total`, `sum`, `maxed`, …) is a stdlib preset. The raw resolved sample is just the pool
itself, read via `reduce` / `shows` / iteration.

- **`.reduce(reducer, seed)`** — fold the **active** leaves' faces. JS argument order:

  ```
  reduce( (accumulator, current = 0) => accumulator + current,  seed )
  ```

  - Order is `(accumulator, current)`, matching `Array.reduce` — nothing new to learn.
  - The reducer is **required** (no default) and must be **pure** (a function of faces only,
    §6), since it runs per-outcome.
  - `current = 0` makes the fold **total**: an empty/degenerate fold returns the seed, so a
    construction-empty pool has a defined result.
  - Faces may be non-numeric: a symbolic system (e.g. Genesys tokens) supplies a reducer that
    unions-then-cancels token multisets and a matching empty seed. The engine hosts only the
    fold.
- **`.reduceDiscarded(reducer, seed)`** — the same fold over the **ghost** stratum
  (discarded dice, §10) instead of active leaves. Named ghost reductions (`totalDiscarded`,
  `countDiscarded`) are stdlib presets over this, mirroring `reduce`.

### Value tests (outcome): `shows`

- `p.shows(6)` — every active leaf shows 6.
- `p.shows([1, 3, 5])` — every active leaf shows a value in the set.
- `p.shows(max)` / `p.shows(min)` — every active leaf shows its own maximum / minimum face.
  `max` / `min` are **per-die sentinels** resolved against each die's `bounds`, so on a mixed
  pool each leaf is compared to *its own* extreme. Sentinels may appear in sets:
  `p[0].shows([1, max])` — "botch or crit" in one test.

The pool form means *every* active leaf passes; for a pool of 1, just that die.

### Rank selection (outcome): `highest` / `lowest`

- **`p.highest(n)`** / **`p.lowest(n)`** — the sub-pool of the `n` highest / lowest active
  leaves *by rolled value*. An **outcome read** (it reads every leaf's value to rank, so it
  correlates over all of them). This is what "the 2nd-highest die" wants, without sorting then
  indexing. The result is a **live view** (§1): `p.lowest(2).discard()` removes those two from
  `p` and returns `p`.

### Reordering (outcome): `sort`

- **`p.sort(dir?)`** — the pool reordered by rolled value. ⚠️ the one operation that makes
  **position outcome-dependent**: `p[0]` after a `sort` differs per roll. Prefer rank
  selection or label access for stable reference.

### Structural reads: `bounds`, `is`, `size`

- **`p.bounds`** → `.bounds.min` / `.bounds.max` / `.bounds.span` — the pool's **possible**
  value range, summed over active leaves' per-die face extremes. *Structural* (build-time).
  **Ordered-numeric only:** `bounds` and the `shows(max|min)` sentinels require an ordered
  face set, so they exist only for numeric dice; symbolic dice have `reduce` and
  `shows(specificFace)` but no extremes — a defined absence, not a gap.
- **`p.is(kind)`** / **`p.is([kinds])`** — match die **kind** (a *fifth* property, distinct
  from value, leaf identity, node label, and name). `p.is(d6)` = every active leaf is that
  kind; `p.is([d6,d8,d10])` = the active-leaf kinds match this composition **by multiset**
  (arrangement-independent). Kind equality is **face-multiset equality**, name irrelevant
  (`die(6)` ≡ `die([1..6])`; `die([1,1,1,2])` is its own kind). Structural / build-time: `.is`
  reads kind, never value, so type-directed mixed-pool rules cost nothing in the tree. (It
  reads the active set, so after an outcome-dependent discard it inherits that dependence —
  handled by §6, no special case.)
- **`p.size`** — count of active leaves, recursively (the dice count of the subtree, not the
  immediate-child count). A **structural cardinality** — how many dice are *present*, never
  what they show — **not a `reduce`**: routing it through the face-fold would misfile a
  membership count as an outcome read. (It is still outcome-dependent *after* an
  outcome-triggered discard, because membership changed — but its value is always a count, not
  a face.) A discarded die (§10) leaves `size`, every `reduce`, and every read.

### Selecting subpools: positional vs. label

Indexing returns a sub-pool, two ways:

- **Positional** — `p[0]`. *Fragile:* meaningful only relative to the current (possibly
  reordered) arrangement.
- **Label** — `p.vicious` / `p['vicious']` — the sub-pool of dice that entered under that
  provenance label. Forms are equivalent; bracket form is for non-identifier labels
  (`p['extra damage']`). *Robust:* the runtime realization of §2's identity-is-provenance —
  survives reordering. **Prefer label access** for a specific role. A label may name >1 die,
  so `p.vicious` is a subpool of size ≥ 1. Label selection returns **active** dice only.

**Reserved names throw.** A label may not collide with any built-in pool member — a read
(`size`, `shows`, `bounds`, `highest`, `lowest`, `sort`, `reduce`, `reduceDiscarded`, `is`)
or a method (`discard`, `addDice`, `when`). `addDice(1, "shows")` **throws at construction**,
deterministically, before any roll. The reserved set is a **closed, versioned vocabulary** —
adding a built-in member later forbids a previously legal label, so it is a compatibility
event. (Stdlib free functions are *not* pool members, so they do not reserve labels.)

---

## 5. Correlation by shared atoms: joint vs. product

Leaf identity attaches to **atoms** (§2). A pool is a tree whose leaves are atoms, and every
outcome read covers the **set of leaves beneath the node it reads**, regardless of depth.
Nesting is pure addressing — it never changes *which* atoms a read covers — so §5 is computed
at the leaf level, unaffected by depth. The unit of *identity* (the leaf) and the unit of
*correlation* (the leaf-set a read covers) are distinct:

> **Two reads correlate iff their atom-sets intersect.**

- **Overlapping** → joint distribution over the *union*. `p[0].shows(max)` and
  `p[0].shows(min)` cover the same atom, so the impossible "both true" world is never
  constructed. A whole-pool `reduce` and `p[0].shows(max)` overlap on atom 0 → joint, even
  though their pool identities differ.
- **Disjoint** → product. Independence is read off disjoint provenance, not assumed.

Identity-equality grouping is only the special case of a single shared atom. A composite read
(a whole-pool `reduce`) spans many atoms; any read sharing even one is correlated. The
canonical failure prevented: treating `shows(max)` (1/6) and `shows(min)` (1/6) as independent
yields a 1/36 "exploded-and-fumbled" world of true probability 0, corrupting the distribution.

---

## 6. `poolBuilder` — one boundary, four roles

`poolBuilder(fn)` wraps a builder. `fn` is a **pure function of its inputs** and may run many
times. `poolBuilder` is at once:

1. **Effect handler.** Every outcome read inside the body suspends to this boundary; the
   handler resumes the body once per relevant outcome assignment, weighting each. Because the
   boundary is *above* the whole body, every read — in `when` conditions, in `&&`/`>`
   operators, in `filter` predicates — is tracked uniformly. Authors write bare expressions
   (`p[0].shows(min) && first`, any operand order); the body *is* the reactive scope.
2. **Collector.** For each read it records which pool identity was read and which
   branch-conditions were pinned true at that point.
3. **Grouper.** It partitions reads by atom-set for the joint-vs-product analysis of §5.
4. **Memo table.** It caches sub-distributions (§8).

One mechanism, four views — all resting on whole-body **purity** and provenance **identity**.

### Purity contract

Because the body may run many times, everything in it must be pure and idempotent —
including recursive `poolBuilder` calls. Die rolls are pure by nature, so this is natural,
but it is the assumption the whole evaluation model rests on.

---

## 7. `when` — a transform boundary, not a reactive one

```js
pool.when(condition, transform)   // transform: pool => pool
```

`when` is **not** the reactive boundary — `poolBuilder` is. `when` scopes *which operations
are conditional*. Semantically it is the pool-level conditional identity:

```
when(cond, fn)  ≡  cond ? fn(pool) : pool
```

The callback form is required: it makes the *scope* of a condition explicit and removes the
"what does a false branch return" ambiguity. Conditions evaluate as ordinary booleans because
by the time any operator runs inside one resumption, every operand is concrete (§6).
Independent `when` calls are independent; mutual exclusivity (a pool can't be both
`shows(max)` and `shows(min)`) is a property of the dice recovered by §5, not implied by
`when`.

---

## 8. Recursion and memoization

A `poolBuilder` call invoked from inside another builder is a **nested handler**. The inner
computation contributes a full sub-distribution, folded into the parent weighted by the branch
probability that reached it. The engine composes distributions across the boundary.

**The memo key is `(set of pool identities read, pinned-condition context)`** — both parts:

- Identity alone gives *correlation* correctness (§5).
- Identity **plus context** gives *memoization* correctness: a sub-computation reading pool D
  means different things under "the parent maxed" vs. unconditioned, because conditioning
  changes the weights. A dice-only key would serve a distribution computed under one
  conditioning into a branch with another — plausible-looking but wrong totals.

The key falls out of the collector's records. By purity, two branches reading the same pools
under the same pinned conditions are the same distribution and share a cache slot. Payoff: an
explosion recursing with a fixed input shape is computed once and reweighted at every
explosion node, collapsing an exponential re-expansion to one computation.

---

## 9. Reporting

Because reads are first-class collected nodes over a known pool graph, the engine can report
**which conditions fork the distribution and with what probability**. Two `when` calls that
look identical may affect the tree very differently; surfacing this is the payoff for reifying
conditions instead of forking eagerly.

---

## 10. `.discard()` — the sole removal mechanism

`.discard()` **removes** the dice of the pool it is called on, and is the *only* removal
mechanism (stdlib `keepHigh`/`keepLow` are built on it). A discarded die is no longer in the
pool: it enters no `reduce`, no `size`, no read, no later operation. Its **rolled value is
retained as a display-only record** — a *ghost* — so a renderer can show what was rolled,
grayed and barred.

`discard()` is **nullary**; what it removes is the receiver's dice, and it always returns the
**root** pool:

- On a **root** pool, `p.discard()` discards **all** its active dice (→ a barred / no-result
  outcome), returning `p`.
- On a **view** (§1, e.g. `p.lowest(1)`), `p.lowest(1).discard()` discards those dice from the
  shared parent and returns the **root** `p`. Selection (`highest`/`lowest`/`p[0]`/label) narrows
  *which* dice; `discard` removes them. No selection argument is needed — the view is the
  selection.

A pool is two strata:

| Stratum | In `reduce` / `size` / reads? | Read by | Purpose |
|---|---|---|---|
| **Active dice** | yes | `reduce`, `shows`, … | the live result |
| **Ghosts** (discarded) | no | `reduceDiscarded` | display only — retain value, grayed |

### Discard is not pruning — the ghost stays in the sample space

The opposite of §3 pruning:

- **Prune** (a structural/parameter `when` that is false): the world never existed; its mass
  is never constructed.
- **Discard** (`.discard()` on a rolled pool): the roll *happened* — in the fumble case the
  die rolling its minimum is *why* it is discarded. The die's outcome **stays in the sample
  space** (it still selects the branch and correlates per §5); only its contribution to the
  result is removed.

So discarding a whole pool yields a distinguished **barred / no-result** outcome holding real
mass — a fumble on a d6 contributes its full 1/6. `outcomeProbability` (§11) includes it.

> **Implementation trap:** never implement discard as dropping the branch. Dropping
> renormalizes survivors to sum to 1, silently erasing the miss probability — the quantity a
> grayed bar exists to show. Keep the mass; it lands on the barred outcome.

### All removal is discard

There is **no non-discarding removal**. Anything that takes dice out of the active set is a
discard (the removed dice persist as grayed ghosts). `keepHigh` (stdlib) is "discard the
complement." So there is always a ghost stratum, which is what `reduceDiscarded` reads.

### Subpool discard

A discarded subpool's dice leave the active set, so a parent's reductions aggregate the
remainder automatically — nothing to "poison." The only distinguished case is discarding a
whole pool to zero active dice (the barred outcome above).

---

## 11. Data functions (pure)

The engine exposes **pure data functions** returning resolved outcomes and probabilities —
presentation-free (no titles, colors, `mode`).

### Core primitives (the two evaluation modes)

- **`roll(pool)`** → one **raw resolved outcome**: active dice and faces, ghosts, barred flag
  — *not* a scalar. Reduce it (or read `shows`) for a value.
- **`outcomeProbability(pool, groupBy?)`** → the full weighted enumeration of raw resolved
  outcomes, summing to 1, **including** barred / no-result mass (§10). **The engine never
  reduces** — it returns raw outcomes. The optional `groupBy` is a **caller-supplied,
  defaultless** value function (typically a `reduce`) used to collapse outcomes sharing a
  value (216 raw 3d6 → 16 sums); omit it for raw outcomes. No engine default sneaks in — sum
  is a *display* convention, not an engine one.

### Classification: `filter`

The derived functions share one classification concept, **`filter`**; each category's
predicate is its **`when`**:

```
predicate := dice => boolean
category  := predicate | { when: predicate, label?, color? }
filter    := category | category[]
```

A lone function (one anonymous category), an array of bare functions (several anonymous), or
an array of `{ when, label?, color? }` objects. Everything normalizes to a category list, so
**`p` is always an array**. The data layer reads only each `when`; `label`/`color` are
presentation, ignored here and defined by Display.

### Derived functions

```
classify(pool, filter)
    → { p: [m0, m1, …], barred, uncategorized }          // one mass per category; sums to 1

scalingProbability(build, {from, to, step = 1}, filter)
    → [{ x, p: […], barred, uncategorized }, …]          // classify(build(x)) per x

cumulativeProbability(pool, filter, {attempts})
    → [{ attempts: k, p: [ 1 - (1 - p_i) ** k  per category i ] }, …]
```

- **Barred mass is partitioned out before predicates run.** A barred outcome has no active
  dice, so a predicate like `dice => count(dice, v => v === 1) === 0` is *vacuously true* and
  would wrongly bucket every miss as success. `barred` is a sibling of `p[]`, not a category.
- **`cumulativeProbability` assumes independent re-rolls.** Single-attempt `p_i` once, then
  the closed form `1 − (1 − p_i)^k`. No k-fold enumeration. Models "≥ 1 success across
  *independent* attempts."

---

## 12. Worked example (engine primitives only)

`bonus` is a constant die `die([bonus])`; advantage keeps the best/worst by discarding the
extra dice; the named conveniences (`addBonus`, `keepHigh`) live in stdlib but desugar to
exactly this.

```js
const nimbleAttack = poolBuilder((p, {advantage=0, vicious=0, bonus=0}={}, first=true) =>
  p.addDice(die([bonus]), "bonus").addDice(Math.abs(advantage))
    // disadvantage: keep low ⇒ discard the highest |advantage|
    .when(advantage < 0, pool => pool.highest(-advantage).discard())
    // advantage: keep high ⇒ discard the lowest advantage
    .when(advantage > 0, pool => pool.lowest(advantage).discard())
    .when(p[0].shows(max), pool =>
      pool.addDice(nimbleAttack(p.addDice(vicious, "vicious"), {}, false), "explosion"))
    .when(p[0].shows(min) && first, pool => pool.discard())
)

roll(nimbleAttack([die(6), die(6)], {advantage:1, vicious:1, bonus:2}))  // one resolved outcome
outcomeProbability(nimbleAttack(die(6), {vicious:1, bonus:2}))           // full distribution
```

How the engine reads it:

- `advantage < 0/> 0` are parameter-only — evaluated once at bind time, pruning the discard
  branches before enumeration.
- `p[0].shows(max)` and `p[0].shows(min)` read the same size-1 sub-pool, so they group under
  one atom and enumerate jointly over its faces. The "exploded **and** fumbled" world is never
  constructed.
- `first` is a parameter; `p[0].shows(min) && first` is concrete per resumption, so operand
  order is irrelevant.
- The fumble branch **discards** rather than prunes: the d6 still rolled (its min triggered the
  discard), so that atom stays in the enumeration; its sole die gone, the pool has no active
  dice → a barred outcome holding the full 1/6. `size` and every reduction ignore the ghost.
- The explosion recurses with a fixed input shape (`{}`, `first=false`), so its
  sub-distribution is memoized and reweighted at every explosion node.

---

## Appendix — Engine invariants checklist

- [ ] Engine is the npm package `dicescript`: pure, presentation-free, no global/prototype
      mutation on import. Holds only primitives + data-function requirements.
- [ ] Pool is the only value type; a die is a pool of 1. Pools nest into a tree; array
      literals are coerced input.
- [ ] Dice: `die(n, name?)` / `die([faces], name?)`; repeated faces = weighting; faces may be
      non-numeric. `name` is display metadata, orthogonal to identity/labels/faces. poolsOf
      `die(6)(10)` = N copies, fresh leaf identities, shared name. No named aliases in engine.
- [ ] Two identities: **leaf** (atom = random variable; no nesting) and **node** (label
      grouping; not random; nests). Provenance, not value; survives reorder.
- [ ] Correlation at the **leaf** level by atom-set overlap (joint) vs. disjoint (product);
      nesting is pure addressing.
- [ ] Reads split outcome (sample-dependent, enumerated) vs. structural (build-time, prune).
- [ ] **No result accessor** — no `.total`/`.outcome`. `reduce(reducer, seed)` folds active
      faces (JS arg order, reducer required, `current=0` ⇒ total/empty=seed, faces any type).
      `reduceDiscarded` folds the ghost stratum. Named reductions are stdlib.
- [ ] `shows(v|[set]|max|min)` value test; `max`/`min` per-die sentinels via `bounds`.
      `highest`/`lowest`/`sort` rank/order (outcome). `bounds` (ordered-numeric only), `is`
      (kind, structural), `size` (active count) — structural except as noted.
- [ ] Engine never reduces: `roll`/`outcomeProbability` return raw outcomes; `groupBy` is a
      defaultless caller-supplied collapse. Sum is a display default, not an engine fact.
- [ ] Sub-pools are **live views** into the parent (shared atoms by identity); `discard()` is
      nullary, acting on the receiver's dice and returning the **root** (`p.lowest(2).discard()`).
- [ ] `.discard()` is the sole removal; removed dice become grayed ghosts in
      `reduceDiscarded`. Discard ≠ prune: ghost stays in the sample space; whole-pool discard →
      barred mass kept (never drop the branch).
- [ ] `size` is a structural cardinality (active-leaf count), **not** a `reduce`.
- [ ] Selection: `p[0]` positional (fragile), `p.label` provenance (robust). Reserved-name
      labels throw at construction (closed/versioned vocabulary); stdlib free functions don't
      reserve labels.
- [ ] `poolBuilder` is the reactive boundary (handler/collector/grouper/memo); `when` is the
      transform boundary. Body pure/idempotent. Memo key = (identities read, pinned context).
- [ ] Data: `classify`/`scalingProbability`/`cumulativeProbability` share `filter` (fn | fns |
      `{when,…}` objects). Barred partitioned before predicates. Cumulative assumes independent
      re-rolls (`1−(1−p)^k`, no k-fold enumeration).
