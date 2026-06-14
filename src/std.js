// ================================================================
// dicescript/std — standard library
//
// Pure, side-effect-free, expressed entirely over the engine. Named
// dice, named reductions, and common builder patterns — no rendering,
// no global/prototype mutation on import. Conveniences are *free
// functions* (not pool methods): patching the pool prototype would be
// a side effect on import, which stdlib forbids.
// ================================================================

import { die } from './engine.js';

// ----------------------------------------------------------------
// §1 Default dice — plain aliases of die(n, "dN").
// `d6` is a single die; `d6(10)` gives ten via the engine poolsOf rule.
// ----------------------------------------------------------------
export const d2 = die(2, 'd2');
export const d4 = die(4, 'd4');
export const d6 = die(6, 'd6');
export const d8 = die(8, 'd8');
export const d10 = die(10, 'd10');
export const d12 = die(12, 'd12');
export const d20 = die(20, 'd20');
export const d24 = die(24, 'd24');
export const d30 = die(30, 'd30');
export const d60 = die(60, 'd60');
export const d100 = die(100, 'd100');

// ----------------------------------------------------------------
// §2 Reductions over active dice (presets over `reduce`). Numeric faces;
// symbolic systems supply their own reducer.
// ----------------------------------------------------------------
export const sum = p => p.reduce((acc, current = 0) => acc + current, 0);
export const total = sum;                    // player-facing alias
export const maxed = p => p.reduce((acc, current) => Math.max(acc, current), -Infinity);
export const floored = p => p.reduce((acc, current) => Math.min(acc, current), +Infinity);
export const product = p => p.reduce((acc, current) => acc * current, 1);
export const count = (p, pred) =>
  p.reduce((acc, current) => pred(current) ? acc + 1 : acc, 0);

// ----------------------------------------------------------------
// §2 Reductions over discarded dice (presets over `reduceDiscarded`).
// ----------------------------------------------------------------
export const totalDiscarded = p => p.reduceDiscarded((acc, current = 0) => acc + current, 0);
export const countDiscarded = p => p.reduceDiscarded(acc => acc + 1, 0);

// ----------------------------------------------------------------
// §3 Builder patterns — compose engine primitives, no new semantics.
// ----------------------------------------------------------------

// keep the n best / worst active dice by discarding the complement.
// A view discards itself and returns the root (Engine §1, §10); the
// discarded dice persist as grayed ghosts.
export const keepHigh = (p, n) => p.lowest(p.size - n).discard();
export const keepLow = (p, n) => p.highest(p.size - n).discard();

// a flat modifier as a constant die: die([n]) always rolls n (Engine §1).
export const addBonus = (p, n, label = 'bonus') => p.addDice(die([n]), label);

// roll extra and keep the best / worst — one game family's idiom.
export const advantage = (p, extra = 1) => keepHigh(p.addDice(extra), p.size);
export const disadvantage = (p, extra = 1) => keepLow(p.addDice(extra), p.size);
