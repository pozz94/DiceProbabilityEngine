# DiceScript — Standard Library Specification

The **standard library** (a *prelude* / *kit*) is the middle tier between the bare engine and
the website's display layer. It is the npm entry `dicescript/std`. It is **pure** and
**side-effect-free**, expressed *entirely* in terms of the **Engine Specification** — named
dice, named reductions, and common builder patterns a package consumer wants without any
rendering.

Three tiers, by dependency and distribution:

```
engine   (dicescript)        primitives + data functions; depends on nothing      — npm
   ↑
stdlib   (dicescript/std)    pure conveniences over the engine; no output          — npm
   ↑
display  (website only)      rendering + editor; depends on engine + stdlib        — NOT npm
```

The npm package is **engine + stdlib only**. Display/editor is exclusive to the website and is
never published. Each tier imports without the ones above it.

## Membership test

- **Engine** — primitive (not expressible via other engine pieces) *or* required by the data
  functions.
- **Standard library** — a pure value or function over the engine that concerns **no output**
  and mutates nothing on import.
- **Display** — anything that draws or configures drawing.

## Free functions, not methods

A pool *method* would require patching the pool prototype — a side effect on import, which
stdlib forbids. So stdlib conveniences are **free functions**: `keepHigh(p, n)`,
`total(p)` — not `p.keepHigh(n)`. The fluent method spellings still exist where authors
actually write rolls, because the **website/editor** may promote these to methods via
page-level prototype patching (its prerogative; see Display Spec). The engine's own fluent
methods (`addDice`, `discard`, `reduce`, `shows`, …) are unaffected — those are primitives on
the pool type.

---

## 1. Default dice

The engine ships no named dice — only `die(n, name?)` / `die([faces], name?)` (Engine §1).
Stdlib adds the conventional set as plain aliases:

```
d2  = die(2,  "d2")    d4  = die(4,  "d4")    d6  = die(6,  "d6")    d8  = die(8,  "d8")
d10 = die(10, "d10")   d12 = die(12, "d12")   d20 = die(20, "d20")   d24 = die(24, "d24")
d30 = die(30, "d30")   d60 = die(60, "d60")   d100 = die(100, "d100")
```

`d6` *is* `die(6, "d6")` — a single die, or `d6(10)` for ten via the engine's poolsOf rule.
The name (`"d6"`) is engine display metadata, consumed by display; stdlib only provides the
pre-named values. Distinguish same-sided dice by renaming at the engine constructor
(`die(6, "atk")`). Non-standard or weighted dice use the engine constructor directly:
`die(7)`, `die([1,3,5,7,9,11])`, `die([1,1,1,2])`.

---

## 2. Reductions (numerical dice)

The engine hosts the folds (`reduce`, `reduceDiscarded`) and **never reduces** itself. Every
named reduction is a stdlib preset: a fold with a reducer and matching seed bundled together
(JS argument order). These assume **numeric faces**; symbolic systems supply their own
reducer.

### Over active dice (`reduce`)

```
sum     = p => p.reduce((accumulator, current) => accumulator + current, 0)
total   = sum                                                    // player-facing alias of sum
maxed   = p => p.reduce((accumulator, current) => Math.max(accumulator, current), -Infinity)
floored = p => p.reduce((accumulator, current) => Math.min(accumulator, current), +Infinity)
product = p => p.reduce((accumulator, current) => accumulator * current, 1)
count   = (p, pred) => p.reduce((accumulator, current) => pred(current) ? accumulator + 1 : accumulator, 0)
```

`count(p, pred)` is the success-counting helper (e.g. *count d10s ≥ 7*): a `reduce` that tallies
matching active leaves.

### Over discarded dice (`reduceDiscarded`)

Mirror presets over the ghost stratum (Engine §10) — for systems where dropped dice still
carry meaning (spent dice, wild-magic triggers):

```
totalDiscarded = p => p.reduceDiscarded((accumulator, current) => accumulator + current, 0)
countDiscarded = p => p.reduceDiscarded((accumulator) => accumulator + 1, 0)
```

Note the division of labor with display: the reduction *functions* are stdlib; the *choice*
of sum as the default histogram value-axis and `displayRoll` result is a display default. A
consumer not using display picks whichever reduction they want, explicitly.

---

## 3. Builder patterns

Conveniences that compose engine primitives — no new engine semantics — provided as free
functions.

- **`keepHigh(p, n)`** / **`keepLow(p, n)`** — keep the `n` best / worst active dice by
  discarding the complement. Built on rank selection + `discard` (a view discarding itself,
  returning the root):

  ```
  keepHigh = (p, n) => p.lowest(p.size - n).discard()
  keepLow  = (p, n) => p.highest(p.size - n).discard()
  ```

  The discarded dice persist as grayed ghosts (Engine §10), matching how advantage /
  disadvantage is shown on a physical table.
- **`addBonus(p, n, label?)`** — add a flat modifier as a **constant die**:

  ```
  addBonus = (p, n, label = "bonus") => p.addDice(die([n]), label)
  ```

  A single-face die `die([n])` always rolls `n`, so a bonus is just a degenerate die — it has
  leaf identity, enters reductions, and renders like any die, with no special "modifier"
  concept in the engine.
- **`reroll(p, selection)`** *(sketch)* — discard `selection` (it becomes a ghost) and add
  fresh dice of the same kind (Engine §1, `.is`/kind). Reroll-until is recursion, like
  explosion. No new semantic.
- **`advantage` / `disadvantage`** *(sketch)* — roll extra and `keepHigh` / `keepLow`. One
  game family's idiom, so stdlib, not engine.
- **Opposed / multi-pool** *(sketch)* — a builder constructing two pools and comparing them;
  disjoint atom-sets → product enumeration, already handled by Engine §5. The helper packages
  the shape; the engine needs nothing new.

---

## Appendix — Standard library invariants checklist

- [ ] npm entry `dicescript/std`. Pure and side-effect-free: no global/prototype mutation on
      import.
- [ ] Everything here is engine-expressible; nothing primitive lives here; nothing concerns
      output.
- [ ] Conveniences are **free functions** (`keepHigh(p,n)`, `total(p)`); fluent method
      spellings are the website's prototype-promotion, not stdlib's.
- [ ] Default dice (`d2`…`d100`) are plain aliases of `die(n, "dN")`.
- [ ] Active reductions (`sum`/`total`, `maxed`, `floored`, `product`, `count`) are `reduce`
      presets; discarded reductions (`totalDiscarded`, `countDiscarded`) are `reduceDiscarded`
      presets. Numeric faces; symbolic systems supply their own reducer.
- [ ] `keepHigh`/`keepLow` = `p.lowest/highest(p.size - n).discard()` (view discards itself,
      returns root); `addBonus(n)` = `addDice(die([n]))`. `reroll`/`advantage`/opposed compose
      primitives — no new engine semantics.
- [ ] Dependency `engine ← stdlib ← display`, acyclic; stdlib importable without display.
