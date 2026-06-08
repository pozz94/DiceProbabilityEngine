import { runCode } from './display.js';

// ================================================================
// Built-in examples and example accordion menu logic
// ================================================================

export const EXAMPLES = {
  "Dice Basics": {
    "Simple dice": `// Basic dice pools
display(d6,                        "d6")
display(d6.addDice(1),             "2d6")
display(d6.addDice(3).keepHigh(3), "4d6 keep 3")
display(d6.addDice(3).keepLow(1),  "4d6 keep lowest")
display(d8.addBonus(3),            "d8 + 3")
display(customDie([1,3,5,7,9]),    "odd d5")
display(customDie([2,2,3,3,4,6]),  "non-standard d6")`,

    "Advantage / disadvantage": `// Advantage and disadvantage
display(d20.addDice(1).keepHigh(1), "d20 advantage",    dice => ev(dice) >= 10)
display(d20,                        "d20 normal",       dice => ev(dice) >= 10)
display(d20.addDice(1).keepLow(1),  "d20 disadvantage", dice => ev(dice) >= 10)

// Scaling: effect of advantage
displayScaling(
  n => n >= 0
    ? d20.addDice(n).keepHigh(1)
    : d20.addDice(-n).keepLow(1),
  {from: -3, to: 3},
  "advantage scaling (-=disadv, +=adv)",
  dice => ev(dice) >= 10,
  {mode: 'pct'}
)`,

    "Pools & keep": `// Keep highest / lowest
display(d6.addDice(2).keepHigh(1),  "3d6 keep 1 (best)")
display(d6.addDice(2).keepHigh(2),  "3d6 keep 2")
display(d6.addDice(2),              "3d6 keep all")
display(d6.addDice(5).keepHigh(3),  "6d6 keep 3")`,
  },

  "Attack Mechanics": {
    "Nimble attack": `// Nimble RPG: exploding dice, min=fail, max=explode
const nimbleAttack = (base, {advantage=0, vicious=0, bonus=0}={}, first=true) => {
  base = pool(base)
  const p = base.addDice(Math.abs(advantage))
  const kept = advantage < 0 ? p.keepLow(base.size) : p.keepHigh(base.size)
  return kept.addBonus(bonus, "bonus").then(kept =>
    kept[0]
      .when(kept[0].isMax, kept.addDice(
        nimbleAttack(base.addDice(vicious, "vicious"), {}, false), "explosion"
      ))
      .when(first ? kept[0].isMin : 0, kept.discard())
      .otherwise(kept)
  )
}

displayRoll(nimbleAttack(d6, {advantage:1, vicious:1, bonus:2}), "roll it")
display(nimbleAttack(d6),                           "d6 base",       dice => ev(dice) > 0)
display(nimbleAttack(d6, {advantage: 1}),           "d6 advantage",  dice => ev(dice) > 0)
display(nimbleAttack(d6, {vicious:1, bonus:2}),     "d6 vicious+bonus", dice => ev(dice) > 0)`,

    "Weapon comparison": `// Compare weapons by expected damage + hit distribution
const nimbleAttack = (base, {advantage=0, vicious=0, bonus=0}={}, first=true) => {
  base = pool(base)
  const p = base.addDice(Math.abs(advantage))
  const kept = advantage < 0 ? p.keepLow(base.size) : p.keepHigh(base.size)
  return kept.addBonus(bonus, "bonus").then(kept =>
    kept[0]
      .when(kept[0].isMax, kept.addDice(
        nimbleAttack(base.addDice(vicious, "vicious"), {}, false), "explosion"
      ))
      .when(first ? kept[0].isMin : 0, kept.discard())
      .otherwise(kept)
  )
}

const degrees = [
  {label: "miss", color: "#ef4444", fn: dice => ev(dice) === 0},
  {label: "hit",  color: "#60c8f0", fn: dice => ev(dice) > 0 && ev(dice) < 8},
  {label: "big",  color: "#a3e635", fn: dice => ev(dice) >= 8},
]

displayScaling(
  [
    nimbleAttack(die(2).addDice(5)),
    nimbleAttack(die(4).addDice(2)),
    nimbleAttack(die(6).addDice(1)),
    nimbleAttack(die(8)),
    nimbleAttack(die(10)),
  ],
  {labels: ["d2+5","d4+2","d6+1","d8","d10"]},
  "weapon comparison",
  degrees,
  {mode: 'ev'}
)`,

    "Die size scaling": `// How does die size affect nimble attack?
const nimbleAttack = (base, {advantage=0, vicious=0, bonus=0}={}, first=true) => {
  base = pool(base)
  const p = base.addDice(Math.abs(advantage))
  const kept = advantage < 0 ? p.keepLow(base.size) : p.keepHigh(base.size)
  return kept.addBonus(bonus, "bonus").then(kept =>
    kept[0]
      .when(kept[0].isMax, kept.addDice(
        nimbleAttack(base.addDice(vicious, "vicious"), {}, false), "explosion"
      ))
      .when(first ? kept[0].isMin : 0, kept.discard())
      .otherwise(kept)
  )
}

displayScaling(
  n => nimbleAttack(die(n), {vicious:1}),
  {from: 4, to: 12, step: 2},
  "nimble attack by die size (vicious 1)",
  [
    {label: "miss", color: "#ef4444", fn: dice => ev(dice) === 0},
    {label: "hit",  color: "#60c8f0", fn: dice => ev(dice) > 0 && ev(dice) < 10},
    {label: "big",  color: "#a3e635", fn: dice => ev(dice) >= 10},
  ],
  {mode: 'pct'}
)`,
  },

  "Pass / Fail": {
    "Threshold checks": `// Roll vs target number — how does pool size help?
displayScaling(
  n => d6.addDice(n - 1),
  {from: 1, to: 6},
  "Nd6 pool vs target 10",
  dice => ev(dice) >= 10,
  {mode: 'pct'}
)

displayScaling(
  n => d6.addDice(n - 1).keepHigh(1),
  {from: 1, to: 6},
  "Nd6 keep best vs target 4",
  dice => ev(dice) >= 4,
  {mode: 'pct'}
)`,

    "Danger dice": `// Environmental danger pool — how many 1s appear?
displayScaling(
  n => d6.addDice(n - 1),
  {from: 1, to: 8},
  "danger pool — ones rolled",
  [
    {label: "fine",  color: "#a3e635", fn: dice => dice.filter(d => d === 1).length === 0},
    {label: "bad",   color: "#facc15", fn: dice => dice.filter(d => d === 1).length === 1},
    {label: "worse", color: "#f97316", fn: dice => dice.filter(d => d === 1).length === 2},
    {label: "worst", color: "#ef4444", fn: dice => dice.filter(d => d === 1).length >= 3},
  ],
  {mode: 'pct'}
)`,

    "Opposed rolls": `// Attacker vs defender — P(attacker wins)
displayScaling(
  n => d6.addDice(n - 1),
  {from: 1, to: 5},
  "attacker pool size (vs 2d6 defender)",
  dice => ev(dice) > 7,
  {mode: 'pct'}
)`,
  },

  "Advanced": {
    "Exploding dice": `// Pure exploding d6: re-roll and add on max
const explode = (base, depth=0) => {
  if (depth > 8) return pool(base)
  return pool(base).then(kept =>
    kept[0]
      .when(kept[0].isMax, kept.addDice(explode(base, depth+1), "chain"))
      .otherwise(kept)
  )
}

display(explode(d6),  "exploding d6")
display(explode(d8),  "exploding d8")
display(explode(d10), "exploding d10")`,

    "Custom dice": `// Non-standard face distributions
display(customDie([1,2,3,3,4,5]),       "skewed d6 (more 3s)")
display(customDie([0,0,0,2,4,6]),       "swingy d6 (high variance)")
display(customDie([1,1,1,1,2,3]),       "weak d6 (mostly 1s)")

displayScaling(
  [
    customDie([1,2,3,3,4,5]).addDice(1),
    d6.addDice(1),
    customDie([0,0,0,2,4,6]).addDice(1),
  ],
  {labels: ["skewed 2d6","normal 2d6","swingy 2d6"]},
  "custom die comparison",
  dice => ev(dice) >= 7,
  {mode: 'pct'}
)`,
  },

  "Cumulative": {
    "Roll until success": `// How many attempts to hit a target sum?
displayCumulative(
  die(6).addDice(2),
  "3d6 — P(sum ≥ 7) over N attempts",
  dice => ev(dice) >= 7,
  {attempts: 8}
)

displayCumulative(
  die(6).addDice(2),
  "3d6 — P(sum ≥ 12) over N attempts",
  dice => ev(dice) >= 12,
  {attempts: 12}
)`,

    "Danger accumulation": `// How likely to see at least one 1 (or more) in N danger rolls?
displayCumulative(
  die(6).addDice(2),
  "3d6 danger — bad things over time",
  [
    {label: "at least one 1",   color: "#ef4444", fn: dice => dice.filter(d=>d===1).length >= 1},
    {label: "at least two 1s",  color: "#f97316", fn: dice => dice.filter(d=>d===1).length >= 2},
    {label: "at least one 6",   color: "#a3e635", fn: dice => dice.includes(6)},
  ],
  {attempts: 10}
)`,

    "Encounter table": `// Wilderness encounter: roll d6, 1 = encounter
displayCumulative(
  d6,
  "d6 encounter — P(at least one in N days)",
  dice => ev(dice) === 1,
  {attempts: 14}
)

displayCumulative(
  d6.addDice(1),
  "2d6 encounter — P(snake eyes in N days)",
  dice => ev(dice) === 2,
  {attempts: 20}
)`,

    "Critical hits": `// P(at least one crit) over N attacks
const nimbleAttack = (base, opts={}, first=true) => {
  base = pool(base)
  const kept = base.keepHigh(base.size)
  return kept.then(kept =>
    kept[0]
      .when(kept[0].isMax, kept.addDice(
        nimbleAttack(base, {}, false), "explosion"
      ))
      .when(first ? kept[0].isMin : 0, kept.discard())
      .otherwise(kept)
  )
}

displayCumulative(
  nimbleAttack(d6),
  "P(at least one big hit) in N attacks",
  [
    {label: "hit",      color: "#60c8f0", fn: dice => ev(dice) > 0 && ev(dice) < 10},
    {label: "big hit",  color: "#a3e635", fn: dice => ev(dice) >= 10},
  ],
  {attempts: 10}
)`,
  },
};

export function populateExampleMenu(getEditorValue) {
  const inner = document.getElementById('example-accordion-inner');
  if (inner.children.length) return;
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
        closeExampleMenu();
        runCode(getEditorValue);
      });
      col.appendChild(btn);
    });
    inner.appendChild(col);
  });
}

export function toggleExampleMenu(getEditorValue) {
  const acc = document.getElementById('example-accordion');
  if (acc.classList.contains('open')) {
    closeExampleMenu();
  } else {
    populateExampleMenu(getEditorValue);
    acc.classList.add('open');
    requestAnimationFrame(() => {
      const h = document.getElementById('example-accordion-inner').offsetHeight;
      document.documentElement.style.setProperty('--accordion', h + 'px');
    });
    document.getElementById('examples-btn').textContent = 'EXAMPLES ▴';
  }
}

export function closeExampleMenu() {
  document.getElementById('example-accordion').classList.remove('open');
  document.documentElement.style.setProperty('--accordion', '0px');
  document.getElementById('examples-btn').textContent = 'EXAMPLES ▾';
}
