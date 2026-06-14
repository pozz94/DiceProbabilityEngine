import { runCode } from './display.js';
import { toggleMenu, closeMenu } from './menu.js';

// ================================================================
// Built-in examples (new DiceScript syntax) + accordion menu logic.
// Display functions take a single options object; pools are built
// with die()/poolsOf/arrays; builders use poolBuilder + when(cond, fn).
// ================================================================

export const EXAMPLES = {
  "Dice Basics": {
    "Simple dice": `// Basic dice pools — display() takes one options object
display({ pool: d6,                 title: "d6" })
display({ pool: d6(2),              title: "2d6" })
display({ pool: d6(4).keepHigh(3),  title: "4d6 keep 3" })
display({ pool: d6(4).keepLow(1),   title: "4d6 keep lowest" })
display({ pool: d8.addBonus(3),     title: "d8 + 3" })
display({ pool: die([1,3,5,7,9]),   title: "odd d5" })
display({ pool: die([2,2,3,3,4,6]), title: "weighted d6" })`,

    "Advantage / disadvantage": `// keep best / worst of two d20
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
})`,

    "Pools & keep": `display({ pool: d6(3).keepHigh(1), title: "3d6 keep 1 (best)" })
display({ pool: d6(3).keepHigh(2), title: "3d6 keep 2" })
display({ pool: d6(3),             title: "3d6 keep all" })
display({ pool: d6(6).keepHigh(3), title: "6d6 keep 3" })`,
  },

  "Attack Mechanics": {
    "Nimble attack": `// Nimble: a max explodes, a min (on the first roll) is a miss.
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
display({ pool: nimbleAttack(d6, { vicious: 1, bonus: 2 }), title: "d6 vicious+bonus", filter: dice => total(dice) > 0 })`,

    "Weapon comparison": `// same average, different shape — bars scale with avg damage
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
})`,
  },

  "Interactive": {
    "Live controls": `// drag the controls (above the chart) — it re-runs live
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
})`,

    "Pool size & target": `// how pool size trades off against a target number
const dieN  = select("die", [4, 6, 8, 10, 12], { value: 6 })
const count = slider("pool size", { min: 1, max: 8, value: 3 })
const target = slider("target", { min: 1, max: 40, value: 12 })
const best = toggle("keep best only", false)

const p = best ? die(dieN)(count).keepHigh(1) : die(dieN)(count)
display({ pool: p, filter: dice => total(dice) >= target, title: "roll vs target" })`,
  },

  "Pass / Fail": {
    "Threshold checks": `displayScaling({
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
})`,

    "Danger dice": `// environmental danger pool — how many 1s appear?
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
})`,
  },

  "Advanced": {
    "Exploding dice": `// pure exploding die: on max, add a fresh roll on top
const explode = poolBuilder(p =>
  p.when(p[0].shows(max), x => x.addDice(explode(p), "chain"))
)

display({ pool: explode(d6),  title: "exploding d6" })
display({ pool: explode(d8),  title: "exploding d8" })
display({ pool: explode(d10), title: "exploding d10" })`,

    "Custom dice": `display({ pool: die([1,2,3,3,4,5]), title: "skewed d6 (more 3s)" })
display({ pool: die([0,0,0,2,4,6]), title: "swingy d6 (high variance)" })
display({ pool: die([1,1,1,1,2,3]), title: "weak d6 (mostly 1s)" })`,

    "Random die (shuffle)": `// shuffle() puts a MIXED pool in random order, so a
// positional read becomes a random die. (On a uniform pool it's a no-op,
// since identical dice have no meaningful order.)
// Reroll a few times: the dice appear in a different order each run.
displayRoll({ pool: poolBuilder(p => p.shuffle())([d4, d6, d8]), title: "mixed pool, random order" })

// a uniformly-random die of the pool crits (+5 when it shows its own max)
const randomCrit = poolBuilder(p => {
  const r = p.shuffle()
  return r.when(r[0].shows(max), x => x.addBonus(5, "crit"))
})
display({ pool: randomCrit([d4, d6, d8]), title: "random-die crit (+5 on its max)" })`,
  },

  "Cumulative": {
    "Roll until success": `displayCumulative({
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
})`,

    "Danger accumulation": `displayCumulative({
  pool: d6(3),
  over: { attempts: 10 },
  title: "3d6 danger — bad things over time",
  filter: [
    { when: dice => count(dice, v => v === 1) >= 1, label: "at least one 1",  color: "#ef4444" },
    { when: dice => count(dice, v => v === 1) >= 2, label: "at least two 1s", color: "#f97316" },
    { when: dice => count(dice, v => v === 6) >= 1, label: "at least one 6",  color: "#a3e635" },
  ],
})`,
  },
};

export function toggleExampleMenu(getEditorValue) {
  toggleMenu('examples', (inner) => {
    Object.entries(EXAMPLES).forEach(([colLabel, items]) => {
      const col = document.createElement('div');
      col.className = 'ex-col';
      const heading = document.createElement('div');
      heading.className = 'ex-col-title';
      heading.textContent = colLabel.toUpperCase();
      col.appendChild(heading);
      Object.entries(items).forEach(([name, code]) => {
        const btn = document.createElement('button');
        btn.className = 'ex-btn';
        btn.textContent = name;
        btn.addEventListener('click', () => {
          if (window._editor) window._editor.setValue(code);
          closeMenu();
          runCode(getEditorValue);
        });
        col.appendChild(btn);
      });
      inner.appendChild(col);
    });
  });
}
