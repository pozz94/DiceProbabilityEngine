// ================================================================
// Monaco intellisense for the DiceScript runtime sandbox.
// ================================================================

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

declare class Pool {
  readonly type: DieType;
  readonly size: number;
  /** Add more dice of the same type, or concatenate another Pool. */
  addDice(poolOrN: Pool | number, poolName?: string): Pool;
  /** Add a fixed bonus value as a named constant die. */
  addBonus(n: number, poolName?: string): Pool;
  /** Keep the highest \`n\` dice. */
  keepHigh(n: number): Pool;
  /** Keep the lowest \`n\` dice. */
  keepLow(n: number): Pool;
  /** Branch on each concrete outcome; return the new Pool from \`fn\`. */
  then(fn: (kept: Kept) => Pool | number | null): Pool;
  /** Compute the full probability distribution as a Map<value, probability>. */
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
    doc: 'Render the probability distribution of a Pool.',
    params: [
      { label: 'pool: Pool | StatsResult',                          doc: 'The pool to analyse.' },
      { label: 'label?: string',                                    doc: 'Chart title shown in the output pane.', required: false },
      { label: 'condition?: (dice: number[]) => boolean',           doc: 'Pass/fail function — adds a coloured bar.', required: false },
      { label: 'opts?: { cutoff?: number }',                        doc: 'Trim low-probability tail bars.', required: false },
    ],
  },
  displayRoll: {
    doc: 'Render a single concrete roll result with a reroll button.',
    params: [
      { label: 'pool: Pool | RollResult',   doc: 'The pool to roll, or an existing RollResult.' },
      { label: 'label?: string',            doc: 'Title shown above the roll.', required: false },
    ],
  },
  displayScaling: {
    doc: 'Render how a statistic changes as a parameter scales.',
    params: [
      { label: 'poolFn: (n: number) => Pool  |  pools: Pool[]',    doc: 'A function of n returning a Pool, or an array of Pools.' },
      { label: 'range: { from?, to?, step? }  |  { labels? }',     doc: 'Numeric range or explicit label array.' },
      { label: 'label?: string',                                    doc: 'Chart title.', required: false },
      { label: 'condition?: (dice: number[]) => boolean | DegreeSpec[]', doc: 'Pass/fail function or degree-of-success spec array.', required: false },
      { label: "opts?: { mode: 'ev' | 'pct' }",                    doc: "Display mode: 'ev' = expected value bars, 'pct' = stacked %.", required: false },
    ],
  },
  displayCumulative: {
    doc: 'Render cumulative probability of success over N repeated attempts.',
    params: [
      { label: 'pool: Pool | (() => Pool)',                         doc: 'Pool rolled on each attempt.' },
      { label: 'label?: string',                                    doc: 'Chart title.', required: false },
      { label: 'condition?: (dice: number[]) => boolean | DegreeSpec[]', doc: 'Pass/fail function or degree-of-success spec array.', required: false },
      { label: 'opts?: { attempts?: number }',                      doc: 'Number of attempts on the x-axis (default 10).', required: false },
    ],
  },
  die: {
    doc: 'Create a pool of 1 die with the given number of sides.',
    params: [
      { label: 'sides: number',  doc: 'Number of faces (e.g. 6 for a d6).' },
      { label: 'name?: string',  doc: 'Optional display name for this die type.', required: false },
    ],
  },
  customDie: {
    doc: 'Create a die with arbitrary face values.',
    params: [
      { label: 'faces: number[]', doc: 'Array of face values (repeats allowed, e.g. [2,2,3,3,4,6]).' },
      { label: 'name?: string',   doc: 'Optional display name.', required: false },
    ],
  },
  pool: {
    doc: 'Coerce a Pool, array of Pools, or DieType into a single Pool.',
    params: [
      { label: 'x: Pool | Pool[] | DieType | null', doc: 'Value to coerce.' },
      { label: 'n?: number',                        doc: 'Repeat n times.', required: false },
    ],
  },
  coercePool: {
    doc: 'Alias for pool(). Coerce a value into a single Pool.',
    params: [
      { label: 'x: Pool | Pool[] | DieType | null', doc: 'Value to coerce.' },
    ],
  },
  memoize: {
    doc: 'Memoize a pool-returning function by argument structure.',
    params: [
      { label: 'fn: (...args) => Pool',              doc: 'The function to memoize.' },
      { label: 'keyFn?: (...args) => string',        doc: 'Custom cache-key function.', required: false },
    ],
  },
  stats: {
    doc: 'Compute the full probability distribution of a Pool.',
    params: [
      { label: 'pool: Pool', doc: 'The pool to analyse.' },
    ],
  },
  roll: {
    doc: 'Sample one concrete outcome from a Pool.',
    params: [
      { label: 'pool: Pool', doc: 'The pool to roll.' },
    ],
  },
  ev: {
    doc: 'Sum all values in a dice outcome array.',
    params: [
      { label: 'dice: number[]', doc: 'The dice array passed into a condition function.' },
    ],
  },
};

// Completion items for the custom provider.
const COMPLETIONS = [
  // display functions
  { label: 'display',         kind: 'Function', insert: 'display($1)',                          detail: '(pool, label?, condition?, opts?) → StatsResult',   doc: 'Render the probability distribution of a Pool.' },
  { label: 'displayRoll',     kind: 'Function', insert: 'displayRoll($1)',                      detail: '(pool, label?) → void',                             doc: 'Render a single concrete roll result with a reroll button.' },
  { label: 'displayScaling',  kind: 'Function', insert: 'displayScaling($1)',                   detail: '(poolFn|pools, range, label?, condition?, opts?) → void', doc: 'Render how a statistic changes as a parameter scales.' },
  { label: 'displayCumulative',kind:'Function', insert: 'displayCumulative($1)',                detail: '(pool, label?, condition?, opts?) → void',           doc: 'Render cumulative probability over N repeated attempts.' },
  // engine functions
  { label: 'die',             kind: 'Function', insert: 'die($1)',                              detail: '(sides, name?) → CallablePool',                      doc: 'Create a pool of 1 die with the given number of sides.' },
  { label: 'customDie',       kind: 'Function', insert: 'customDie([$1])',                      detail: '(faces[], name?) → Pool',                           doc: 'Create a die with arbitrary faces.' },
  { label: 'pool',            kind: 'Function', insert: 'pool($1)',                             detail: '(x, n?) → Pool',                                    doc: 'Coerce a Pool, array, or DieType into a single Pool.' },
  { label: 'coercePool',      kind: 'Function', insert: 'coercePool($1)',                       detail: '(x) → Pool',                                        doc: 'Alias for pool().' },
  { label: 'memoize',         kind: 'Function', insert: 'memoize($1)',                          detail: '(fn, keyFn?) → fn',                                 doc: 'Memoize a pool-returning function by argument structure.' },
  { label: 'stats',           kind: 'Function', insert: 'stats($1)',                            detail: '(pool) → StatsResult',                              doc: 'Compute mean, median, mode, stddev, min, max, percentiles.' },
  { label: 'roll',            kind: 'Function', insert: 'roll($1)',                             detail: '(pool) → RollResult',                               doc: 'Sample one concrete outcome from a Pool.' },
  { label: 'ev',              kind: 'Function', insert: 'ev($1)',                               detail: '(dice[]) → number',                                 doc: 'Sum all values in a dice outcome array.' },
  // dice constants
  { label: 'd2',              kind: 'Variable', insert: 'd2',                                   detail: 'CallablePool — 1d2',                                doc: 'd2(n) returns n d2s.' },
  { label: 'd3',              kind: 'Variable', insert: 'd3',                                   detail: 'CallablePool — 1d3',                                doc: 'd3(n) returns n d3s.' },
  { label: 'd4',              kind: 'Variable', insert: 'd4',                                   detail: 'CallablePool — 1d4',                                doc: 'd4(n) returns n d4s.' },
  { label: 'd6',              kind: 'Variable', insert: 'd6',                                   detail: 'CallablePool — 1d6',                                doc: 'd6(n) returns n d6s.' },
  { label: 'd8',              kind: 'Variable', insert: 'd8',                                   detail: 'CallablePool — 1d8',                                doc: 'd8(n) returns n d8s.' },
  { label: 'd10',             kind: 'Variable', insert: 'd10',                                  detail: 'CallablePool — 1d10',                               doc: 'd10(n) returns n d10s.' },
  { label: 'd12',             kind: 'Variable', insert: 'd12',                                  detail: 'CallablePool — 1d12',                               doc: 'd12(n) returns n d12s.' },
  { label: 'd20',             kind: 'Variable', insert: 'd20',                                  detail: 'CallablePool — 1d20',                               doc: 'd20(n) returns n d20s.' },
  { label: 'd100',            kind: 'Variable', insert: 'd100',                                 detail: 'CallablePool — 1d100',                              doc: 'd100(n) returns n d100s.' },
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
        suggestions: COMPLETIONS.map(c => ({
          label:         c.label,
          kind:          kindMap[c.kind],
          detail:        c.detail,
          documentation: { value: c.doc },
          insertText:    c.label,
          sortText:      '0' + c.label,
          range,
        })),
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
      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        ),
        contents: [
          { value: '```typescript\n' + c.detail + '\n```' },
          { value: c.doc },
        ],
      };
    },
  });
}
