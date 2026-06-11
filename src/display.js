import {
  Pool, coercePool, die, customDie, memoize, stats, roll, poolBuilder,
  _pendingKeys, _resolvedCache, resetEngineState,
} from './engine.js';

// Arrays can be used anywhere a Pool is expected.
// Non-enumerable so for...in loops on arrays are unaffected.
// NOTE: 'then' is intentionally omitted — it would make arrays thenable,
//       causing them to be unwrapped by Promise resolution.
for (const [name, fn] of [
  ['keepHigh', function(n)       { return coercePool(this).keepHigh(n); }],
  ['keepLow',  function(n)       { return coercePool(this).keepLow(n); }],
  ['addDice',  function(p, q, r) { return coercePool(this).addDice(p, q, r); }],
  ['addBonus', function(n, name) { return coercePool(this).addBonus(n, name); }],
  ['when',     function(c, r)    { return coercePool(this).when(c, r); }],
  ['discard',  function()        { return coercePool(this).discard(); }],
]) {
  Object.defineProperty(Array.prototype, name, {
    value: fn, writable: true, configurable: true, enumerable: false,
  });
}
import {
  esc,
  renderError, renderRollBlock, renderScalingBlock,
  renderCumulativeBlock, renderStatBlock,
} from './render.js';

// ================================================================
// Display API — user-facing functions that queue render results,
// and runCode which drives the editor → engine → render pipeline
// ================================================================

export let _displayResults = [];
export let _logs = [];

function coerceDegrees(condition) {
  if (!condition) return null;
  if (typeof condition === 'function') return [
    {label: 'fail', color: '#ef4444', fn: v => !condition(v)},
    {label: 'pass', color: '#a3e635', fn: condition},
  ];
  return condition;
}

export function display(poolOrStats, label, passFn, opts) {
  try {
    if (passFn && typeof passFn === 'object' && !passFn.fn && typeof passFn !== 'function') {
      opts = passFn; passFn = null;
    }
    const s = (poolOrStats instanceof Pool || Array.isArray(poolOrStats))
      ? stats(coercePool(poolOrStats))
      : poolOrStats;
    _displayResults.push({label: label || null, stats: s, passFn: passFn || null, opts: opts || {}});
    return s;
  } catch(e) {
    _logs.push(`⚠ display() error: ${e.message}`);
    return null;
  }
}

export function displayRoll(poolOrResult, label) {
  try {
    const isPool = Array.isArray(poolOrResult) || poolOrResult instanceof Pool;
    const poolRef = isPool ? coercePool(poolOrResult) : null;
    const rollResult = isPool ? roll(poolRef) : poolOrResult;
    if (!rollResult || !rollResult.pools) {
      _logs.push(`⚠ displayRoll() expects a Pool or roll() result`);
      return;
    }
    _displayResults.push({ label: label || null, rollResult, poolRef });
  } catch(e) {
    _logs.push(`⚠ displayRoll() error: ${e.message}`);
  }
}

export function displayCumulative(poolOrFn, label, condition, opts) {
  try {
    opts = opts || {};
    const attempts = opts.attempts || 10;
    const p = typeof poolOrFn === 'function' ? poolOrFn() : coercePool(poolOrFn);
    const s = stats(p);
    const degrees = coerceDegrees(condition);

    const perAttempt = (degrees || []).map((d) => {
      let prob = 0;
      for (const {dice, prob: p2} of s.outcomes || []) {
        if (d.fn(dice)) prob += p2;
      }
      return prob;
    });

    const points = [];
    for (let n = 1; n <= attempts; n++) {
      const cumDegrees = (degrees || []).map((d, di) => ({
        ...d,
        cumProb: 1 - Math.pow(1 - perAttempt[di], n),
      }));
      points.push({x: n, cumDegrees, perAttempt});
    }

    _displayResults.push({
      label: label || null,
      cumulativePoints: points,
      degrees: degrees || [],
      perAttempt,
      opts,
    });
  } catch(e) {
    _logs.push(`⚠ displayCumulative() error: ${e.message}`);
  }
}

export function displayScaling(poolFnOrArray, rangeOrLabel, labelOrCondition, condition, opts) {
  try {
    let range, label, cond;
    if (Array.isArray(poolFnOrArray)) {
      if (typeof rangeOrLabel === 'string') {
        range = null; label = rangeOrLabel; cond = labelOrCondition; opts = opts || condition; condition = undefined;
      } else if (typeof rangeOrLabel === 'function' || Array.isArray(rangeOrLabel)) {
        range = null; label = null; cond = rangeOrLabel; opts = opts || labelOrCondition;
      } else {
        range = rangeOrLabel; label = labelOrCondition; cond = condition;
      }
    } else {
      range = rangeOrLabel; label = labelOrCondition; cond = condition;
    }

    let entries;
    if (Array.isArray(poolFnOrArray)) {
      const labels = (range && range.labels) || poolFnOrArray.map((_, i) => i);
      entries = poolFnOrArray.map((p, i) => ({x: labels[i], pool: coercePool(p)}));
    } else {
      const from = range.from ?? 0, to = range.to ?? 10, step = range.step ?? 1;
      entries = [];
      for (let n = from; n <= to; n += step) entries.push({x: n, pool: coercePool(poolFnOrArray(n))});
    }
    const points = entries.map(({x, pool}) => ({x, stats: stats(pool)}));
    const degrees = coerceDegrees(cond);
    _displayResults.push({label: label || null, scalingPoints: points, degrees, opts: opts || {}});
  } catch(e) {
    _logs.push(`⚠ displayScaling() error: ${e.message}`);
  }
}

function fmtVal(v) {
  if (v instanceof Pool) return `[Pool n=${v._n} type=${v.type}]`;
  if (typeof v === 'number') return String(+v.toFixed(6)).replace(/\.?0+$/, '');
  if (v && typeof v === 'object' && 'total' in v && 'pools' in v) {
    function renderPool(pool, indent) {
      const lbl = pool.name ? `${pool.name}: ` : '';
      const diceStr = (pool.dice||[]).map(d =>
        `${d.discarded ? '~~' : ''}[${d.name||'?'}]→${d.rolled}${d.discarded ? '~~' : ''}`
      ).join(' ');
      let s = `${indent}${lbl}${diceStr}`;
      if (pool.pools && pool.pools.length)
        s += '\n' + pool.pools.map(p => renderPool(p, indent + '\t')).join('\n');
      return s;
    }
    return `total=${v.total}\n${v.pools.map(p => renderPool(p, '')).join('\n')}`;
  }
  if (v && typeof v === 'object' && 'mean' in v) return `{mean:${v.mean.toFixed(2)} med:${v.median}}`;
  return String(v);
}

// getEditorValue: () => string, injected by editor.js to avoid circular deps
export function runCode(getEditorValue) {
  const src = getEditorValue().trim();
  if (!src) return;

  const outputEl = document.getElementById('output-scroll');
  outputEl.innerHTML = '';
  _displayResults = [];
  _logs = [];
  resetEngineState();

  const rt = {
    pool: coercePool, die, customDie, memoize, poolBuilder,
    stats, roll,
    display, displayRoll, displayScaling, displayCumulative,
    total: dice => dice.reduce((a, b) => a + b, 0),
    ev:    dice => dice.reduce((a, b) => a + b, 0), // legacy alias
    console: {log: (...args) => _logs.push(args.map(fmtVal).join(' '))},
  };
  for (const n of [2, 3, 4, 6, 8, 10, 12, 20, 100]) rt[`d${n}`] = die(n);

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(rt), `"use strict";\n${src}`);
    fn(...Object.values(rt));
  } catch (e) {
    renderError(outputEl, e.message + (e.stack ? '\n' + e.stack.split('\n').slice(1,4).join('\n') : ''));
    return;
  }

  if (_displayResults.length === 0 && _logs.length === 0) {
    outputEl.innerHTML = '<div class="empty-state"><div class="big">∅</div><div>No output — use display() or console.log()</div></div>';
    return;
  }

  if (_logs.length > 0) {
    const block = document.createElement('div');
    block.className = 'result-block';
    block.innerHTML = `<div class="result-label">CONSOLE</div><div class="log-block">${_logs.map(l => `<div class="log-line" style="${l.startsWith('⚠') ? 'color:var(--accent3)' : ''}">${esc(l)}</div>`).join('')}</div>`;
    outputEl.appendChild(block);
  }

  _displayResults.forEach((r, i) => {
    if (r.rollResult)            renderRollBlock(outputEl, r.rollResult, r.label || `Roll ${i+1}`, r.poolRef);
    else if (r.scalingPoints)    renderScalingBlock(outputEl, r.scalingPoints, r.label || `Scaling ${i+1}`, r.degrees, r.opts);
    else if (r.cumulativePoints) renderCumulativeBlock(outputEl, r.cumulativePoints, r.label || `Cumulative ${i+1}`, r.degrees, r.perAttempt, r.opts);
    else                         renderStatBlock(outputEl, r.stats, r.label || `Distribution ${i+1}`, r.passFn, r.opts);
  });
}
