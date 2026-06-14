# DiceScript — Display Specification

The **display** layer renders the engine's results: charts, rolled dice, colors, labels. It
is **website-exclusive** — it is *not* published to npm. The npm package is engine + stdlib
only (Standard Library Spec); display and the editor sandbox live only on the website, built
on top of the published tiers.

```
engine   (dicescript)        — npm
stdlib   (dicescript/std)    — npm
display  (website only)      — NOT npm   ← this document
```

Display depends on the engine's pure data functions (`roll`, `outcomeProbability`,
`classify`, `scalingProbability`, `cumulativeProbability`) and on stdlib reductions for its
default value-axis.

## The contract

> Display functions are thin wrappers. Each extracts the data-relevant fields from its
> options, calls a pure engine data function, and renders the result. **Presentation never
> reaches the data layer** — `title`, `label`, `color`, `mode` are read only by the wrapper.

Structurally, the wrapper hands the engine only `pool`, `over`, and the `when` predicates
inside `filter`. Because `label`/`color`/`title`/`mode` live in fields the data functions do
not read, presentation cannot influence a probability.

## Editor sugar (website-only)

Beyond rendering, the website's editor may add page-level conveniences the npm tiers cannot,
because it owns its own globals:

- **Prototype promotion** — promote stdlib free functions to fluent pool methods
  (`p.keepHigh(n)`, `p.total`) via `Object.defineProperty` (non-enumerable), so sandbox
  authors write fluently. This is page-level prototype patching, forbidden in the published
  tiers but fine here.
- **Ambient scope** — default dice (`d6`) and reductions (`total`) in scope without imports.
- **Source transforms** — Monaco-fed source rewriting, if ever wanted.

These never change semantics; they are spellings over engine + stdlib.

---

## 1. Common options vocabulary

Every display function takes a **single named options object**, split into a data zone and a
presentation zone:

| Field | Zone | Meaning |
|---|---|---|
| `pool` | data | a pool, or a builder fn `x => pool` |
| `over` | data | the sweep axis (shape selects the data function — see §2) |
| `filter` | mixed | classification; `when` predicates are data, `label`/`color` presentation |
| `title` | presentation | chart/heading text |
| `mode` | presentation | e.g. `'pct'` vs `'count'` — formatting only |

`filter` is the engine's polymorphic classification type (Engine §11): a function, an array of
functions, or an array of `{ when, label?, color? }`. The wrapper forwards each `when` to the
engine and keeps `label`/`color` for rendering.

---

## 2. The four display functions

`over`'s *shape* selects the engine data function:

| Display function | Engine data function | `over` shape |
|---|---|---|
| `display` | `classify` / `outcomeProbability` | (none) |
| `displayRoll` | `roll` | (none) |
| `displayScaling` | `scalingProbability` | `{ from, to, step? }` |
| `displayCumulative` | `cumulativeProbability` | `{ attempts }` |

`display` buckets a distribution by `filter` and renders bars plus the barred / no-result
segment. `displayRoll` renders one sampled outcome (active dice and grayed ghosts). The swept
forms render a series across the x-axis `over` defines.

```js
displayScaling({
  pool: n => d6(n),
  over:  { from: 1, to: 8 },
  filter: [
    { when: dice => count(dice, v => v === 1) === 0, label: "fine",  color: "#a3e635" },
    { when: dice => count(dice, v => v === 1) === 1, label: "bad",   color: "#facc15" },
    { when: dice => count(dice, v => v === 1) === 2, label: "worse", color: "#f97316" },
    { when: dice => count(dice, v => v === 1) >= 3,  label: "worst", color: "#ef4444" },
  ],
  title: "danger pool — ones rolled",
  mode: "pct",
})

displayCumulative({
  pool: d6(3),
  over: { attempts: 8 },
  filter: dice => total(dice) >= 7,          // bare function ⇒ single category (one curve)
  title: "3d6 — P(sum ≥ 7) over N attempts",
  mode: "pct",
})
```

`filter` works identically in both; an array passed to `displayCumulative` renders one
cumulative curve per category. Only `over` differs. `count` and `total` here are stdlib
helpers (Standard Library §2). The data layer reads each `when`, never the presentation fields.

---

## 3. Rendering concerns

The engine supplies numbers; the wrapper draws them.

- **Value axis.** The histogram x-axis and the `displayRoll` result are a *reduction* of each
  outcome. The default is `total` (sum, a stdlib helper) — but that default lives here, in
  display, not the engine, which returns raw outcomes. A highest-die-wins or success-counting
  system swaps the reduction (`maxed`, `count`) with no engine change.
- **Barred / no-result segment.** `outcomeProbability` returns barred mass as a distinct field
  (Engine §10). Render it as its own segment — never fold it into a bucket, never renormalize
  it away. It is the "miss" probability.
- **Grayed ghosts.** Each resolved outcome carries its ghosts (discarded dice with retained
  values). `displayRoll` shows them grayed and barred beside the active dice. Ghosts are
  per-outcome — different enumerated outcomes ghost different dice, so ghost rendering is
  per-branch.
- **Die names.** Each die carries an optional display name (Engine §1). `displayRoll` uses it
  to distinguish dice (`"atk"` vs `"dmg"`); identical names fall back to positional
  distinction. Names never affect probabilities.
- **`mode`.** Pure formatting (`'pct'`, `'count'`, …); the underlying data is always
  probabilities in [0, 1].

---

## 4. Building your own

`display`/`displayRoll` wrap `outcomeProbability`/`roll`; the swept forms wrap
`scalingProbability`/`cumulativeProbability`. Any custom display follows the pattern: call a
pure data function, read its `p[]` / `barred` / `x` / `attempts` fields, render — never pass
presentation into the data call.

---

## 5. Open interface questions (taste)

- **`over` by shape.** `over` carries two meanings by shape (`{from,to}` vs `{attempts}`):
  one "what is the x-axis" question, vs. distinct fields (`sweep` / `attempts`).
- **Collapsing the wrappers.** `display` / `displayScaling` / `displayCumulative` share
  `pool` + `over` + `filter` and differ only by `over` shape, so they could collapse into one
  dispatching function. Kept separate for discoverability.
- **Mixed `filter` arrays.** The type permits `[fn, { when, label }]`; confirm allowed or
  rejected.

---

## Appendix — Display invariants checklist

- [ ] Display is **website-only**, not published to npm. Built on engine + stdlib.
- [ ] Thin wrapper over engine data functions; presentation never reaches the data layer.
- [ ] Single named options object; `over` shape selects the data function.
- [ ] Value axis defaults to `total` (a stdlib reduction) but is swappable; the default lives
      in display, not the engine.
- [ ] Barred mass rendered as its own segment; never folded or renormalized away.
- [ ] Ghosts rendered grayed/barred, per-outcome; die names label dice; `mode` is formatting
      only.
- [ ] Editor sugar (prototype promotion, ambient scope, transforms) is page-level and changes
      no semantics.
