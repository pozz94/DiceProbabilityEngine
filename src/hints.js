// ================================================================
// Monaco intellisense for the DiceScript runtime sandbox.
// ================================================================
import * as monaco from 'monaco-editor';

// Full .d.ts for the sandbox globals. Monaco's JS language service
// reads this via addExtraLib and produces autocomplete + hover
// automatically — no custom provider needed.
const DICE_TYPES = `
declare class DieType {
  readonly sides: number;
  readonly min: number;
  readonly max: number;
  readonly name: string;
}

declare class DieRef {
  /** True when this die showed its maximum face. */
  readonly isMax: DieCondition;
  /** True when this die showed its minimum face. */
  readonly isMin: DieCondition;
}

/** Lazy condition created by pool[n].isMax / pool[n].isMin. Pass to pool.when(). */
declare class DieCondition {}

/** Discard sentinel returned by pool.discard(). Pass as the result argument of .when(). */
declare class LazyDiscard {}

declare class Pool {
  readonly type: DieType;
  readonly size: number;
  /** pool[n] returns a DieRef for use in .when() conditions. */
  [n: number]: DieRef;
  /** Add more dice of the same type, or concatenate another Pool. */
  addDice(poolOrN: Pool | number, poolName?: string): Pool;
  /** Conditionally append extra dice when a DieCondition fires (additive — keeps current dice and adds more). */
  addDice(condition: DieCondition, extra: Pool, name?: string): Pool;
  /** Add a fixed bonus value as a named constant die. */
  addBonus(n: number, poolName?: string): Pool;
  /** Keep the highest \`n\` dice. */
  keepHigh(n: number): Pool;
  /** Keep the lowest \`n\` dice. */
  keepLow(n: number): Pool;
  /** If condition fires for a concrete outcome, resolve to result; otherwise pass through. Chain freely. */
  when(condition: DieCondition | ((dice: number[], types: DieType[]) => boolean), result: Pool | LazyDiscard | number | null): Pool;
  /** Returns a LazyDiscard — use as the result of .when() to discard this outcome's dice. */
  discard(): LazyDiscard;
  /** Low-level escape hatch: iterate every concrete outcome via a callback. */
  morph(fn: (kept: Kept) => Pool | number | null): Pool;
  /** Compute the full probability distribution as a Map<value, probability>. */
  toPMF(): Map<number, number>;
}

/** A concrete roll outcome passed into .morph() callbacks. */
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
  discard(): Pool;
  addDice(poolOrN: Pool | number, poolName?: string): Pool;
  addBonus(n: number, poolName?: string): Pool;
}

/** Returned by kept[i] — supports .when().otherwise() branching. */
declare interface BranchValue {
  readonly die: DieType;
  /** TaggedProb for the maximum face. Use as: .when(kept[i].isMax, ...) */
  readonly isMax: TaggedProb;
  /** TaggedProb for the minimum face. Use as: .when(kept[i].isMin, ...) */
  readonly isMin: TaggedProb;
  when(trigger: TaggedProb | number, result: Pool | Kept | number | null | (() => Pool)): BranchValue;
  otherwise(result: Pool | Kept | number | null | (() => Pool)): Pool;
}

declare interface TaggedProb {
  readonly prob: number;
  readonly face: number;
  valueOf(): number;
}

declare interface StatsResult {
  mean: number;
  median: number;
  mode: number;
  stddev: number;
  min: number;
  max: number;
  p10: number; p25: number; p75: number; p90: number;
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
  /** Initial display mode: 'ev' = expected-value bars, 'pct' = stacked probability. */
  mode?: 'ev' | 'pct';
}

declare interface CumulativeOpts {
  /** Number of attempts shown on the x-axis. Default: 10. */
  attempts?: number;
}

// ── Callable dice type ───────────────────────────────────────────
// d6(n) returns n d6s; all Pool methods are also available directly.
type CallablePool = ((n?: number) => Pool) & Pool;

// ── Runtime globals ──────────────────────────────────────────────

/**
 * Create a pool of 1 die with the given number of sides.
 * @example die(6)  // same as d6
 * @example die(6)(3)  // same as d6(3) — 3d6
 */
declare function die(sides: number, name?: string): CallablePool;

/**
 * Create a single die with arbitrary faces.
 * @example customDie([1,3,5,7,9])       // odd-only d5
 * @example customDie([2,2,3,3,4,6])     // non-standard d6
 */
declare function customDie(faces: number[], name?: string): Pool;

/**
 * Coerce a Pool, array of Pools, or DieType into a single Pool.
 * @example pool([d6, d8])  // concatenate two pools
 */
declare function pool(x: Pool | Pool[] | DieType | null, n?: number): Pool;

/** Alias for pool(). */
declare function coercePool(x: Pool | Pool[] | DieType | null): Pool;

/**
 * Memoize a pool-returning function by argument structure.
 * Useful for recursive expressions to avoid redundant recomputation.
 */
declare function memoize<T extends (...args: any[]) => Pool>(fn: T, keyFn?: (...args: any[]) => string): T;

/**
 * Wrap a recursive pool function so that self-referential calls are evaluated
 * lazily, avoiding infinite recursion at construction time.
 * Use this whenever your pool-returning function calls itself (e.g. exploding
 * dice, depth-limited recursion).
 */
declare function poolBuilder<T extends (...args: any[]) => Pool>(fn: T): T;

/**
 * Compute the full probability distribution of a Pool.
 * Returns mean, median, mode, stddev, min, max, percentiles, and raw outcomes.
 */
declare function stats(p: Pool): StatsResult;

/**
 * Sample one concrete outcome from a Pool.
 * Returns the rolled total and a structured pools tree.
 */
declare function roll(p: Pool): RollResult;

/**
 * Sum all values in a dice outcome array.
 * Shorthand for use inside condition functions.
 * @example dice => ev(dice) >= 10
 */
declare function ev(dice: number[]): number;

/**
 * Render the probability distribution of a Pool.
 * @param pool      - The pool to analyse.
 * @param label     - Chart title shown in the output pane.
 * @param condition - Optional pass/fail function; adds a coloured bar.
 * @param opts      - { cutoff?: number } — trim low-probability tail bars.
 * @example display(d6(3), "3d6", dice => ev(dice) >= 10)
 */
declare function display(
  pool: Pool | StatsResult,
  label?: string,
  condition?: ((dice: number[]) => boolean) | null,
  opts?: { cutoff?: number }
): StatsResult | null;

/**
 * Render a single concrete roll result with a reroll button.
 * @example displayRoll(d6(3), "my roll")
 */
declare function displayRoll(poolOrResult: Pool | RollResult, label?: string): void;

/**
 * Render how a statistic changes as a parameter scales.
 * @param poolFnOrArray - \`n => Pool\` function, or an array of Pools.
 * @param range         - \`{from, to, step}\` or \`{labels}\` for array form.
 * @param label         - Chart title.
 * @param condition     - Pass/fail function or array of DegreeSpec for stacked bars.
 * @param opts          - \`{mode: 'ev' | 'pct'}\`
 * @example
 * displayScaling(n => d6(n), {from:1, to:6}, "Nd6", dice => ev(dice) >= 10, {mode:'pct'})
 */
declare function displayScaling(
  poolFnOrArray: ((n: number) => Pool) | Pool[],
  range: { from?: number; to?: number; step?: number; labels?: any[] } | string,
  label?: string | ((dice: number[]) => boolean) | DegreeSpec[],
  condition?: ((dice: number[]) => boolean) | DegreeSpec[],
  opts?: ScalingOpts
): void;

/**
 * Render cumulative probability of success over N repeated attempts.
 * @param pool      - Pool rolled on each attempt.
 * @param label     - Chart title.
 * @param condition - Pass/fail function or array of DegreeSpec.
 * @param opts      - \`{attempts: number}\` — x-axis length, default 10.
 * @example
 * displayCumulative(d6, "encounter", dice => ev(dice) === 1, {attempts: 14})
 */
declare function displayCumulative(
  pool: Pool | (() => Pool),
  label?: string,
  condition?: ((dice: number[]) => boolean) | DegreeSpec[],
  opts?: CumulativeOpts
): void;

// ── Pre-built standard dice ──────────────────────────────────────
/** 1d2. Call as \`d2(n)\` for n dice. */  declare const d2:   CallablePool;
/** 1d3. Call as \`d3(n)\` for n dice. */  declare const d3:   CallablePool;
/** 1d4. Call as \`d4(n)\` for n dice. */  declare const d4:   CallablePool;
/** 1d6. Call as \`d6(n)\` for n dice. */  declare const d6:   CallablePool;
/** 1d8. Call as \`d8(n)\` for n dice. */  declare const d8:   CallablePool;
/** 1d10. Call as \`d10(n)\` for n dice. */ declare const d10:  CallablePool;
/** 1d12. Call as \`d12(n)\` for n dice. */ declare const d12:  CallablePool;
/** 1d20. Call as \`d20(n)\` for n dice. */ declare const d20:  CallablePool;
/** 1d100. Call as \`d100(n)\` for n dice. */ declare const d100: CallablePool;
`;

// Signature definitions — each param has a label and optional doc.
// `required: false` marks optional parameters (shown greyed-out in the popup).
const SIGNATURES = {
  display: {
    doc: 'display() — bar chart of every possible total and its probability. The main output function — call it once per pool you want to analyse.',
    params: [
      { label: 'pool: Pool | StatsResult',                          doc: 'pool — the pool to analyse.' },
      { label: 'label?: string',                                    doc: 'label — chart title shown in the output pane.', required: false },
      { label: 'condition?: (dice: number[]) => boolean',           doc: 'condition — pass/fail function; adds a coloured bar.', required: false },
      { label: 'opts?: { cutoff?: number }',                        doc: 'opts.cutoff — trim bars below this probability.', required: false },
    ],
  },
  displayRoll: {
    doc: 'Simulates one roll and shows the concrete result with a reroll button. Use instead of display() when you want to show an actual roll rather than the full distribution.',
    params: [
      { label: 'pool: Pool | RollResult',   doc: 'pool — the pool to roll, or an existing RollResult.' },
      { label: 'label?: string',            doc: 'label — title shown above the roll.', required: false },
    ],
  },
  displayScaling: {
    doc: 'Charts how a pool\'s probability or expected value changes as a parameter varies. Use this to compare mechanics across different dice counts, spell levels, or other scaling inputs.',
    params: [
      { label: 'poolFn: (n: number) => Pool  |  pools: Pool[]',    doc: 'poolFn / pools — a function of n returning a Pool, or an array of Pools.' },
      { label: 'range: { from?, to?, step? }  |  { labels? }',     doc: 'range — numeric range or explicit label array for the x-axis.' },
      { label: 'label?: string',                                    doc: 'label — chart title.', required: false },
      { label: 'condition?: (dice: number[]) => boolean | DegreeSpec[]', doc: 'condition — pass/fail function or degree-of-success spec array.', required: false },
      { label: "opts?: { mode: 'ev' | 'pct' }",                    doc: "opts.mode — 'ev' = expected value bars, 'pct' = stacked %.", required: false },
    ],
  },
  displayCumulative: {
    doc: 'Charts the probability of succeeding at least once over N repeated attempts. Use for "try until success" or repeated-check scenarios.',
    params: [
      { label: 'pool: Pool | (() => Pool)',                         doc: 'pool — the pool rolled on each attempt.' },
      { label: 'label?: string',                                    doc: 'label — chart title.', required: false },
      { label: 'condition?: (dice: number[]) => boolean | DegreeSpec[]', doc: 'condition — pass/fail function or degree-of-success spec array.', required: false },
      { label: 'opts?: { attempts?: number }',                      doc: 'opts.attempts — number of attempts on the x-axis (default 10).', required: false },
    ],
  },
  die: {
    doc: 'Creates a 1-die Pool with the given number of sides. Use this for arbitrary face counts; for standard dice use the built-in d4, d6, d8, d10, d12, d20 constants instead.',
    params: [
      { label: 'sides: number',  doc: 'sides — number of faces (e.g. 6 for a d6).' },
      { label: 'name?: string',  doc: 'name — optional display name for this die type.', required: false },
    ],
  },
  customDie: {
    doc: 'Creates a die whose faces are explicit values you provide (repeats allowed). Use for non-standard dice such as Fate/Fudge dice, Genesys dice, or faces with weighted probabilities.',
    params: [
      { label: 'faces: number[]', doc: 'faces — array of face values (repeats allowed, e.g. [2,2,3,3,4,6]).' },
      { label: 'name?: string',   doc: 'name — optional display name.', required: false },
    ],
  },
  pool: {
    doc: 'Flattens a Pool, array of Pools, or DieType into one combined Pool. Use to merge multiple dice before passing them to display() or stats().',
    params: [
      { label: 'x: Pool | Pool[] | DieType | null', doc: 'x — the value to coerce into a Pool.' },
      { label: 'n?: number',                        doc: 'n — repeat x that many times before combining.', required: false },
    ],
  },
  memoize: {
    doc: 'Wraps a pool-returning function so repeated calls with the same arguments reuse the cached Pool. Use inside displayScaling callbacks to avoid recomputing expensive pools on every step.',
    params: [
      { label: 'fn: (...args) => Pool',              doc: 'fn — the pool-returning function to memoize.' },
      { label: 'keyFn?: (...args) => string',        doc: 'keyFn — custom cache-key function (defaults to JSON.stringify).', required: false },
    ],
  },
  poolBuilder: {
    doc: 'Wraps a recursive pool-returning function so self-calls are deferred, preventing infinite recursion. Required whenever a pool function calls itself (exploding dice, chained rolls). The engine resolves laziness via cycle detection during distribution computation.',
    params: [
      { label: 'fn: (...args) => Pool', doc: 'fn — the recursive pool-returning function to wrap.' },
    ],
  },
  stats: {
    doc: 'Computes the full probability distribution of a pool and returns the numbers (mean, median, mode, std dev, min, max, percentiles). Use when you need the raw stats without rendering a chart.',
    params: [
      { label: 'pool: Pool', doc: 'pool — the pool to analyse.' },
    ],
  },
  roll: {
    doc: 'Randomly samples one concrete outcome from a pool. Use for a one-off roll when you don\'t need the full distribution; pair with displayRoll() to show the result.',
    params: [
      { label: 'pool: Pool', doc: 'pool — the pool to roll.' },
    ],
  },
  total: {
    doc: 'Sums all values in a dice-array. Use inside condition functions — the `dice` parameter passed to your condition is the array of individual die results, and total(dice) gives you the sum.',
    params: [
      { label: 'dice: number[]', doc: 'dice — the array of individual die results passed into a condition function.' },
    ],
  },
};

// Completion items for the custom provider.
const COMPLETIONS = [
  // display functions
  { label: 'display',          kind: 'Function', insert: 'display($1)',        sig: '(pool, label?, condition?, opts?) → StatsResult',        doc: 'Probability bar chart for every possible total of a pool.' },
  { label: 'displayRoll',      kind: 'Function', insert: 'displayRoll($1)',    sig: '(pool, label?) → void',                                  doc: 'Simulate and show one concrete roll result with a reroll button.' },
  { label: 'displayScaling',   kind: 'Function', insert: 'displayScaling($1)', sig: '(poolFn|pools, range, label?, condition?, opts?) → void', doc: 'Chart how a pool\'s stats change as a parameter scales.' },
  { label: 'displayCumulative', kind:'Function', insert: 'displayCumulative($1)', sig: '(pool, label?, condition?, opts?) → void',            doc: 'Chart cumulative success probability across N repeated attempts.' },
  // engine functions
  { label: 'die',              kind: 'Function', insert: 'die($1)',            sig: '(sides, name?) → CallablePool',                          doc: 'Create a standard die pool with N sides.' },
  { label: 'customDie',        kind: 'Function', insert: 'customDie([$1])',    sig: '(faces[], name?) → Pool',                                doc: 'Create a die pool with arbitrary face values.' },
  { label: 'pool',             kind: 'Function', insert: 'pool($1)',           sig: '(x, n?) → Pool',                                        doc: 'Combine a Pool, array of pools, or die type into one Pool.' },
  { label: 'memoize',          kind: 'Function', insert: 'memoize($1)',        sig: '(fn, keyFn?) → fn',                                      doc: 'Cache a pool-returning function by argument structure.' },
  { label: 'poolBuilder',      kind: 'Function', insert: 'poolBuilder($1)',    sig: '(fn) → fn',                                              doc: 'Wrap a recursive pool function to prevent infinite recursion at build time.' },
  { label: 'stats',            kind: 'Function', insert: 'stats($1)',          sig: '(pool) → StatsResult',                                   doc: 'Compute full probability stats for a pool without rendering.' },
  { label: 'roll',             kind: 'Function', insert: 'roll($1)',           sig: '(pool) → RollResult',                                    doc: 'Sample one random concrete outcome from a pool.' },
  { label: 'total',            kind: 'Function', insert: 'total($1)',          sig: '(dice[]) → number',                                      doc: 'Sum all values in a dice array (use inside condition functions).' },
  // dice constants
  { label: 'd2',   kind: 'Variable', insert: 'd2',   sig: 'CallablePool — 1d2',   doc: 'Pre-built 1d2 pool. Call as d2(n) to get n d2s.' },
  { label: 'd3',   kind: 'Variable', insert: 'd3',   sig: 'CallablePool — 1d3',   doc: 'Pre-built 1d3 pool. Call as d3(n) to get n d3s.' },
  { label: 'd4',   kind: 'Variable', insert: 'd4',   sig: 'CallablePool — 1d4',   doc: 'Pre-built 1d4 pool. Call as d4(n) to get n d4s.' },
  { label: 'd6',   kind: 'Variable', insert: 'd6',   sig: 'CallablePool — 1d6',   doc: 'Pre-built 1d6 pool. Call as d6(n) to get n d6s.' },
  { label: 'd8',   kind: 'Variable', insert: 'd8',   sig: 'CallablePool — 1d8',   doc: 'Pre-built 1d8 pool. Call as d8(n) to get n d8s.' },
  { label: 'd10',  kind: 'Variable', insert: 'd10',  sig: 'CallablePool — 1d10',  doc: 'Pre-built 1d10 pool. Call as d10(n) to get n d10s.' },
  { label: 'd12',  kind: 'Variable', insert: 'd12',  sig: 'CallablePool — 1d12',  doc: 'Pre-built 1d12 pool. Call as d12(n) to get n d12s.' },
  { label: 'd20',  kind: 'Variable', insert: 'd20',  sig: 'CallablePool — 1d20',  doc: 'Pre-built 1d20 pool. Call as d20(n) to get n d20s.' },
  { label: 'd100', kind: 'Variable', insert: 'd100', sig: 'CallablePool — 1d100', doc: 'Pre-built 1d100 pool. Call as d100(n) to get n d100s.' },
];

export function registerHints() {
  const defaults = monaco.languages.typescript.javascriptDefaults;

  defaults.setCompilerOptions({
    ...defaults.getCompilerOptions(),
    allowJs: true,
    allowNonTsExtensions: true,
    noLib: false,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
  });

  // addExtraLib gives hover tooltips and signature help for all declared symbols.
  defaults.addExtraLib(DICE_TYPES, 'ts:dicescript.d.ts');

  defaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });

  // Custom completion provider — needed because addExtraLib ambient globals
  // don't reliably appear in the dropdown for `language: 'javascript'` models
  // (monaco-editor issues #2006, #2456). This provider fills the gap.
  const kindMap = {
    Function: monaco.languages.CompletionItemKind.Function,
    Variable: monaco.languages.CompletionItemKind.Variable,
  };

  monaco.languages.registerCompletionItemProvider('dicescript', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };
      return {
        suggestions: COMPLETIONS.map(c => {
          const sigEntry = SIGNATURES[c.label];
          const fullDoc = sigEntry ? sigEntry.doc : c.doc;
          return {
            label:         c.label,
            kind:          kindMap[c.kind],
            detail:        c.doc,
            documentation: { value: '```typescript\n' + c.sig + '\n```\n\n' + fullDoc },
            insertText:    c.label,
            sortText:      '0' + c.label,
            range,
          };
        }),
      };
    },
  });

  // Signature help — shows parameter hints on '(' and ','.
  monaco.languages.registerSignatureHelpProvider('dicescript', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model, position) {
      // Walk backwards from the cursor to find the innermost open '(' and
      // the function name before it, counting commas to get the active param.
      const text = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });

      let depth = 0;
      let commas = 0;
      let parenIdx = -1;

      for (let i = text.length - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === ')') { depth++; continue; }
        if (ch === '(') {
          if (depth > 0) { depth--; continue; }
          parenIdx = i;
          break;
        }
        if (ch === ',' && depth === 0) commas++;
      }

      if (parenIdx === -1) return null;

      // Extract the identifier immediately before the '('.
      const before = text.slice(0, parenIdx);
      const match = before.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
      if (!match) return null;

      const fnName = match[1];
      const sig = SIGNATURES[fnName];
      if (!sig) return null;

      const activeParameter = Math.min(commas, sig.params.length - 1);

      return {
        value: {
          signatures: [{
            label: fnName + '(' + sig.params.map(p => p.label).join(', ') + ')',
            documentation: { value: sig.doc },
            parameters: sig.params.map(p => ({
              label: p.label,
              documentation: { value: (p.required === false ? '_(optional)_ ' : '') + p.doc },
            })),
          }],
          activeSignature: 0,
          activeParameter,
        },
        dispose() {},
      };
    },
  });

  // Hover provider — shows the full doc comment when hovering over a symbol.
  monaco.languages.registerHoverProvider('dicescript', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const c = COMPLETIONS.find(x => x.label === word.word);
      if (!c) return null;
      const sigEntry = SIGNATURES[word.word];
      const fullDoc = sigEntry ? sigEntry.doc : c.doc;
      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        ),
        contents: [
          { value: '```typescript\n' + c.sig + '\n```' },
          { value: fullDoc },
        ],
      };
    },
  });
}
