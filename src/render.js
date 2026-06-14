import { roll } from './engine.js';
import { total as totalReduction } from './std.js';

// ================================================================
// DOM rendering — pure DOM builders consuming the display layer's
// presentation-ready shapes. No engine logic, no probability math
// beyond trivial layout.
// ================================================================

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Shared cursor-following tooltip — robust against container `overflow:hidden`
// (the in-flow `.bar-tooltip` gets clipped by .chart-wrap, so bars use this).
function floatTip() {
  let t = document.getElementById('dice-tooltip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'dice-tooltip';
    t.style.cssText = 'position:fixed;pointer-events:none;background:var(--surface2);border:1px solid var(--border);padding:0.25rem 0.5rem;font-size:0.6rem;border-radius:4px;z-index:999;display:none;white-space:nowrap;color:var(--text)';
    document.body.appendChild(t);
  }
  return t;
}

export function renderError(container, msg) {
  const b = document.createElement('div');
  b.className = 'error-block';
  b.innerHTML = `<div style="color:var(--accent3);font-size:0.65rem;letter-spacing:0.1em;margin-bottom:0.4rem">ERROR</div>${esc(msg)}`;
  container.appendChild(b);
}

// ---------------------------------------------------------------- stat block
export function renderStatBlock(container, s, title, opts = {}) {
  const block = document.createElement('div');
  block.className = 'result-block';

  const pmf = new Map(s.sorted);
  const allFilled = [];
  for (let v = s.min; v <= s.max; v++) allFilled.push([v, pmf.get(v) || 0]);
  const nonZero = allFilled.filter(([, p]) => p > 0).length;

  const cats = s.categories || null;
  const catLegend = cats ? `
    <div style="display:flex;gap:0.75rem;padding:0.4rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">
      ${cats.map(c => `<span style="display:flex;align-items:center;gap:0.3rem">
        <span style="width:8px;height:8px;border-radius:2px;background:${c.color};display:inline-block"></span>
        <span style="color:var(--muted)">${esc(c.label)}</span>
        <span style="color:${c.color}">${(c.mass * 100).toFixed(1)}%</span></span>`).join('')}
    </div>` : '';

  block.innerHTML = `
    <div class="result-label">
      <span>${esc(title).toUpperCase()}</span>
      <span style="display:flex;align-items:center;gap:0.5rem">
        <span class="range-label" style="color:var(--muted);font-size:0.55rem"></span>
        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.55rem;color:var(--muted);cursor:pointer">
          cutoff
          <input type="range" min="0" max="100" step="1" value="0" style="width:80px;accent-color:var(--accent2);cursor:pointer">
          <span class="cutoff-label" style="min-width:2.5rem;color:var(--accent2)">0.00%</span>
        </label>
      </span>
    </div>
    <div class="stats-grid">
      <div class="stat"><div class="label">MEAN</div><div class="value">${s.mean.toFixed(2)}</div></div>
      <div class="stat"><div class="label">MEDIAN</div><div class="value">${s.median}</div></div>
      <div class="stat"><div class="label">MODE</div><div class="value">${s.mode}</div></div>
      <div class="stat"><div class="label">STD DEV</div><div class="value">${s.stddev.toFixed(2)}</div></div>
      <div class="stat"><div class="label">RANGE</div><div class="value">${s.min}–${s.max}</div></div>
    </div>
    <div class="chart-area">
      <div class="chart-wrap" style="position:relative"><div class="bar-chart"></div></div>
      <div class="dot-row" style="position:relative;height:8px;margin:2px 0 0"></div>
      <div class="chart-labels"></div>
    </div>
    ${catLegend}
    <div class="percentile-row">
      <div class="pct-cell"><div class="pct-label">P10</div><div class="pct-val">${s.p10}</div></div>
      <div class="pct-cell"><div class="pct-label">P25</div><div class="pct-val">${s.p25}</div></div>
      <div class="pct-cell"><div class="pct-label">P50</div><div class="pct-val">${s.median}</div></div>
      <div class="pct-cell"><div class="pct-label">P75</div><div class="pct-val">${s.p75}</div></div>
      <div class="pct-cell"><div class="pct-label">P90</div><div class="pct-val">${s.p90}</div></div>
    </div>`;

  const barChart = block.querySelector('.bar-chart');
  const dotRow = block.querySelector('.dot-row');
  const chartLabels = block.querySelector('.chart-labels');
  const rangeLabel = block.querySelector('.range-label');
  const cutoffLabel = block.querySelector('.cutoff-label');
  const slider = block.querySelector('input[type=range]');

  // hover popup on bars (delegated, so it survives barChart re-renders)
  const tip = floatTip();
  barChart.addEventListener('mousemove', e => {
    const col = e.target.closest('.bar-col');
    if (!col) { tip.style.display = 'none'; return; }
    tip.textContent = col.dataset.tip;
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top = (e.clientY - 28) + 'px';
  });
  barChart.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  function update(cutoff) {
    let filled = allFilled.slice();
    if (cutoff > 0) {
      let removed = 0;
      while (filled.length > 1) {
        const last = filled[filled.length - 1];
        if (removed + last[1] <= cutoff) { removed += last[1]; filled = filled.slice(0, -1); }
        else break;
      }
    }
    if (!filled.length) return;
    const minV = filled[0][0], maxV = filled[filled.length - 1][0];
    const showing = filled.filter(([, p]) => p > 0).length;
    const cutoffTxt = cutoff > 0 ? ` ≥${(cutoff * 100).toFixed(2)}%` : '';
    rangeLabel.textContent = `${minV}–${maxV} (${showing}${cutoffTxt}/${nonZero})`;

    const maxP = Math.max(...filled.map(([, p]) => p));
    barChart.innerHTML = filled.map(([v, p]) => {
      const h = Math.round((p / maxP) * 100);
      const tip = `${v}: ${(p * 100).toFixed(2)}%`;
      return `<div class="bar-col" data-tip="${esc(tip)}"><div class="bar ${v === s.mode ? 'mode-bar' : ''}" style="height:${Math.max(h, p > 0 ? 1 : 0)}%"></div></div>`;
    }).join('');

    chartLabels.innerHTML = `<span>${minV}</span><span>${Math.round((minV + maxV) / 2)}</span><span>${maxV}</span>`;

    dotRow.innerHTML = '';
    if (s.dotByValue) {
      const cells = filled.length;
      filled.forEach(([v, p], idx) => {
        if (p === 0) return;
        const color = s.dotByValue.get(v);
        if (!color) return;
        const dot = document.createElement('div');
        const pct = ((idx + 0.5) / cells) * 100;
        dot.title = `${v}: ${(p * 100).toFixed(2)}%`;
        Object.assign(dot.style, {
          position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)',
          width: '3px', height: '3px', borderRadius: '50%', background: color, opacity: '0.8',
        });
        dotRow.appendChild(dot);
      });
    }
  }

  const CUTOFF_MAX = 0.05;
  slider.addEventListener('input', () => {
    const t = parseFloat(slider.value) / 100;
    const val = CUTOFF_MAX * t * t;
    cutoffLabel.textContent = (val * 100).toFixed(2) + '%';
    update(val);
  });
  update(0);
  container.appendChild(block);
}

// ---------------------------------------------------------------- roll block
export function renderRollBlock(container, result, axis, title, poolRef) {
  const reduce = axis || totalReduction;
  const block = document.createElement('div');
  block.className = 'result-block';

  function dieSpan(leaf) {
    const style = leaf.discarded ? 'opacity:0.35;text-decoration:line-through' : '';
    const name = leaf.name || '·';
    return `<span style="${style}">[<span style="color:var(--muted)">${esc(name)}</span>]<span style="color:var(--accent)">→${leaf.face}</span></span>`;
  }
  // walk a node in roll order: leaves (and leaves of unlabeled groups) go on
  // the current line; labeled groups become their own indented sub-blocks.
  function walk(node) {
    let inline = '', blocks = '';
    for (const c of node.children || []) {
      if (c.leaf) inline += (inline ? ' ' : '') + dieSpan(c);
      else if (c.label) blocks += labeledBlock(c);
      else { const r = walk(c); if (r.inline) inline += (inline ? ' ' : '') + r.inline; blocks += r.blocks; }
    }
    return { inline, blocks };
  }
  function labeledBlock(node) {
    const r = walk(node);
    const head = `<div style="padding-left:1.2rem"><span style="color:var(--accent2)">${esc(node.label)}</span>:${r.inline ? ' ' + r.inline : ''}</div>`;
    return head + (r.blocks ? `<div style="padding-left:1.2rem">${r.blocks}</div>` : '');
  }
  function content(r) {
    if (!r.tree) return '(empty)';
    const root = walk(r.tree);
    const barred = r.barred ? `<div style="color:var(--accent3)">⊘ barred — no result</div>` : '';
    const first = root.inline ? `<div>${root.inline}</div>` : '';
    return barred + first + root.blocks;
  }

  block.innerHTML = `
    <div class="result-label">
      <span>${esc(title).toUpperCase()}</span>
      <span style="display:flex;align-items:center;gap:0.75rem">
        total: <span class="roll-total" style="color:var(--accent);font-size:1rem">${reduce(result.view)}</span>
        <button class="reroll-btn" style="height:1.5rem;padding:0 0.6rem;font-size:0.65rem;background:transparent;color:var(--accent2);border:1px solid var(--accent2);cursor:pointer;letter-spacing:0.08em">↺ REROLL</button>
      </span>
    </div>
    <div class="roll-content" style="padding:0.85rem;font-size:0.8rem;line-height:1.8;font-family:'DM Mono',monospace">${content(result)}</div>`;

  block.querySelector('.reroll-btn').addEventListener('click', () => {
    if (!poolRef) return;
    const r = roll(poolRef);
    block.querySelector('.roll-content').innerHTML = content(r);
    block.querySelector('.roll-total').textContent = reduce(r.view);
  });
  container.appendChild(block);
}

// ---------------------------------------------------------------- scaling block
export function renderScalingBlock(container, rows, cats, title, opts = {}) {
  const block = document.createElement('div');
  block.className = 'result-block';
  const W = 600, H = 140, PL = 36, PR = 12, PT = 10, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = rows.length;
  if (!n) return;
  const hasCats = cats && cats.length > 0;
  const xPos = i => PL + (i / (n - 1 || 1)) * cW;
  const means = rows.map(r => r.mean);

  // 'pct' = stacked-probability bars (full height); 'ev' = outcome mode:
  // bar height scales with the average roll value, split across its width
  // by category probability. Mirror of the old E/% toggle.
  function buildSVG(mode) {
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
    for (let g = 0; g <= 4; g++) {
      const y = PT + (g / 4) * cH;
      svg += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    }

    if (hasCats && mode === 'ev') {
      const maxM = Math.max(...means, 1e-6);
      const barW = cW / n;
      for (let i = 0; i < n; i++) {
        const barH = (means[i] / maxM) * cH;
        const x = PL + i * barW + barW * 0.1, bw = barW * 0.8, y = PT + cH - barH;
        let cumX = x;
        const seg = (p, color, label) => {
          const segW = p * bw;
          if (segW > 0.1) svg += `<rect x="${cumX.toFixed(1)}" y="${y.toFixed(1)}" width="${segW.toFixed(1)}" height="${Math.max(barH, 0.5).toFixed(1)}" fill="${color}" opacity="0.85"><title>${esc(label)}: ${(p * 100).toFixed(1)}% · avg ${means[i].toFixed(2)}</title></rect>`;
          cumX += segW;
        };
        cats.forEach((c, ci) => seg(rows[i].p[ci] || 0, c.color, c.label));
        if ((rows[i].other || 0) > 0.001) seg(rows[i].other, 'var(--muted)', 'other');
      }
      svg += `<text x="${PL - 4}" y="${PT + 4}" text-anchor="end" font-size="8" fill="var(--muted)">${maxM.toFixed(1)}</text>`;
      svg += `<text x="${PL - 4}" y="${PT + cH + 4}" text-anchor="end" font-size="8" fill="var(--muted)">0</text>`;
    } else if (hasCats) {
      const barW = cW / n;
      for (let i = 0; i < n; i++) {
        const x = PL + i * barW + barW * 0.1, bw = barW * 0.8;
        let cumY = PT + cH;
        const seg = (p, color, label) => {
          const h = p * cH;
          if (h > 0.1) { svg += `<rect x="${x.toFixed(1)}" y="${(cumY - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="0.85"><title>${esc(label)}: ${(p * 100).toFixed(1)}%</title></rect>`; cumY -= h; }
        };
        cats.forEach((c, ci) => seg(rows[i].p[ci] || 0, c.color, c.label));
        if ((rows[i].other || 0) > 0.001) seg(rows[i].other, 'var(--muted)', 'other');
      }
      svg += `<text x="${PL - 4}" y="${PT + 4}" text-anchor="end" font-size="8" fill="var(--muted)">100%</text>`;
      svg += `<text x="${PL - 4}" y="${PT + cH + 4}" text-anchor="end" font-size="8" fill="var(--muted)">0%</text>`;
    } else {
      const sds = rows.map(r => r.stddev);
      const maxM = Math.max(...means.map((m, i) => m + sds[i]));
      const minM = Math.min(...means.map((m, i) => m - sds[i]));
      const range = maxM - minM || 1;
      const yM = v => PT + cH - ((v - minM) / range) * cH;
      const top = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yM(r.mean + sds[i]).toFixed(1)}`).join(' ');
      const bot = rows.map((r, i) => `${i === n - 1 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yM(r.mean - sds[i]).toFixed(1)}`).join(' ') + ' Z';
      svg += `<path d="${top} ${bot}" fill="var(--accent2)" opacity="0.12"/>`;
      const line = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yM(r.mean).toFixed(1)}`).join(' ');
      svg += `<path d="${line}" fill="none" stroke="var(--accent2)" stroke-width="1.5"/>`;
      rows.forEach((r, i) => { svg += `<circle cx="${xPos(i).toFixed(1)}" cy="${yM(r.mean).toFixed(1)}" r="2.5" fill="var(--accent2)"><title>${r.x}: ${r.mean.toFixed(2)}</title></circle>`; });
      svg += `<text x="${PL - 4}" y="${PT + 4}" text-anchor="end" font-size="8" fill="var(--muted)">${maxM.toFixed(1)}</text>`;
      svg += `<text x="${PL - 4}" y="${PT + cH + 4}" text-anchor="end" font-size="8" fill="var(--muted)">${minM.toFixed(1)}</text>`;
    }

    const step = Math.ceil(n / 10);
    rows.forEach((r, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const tx = hasCats ? PL + (i + 0.5) * (cW / n) : xPos(i);
      svg += `<text x="${tx.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc(String(r.x))}</text>`;
    });
    return svg + '</svg>';
  }

  const legend = hasCats ? `<div style="display:flex;gap:0.75rem;padding:0.35rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border);flex-wrap:wrap">
    ${cats.map(c => `<span style="display:flex;align-items:center;gap:0.3rem"><span style="width:8px;height:8px;border-radius:2px;background:${c.color};display:inline-block"></span><span style="color:var(--muted)">${esc(c.label)}</span></span>`).join('')}</div>` : '';

  const toggle = hasCats ? `<div style="display:flex;gap:2px">
    <button class="tog" data-mode="ev"  title="outcome: bar height = average value" style="font-size:0.55rem;padding:0.1rem 0.4rem;border:none;border-radius:3px 0 0 3px;cursor:pointer">avg</button>
    <button class="tog" data-mode="pct" title="probability composition" style="font-size:0.55rem;padding:0.1rem 0.4rem;border:none;border-radius:0 3px 3px 0;cursor:pointer">%</button>
  </div>` : '';

  block.innerHTML = `<div class="result-label"><span>${esc(title).toUpperCase()}</span>${toggle}</div>
    <div class="svg-wrap" style="padding:0.5rem 0.5rem 0"></div>${legend}`;

  const svgWrap = block.querySelector('.svg-wrap');
  let mode = opts.mode || 'ev';
  const paint = () => {
    svgWrap.innerHTML = buildSVG(mode);
    block.querySelectorAll('.tog').forEach(b => {
      const active = b.dataset.mode === mode;
      b.style.background = active ? 'var(--accent2)' : 'var(--surface2)';
      b.style.color = active ? 'var(--bg)' : 'var(--muted)';
    });
  };
  block.querySelectorAll('.tog').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; paint(); }));
  paint();
  container.appendChild(block);
}

// ---------------------------------------------------------------- cumulative block
export function renderCumulativeBlock(container, rows, single, cats, title, opts = {}) {
  const block = document.createElement('div');
  block.className = 'result-block';
  const W = 600, H = 160, PL = 40, PR = 12, PT = 10, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = rows.length;
  if (!n || !cats || !cats.length) return;
  const xPos = i => PL + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yPos = p => PT + cH - Math.max(0, Math.min(1, p)) * cH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
  for (let g = 0; g <= 4; g++) {
    const y = PT + (g / 4) * cH;
    svg += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    svg += `<text x="${PL - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="var(--muted)">${100 - g * 25}%</text>`;
  }

  cats.forEach((c, ci) => {
    const probs = rows.map(r => r.p[ci] || 0);
    let area = probs.map((p, i) => (i === 0 ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(p).toFixed(1)).join(' ');
    area += ` L${xPos(n - 1).toFixed(1)},${yPos(0).toFixed(1)} L${xPos(0).toFixed(1)},${yPos(0).toFixed(1)} Z`;
    svg += `<path d="${area}" fill="${c.color}" opacity="0.1"/>`;
    const line = probs.map((p, i) => (i === 0 ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(p).toFixed(1)).join(' ');
    svg += `<path d="${line}" fill="none" stroke="${c.color}" stroke-width="1.5"/>`;
    probs.forEach((p, i) => {
      svg += `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(p).toFixed(1)}" r="3" fill="${c.color}" stroke="var(--bg)" stroke-width="1.5"><title>${esc(c.label)} — attempt ${rows[i].attempts}: ${(p * 100).toFixed(1)}%</title></circle>`;
    });
  });

  const step = Math.max(1, Math.ceil(n / 10));
  rows.forEach((r, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    svg += `<text x="${xPos(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="8" fill="var(--muted)">${r.attempts}</text>`;
  });
  svg += '</svg>';

  const legend = `<div style="display:flex;gap:0.75rem;padding:0.35rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">
    ${cats.map((c, ci) => `<span style="display:flex;align-items:center;gap:0.3rem">
      <span style="width:14px;height:2px;border-radius:2px;background:${c.color};display:inline-block"></span>
      <span style="color:var(--muted)">${esc(c.label)}</span>
      <span style="color:${c.color}">${((single[ci] || 0) * 100).toFixed(1)}%/attempt</span></span>`).join('')}</div>`;

  block.innerHTML = `<div class="result-label"><span>${esc(title).toUpperCase()}</span></div>
    <div style="padding:0.5rem 0.5rem 0">${svg}</div>${legend}`;
  container.appendChild(block);
}
