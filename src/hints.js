// ================================================================
// Monaco intellisense hints for the DiceScript runtime sandbox.
// Called once after Monaco loads, before the editor is created.
// ================================================================

// Type declarations injected as an in-memory .d.ts file so Monaco
// understands Pool, DieType, and all the sandbox globals.
const DICE_TYPES = `
declare class DieType {
  readonly sides: number;
  readonly min: number;
  readonly max: number;
  readonly name: string;
}

declare class Pool {
  readonly type: DieType;
  readonly size: number;
  /** Add \`n\` extra dice of the same type, or concatenate another Pool. */
  addDice(poolOrN: Pool | number, poolName?: string): Pool;
  /** Add a fixed bonus value as a named constant die. */
  addBonus(n: number, poolName?: string): Pool;
  /** Keep the highest \`n\` dice. */
  keepHigh(n: number): Pool;
  /** Keep the lowest \`n\` dice. */
  keepLow(n: number): Pool;
  /** Branch on each concrete outcome; return the new Pool from \`fn\`. */
  then(fn: (kept: Kept) => Pool | KeptResult | number | null): Pool;
  /** Compute the full probability distribution. */
  toPMF(): Map<number, number>;
}

/** A concrete roll outcome passed into .then() callbacks. */
declare interface Kept {
  readonly dice: number[];
  readonly size: number;
  readonly sum: number;
  readonly highest: number;
  readonly lowest: number;
  readonly die: DieType;
  readonly leftmost: BranchValue;
  readonly rightmost: BranchValue;
  [index: number]: BranchValue;
  at(i: number): BranchValue;
  discard(): DiscardedPool;
  addDice(poolOrN: Pool | number, poolName?: string): AddIntent;
  addBonus(n: number, poolName?: string): AddIntent;
}

/** Returned by kept[i] — supports .when().otherwise() branching. */
declare interface BranchValue {
  readonly die: DieType;
  /** TaggedProb for the maximum face. Use in .when(kept[i].isMax, ...). */
  readonly isMax: TaggedProb;
  /** TaggedProb for the minimum face. Use in .when(kept[i].isMin, ...). */
  readonly isMin: TaggedProb;
  when(trigger: TaggedProb | number, result: Pool | Kept | number | null | (() => Pool)): BranchValue;
  otherwise(result: Pool | Kept | number | null | (() => Pool)): Pool | KeptResult;
}

declare interface TaggedProb {
  readonly prob: number;
  readonly face: number;
  valueOf(): number;
}

declare interface AddIntent extends Pool {}
declare interface DiscardedPool extends Pool {}
declare type KeptResult = Pool;

declare interface StatsResult {
  mean: number;
  median: number;
  mode: number;
  stddev: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  outcomes: Array<{ dice: number[]; prob: number }>;
  groups: Record<string, number>;
}

declare interface RollResult {
  total: number;
  pools: PoolEntry[];
}

declare interface PoolEntry {
  name?: string;
  dice: Array<{ name: string; rolled: number; discarded: boolean }>;
  pools?: PoolEntry[];
}

declare interface DegreeSpec {
  label: string;
  color: string;
  fn: (dice: number[]) => boolean;
}

declare interface ScalingOpts {
  /** Default display mode: 'ev' (expected value bars) or 'pct' (stacked %). */
  mode?: 'ev' | 'pct';
}

declare interface CumulativeOpts {
  /** Number of attempts on the x-axis (default 10). */
  attempts?: number;
}

// ── Runtime globals ──────────────────────────────────────────────

/** Create a pool of \`n\` dice with \`sides\` faces. */
declare function die(sides: number, name?: string): Pool;

/** Create a single die with custom faces, e.g. customDie([1,3,5,7,9]). */
declare function customDie(faces: number[], name?: string): Pool;

/** Coerce a Pool, DieType, or array of Pools into a single Pool. */
declare function pool(x: Pool | Pool[] | DieType | null, n?: number): Pool;

/** Alias for pool(). */
declare function coercePool(x: Pool | Pool[] | DieType | null): Pool;

/** Memoize a pool-returning function by argument structure. */
declare function memoize<T extends (...args: any[]) => Pool>(fn: T, keyFn?: (...args: any[]) => string): T;

/** Compute the full probability distribution of a Pool. */
declare function stats(p: Pool): StatsResult;

/** Sample one concrete outcome from a Pool. */
declare function roll(p: Pool): RollResult;

/** Sum all dice in an outcome array. Shorthand inside condition functions. */
declare function ev(dice: number[]): number;

/** Display the probability distribution of a Pool or StatsResult. */
declare function display(
  pool: Pool | StatsResult,
  label?: string,
  condition?: ((dice: number[]) => boolean) | null,
  opts?: { cutoff?: number }
): StatsResult | null;

/** Display a single concrete roll result with a reroll button. */
declare function displayRoll(poolOrResult: Pool | RollResult, label?: string): void;

/**
 * Display how a statistic changes as a parameter scales.
 * @param poolFnOrArray - A function n => Pool, or an array of Pools.
 * @param range         - { from, to, step } or { labels } for array form.
 * @param label         - Chart title.
 * @param condition     - Pass/fail function or array of DegreeSpec.
 * @param opts          - { mode: 'ev' | 'pct' }
 */
declare function displayScaling(
  poolFnOrArray: ((n: number) => Pool) | Pool[],
  range: { from?: number; to?: number; step?: number; labels?: any[] } | string,
  label?: string | ((dice: number[]) => boolean) | DegreeSpec[],
  condition?: ((dice: number[]) => boolean) | DegreeSpec[],
  opts?: ScalingOpts
): void;

/**
 * Display cumulative probability of success over N attempts.
 * @param pool      - Pool rolled each attempt.
 * @param label     - Chart title.
 * @param condition - Pass/fail function or array of DegreeSpec.
 * @param opts      - { attempts: number }
 */
declare function displayCumulative(
  pool: Pool | (() => Pool),
  label?: string,
  condition?: ((dice: number[]) => boolean) | DegreeSpec[],
  opts?: CumulativeOpts
): void;

// ── Pre-built standard dice ──────────────────────────────────────
// Each is a Pool but also callable: d6(n) returns a pool of n d6s.
interface CallablePool extends Pool { (n: number): Pool; }
declare const d2:   CallablePool;
declare const d3:   CallablePool;
declare const d4:   CallablePool;
declare const d6:   CallablePool;
declare const d8:   CallablePool;
declare const d10:  CallablePool;
declare const d12:  CallablePool;
declare const d20:  CallablePool;
declare const d100: CallablePool;
`;

// Completion items for everything the sandbox injects.
// Monaco will also autocomplete from the .d.ts above; these items
// add richer documentation shown in the suggest widget.
const COMPLETIONS = [
  {
    label: 'die',
    kind: 'Function',
    detail: 'die(sides, name?) → Pool',
    doc: 'Create a pool of 1 die with the given number of sides.\n\nExample: die(6) is equivalent to d6.',
  },
  {
    label: 'customDie',
    kind: 'Function',
    detail: 'customDie(faces, name?) → Pool',
    doc: 'Create a single die with arbitrary faces.\n\nExample: customDie([1,3,5,7,9]) — an odd-only d5.',
  },
  {
    label: 'pool',
    kind: 'Function',
    detail: 'pool(x, n?) → Pool',
    doc: 'Coerce a Pool, DieType, or array of Pools into a single Pool.',
  },
  {
    label: 'memoize',
    kind: 'Function',
    detail: 'memoize(fn, keyFn?) → fn',
    doc: 'Cache a pool-returning function by argument structure.\nUseful for recursive pool expressions to avoid redundant re-computation.',
  },
  {
    label: 'stats',
    kind: 'Function',
    detail: 'stats(pool) → StatsResult',
    doc: 'Compute the full probability distribution of a Pool.\nReturns mean, median, mode, stddev, min, max, percentiles, and raw outcomes.',
  },
  {
    label: 'roll',
    kind: 'Function',
    detail: 'roll(pool) → { total, pools }',
    doc: 'Sample one concrete outcome from a Pool.\nReturns the rolled total and a structured pools tree.',
  },
  {
    label: 'ev',
    kind: 'Function',
    detail: 'ev(dice) → number',
    doc: 'Sum all values in a dice array. Shorthand inside condition functions.\n\nExample: dice => ev(dice) >= 10',
  },
  {
    label: 'display',
    kind: 'Function',
    detail: 'display(pool, label?, condition?, opts?) → StatsResult',
    doc: 'Render the probability distribution of a Pool.\n\nOptional condition function adds a pass/fail bar:\n  display(d6.addDice(1), "2d6", dice => ev(dice) >= 7)',
  },
  {
    label: 'displayRoll',
    kind: 'Function',
    detail: 'displayRoll(pool, label?) → void',
    doc: 'Render a single concrete roll with a reroll button.',
  },
  {
    label: 'displayScaling',
    kind: 'Function',
    detail: 'displayScaling(poolFn | pools[], range, label?, condition?, opts?) → void',
    doc: 'Render how a distribution changes as a parameter scales.\n\nRange form:  displayScaling(n => die(n), {from:4, to:12, step:2}, "label", condition)\nArray form:  displayScaling([d6, d8, d10], {labels:[...]}, "label", condition)\n\nopts.mode: "ev" (expected value bars) | "pct" (stacked probability)',
  },
  {
    label: 'displayCumulative',
    kind: 'Function',
    detail: 'displayCumulative(pool, label?, condition?, opts?) → void',
    doc: 'Render cumulative probability of success over N repeated attempts.\n\nExample: displayCumulative(d6, "encounter", dice => ev(dice) === 1, {attempts: 14})',
  },
  ...['d2','d3','d4','d6','d8','d10','d12','d20','d100'].map(d => ({
    label: d,
    kind: 'Variable',
    detail: `${d}  /  ${d}(n) → Pool`,
    doc: `Pre-built pool for a standard ${d}.\n\n- \`${d}\` — single die (1${d})\n- \`${d}(n)\` — n dice  e.g. \`${d}(3)\` = 3${d}`,
  })),
];

export function registerHints() {
  // Inject .d.ts into Monaco's JS/TS language service
  monaco.languages.typescript.javascriptDefaults.addExtraLib(DICE_TYPES, 'ts:dicescript.d.ts');

  // Disable strict mode diagnostics that would flag undeclared globals
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  // Completion provider — fires when the user types or presses Ctrl+Space
  monaco.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      const kindMap = {
        Function: monaco.languages.CompletionItemKind.Function,
        Variable: monaco.languages.CompletionItemKind.Variable,
      };

      return {
        suggestions: COMPLETIONS.map(c => ({
          label:            c.label,
          kind:             kindMap[c.kind],
          detail:           c.detail,
          documentation:    { value: c.doc },
          insertText:       c.label,
          range,
        })),
      };
    },
  });

  // Hover provider — shows doc when hovering a known symbol
  monaco.languages.registerHoverProvider('javascript', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const item = COMPLETIONS.find(c => c.label === word.word);
      if (!item) return null;
      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        ),
        contents: [
          { value: `**\`${item.detail}\`** ` },
          { value: item.doc },
        ],
      };
    },
  });
}
