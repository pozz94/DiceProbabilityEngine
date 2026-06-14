import { describe, it, expect } from 'vitest';
import {
  die, pool, poolBuilder, max, min,
  roll, outcomeProbability, classify, scalingProbability, cumulativeProbability,
} from './engine.js';
import { d6, d20, total, sum, keepHigh, keepLow, addBonus, count } from './std.js';

// ---------------------------------------------------------------- helpers
const dist = (p, g = total) => outcomeProbability(p, g);
const probOf = (p, value, g = total) => {
  const row = dist(p, g).find(r => r.value === value);
  return row ? row.prob : 0;
};
const sumProbs = p => outcomeProbability(p).reduce((a, o) => a + o.prob, 0);
const barredMass = p => outcomeProbability(p).filter(o => o.barred).reduce((a, o) => a + o.prob, 0);

// ---------------------------------------------------------------- §1 dice
describe('die', () => {
  it('d6 is uniform, sums to 1, mean 3.5', () => {
    const rows = dist(die(6));
    expect(sumProbs(die(6))).toBeCloseTo(1, 10);
    for (const r of rows) expect(r.prob).toBeCloseTo(1 / 6, 10);
    const mean = rows.reduce((a, r) => a + r.value * r.prob, 0);
    expect(mean).toBeCloseTo(3.5, 10);
  });

  it('die([faces]) repeated faces encode weighting', () => {
    expect(probOf(die([1, 1, 1, 2]), 1)).toBeCloseTo(3 / 4, 10);
    expect(probOf(die([1, 1, 1, 2]), 2)).toBeCloseTo(1 / 4, 10);
  });

  it('poolsOf: die(6)(2) is 2d6, peak at 7', () => {
    const s = (v) => probOf(die(6)(2), v);
    expect(sumProbs(die(6)(2))).toBeCloseTo(1, 10);
    for (let v = 2; v <= 12; v++) if (v !== 7) expect(s(7)).toBeGreaterThanOrEqual(s(v));
  });

  it('array literal is coerced to a pool', () => {
    expect(sumProbs(pool([die(6), die(6)]))).toBeCloseTo(1, 10);
    expect(probOf([die(6), die(6)], 7)).toBeCloseTo(6 / 36, 10);
  });
});

// ---------------------------------------------------------------- §4 reads
describe('reads', () => {
  it('reduce folds active faces; sum/total presets agree', () => {
    expect(probOf(die(6)(3), 18)).toBeCloseTo(1 / 216, 10);
    const o = roll(die(6));
    expect(total(o.view)).toBe(o.dice[0].face);
  });

  it('shows(max|min) are per-die sentinels via bounds', () => {
    const r = outcomeProbability(die(6));
    // every outcome view: shows(max) true iff face 6
    for (const o of r) {
      expect(o.view.shows(max)).toBe(o.dice[0].face === 6);
      expect(o.view.shows(min)).toBe(o.dice[0].face === 1);
    }
  });

  it('size is structural active count; bounds sums per-die extremes', () => {
    expect(die(6)(3).size).toBe(3);
    expect(roll(die(6)(3)).view.bounds).toEqual({ min: 3, max: 18, span: 15 });
  });

  it('is() matches kind by face-multiset, name irrelevant', () => {
    expect(roll(die(6)).view.is(die([1, 2, 3, 4, 5, 6]))).toBe(true);
    expect(roll(die(6)).view.is(die(8))).toBe(false);
  });
});

// ---------------------------------------------------------------- §10 discard / ghosts
describe('discard and ghosts', () => {
  const dropMaxToBar = poolBuilder(p => p.when(p.shows(max), x => x.discard()));

  it('whole-pool discard yields barred mass kept in the sample space', () => {
    expect(barredMass(dropMaxToBar(die(6)))).toBeCloseTo(1 / 6, 10);
    expect(sumProbs(dropMaxToBar(die(6)))).toBeCloseTo(1, 10);
  });

  it('keepHigh discards the complement as ghosts; reads ignore them', () => {
    const kh = poolBuilder(p => keepHigh(p, 1));
    // 2d6 keep best — mean strictly above 3.5
    const rows = dist(kh(die(6)(2)));
    const mean = rows.reduce((a, r) => a + r.value * r.prob, 0);
    expect(mean).toBeGreaterThan(3.5);
    expect(sumProbs(kh(die(6)(2)))).toBeCloseTo(1, 8);
  });

  it('keepLow is the mirror of keepHigh on a fair die', () => {
    const kh = poolBuilder(p => keepHigh(p, 1));
    const kl = poolBuilder(p => keepLow(p, 1));
    for (let v = 1; v <= 6; v++)
      expect(probOf(kh(die(6)(2)), v)).toBeCloseTo(probOf(kl(die(6)(2)), 7 - v), 8);
  });

  it('ghosts retain their rolled value for reduceDiscarded', () => {
    const o = roll(poolBuilder(p => keepHigh(p, 1))(die(6)(2)));
    expect(o.ghosts.length).toBe(1);
    expect(o.dice.length).toBe(1);
  });
});

// ---------------------------------------------------------------- §3 addBonus
describe('addBonus', () => {
  const plus3 = poolBuilder(p => addBonus(p, 3));
  it('d6+3 mean 6.5, range 4..9', () => {
    const rows = dist(plus3(die(6)));
    const mean = rows.reduce((a, r) => a + r.value * r.prob, 0);
    expect(mean).toBeCloseTo(6.5, 10);
    expect(Math.min(...rows.map(r => r.value))).toBe(4);
    expect(Math.max(...rows.map(r => r.value))).toBe(9);
  });
});

// ---------------------------------------------------------------- §5 correlation
describe('correlation by shared atoms', () => {
  // shows(max) and shows(min) on the same atom must be jointly impossible.
  const both = poolBuilder(p =>
    p.when(p.at(0).shows(max) && p.at(0).shows(min), x => x.discard()));
  it('the "max and min" world is never constructed', () => {
    expect(barredMass(both(die(6)))).toBeCloseTo(0, 10);
    expect(sumProbs(both(die(6)))).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------- §8 recursion (explosion)
describe('poolBuilder recursion', () => {
  const explode = poolBuilder(p =>
    p.when(p.at(0).shows(max), x => x.addDice(explode(p), 'chain')));

  it('exploding d6: P(1..5)=1/6, P(6)=0, mass conserved', () => {
    expect(probOf(explode(die(6)), 6)).toBeCloseTo(0, 8);
    for (let v = 1; v <= 5; v++) expect(probOf(explode(die(6)), v)).toBeCloseTo(1 / 6, 6);
    for (let v = 7; v <= 11; v++) expect(probOf(explode(die(6)), v)).toBeGreaterThan(0);
    expect(sumProbs(explode(die(6)))).toBeCloseTo(1, 6);
  });
});

// ---------------------------------------------------------------- §12 worked example (Nimble)
describe('nimble attack', () => {
  const nimbleAttack = poolBuilder((p, { advantage = 0, vicious = 0, bonus = 0 } = {}, first = true) =>
    addBonus(p, bonus, 'bonus').addDice(Math.abs(advantage))
      .when(advantage < 0, x => keepLow(x, x.size - Math.abs(advantage)))
      .when(advantage > 0, x => keepHigh(x, x.size - advantage))
      .when(p.at(0).shows(max), x =>
        x.addDice(nimbleAttack(p.addDice(vicious, 'vicious'), {}, false), 'explosion'))
      .when(p.at(0).shows(min) && first, x => x.discard()));

  it('P(miss) = 1/6 on a bare d6, mass conserved', () => {
    expect(barredMass(nimbleAttack(die(6)))).toBeCloseTo(1 / 6, 6);
    expect(sumProbs(nimbleAttack(die(6)))).toBeCloseTo(1, 6);
  });

  it('explosion lets the total exceed the die max', () => {
    const rows = dist(nimbleAttack(die(6)));
    expect(Math.max(...rows.map(r => r.value))).toBeGreaterThan(6);
  });

  it('first=false never misses', () => {
    expect(barredMass(nimbleAttack(die(6), {}, false))).toBeCloseTo(0, 8);
  });
});

// ---------------------------------------------------------------- §11 data functions
describe('classify / scaling / cumulative', () => {
  it('classify partitions, barred is a sibling, sums to 1', () => {
    const danger = poolBuilder(p => p);
    const c = classify(danger(die(6)(3)), [
      d => count(d, v => v === 1) === 0,
      d => count(d, v => v === 1) === 1,
      d => count(d, v => v === 1) >= 2,
    ]);
    expect(c.p.reduce((a, b) => a + b, 0) + c.barred + c.uncategorized).toBeCloseTo(1, 10);
  });

  it('scalingProbability returns one classify row per x', () => {
    const rows = scalingProbability(n => die(6)(n), { from: 1, to: 3 },
      d => total(d) >= 4);
    expect(rows.map(r => r.x)).toEqual([1, 2, 3]);
    for (const r of rows) expect(r.p[0] + r.barred + r.uncategorized).toBeCloseTo(1, 10);
  });

  it('cumulativeProbability uses the closed form 1-(1-p)^k', () => {
    const rows = cumulativeProbability(die(6)(3), d => total(d) >= 7, { attempts: 3 });
    const p1 = rows[0].p[0];
    expect(rows[1].p[0]).toBeCloseTo(1 - (1 - p1) ** 2, 12);
    expect(rows[2].p[0]).toBeCloseTo(1 - (1 - p1) ** 3, 12);
  });
});

// ---------------------------------------------------------------- §4 reserved labels
describe('reserved-name labels throw at construction', () => {
  it('addDice(1, "shows") throws before any roll', () => {
    expect(() => die(6).addDice(1, 'shows')).toThrow();
  });
});
