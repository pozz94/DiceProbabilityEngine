import{c as e,h as t,i as n,p as r,r as i}from"./editor.api2-DuvA-XEt.js";import{f as a,n as o,t as s}from"./monaco-theme-B0Ca0kSW.js";var c={examples:`EXAMPLES`,projects:`PROJECTS`},l=null;function u(e,t){if(l===e){d();return}l=e;let n=document.getElementById(`menu-inner`);n.innerHTML=``,t(n),document.getElementById(`menu-accordion`).classList.add(`open`),requestAnimationFrame(()=>{document.documentElement.style.setProperty(`--accordion`,n.offsetHeight+`px`)}),f()}function d(){l=null,document.getElementById(`menu-accordion`).classList.remove(`open`),document.documentElement.style.setProperty(`--accordion`,`0px`),f()}function f(){for(let e of Object.keys(c)){let t=document.getElementById(e+`-btn`);t&&(t.textContent=c[e]+(l===e?` ▴`:` ▾`))}}var p={"Dice Basics":{"Simple dice":`// Basic dice pools — display() takes one options object
display({ pool: d6,                 title: "d6" })
display({ pool: d6(2),              title: "2d6" })
display({ pool: d6(4).keepHigh(3),  title: "4d6 keep 3" })
display({ pool: d6(4).keepLow(1),   title: "4d6 keep lowest" })
display({ pool: d8.addBonus(3),     title: "d8 + 3" })
display({ pool: die([1,3,5,7,9]),   title: "odd d5" })
display({ pool: die([2,2,3,3,4,6]), title: "weighted d6" })`,"Advantage / disadvantage":`// keep best / worst of two d20
display({ pool: d20(2).keepHigh(1), title: "advantage",    filter: dice => total(dice) >= 10 })
display({ pool: d20,                title: "normal",       filter: dice => total(dice) >= 10 })
display({ pool: d20(2).keepLow(1),  title: "disadvantage", filter: dice => total(dice) >= 10 })

// sweep advantage from disadvantage (-) to advantage (+)
displayScaling({
  pool: n => n >= 0 ? d20(n + 1).keepHigh(1) : d20(-n + 1).keepLow(1),
  over: { from: -3, to: 3 },
  filter: dice => total(dice) >= 10,
  title: "advantage scaling (-=disadv, +=adv)",
  mode: "pct",
})`,"Pools & keep":`display({ pool: d6(3).keepHigh(1), title: "3d6 keep 1 (best)" })
display({ pool: d6(3).keepHigh(2), title: "3d6 keep 2" })
display({ pool: d6(3),             title: "3d6 keep all" })
display({ pool: d6(6).keepHigh(3), title: "6d6 keep 3" })`},"Attack Mechanics":{"Nimble attack":`// Nimble: a max explodes, a min (on the first roll) is a miss.
// advantage/disadvantage keep the best/worst of the rolled dice; the bonus
// is added AFTER the keep.
const nimbleAttack = poolBuilder((p, { advantage = 0, vicious = 0, bonus = 0 } = {}, first = true) => {
  let atk = p.addDice(Math.abs(advantage))
  if (advantage > 0) atk = atk.keepHigh(p.size)   // keep the best -> advantage
  if (advantage < 0) atk = atk.keepLow(p.size)    // keep the worst -> disadvantage
  return (bonus ? atk.addBonus(bonus, "bonus") : atk)
    .when(atk[0].shows(max), x =>
      x.addDice(nimbleAttack(atk.addDice(vicious, "vicious"), {}, false), "explosion"))
    .when(atk[0].shows(min) && first, x => x.discard())
})

displayRoll({ pool: nimbleAttack(d6, { advantage: 1, vicious: 1, bonus: 2 }), title: "roll it" })
display({ pool: nimbleAttack(d6),                          title: "d6 base",          filter: dice => total(dice) > 0 })
display({ pool: nimbleAttack(d6, { advantage: 1 }),        title: "d6 advantage",     filter: dice => total(dice) > 0 })
display({ pool: nimbleAttack(d6, { advantage: -1 }),       title: "d6 disadvantage",  filter: dice => total(dice) > 0 })
display({ pool: nimbleAttack(d6, { vicious: 1, bonus: 2 }), title: "d6 vicious+bonus", filter: dice => total(dice) > 0 })`,"Weapon comparison":`// same average, different shape — bars scale with avg damage
// (toggle avg / % on the chart). Rows: plain, disadvantage, disadv+vicious,
// vicious, advantage+vicious — across equal-average dice.
const nimbleAttack = poolBuilder((p, { advantage = 0, vicious = 0, bonus = 0 } = {}, first = true) => {
  let atk = p.addDice(Math.abs(advantage))
  if (advantage > 0) atk = atk.keepHigh(p.size)   // keep the best -> advantage
  if (advantage < 0) atk = atk.keepLow(p.size)    // keep the worst -> disadvantage
  return (bonus ? atk.addBonus(bonus, "bonus") : atk)
    .when(atk[0].shows(max), x =>
      x.addDice(nimbleAttack(atk.addDice(vicious, "vicious"), {}, false), "explosion"))
    .when(atk[0].shows(min) && first, x => x.discard())
})

displayScaling({
  pool: [
    { label: "6xd2", pool: nimbleAttack(d2(6)) },
    { label: "3xd4", pool: nimbleAttack(d4(3)) },
    { label: "2xd6", pool: nimbleAttack(d6(2)) },
    { label: "d12",  pool: nimbleAttack(d12)   },
    { label: "6xd2", pool: nimbleAttack(d2(6), { advantage: -1 }) },
    { label: "3xd4", pool: nimbleAttack(d4(3), { advantage: -1 }) },
    { label: "2xd6", pool: nimbleAttack(d6(2), { advantage: -1 }) },
    { label: "d12",  pool: nimbleAttack(d12,   { advantage: -1 }) },
    { label: "6xd2", pool: nimbleAttack(d2(6), { advantage: -1, vicious: 1 }) },
    { label: "3xd4", pool: nimbleAttack(d4(3), { advantage: -1, vicious: 1 }) },
    { label: "2xd6", pool: nimbleAttack(d6(2), { advantage: -1, vicious: 1 }) },
    { label: "d12",  pool: nimbleAttack(d12,   { advantage: -1, vicious: 1 }) },
    { label: "6xd2", pool: nimbleAttack(d2(6), { vicious: 1 }) },
    { label: "3xd4", pool: nimbleAttack(d4(3), { vicious: 1 }) },
    { label: "2xd6", pool: nimbleAttack(d6(2), { vicious: 1 }) },
    { label: "d12",  pool: nimbleAttack(d12,   { vicious: 1 }) },
    { label: "6xd2", pool: nimbleAttack(d2(6), { advantage: 1, vicious: 1 }) },
    { label: "3xd4", pool: nimbleAttack(d4(3), { advantage: 1, vicious: 1 }) },
    { label: "2xd6", pool: nimbleAttack(d6(2), { advantage: 1, vicious: 1 }) },
    { label: "d12",  pool: nimbleAttack(d12,   { advantage: 1, vicious: 1 }) },
  ],
  title: "nimble attack — die size × advantage × vicious",
  filter: [
    { when: dice => total(dice) === 0,                    label: "miss", color: "#ef4444" },
    { when: dice => total(dice) > 0 && total(dice) < 10,  label: "hit",  color: "#60c8f0" },
    { when: dice => total(dice) >= 10,                    label: "big",  color: "#a3e635" },
  ],
})`},Interactive:{"Live controls":`// drag the controls (above the chart) — it re-runs live
const advantage = slider("advantage", { min: -2, max: 2, value: 0 })
const vicious   = slider("vicious",   { min: 0, max: 3, value: 0 })
const bonus     = slider("bonus",     { min: 0, max: 5, value: 0 })
const sides     = select("die", [4, 6, 8, 10, 12], { value: 6 })
const count     = slider("dice count", { min: 1, max: 3, value: 1 })

const nimbleAttack = poolBuilder((p, { advantage = 0, vicious = 0, bonus = 0 } = {}, first = true) => {
  let atk = p.addDice(Math.abs(advantage))
  if (advantage > 0) atk = atk.keepHigh(p.size)
  if (advantage < 0) atk = atk.keepLow(p.size)
  return (bonus ? atk.addBonus(bonus, "bonus") : atk)
    .when(atk[0].shows(max), x =>
      x.addDice(nimbleAttack(atk.addDice(vicious, "vicious"), {}, false), "explosion"))
    .when(atk[0].shows(min) && first, x => x.discard())
})

display({
  pool: nimbleAttack(die(sides)(count), { advantage, vicious, bonus }),
  filter: dice => total(dice) > 0,
  title: "nimble attack (live)",
})`,"Pool size & target":`// how pool size trades off against a target number
const dieN  = select("die", [4, 6, 8, 10, 12], { value: 6 })
const count = slider("pool size", { min: 1, max: 8, value: 3 })
const target = slider("target", { min: 1, max: 40, value: 12 })
const best = toggle("keep best only", false)

const p = best ? die(dieN)(count).keepHigh(1) : die(dieN)(count)
display({ pool: p, filter: dice => total(dice) >= target, title: "roll vs target" })`},"Pass / Fail":{"Threshold checks":`displayScaling({
  pool: n => d6(n),
  over: { from: 1, to: 6 },
  title: "Nd6 pool vs target 10",
  filter: dice => total(dice) >= 10,
  mode: "pct",
})

displayScaling({
  pool: n => d6(n).keepHigh(1),
  over: { from: 1, to: 6 },
  title: "Nd6 keep best vs target 4",
  filter: dice => total(dice) >= 4,
  mode: "pct",
})`,"Danger dice":`// environmental danger pool — how many 1s appear?
displayScaling({
  pool: n => d6(n),
  over: { from: 1, to: 8 },
  title: "danger pool — ones rolled",
  filter: [
    { when: dice => count(dice, v => v === 1) === 0, label: "fine",  color: "#a3e635" },
    { when: dice => count(dice, v => v === 1) === 1, label: "bad",   color: "#facc15" },
    { when: dice => count(dice, v => v === 1) === 2, label: "worse", color: "#f97316" },
    { when: dice => count(dice, v => v === 1) >= 3,  label: "worst", color: "#ef4444" },
  ],
  mode: "pct",
})`},Advanced:{"Exploding dice":`// pure exploding die: on max, add a fresh roll on top
const explode = poolBuilder(p =>
  p.when(p[0].shows(max), x => x.addDice(explode(p), "chain"))
)

display({ pool: explode(d6),  title: "exploding d6" })
display({ pool: explode(d8),  title: "exploding d8" })
display({ pool: explode(d10), title: "exploding d10" })`,"Custom dice":`display({ pool: die([1,2,3,3,4,5]), title: "skewed d6 (more 3s)" })
display({ pool: die([0,0,0,2,4,6]), title: "swingy d6 (high variance)" })
display({ pool: die([1,1,1,1,2,3]), title: "weak d6 (mostly 1s)" })`,"Random die (shuffle)":`// shuffle() puts a MIXED pool in random order, so a
// positional read becomes a random die. (On a uniform pool it's a no-op,
// since identical dice have no meaningful order.)
// Reroll a few times: the dice appear in a different order each run.
displayRoll({ pool: poolBuilder(p => p.shuffle())([d4, d6, d8]), title: "mixed pool, random order" })

// a uniformly-random die of the pool crits (+5 when it shows its own max)
const randomCrit = poolBuilder(p => {
  const r = p.shuffle()
  return r.when(r[0].shows(max), x => x.addBonus(5, "crit"))
})
display({ pool: randomCrit([d4, d6, d8]), title: "random-die crit (+5 on its max)" })`},Cumulative:{"Roll until success":`displayCumulative({
  pool: d6(3),
  over: { attempts: 8 },
  filter: dice => total(dice) >= 7,
  title: "3d6 — P(sum ≥ 7) over N attempts",
})

displayCumulative({
  pool: d6(3),
  over: { attempts: 12 },
  filter: dice => total(dice) >= 12,
  title: "3d6 — P(sum ≥ 12) over N attempts",
})`,"Danger accumulation":`displayCumulative({
  pool: d6(3),
  over: { attempts: 10 },
  title: "3d6 danger — bad things over time",
  filter: [
    { when: dice => count(dice, v => v === 1) >= 1, label: "at least one 1",  color: "#ef4444" },
    { when: dice => count(dice, v => v === 1) >= 2, label: "at least two 1s", color: "#f97316" },
    { when: dice => count(dice, v => v === 6) >= 1, label: "at least one 6",  color: "#a3e635" },
  ],
})`}};function m(e){u(`examples`,t=>{Object.entries(p).forEach(([n,r])=>{let i=document.createElement(`div`);i.className=`ex-col`;let a=document.createElement(`div`);a.className=`ex-col-title`,a.textContent=n.toUpperCase(),i.appendChild(a),Object.entries(r).forEach(([t,n])=>{let r=document.createElement(`button`);r.className=`ex-btn`,r.textContent=t,r.addEventListener(`click`,()=>{window._editor&&window._editor.setValue(n),d(),o(e)}),i.appendChild(r)}),t.appendChild(i)})})}var h=`dicescript:draft`,g=`dicescript:projects`;function _(){try{return localStorage.getItem(h)}catch{return null}}function v(e){try{localStorage.setItem(h,e)}catch{}}function y(){try{return JSON.parse(localStorage.getItem(g)||`{}`)}catch{return{}}}function b(e,t){let n=y();n[e]=t;try{localStorage.setItem(g,JSON.stringify(n))}catch{}}function x(e){let t=y();delete t[e];try{localStorage.setItem(g,JSON.stringify(t))}catch{}}function S(){return JSON.stringify({format:`dicescript-projects`,version:1,projects:y()},null,2)}function C(e){let t=JSON.parse(e),n=t&&typeof t==`object`&&t.projects?t.projects:t;if(!n||typeof n!=`object`)throw Error(`not a projects file`);let r=y(),i=0;for(let[e,t]of Object.entries(n))typeof t==`string`&&(r[e]=t,i++);try{localStorage.setItem(g,JSON.stringify(r))}catch{}return i}function w(e){u(`projects`,t=>E(t,e))}function T(e,t){e.innerHTML=``,E(e,t),requestAnimationFrame(()=>{document.documentElement.style.setProperty(`--accordion`,e.offsetHeight+`px`)})}function E(e,t){let n=document.createElement(`div`);n.className=`ex-col`;let r=document.createElement(`div`);r.className=`ex-col-title`,r.textContent=`PROJECTS`,n.appendChild(r);let i=document.createElement(`button`);i.className=`ex-btn proj-save`,i.textContent=`＋ Save current…`,i.addEventListener(`click`,()=>{let n=(window.prompt(`Project name:`)||``).trim();n&&(b(n,t()),T(e,t))}),n.appendChild(i);let a=document.createElement(`div`);a.className=`proj-io`;let s=document.createElement(`button`);s.className=`ex-btn`,s.textContent=`⭳ Export`,s.title=`Download all projects as a JSON file`,s.addEventListener(`click`,()=>{let e=new Blob([S()],{type:`application/json`}),t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`dicescript-projects.json`,n.click(),URL.revokeObjectURL(t)});let c=document.createElement(`button`);c.className=`ex-btn`,c.textContent=`⭱ Import`,c.title=`Load projects from a JSON file (merges)`,c.addEventListener(`click`,()=>{let n=document.createElement(`input`);n.type=`file`,n.accept=`.json,application/json`,n.addEventListener(`change`,()=>{let r=n.files&&n.files[0];if(!r)return;let i=new FileReader;i.onload=()=>{try{let n=C(i.result);T(e,t),window.alert(`Imported ${n} project${n===1?``:`s`}.`)}catch(e){window.alert(`Import failed: `+e.message)}},i.readAsText(r)}),n.click()}),a.appendChild(s),a.appendChild(c),n.appendChild(a);let l=y(),u=Object.keys(l).sort((e,t)=>e.localeCompare(t));if(!u.length){let e=document.createElement(`div`);e.className=`proj-empty`,e.textContent=`No saved projects yet.`,n.appendChild(e)}for(let r of u){let i=document.createElement(`div`);i.className=`proj-row`;let a=document.createElement(`button`);a.className=`ex-btn proj-load`,a.textContent=r,a.title=`Load `+r,a.addEventListener(`click`,()=>{window._editor&&window._editor.setValue(l[r]),d(),o(t)});let s=document.createElement(`button`);s.className=`proj-del`,s.textContent=`✕`,s.title=`Delete `+r,s.addEventListener(`click`,n=>{n.stopPropagation(),window.confirm(`Delete project "${r}"?`)&&(x(r),T(e,t))}),i.appendChild(a),i.appendChild(s),n.appendChild(i)}let f=document.createElement(`div`);f.className=`proj-warn`,f.textContent=`⚠ Saved in this browser only — clearing site data erases them. Export to keep a backup.`,n.appendChild(f),e.appendChild(n)}var D=`
/** A face-set (the die "kind"). */
declare class DieKind { readonly name: string; }

/** Per-die sentinels for shows() — resolved against each die's own bounds. */
declare const max: unique symbol;
declare const min: unique symbol;

/** A resolved pool handed to predicates / builder bodies — every read is concrete. */
declare class PoolView {
  /** Active dice count (structural). */
  readonly size: number;
  /** Possible value range, summed over active leaves. */
  readonly bounds: { min: number; max: number; span: number };
  /** Fold the active faces. reducer(acc, face); reducer required; current defaults make it total. */
  reduce<T>(reducer: (acc: T, current: number) => T, seed: T): T;
  /** Fold the discarded (ghost) faces. */
  reduceDiscarded<T>(reducer: (acc: T, current: number) => T, seed: T): T;
  /** Every active die shows value / a value in the set / its own max|min. */
  shows(spec: number | number[] | typeof max | typeof min): boolean;
  /** Match die kind by face-multiset (structural). */
  is(kind: Pool | DieKind | (Pool | DieKind)[]): boolean;
  /** Sub-pool of the n highest / lowest active dice (a live view). */
  highest(n: number): PoolView;
  lowest(n: number): PoolView;
  /** Reorder by rolled value. */
  sort(dir?: 'asc' | 'desc'): PoolView;
  /** Sub-pool of n active dice chosen uniformly at random, in draw order (a live view). */
  sample(n: number): PoolView;
  /** The active dice in a uniformly random order (no-op on a uniform pool). */
  shuffle(): PoolView;
  /** Positional sub-pool (fragile — prefer label access). */
  at(i: number): PoolView;
  /** Provenance sub-pool of dice added under this label (robust). */
  label(name: string): PoolView;
  /** Add dice (count of same kind, a pool, or an array), under an optional provenance label. */
  addDice(arg: Pool | PoolView | number | any[], label?: string): PoolView;
  /** Remove the receiver's active dice (they become grayed ghosts); returns the root pool. */
  discard(): PoolView;
  /** cond ? transform(pool) : pool. */
  when(cond: boolean, transform: (p: PoolView) => PoolView): PoolView;
  // fluent stdlib sugar (website prototype-promotion):
  readonly total: number; readonly sum: number;
  readonly maxed: number; readonly floored: number; readonly product: number;
  count(pred: (face: number) => boolean): number;
  keepHigh(n: number): PoolView; keepLow(n: number): PoolView;
  addBonus(n: number, label?: string): PoolView;
  advantage(extra?: number): PoolView; disadvantage(extra?: number): PoolView;
}

/** A pool template (value-free). Callable for copies: d6(10). */
declare class Pool {
  readonly size: number;
  addDice(arg: Pool | number | any[], label?: string): Pool;
  highest(n: number): Pool; lowest(n: number): Pool; sort(dir?: string): Pool; discard(): Pool;
  keepHigh(n: number): Pool; keepLow(n: number): Pool;
  addBonus(n: number, label?: string): Pool;
  advantage(extra?: number): Pool; disadvantage(extra?: number): Pool;
}
type CallablePool = ((n?: number) => Pool) & Pool;

/** category := predicate | { when, label?, color? };  filter := category | category[] */
type Predicate = (dice: PoolView) => boolean;
type Category = Predicate | { when: Predicate; label?: string; color?: string };
type Filter = Category | Category[];

declare interface RawOutcome {
  prob: number; barred: boolean;
  dice: Array<{ name: string; face: number }>;
  ghosts: Array<{ name: string; face: number }>;
  view: PoolView;
}

// ── engine constructors / data functions ─────────────────────────

/** die(n) faces 1..n; die([faces]) explicit faces (repeats = weighting). */
declare function die(spec: number | number[], name?: string): CallablePool;
/** Coerce a pool, array of pools, or kind into one pool. */
declare function pool(x: Pool | Pool[] | null, n?: number): Pool;
/** Wrap a builder body. Reads inside it are concrete per resumption (effect boundary). */
declare function poolBuilder<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Pool;

/** Sample one raw resolved outcome (active dice, ghosts, barred). */
declare function roll(pool: Pool): RawOutcome;
/** Full weighted enumeration; groupBy collapses outcomes (e.g. a reduce). Sums to 1 incl. barred. */
declare function outcomeProbability(pool: Pool, groupBy?: (v: PoolView) => any): any[];
/** Bucket a distribution by filter → { p[], barred, uncategorized }; sums to 1. */
declare function classify(pool: Pool, filter: Filter): { p: number[]; barred: number; uncategorized: number };
/** classify(build(x)) across a range. */
declare function scalingProbability(build: (x: number) => Pool, over: { from: number; to: number; step?: number }, filter: Filter): any[];
/** Per-category closed form 1-(1-p)^k over N independent attempts. */
declare function cumulativeProbability(pool: Pool, filter: Filter, over: { attempts: number }): any[];

// ── stdlib (in scope) ────────────────────────────────────────────
declare function sum(p: PoolView): number;
declare function total(p: PoolView): number;
declare function maxed(p: PoolView): number;
declare function floored(p: PoolView): number;
declare function product(p: PoolView): number;
declare function count(p: PoolView, pred: (face: number) => boolean): number;
declare function totalDiscarded(p: PoolView): number;
declare function countDiscarded(p: PoolView): number;
declare function keepHigh<T>(p: T, n: number): T;
declare function keepLow<T>(p: T, n: number): T;
declare function keepRandom<T>(p: T, n: number): T;
declare function dropRandom<T>(p: T, n: number): T;
declare function addBonus<T>(p: T, n: number, label?: string): T;
declare function advantage<T>(p: T, extra?: number): T;
declare function disadvantage<T>(p: T, extra?: number): T;

// ── interactive controls (website) ──────────────────────────────
/** A slider; returns its current number. Re-runs the script on change. */
declare function slider(label: string, opts?: { min?: number; max?: number; step?: number; value?: number }): number;
/** A dropdown; returns the chosen value. Options are values or { label, value }. */
declare function select<T>(label: string, options: T[] | { label: string; value: T }[], opts?: { value?: T }): T;
/** A checkbox; returns its boolean state. */
declare function toggle(label: string, value?: boolean): boolean;

// ── display (website) ────────────────────────────────────────────
declare function display(opts: { pool: Pool | (() => Pool); filter?: Filter; axis?: (v: PoolView) => number; title?: string; mode?: string }): void;
declare function displayRoll(opts: { pool: Pool | (() => Pool); axis?: (v: PoolView) => number; title?: string }): void;
declare function displayScaling(opts: { pool: (x: number) => Pool; over: { from: number; to: number; step?: number }; filter?: Filter; axis?: (v: PoolView) => number; title?: string; mode?: string }): void;
declare function displayCumulative(opts: { pool: Pool | (() => Pool); over: { attempts: number }; filter?: Filter; title?: string; mode?: string }): void;

// ── pre-built standard dice ──────────────────────────────────────
declare const d2: CallablePool;  declare const d4: CallablePool;  declare const d6: CallablePool;
declare const d8: CallablePool;  declare const d10: CallablePool; declare const d12: CallablePool;
declare const d20: CallablePool; declare const d24: CallablePool; declare const d30: CallablePool;
declare const d60: CallablePool; declare const d100: CallablePool;
`,O={display:{doc:`display({ pool, filter?, axis?, title?, mode? }) — histogram of the value-axis (default total) for every outcome, plus the barred / no-result segment and filter categories.`,params:[{label:`{ pool, filter?, axis?, title?, mode? }`,doc:`pool — pool or () => pool. filter — pass/fail fn or category list. axis — value reduction (default total). title/mode — presentation.`}]},displayRoll:{doc:`displayRoll({ pool, axis?, title? }) — sample one outcome and show active dice + grayed ghosts with a reroll button.`,params:[{label:`{ pool, axis?, title? }`,doc:`pool — pool or () => pool. axis — value reduction (default total). title — heading.`}]},displayScaling:{doc:`displayScaling({ pool, over, filter?, title? }) — classify(pool(x)) swept across over:{from,to,step?}.`,params:[{label:`{ pool, over, filter?, title?, mode? }`,doc:`pool — x => pool. over — { from, to, step? }. filter — category list. title/mode — presentation.`}]},displayCumulative:{doc:`displayCumulative({ pool, over, filter?, title? }) — P(≥1 success) over over:{attempts} independent attempts, per category.`,params:[{label:`{ pool, over, filter?, title?, mode? }`,doc:`pool — pool or () => pool. over — { attempts }. filter — category list. title/mode — presentation.`}]},die:{doc:`die(n) makes a die with faces 1..n; die([faces]) takes explicit faces (repeats encode weighting). Callable for copies: die(6)(3).`,params:[{label:`spec: number | number[]`,doc:`spec — side count, or explicit face array.`},{label:`name?: string`,doc:`name — optional display label carried onto the die.`,required:!1}]},poolBuilder:{doc:`poolBuilder(fn) wraps a builder body. Inside it every read is concrete (the effect boundary re-runs the body per outcome); use when(cond, p => p) and discard().`,params:[{label:`fn: (p, ...args) => pool`,doc:`fn — the builder; first arg is the pool, returns a pool.`}]},pool:{doc:`pool(x, n?) coerces a pool, an array of pools, or a kind into one pool.`,params:[{label:`x: Pool | Pool[] | null`,doc:`x — value to coerce.`},{label:`n?: number`,doc:`n — copies.`,required:!1}]},outcomeProbability:{doc:`outcomeProbability(pool, groupBy?) — full weighted enumeration, summing to 1 incl. barred mass. groupBy (e.g. total) collapses outcomes by value.`,params:[{label:`pool: Pool`,doc:`pool — to enumerate.`},{label:`groupBy?: (v) => any`,doc:`groupBy — caller-supplied collapse (e.g. total).`,required:!1}]},classify:{doc:`classify(pool, filter) → { p[], barred, uncategorized }. Barred is partitioned out before predicates run.`,params:[{label:`pool: Pool`,doc:`pool — to classify.`},{label:`filter: Filter`,doc:`filter — predicate, predicates, or { when, label?, color? } list.`}]},total:{doc:`total(dice) / sum(dice) — sum the active faces. Use inside a filter predicate; dice is the resolved PoolView.`,params:[{label:`dice: PoolView`,doc:`dice — the resolved outcome passed into a predicate.`}]},count:{doc:`count(dice, pred) — tally active faces matching pred (e.g. count(dice, v => v === 1)).`,params:[{label:`dice: PoolView`,doc:`dice — the resolved outcome.`},{label:`pred: (face) => boolean`,doc:`pred — face test.`}]}},k=[{label:`display`,kind:`Function`,insert:`display({ pool: $1 })`,sig:`({ pool, filter?, axis?, title?, mode? }) → void`,doc:`Histogram of a pool with barred segment and filter categories.`},{label:`displayRoll`,kind:`Function`,insert:`displayRoll({ pool: $1 })`,sig:`({ pool, axis?, title? }) → void`,doc:`Show one sampled outcome (active dice + grayed ghosts).`},{label:`displayScaling`,kind:`Function`,insert:`displayScaling({ pool: $1, over: { from: 1, to: 6 } })`,sig:`({ pool, over, filter?, title? }) → void`,doc:`Sweep classify(pool(x)) across a range.`},{label:`displayCumulative`,kind:`Function`,insert:`displayCumulative({ pool: $1, over: { attempts: 10 } })`,sig:`({ pool, over, filter?, title? }) → void`,doc:`P(≥1 success) across N attempts per category.`},{label:`die`,kind:`Function`,insert:`die($1)`,sig:`(spec, name?) → CallablePool`,doc:`die(n) or die([faces]); callable for copies.`},{label:`pool`,kind:`Function`,insert:`pool($1)`,sig:`(x, n?) → Pool`,doc:`Coerce a pool / array / kind into one pool.`},{label:`poolBuilder`,kind:`Function`,insert:`poolBuilder($1)`,sig:`(fn) → builder`,doc:`Wrap a builder body (effect boundary; reads are concrete).`},{label:`roll`,kind:`Function`,insert:`roll($1)`,sig:`(pool) → RawOutcome`,doc:`Sample one raw resolved outcome.`},{label:`outcomeProbability`,kind:`Function`,insert:`outcomeProbability($1)`,sig:`(pool, groupBy?) → outcomes`,doc:`Full weighted enumeration (incl. barred).`},{label:`classify`,kind:`Function`,insert:`classify($1)`,sig:`(pool, filter) → { p[], barred, uncategorized }`,doc:`Bucket a distribution by filter.`},{label:`scalingProbability`,kind:`Function`,insert:`scalingProbability($1)`,sig:`(build, over, filter) → rows`,doc:`classify(build(x)) across a range.`},{label:`cumulativeProbability`,kind:`Function`,insert:`cumulativeProbability($1)`,sig:`(pool, filter, over) → rows`,doc:`Per-category 1-(1-p)^k over N attempts.`},{label:`slider`,kind:`Function`,insert:`slider("$1", { min: 0, max: 10, value: 0 })`,sig:`(label, { min?, max?, step?, value? }) → number`,doc:`Interactive slider; returns its value, re-runs on change.`},{label:`select`,kind:`Function`,insert:`select("$1", [$2])`,sig:`(label, options, { value? }) → value`,doc:`Interactive dropdown; returns the chosen value.`},{label:`toggle`,kind:`Function`,insert:`toggle("$1", false)`,sig:`(label, value?) → boolean`,doc:`Interactive checkbox; returns its boolean state.`},{label:`max`,kind:`Variable`,insert:`max`,sig:`sentinel`,doc:`Per-die maximum-face sentinel for shows(max).`},{label:`min`,kind:`Variable`,insert:`min`,sig:`sentinel`,doc:`Per-die minimum-face sentinel for shows(min).`},{label:`total`,kind:`Function`,insert:`total($1)`,sig:`(dice) → number`,doc:`Sum the active faces (in a predicate).`},{label:`sum`,kind:`Function`,insert:`sum($1)`,sig:`(dice) → number`,doc:`Sum the active faces.`},{label:`count`,kind:`Function`,insert:`count($1)`,sig:`(dice, pred) → number`,doc:`Tally active faces matching pred.`},{label:`maxed`,kind:`Function`,insert:`maxed($1)`,sig:`(dice) → number`,doc:`Highest active face.`},{label:`floored`,kind:`Function`,insert:`floored($1)`,sig:`(dice) → number`,doc:`Lowest active face.`},{label:`keepHigh`,kind:`Function`,insert:`keepHigh($1)`,sig:`(p, n) → pool`,doc:`Keep the n best dice (discard the rest as ghosts).`},{label:`keepLow`,kind:`Function`,insert:`keepLow($1)`,sig:`(p, n) → pool`,doc:`Keep the n worst dice.`},{label:`dropRandom`,kind:`Function`,insert:`dropRandom($1)`,sig:`(p, n) → pool`,doc:`Discard n dice chosen uniformly at random.`},{label:`keepRandom`,kind:`Function`,insert:`keepRandom($1)`,sig:`(p, n) → pool`,doc:`Keep n dice chosen uniformly at random.`},{label:`addBonus`,kind:`Function`,insert:`addBonus($1)`,sig:`(p, n, label?) → pool`,doc:`Add a flat modifier as a constant die.`},{label:`d2`,kind:`Variable`,insert:`d2`,sig:`1d2`,doc:`Pre-built 1d2. d2(n) for n copies.`},{label:`d4`,kind:`Variable`,insert:`d4`,sig:`1d4`,doc:`Pre-built 1d4. d4(n) for n copies.`},{label:`d6`,kind:`Variable`,insert:`d6`,sig:`1d6`,doc:`Pre-built 1d6. d6(n) for n copies.`},{label:`d8`,kind:`Variable`,insert:`d8`,sig:`1d8`,doc:`Pre-built 1d8. d8(n) for n copies.`},{label:`d10`,kind:`Variable`,insert:`d10`,sig:`1d10`,doc:`Pre-built 1d10. d10(n) for n copies.`},{label:`d12`,kind:`Variable`,insert:`d12`,sig:`1d12`,doc:`Pre-built 1d12. d12(n) for n copies.`},{label:`d20`,kind:`Variable`,insert:`d20`,sig:`1d20`,doc:`Pre-built 1d20. d20(n) for n copies.`},{label:`d100`,kind:`Variable`,insert:`d100`,sig:`1d100`,doc:`Pre-built 1d100. d100(n) for n copies.`}];function A(){let n=t.typescript.javascriptDefaults;n.setCompilerOptions({...n.getCompilerOptions(),allowJs:!0,allowNonTsExtensions:!0,noLib:!1,target:t.typescript.ScriptTarget.ES2020}),n.addExtraLib(D,`ts:dicescript.d.ts`),n.setDiagnosticsOptions({noSemanticValidation:!0,noSyntaxValidation:!0});let r={Function:t.CompletionItemKind.Function,Variable:t.CompletionItemKind.Variable};t.registerCompletionItemProvider(`dicescript`,{provideCompletionItems(e,n){let i=e.getWordUntilPosition(n),a={startLineNumber:n.lineNumber,endLineNumber:n.lineNumber,startColumn:i.startColumn,endColumn:i.endColumn};return{suggestions:k.map(e=>{let n=O[e.label],i=n?n.doc:e.doc;return{label:e.label,kind:r[e.kind],detail:e.doc,documentation:{value:"```typescript\n"+e.sig+`
\`\`\`

`+i},insertText:e.insert,insertTextRules:t.CompletionItemInsertTextRule.InsertAsSnippet,sortText:`0`+e.label,range:a}})}}}),t.registerSignatureHelpProvider(`dicescript`,{signatureHelpTriggerCharacters:[`(`,`,`],signatureHelpRetriggerCharacters:[`,`],provideSignatureHelp(e,t){let n=e.getValueInRange({startLineNumber:1,startColumn:1,endLineNumber:t.lineNumber,endColumn:t.column}),r=0,i=0,a=-1;for(let e=n.length-1;e>=0;e--){let t=n[e];if(t===`)`){r++;continue}if(t===`(`){if(r>0){r--;continue}a=e;break}t===`,`&&r===0&&i++}if(a===-1)return null;let o=n.slice(0,a).match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);if(!o)return null;let s=O[o[1]];if(!s)return null;let c=Math.min(i,s.params.length-1);return{value:{signatures:[{label:o[1]+`(`+s.params.map(e=>e.label).join(`, `)+`)`,documentation:{value:s.doc},parameters:s.params.map(e=>({label:e.label,documentation:{value:(e.required===!1?`_(optional)_ `:``)+e.doc}}))}],activeSignature:0,activeParameter:c},dispose(){}}}}),t.registerHoverProvider(`dicescript`,{provideHover(t,n){let r=t.getWordAtPosition(n);if(!r)return null;let i=k.find(e=>e.label===r.word);if(!i)return null;let a=O[r.word],o=a?a.doc:i.doc;return{range:new e(n.lineNumber,r.startColumn,n.lineNumber,r.endColumn),contents:[{value:"```typescript\n"+i.sig+"\n```"},{value:o}]}}})}self.MonacoEnvironment={getWorker(e,t){return new a}};var j=window.ResizeObserver;window.ResizeObserver=class extends j{constructor(e){super((t,n)=>{requestAnimationFrame(()=>{try{e(t,n)}catch{}})})}},window.addEventListener(`error`,e=>{if(e.message&&e.message.includes(`ResizeObserver loop`))return e.stopImmediatePropagation(),e.preventDefault(),!1},!0);function M(){return window._editor?window._editor.getValue():``}function N(){o(M)}window._toggleExampleMenu=()=>m(M),window._toggleProjects=()=>w(M),window._runCode=N,document.addEventListener(`keydown`,e=>{(e.ctrlKey||e.metaKey)&&e.key===`Enter`&&!window._editor&&(e.preventDefault(),N())}),s(),A(),window._editor=r.create(document.getElementById(`monaco-container`),{value:_()??p[`Dice Basics`][`Simple dice`],language:`dicescript`,theme:`diceTheme`,fontSize:13,lineHeight:22,fontFamily:`'DM Mono', monospace`,minimap:{enabled:!1},scrollBeyondLastLine:!1,renderLineHighlight:`line`,overviewRulerLanes:0,hideCursorInOverviewRuler:!0,overviewRulerBorder:!1,folding:!1,lineNumbers:`on`,glyphMargin:!1,lineDecorationsWidth:0,lineNumbersMinChars:3,padding:{top:12,bottom:12},tabSize:2,wordWrap:`off`,automaticLayout:!0,scrollbar:{verticalScrollbarSize:6,horizontalScrollbarSize:6},quickSuggestions:!0,suggestOnTriggerCharacters:!0,acceptSuggestionOnEnter:`on`,tabCompletion:`on`,suggest:{snippetsPreventQuickSuggestions:!1}}),window._editor.addCommand(n.CtrlCmd|i.Enter,N);var P=null;window._editor.onDidChangeModelContent(()=>{clearTimeout(P),P=setTimeout(()=>v(M()),400)}),window._editor.onDidFocusEditorText(()=>document.body.classList.add(`editor-focused`)),window._editor.onDidBlurEditorText(()=>document.body.classList.remove(`editor-focused`));var F=window.visualViewport;if(F){let e=()=>{document.documentElement.style.setProperty(`--vvh`,F.height+`px`),document.body.classList.toggle(`keyboard-open`,window.innerHeight-F.height>150)};F.addEventListener(`resize`,e),F.addEventListener(`scroll`,e),e()}else window._editor.onDidFocusEditorText(()=>document.body.classList.add(`keyboard-open`)),window._editor.onDidBlurEditorText(()=>document.body.classList.remove(`keyboard-open`));document.fonts.load(`13px "DM Mono"`).then(()=>{r.remeasureFonts()}),N();