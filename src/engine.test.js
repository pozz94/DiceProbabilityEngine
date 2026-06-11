import { describe, it, expect, beforeEach } from 'vitest';
import { die, customDie, pool, stats, poolBuilder, resetEngineState } from './engine.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function sumProbs(s) {
  return s.outcomes.reduce((acc, o) => acc + o.prob, 0);
}

// Sum probability of all outcomes whose dice sum to `total`.
function probOf(s, total) {
  let p = 0;
  for (const { dice, prob } of s.outcomes) {
    if (dice.reduce((a, b) => a + b, 0) === total) p += prob;
  }
  return p;
}

beforeEach(() => resetEngineState());

// ----------------------------------------------------------------
// Basic dice
// ----------------------------------------------------------------

describe('d6', () => {
  it('mean is 3.5', () => {
    expect(stats(die(6)).mean).toBeCloseTo(3.5, 10);
  });

  it('min=1 max=6', () => {
    const s = stats(die(6));
    expect(s.min).toBe(1);
    expect(s.max).toBe(6);
  });

  it('uniform distribution — each face prob = 1/6', () => {
    for (const { prob } of stats(die(6)).outcomes) {
      expect(prob).toBeCloseTo(1 / 6, 10);
    }
  });

  it('probabilities sum to 1', () => {
    expect(sumProbs(stats(die(6)))).toBeCloseTo(1, 10);
  });
});

describe('2d6', () => {
  it('mean is 7', () => {
    expect(stats(die(6)(2)).mean).toBeCloseTo(7, 10);
  });

  it('min=2 max=12', () => {
    const s = stats(die(6)(2));
    expect(s.min).toBe(2);
    expect(s.max).toBe(12);
  });

  it('P(7) is highest — triangular peak', () => {
    const s = stats(die(6)(2));
    const p7 = probOf(s, 7);
    for (let v = 2; v <= 12; v++) {
      if (v !== 7) expect(p7).toBeGreaterThanOrEqual(probOf(s, v));
    }
  });

  it('probabilities sum to 1', () => {
    expect(sumProbs(stats(die(6)(2)))).toBeCloseTo(1, 10);
  });
});

describe('customDie', () => {
  it('faces [1,2,3] — mean=2, uniform', () => {
    const s = stats(customDie([1, 2, 3]));
    expect(s.mean).toBeCloseTo(2, 10);
    for (const { prob } of s.outcomes) expect(prob).toBeCloseTo(1 / 3, 10);
  });

  it('repeated faces shift probabilities', () => {
    const s = stats(customDie([1, 1, 2]));
    expect(probOf(s, 1)).toBeCloseTo(2 / 3, 10);
    expect(probOf(s, 2)).toBeCloseTo(1 / 3, 10);
  });
});

// ----------------------------------------------------------------
// keepHigh / keepLow
// ----------------------------------------------------------------

describe('keepHigh / keepLow', () => {
  it('2d6 keepHigh(1) mean > 3.5', () => {
    expect(stats(die(6)(2).keepHigh(1)).mean).toBeGreaterThan(3.5);
  });

  it('2d6 keepLow(1) mean < 3.5', () => {
    expect(stats(die(6)(2).keepLow(1)).mean).toBeLessThan(3.5);
  });

  it('keepHigh and keepLow are mirrors on a fair die', () => {
    const hi = stats(die(6)(2).keepHigh(1));
    const lo = stats(die(6)(2).keepLow(1));
    for (let v = 1; v <= 6; v++) {
      expect(probOf(hi, v)).toBeCloseTo(probOf(lo, 7 - v), 10);
    }
  });

  it('keepHigh(1) probabilities sum to 1', () => {
    expect(sumProbs(stats(die(6)(2).keepHigh(1)))).toBeCloseTo(1, 10);
  });
});

// ----------------------------------------------------------------
// addBonus
// ----------------------------------------------------------------

describe('addBonus', () => {
  it('d6+3 mean = 6.5', () => {
    expect(stats(die(6).addBonus(3)).mean).toBeCloseTo(6.5, 10);
  });

  it('d6+3 min=4 max=9', () => {
    const s = stats(die(6).addBonus(3));
    expect(s.min).toBe(4);
    expect(s.max).toBe(9);
  });
});

// ----------------------------------------------------------------
// .when() / DieRef conditions
// ----------------------------------------------------------------

describe('.when() conditional', () => {
  it('discard on max: d6, P(total=0) = 1/6', () => {
    const p = die(6);
    const s = stats(p.when(p[0].isMax, p.discard()));
    expect(probOf(s, 0)).toBeCloseTo(1 / 6, 10);
  });

  it('discard on max: values 1–5 unchanged at 1/6 each', () => {
    const p = die(6);
    const s = stats(p.when(p[0].isMax, p.discard()));
    for (let v = 1; v <= 5; v++) expect(probOf(s, v)).toBeCloseTo(1 / 6, 10);
  });

  it('probabilities still sum to 1 after conditional discard', () => {
    const p = die(6);
    expect(sumProbs(stats(p.when(p[0].isMax, p.discard())))).toBeCloseTo(1, 10);
  });

  it('replace max with a d4 removes value 6 and adds d4 mass', () => {
    const p = die(6);
    const bonus = die(4);   // on max (6), resolve a d4 instead
    const s = stats(p.when(p[0].isMax, bonus));
    // Value 6 is gone
    expect(probOf(s, 6)).toBeCloseTo(0, 10);
    // Values 1–4 now appear from the direct d6 roll AND from the d4 replacement
    // P(v) = 1/6  (direct)  +  1/6 * 1/4  (via d4)  = 5/24  for v in 1..4
    for (let v = 1; v <= 4; v++) expect(probOf(s, v)).toBeCloseTo(5 / 24, 10);
    // Value 5 only from direct d6
    expect(probOf(s, 5)).toBeCloseTo(1 / 6, 10);
    expect(sumProbs(s)).toBeCloseTo(1, 10);
  });

  it('isMin condition mirrors isMax', () => {
    const p = die(6);
    const s = stats(p.when(p[0].isMin, p.discard()));
    expect(probOf(s, 0)).toBeCloseTo(1 / 6, 10);
    for (let v = 2; v <= 6; v++) expect(probOf(s, v)).toBeCloseTo(1 / 6, 10);
  });
});

// ----------------------------------------------------------------
// poolBuilder — recursive / self-referential pools
// ----------------------------------------------------------------

describe('poolBuilder', () => {
  // These use the canonical self-referential const pattern (same as examples)
  const explode = poolBuilder((base, depth = 0) => {
    if (depth > 8) return pool(base);
    const p = pool(base);
    return p.addDice(p[0].isMax, explode(base, depth + 1), 'chain');
  });

  const nimble = poolBuilder((p, opts = {}, first = true) =>
    p.keepHigh(p.size)
      .when(p[0].isMax).addDice(nimble(p, {}, false), 'explosion')
      .when(p[0].isMin).when(first).discard()
  );

  it('exploding d6: mean > 3.5 and max > 6', () => {
    const s = stats(explode(die(6)));
    expect(s.mean).toBeGreaterThan(3.5);
    expect(s.max).toBeGreaterThan(6);
    expect(sumProbs(s)).toBeCloseTo(1, 6);
  });

  it('exploding d6: P(6) = 0 (max triggers explosion, adding ≥1), values 7–11 > 0', () => {
    const s = stats(explode(die(6)));
    expect(probOf(s, 6)).toBeCloseTo(0, 10);
    for (let v = 7; v <= 11; v++) expect(probOf(s, v)).toBeGreaterThan(0);
  });

  it('exploding d6: values 1–5 have exactly 1/6 probability each', () => {
    const s = stats(explode(die(6)));
    for (let v = 1; v <= 5; v++) expect(probOf(s, v)).toBeCloseTo(1 / 6, 8);
  });

  it('nimbleAttack on d6: P(miss) = 1/6, probabilities sum to 1', () => {
    const s = stats(nimble(die(6)));
    expect(probOf(s, 0)).toBeCloseTo(1 / 6, 6);
    expect(sumProbs(s)).toBeCloseTo(1, 6);
  });

  it('nimbleAttack first=false: no miss, min is kept', () => {
    const s = stats(nimble(die(6), {}, false));
    expect(probOf(s, 0)).toBeCloseTo(0, 10);
    expect(probOf(s, 1)).toBeGreaterThan(0);
  });

  it('nimbleAttack: explosion means total can exceed die max', () => {
    const s = stats(nimble(die(6)));
    expect(s.max).toBeGreaterThan(6);
  });
});
