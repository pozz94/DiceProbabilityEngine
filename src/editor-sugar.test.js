// Exercises example-shaped code through the real editor-sugar surface
// (display.js prototype promotion + ambient stdlib) without a DOM.
import { describe, it, expect } from 'vitest';
import { poolBuilder, max, min, outcomeProbability, classify, scalingProbability, cumulativeProbability } from './engine.js';
import { promote } from './display.js';
import { d6, total, count } from './std.js';

promote();   // install the fluent .keepHigh/.addBonus/.total sugar used by examples

const barred = p => outcomeProbability(p).filter(o => o.barred).reduce((a, o) => a + o.prob, 0);

describe('example-shaped code via editor sugar', () => {
  it('fluent keepHigh/keepLow/addBonus on templates', () => {
    expect(d6(4).keepHigh(3).size).toBe(3);
    expect(outcomeProbability(d6(4).keepHigh(3), total).reduce((a, r) => a + r.prob, 0)).toBeCloseTo(1, 6);
  });

  it('nimble attack: base misses 1/6, advantage keeps the best die', () => {
    const nimbleAttack = poolBuilder((p, { advantage = 0, vicious = 0, bonus = 0 } = {}, first = true) => {
      let atk = p.addDice(Math.abs(advantage));
      if (advantage > 0) atk = atk.keepHigh(p.size);
      if (advantage < 0) atk = atk.keepLow(p.size);
      return (bonus ? atk.addBonus(bonus, 'bonus') : atk)
        .when(atk[0].shows(max), x => x.addDice(nimbleAttack(atk.addDice(vicious, 'vicious'), {}, false), 'explosion'))
        .when(atk[0].shows(min) && first, x => x.discard());
    });
    expect(barred(nimbleAttack(d6))).toBeCloseTo(1 / 6, 6);                       // base: P(1)
    expect(barred(nimbleAttack(d6, { advantage: 1 }))).toBeCloseTo(1 / 36, 6);    // both dice show 1
    expect(barred(nimbleAttack(d6, { advantage: -1 }))).toBeCloseTo(11 / 36, 6);  // either die shows 1
  });

  it('explode example builds and conserves mass', () => {
    const explode = poolBuilder(p => p.when(p.at(0).shows(max), x => x.addDice(explode(p), 'chain')));
    const rows = outcomeProbability(explode(d6), total);
    expect(rows.reduce((a, r) => a + r.prob, 0)).toBeCloseTo(1, 6);
  });

  it('classify / scaling / cumulative with PoolView predicates', () => {
    const c = classify(d6(3), [
      d => count(d, v => v === 1) === 0,
      d => count(d, v => v === 1) >= 1,
    ]);
    expect(c.p[0] + c.p[1] + c.barred + c.uncategorized).toBeCloseTo(1, 10);
    expect(scalingProbability(n => d6(n), { from: 1, to: 3 }, d => total(d) >= 4).length).toBe(3);
    expect(cumulativeProbability(d6(3), d => total(d) >= 7, { attempts: 4 }).length).toBe(4);
  });
});
