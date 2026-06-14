// ================================================================
// Monaco intellisense for the DiceScript sandbox (new API).
// ================================================================
import * as monaco from 'monaco-editor';

const DICE_TYPES = `
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
`;

// Signature popups for the four display functions + key engine fns.
const SIGNATURES = {
  display: {
    doc: 'display({ pool, filter?, axis?, title?, mode? }) — histogram of the value-axis (default total) for every outcome, plus the barred / no-result segment and filter categories.',
    params: [{ label: '{ pool, filter?, axis?, title?, mode? }', doc: 'pool — pool or () => pool. filter — pass/fail fn or category list. axis — value reduction (default total). title/mode — presentation.' }],
  },
  displayRoll: {
    doc: 'displayRoll({ pool, axis?, title? }) — sample one outcome and show active dice + grayed ghosts with a reroll button.',
    params: [{ label: '{ pool, axis?, title? }', doc: 'pool — pool or () => pool. axis — value reduction (default total). title — heading.' }],
  },
  displayScaling: {
    doc: 'displayScaling({ pool, over, filter?, title? }) — classify(pool(x)) swept across over:{from,to,step?}.',
    params: [{ label: '{ pool, over, filter?, title?, mode? }', doc: 'pool — x => pool. over — { from, to, step? }. filter — category list. title/mode — presentation.' }],
  },
  displayCumulative: {
    doc: 'displayCumulative({ pool, over, filter?, title? }) — P(≥1 success) over over:{attempts} independent attempts, per category.',
    params: [{ label: '{ pool, over, filter?, title?, mode? }', doc: 'pool — pool or () => pool. over — { attempts }. filter — category list. title/mode — presentation.' }],
  },
  die: {
    doc: 'die(n) makes a die with faces 1..n; die([faces]) takes explicit faces (repeats encode weighting). Callable for copies: die(6)(3).',
    params: [
      { label: 'spec: number | number[]', doc: 'spec — side count, or explicit face array.' },
      { label: 'name?: string', doc: 'name — optional display label carried onto the die.', required: false },
    ],
  },
  poolBuilder: {
    doc: 'poolBuilder(fn) wraps a builder body. Inside it every read is concrete (the effect boundary re-runs the body per outcome); use when(cond, p => p) and discard().',
    params: [{ label: 'fn: (p, ...args) => pool', doc: 'fn — the builder; first arg is the pool, returns a pool.' }],
  },
  pool: {
    doc: 'pool(x, n?) coerces a pool, an array of pools, or a kind into one pool.',
    params: [
      { label: 'x: Pool | Pool[] | null', doc: 'x — value to coerce.' },
      { label: 'n?: number', doc: 'n — copies.', required: false },
    ],
  },
  outcomeProbability: {
    doc: 'outcomeProbability(pool, groupBy?) — full weighted enumeration, summing to 1 incl. barred mass. groupBy (e.g. total) collapses outcomes by value.',
    params: [
      { label: 'pool: Pool', doc: 'pool — to enumerate.' },
      { label: 'groupBy?: (v) => any', doc: 'groupBy — caller-supplied collapse (e.g. total).', required: false },
    ],
  },
  classify: {
    doc: 'classify(pool, filter) → { p[], barred, uncategorized }. Barred is partitioned out before predicates run.',
    params: [
      { label: 'pool: Pool', doc: 'pool — to classify.' },
      { label: 'filter: Filter', doc: 'filter — predicate, predicates, or { when, label?, color? } list.' },
    ],
  },
  total: {
    doc: 'total(dice) / sum(dice) — sum the active faces. Use inside a filter predicate; dice is the resolved PoolView.',
    params: [{ label: 'dice: PoolView', doc: 'dice — the resolved outcome passed into a predicate.' }],
  },
  count: {
    doc: 'count(dice, pred) — tally active faces matching pred (e.g. count(dice, v => v === 1)).',
    params: [
      { label: 'dice: PoolView', doc: 'dice — the resolved outcome.' },
      { label: 'pred: (face) => boolean', doc: 'pred — face test.' },
    ],
  },
};

const COMPLETIONS = [
  { label: 'display', kind: 'Function', insert: 'display({ pool: $1 })', sig: '({ pool, filter?, axis?, title?, mode? }) → void', doc: 'Histogram of a pool with barred segment and filter categories.' },
  { label: 'displayRoll', kind: 'Function', insert: 'displayRoll({ pool: $1 })', sig: '({ pool, axis?, title? }) → void', doc: 'Show one sampled outcome (active dice + grayed ghosts).' },
  { label: 'displayScaling', kind: 'Function', insert: 'displayScaling({ pool: $1, over: { from: 1, to: 6 } })', sig: '({ pool, over, filter?, title? }) → void', doc: 'Sweep classify(pool(x)) across a range.' },
  { label: 'displayCumulative', kind: 'Function', insert: 'displayCumulative({ pool: $1, over: { attempts: 10 } })', sig: '({ pool, over, filter?, title? }) → void', doc: 'P(≥1 success) across N attempts per category.' },
  { label: 'die', kind: 'Function', insert: 'die($1)', sig: '(spec, name?) → CallablePool', doc: 'die(n) or die([faces]); callable for copies.' },
  { label: 'pool', kind: 'Function', insert: 'pool($1)', sig: '(x, n?) → Pool', doc: 'Coerce a pool / array / kind into one pool.' },
  { label: 'poolBuilder', kind: 'Function', insert: 'poolBuilder($1)', sig: '(fn) → builder', doc: 'Wrap a builder body (effect boundary; reads are concrete).' },
  { label: 'roll', kind: 'Function', insert: 'roll($1)', sig: '(pool) → RawOutcome', doc: 'Sample one raw resolved outcome.' },
  { label: 'outcomeProbability', kind: 'Function', insert: 'outcomeProbability($1)', sig: '(pool, groupBy?) → outcomes', doc: 'Full weighted enumeration (incl. barred).' },
  { label: 'classify', kind: 'Function', insert: 'classify($1)', sig: '(pool, filter) → { p[], barred, uncategorized }', doc: 'Bucket a distribution by filter.' },
  { label: 'scalingProbability', kind: 'Function', insert: 'scalingProbability($1)', sig: '(build, over, filter) → rows', doc: 'classify(build(x)) across a range.' },
  { label: 'cumulativeProbability', kind: 'Function', insert: 'cumulativeProbability($1)', sig: '(pool, filter, over) → rows', doc: 'Per-category 1-(1-p)^k over N attempts.' },
  { label: 'slider', kind: 'Function', insert: 'slider("$1", { min: 0, max: 10, value: 0 })', sig: '(label, { min?, max?, step?, value? }) → number', doc: 'Interactive slider; returns its value, re-runs on change.' },
  { label: 'select', kind: 'Function', insert: 'select("$1", [$2])', sig: '(label, options, { value? }) → value', doc: 'Interactive dropdown; returns the chosen value.' },
  { label: 'toggle', kind: 'Function', insert: 'toggle("$1", false)', sig: '(label, value?) → boolean', doc: 'Interactive checkbox; returns its boolean state.' },
  { label: 'max', kind: 'Variable', insert: 'max', sig: 'sentinel', doc: 'Per-die maximum-face sentinel for shows(max).' },
  { label: 'min', kind: 'Variable', insert: 'min', sig: 'sentinel', doc: 'Per-die minimum-face sentinel for shows(min).' },
  { label: 'total', kind: 'Function', insert: 'total($1)', sig: '(dice) → number', doc: 'Sum the active faces (in a predicate).' },
  { label: 'sum', kind: 'Function', insert: 'sum($1)', sig: '(dice) → number', doc: 'Sum the active faces.' },
  { label: 'count', kind: 'Function', insert: 'count($1)', sig: '(dice, pred) → number', doc: 'Tally active faces matching pred.' },
  { label: 'maxed', kind: 'Function', insert: 'maxed($1)', sig: '(dice) → number', doc: 'Highest active face.' },
  { label: 'floored', kind: 'Function', insert: 'floored($1)', sig: '(dice) → number', doc: 'Lowest active face.' },
  { label: 'keepHigh', kind: 'Function', insert: 'keepHigh($1)', sig: '(p, n) → pool', doc: 'Keep the n best dice (discard the rest as ghosts).' },
  { label: 'keepLow', kind: 'Function', insert: 'keepLow($1)', sig: '(p, n) → pool', doc: 'Keep the n worst dice.' },
  { label: 'addBonus', kind: 'Function', insert: 'addBonus($1)', sig: '(p, n, label?) → pool', doc: 'Add a flat modifier as a constant die.' },
  { label: 'd2', kind: 'Variable', insert: 'd2', sig: '1d2', doc: 'Pre-built 1d2. d2(n) for n copies.' },
  { label: 'd4', kind: 'Variable', insert: 'd4', sig: '1d4', doc: 'Pre-built 1d4. d4(n) for n copies.' },
  { label: 'd6', kind: 'Variable', insert: 'd6', sig: '1d6', doc: 'Pre-built 1d6. d6(n) for n copies.' },
  { label: 'd8', kind: 'Variable', insert: 'd8', sig: '1d8', doc: 'Pre-built 1d8. d8(n) for n copies.' },
  { label: 'd10', kind: 'Variable', insert: 'd10', sig: '1d10', doc: 'Pre-built 1d10. d10(n) for n copies.' },
  { label: 'd12', kind: 'Variable', insert: 'd12', sig: '1d12', doc: 'Pre-built 1d12. d12(n) for n copies.' },
  { label: 'd20', kind: 'Variable', insert: 'd20', sig: '1d20', doc: 'Pre-built 1d20. d20(n) for n copies.' },
  { label: 'd100', kind: 'Variable', insert: 'd100', sig: '1d100', doc: 'Pre-built 1d100. d100(n) for n copies.' },
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

  defaults.addExtraLib(DICE_TYPES, 'ts:dicescript.d.ts');

  defaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });

  const kindMap = {
    Function: monaco.languages.CompletionItemKind.Function,
    Variable: monaco.languages.CompletionItemKind.Variable,
  };

  monaco.languages.registerCompletionItemProvider('dicescript', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: COMPLETIONS.map(c => {
          const sigEntry = SIGNATURES[c.label];
          const fullDoc = sigEntry ? sigEntry.doc : c.doc;
          return {
            label: c.label,
            kind: kindMap[c.kind],
            detail: c.doc,
            documentation: { value: '```typescript\n' + c.sig + '\n```\n\n' + fullDoc },
            insertText: c.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: '0' + c.label,
            range,
          };
        }),
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider('dicescript', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],

    provideSignatureHelp(model, position) {
      const text = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });

      let depth = 0, commas = 0, parenIdx = -1;
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

      const before = text.slice(0, parenIdx);
      const match = before.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
      if (!match) return null;

      const sig = SIGNATURES[match[1]];
      if (!sig) return null;
      const activeParameter = Math.min(commas, sig.params.length - 1);

      return {
        value: {
          signatures: [{
            label: match[1] + '(' + sig.params.map(p => p.label).join(', ') + ')',
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
