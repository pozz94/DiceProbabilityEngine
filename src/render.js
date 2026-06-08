import { roll } from './engine.js';

// ================================================================
// DOM rendering functions — all pure DOM builders, no engine logic
// ================================================================

export function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function renderError(container, msg) {
  const b = document.createElement('div');
  b.className = 'error-block';
  b.innerHTML = `<div style="color:var(--accent3);font-size:0.65rem;letter-spacing:0.1em;margin-bottom:0.4rem">ERROR</div>${esc(msg)}`;
  container.appendChild(b);
}

export function renderCumulativeBlock(container, points, label, degrees, perAttempt, opts) {
  const block = document.createElement('div');
  block.className = 'result-block';
  const W = 600, H = 160, PL = 40, PR = 12, PT = 10, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = points.length;
  if (!n || !degrees || !degrees.length) return;

  const vis = degrees.map((d, i) => ({d, i})).filter(({d}) => d.label !== 'fail');

  function xPos(i) { return PL + (n === 1 ? cW/2 : (i / (n-1)) * cW); }
  function yPos(p) { return PT + cH - Math.max(0, Math.min(1, p)) * cH; }

  const parts = [];
  parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:' + H + 'px">');

  for (let g = 0; g <= 4; g++) {
    const y = PT + (g / 4) * cH;
    parts.push('<line x1="' + PL + '" y1="' + y + '" x2="' + (W-PR) + '" y2="' + y + '" stroke="var(--border)" stroke-width="0.5"/>');
    parts.push('<text x="' + (PL-4) + '" y="' + (y+3) + '" text-anchor="end" font-size="8" fill="var(--muted)">' + (100-g*25) + '%' + '</text>');
  }

  vis.forEach(({d, i: di}) => {
    const probs = points.map(pt => pt.cumDegrees[di].cumProb);

    let areaD = probs.map((p, i) => (i===0?'M':'L') + xPos(i).toFixed(1) + ',' + yPos(p).toFixed(1)).join(' ');
    areaD += ' L' + xPos(n-1).toFixed(1) + ',' + yPos(0).toFixed(1) + ' L' + xPos(0).toFixed(1) + ',' + yPos(0).toFixed(1) + ' Z';
    parts.push('<path d="' + areaD + '" fill="' + d.color + '" opacity="0.1"/>');

    const lineD = probs.map((p, i) => (i===0?'M':'L') + xPos(i).toFixed(1) + ',' + yPos(p).toFixed(1)).join(' ');
    parts.push('<path d="' + lineD + '" fill="none" stroke="' + d.color + '" stroke-width="1.5"/>');

    probs.forEach((p, i) => {
      const cx = xPos(i).toFixed(1), cy = yPos(p).toFixed(1);
      const tip = esc(d.label + ' — attempt ' + points[i].x + ': ' + (p*100).toFixed(1) + '%');
      parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' + d.color + '" stroke="var(--bg)" stroke-width="1.5" data-tip="' + tip + '" style="cursor:crosshair"/>');
    });

    [0.5, 0.9].forEach(threshold => {
      const idx = probs.findIndex(p => p >= threshold);
      if (idx >= 0) {
        const cx = xPos(idx), cy = yPos(probs[idx]);
        const anchor = cx > W * 0.75 ? 'end' : 'start';
        const dx = anchor === 'end' ? -5 : 5;
        parts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3" fill="' + d.color + '"/>');
        parts.push('<text x="' + (cx+dx).toFixed(1) + '" y="' + (cy-4).toFixed(1) + '" font-size="7" fill="' + d.color + '" text-anchor="' + anchor + '">' + Math.round(threshold*100) + '%@' + points[idx].x + '</text>');
      }
    });
  });

  const step = Math.max(1, Math.ceil(n / 10));
  points.forEach((pt, i) => {
    if (i % step !== 0 && i !== n-1) return;
    parts.push('<text x="' + xPos(i).toFixed(1) + '" y="' + (H-4) + '" text-anchor="middle" font-size="8" fill="var(--muted)">' + pt.x + '</text>');
  });

  parts.push('</svg>');
  const svg = parts.join('\n');

  const legend = '<div style="display:flex;gap:0.75rem;padding:0.35rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">'
    + vis.map(({d, i: di}) =>
      '<span style="display:flex;align-items:center;gap:0.3rem">'
      + '<span style="width:14px;height:2px;border-radius:2px;background:' + d.color + ';display:inline-block"></span>'
      + '<span style="color:var(--muted)">' + esc(d.label) + '</span>'
      + '<span style="color:' + d.color + '">' + (perAttempt[di]*100).toFixed(1) + '%/attempt</span>'
      + '</span>'
    ).join('')
    + '</div>';

  block.innerHTML = '<div class="result-label"><span>' + esc(label || '').toUpperCase() + '</span></div>'
    + '<div style="padding:0.5rem 0.5rem 0">' + svg + '</div>'
    + legend;

  container.appendChild(block);

  const tip = document.getElementById('dice-tooltip') || (() => {
    const t = document.createElement('div');
    t.id = 'dice-tooltip';
    t.style.cssText = 'position:fixed;pointer-events:none;background:var(--surface2);border:1px solid var(--border);padding:0.25rem 0.5rem;font-size:0.6rem;border-radius:4px;z-index:999;display:none;white-space:nowrap;color:var(--text)';
    document.body.appendChild(t);
    return t;
  })();

  block.querySelectorAll('circle[data-tip]').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      tip.textContent = dot.getAttribute('data-tip');
      tip.style.display = 'block';
    });
    dot.addEventListener('mousemove', e => {
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top  = (e.clientY - 28) + 'px';
    });
    dot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

export function renderScalingBlock(container, points, label, degrees, opts) {
  opts = opts || {};
  const block = document.createElement('div');
  block.className = 'result-block';

  const W = 600, H = 140, PL = 36, PR = 12, PT = 10, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const n = points.length;
  if (n === 0) return;

  const hasDegrees = degrees && degrees.length > 0;

  const degData = hasDegrees ? degrees.map((d, di) => ({
    ...d,
    probs: points.map(({stats: s}) => {
      let p = 0;
      for (const {dice, prob} of s.outcomes || []) {
        let matched = false;
        for (let j = 0; j < di; j++) if (degrees[j].fn(dice)) { matched = true; break; }
        if (!matched && d.fn(dice)) p += prob;
      }
      return p;
    }),
    ev: points.map(({stats: s}) => {
      let e = 0;
      for (const {dice, prob} of s.outcomes || []) {
        let matched = false;
        for (let j = 0; j < di; j++) if (degrees[j].fn(dice)) { matched = true; break; }
        if (!matched && d.fn(dice)) e += dice.reduce((a,b)=>a+b,0) * prob;
      }
      return e;
    }),
  })) : null;

  const means = points.map(p => p.stats.mean);
  const maxMean = Math.max(...means);
  const minMean = Math.min(...means);
  const meanRange = maxMean - minMean || 1;
  function xPos(i) { return PL + (i / (n - 1 || 1)) * cW; }
  function yMean(v) { return PT + cH - ((v - minMean) / meanRange) * cH; }

  function buildSVG(mode) {
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
    for (let g = 0; g <= 4; g++) {
      const y = PT + (g / 4) * cH;
      svg += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    }

    if (hasDegrees) {
      const barW = cW / n;
      if (mode === 'ev') {
        const maxEV = Math.max(...points.map((_,i) => degData.reduce((s,d) => s+d.ev[i], 0)));
        for (let i = 0; i < n; i++) {
          const totalEV = degData.reduce((s,d) => s+d.ev[i], 0);
          const barH = maxEV > 0 ? (totalEV / maxEV) * cH : 0;
          const x = PL + i * barW + barW * 0.1;
          const bw = barW * 0.8;
          const y = PT + cH - barH;
          let cumX = x;
          for (const d of degData) {
            const segW = d.probs[i] * bw;
            if (segW > 0.1)
              svg += `<rect x="${cumX.toFixed(1)}" y="${y.toFixed(1)}" width="${segW.toFixed(1)}" height="${Math.max(barH,0.5).toFixed(1)}" fill="${d.color}" opacity="0.85"><title>${d.label}: P=${(d.probs[i]*100).toFixed(1)}% EV=${d.ev[i].toFixed(2)}\x3c/title></rect>`;
            cumX += segW;
          }
        }
        svg += `<text x="${PL-4}" y="${PT+4}" text-anchor="end" font-size="8" fill="var(--muted)">${maxEV.toFixed(1)}\x3c/text>`;
        svg += `<text x="${PL-4}" y="${PT+cH+4}" text-anchor="end" font-size="8" fill="var(--muted)">0\x3c/text>`;
      } else {
        for (let i = 0; i < n; i++) {
          const x = PL + i * barW + barW * 0.1;
          const bw = barW * 0.8;
          let cumY = PT + cH;
          for (const d of degData) {
            const h = d.probs[i] * cH;
            if (h > 0.1)
              svg += `<rect x="${x.toFixed(1)}" y="${(cumY-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${d.color}" opacity="0.85"><title>${d.label}: ${(d.probs[i]*100).toFixed(1)}%\x3c/title></rect>`;
            cumY -= h;
          }
        }
        svg += `<text x="${PL-4}" y="${PT+4}" text-anchor="end" font-size="8" fill="var(--muted)">100%\x3c/text>`;
        svg += `<text x="${PL-4}" y="${PT+cH+4}" text-anchor="end" font-size="8" fill="var(--muted)">0%\x3c/text>`;
      }
    } else {
      const stddevs = points.map(p => p.stats.stddev);
      const topPath = points.map((p,i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yMean(Math.min(p.stats.mean+stddevs[i],maxMean)).toFixed(1)}`).join(' ');
      const botPath = points.map((p,i) => `${i===n-1?'M':'L'}${xPos(i).toFixed(1)},${yMean(Math.max(p.stats.mean-stddevs[i],minMean)).toFixed(1)}`).join(' ') + ' Z';
      svg += `<path d="${topPath} ${botPath}" fill="var(--accent2)" opacity="0.12"/>`;
      const linePath = points.map((p,i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yMean(p.stats.mean).toFixed(1)}`).join(' ');
      svg += `<path d="${linePath}" fill="none" stroke="var(--accent2)" stroke-width="1.5"/>`;
      points.forEach((p,i) => {
        svg += `<circle cx="${xPos(i).toFixed(1)}" cy="${yMean(p.stats.mean).toFixed(1)}" r="2.5" fill="var(--accent2)"><title>${p.x}: ${p.stats.mean.toFixed(2)}\x3c/title>\x3c/circle>`;
      });
      svg += `<text x="${PL-4}" y="${PT+4}" text-anchor="end" font-size="8" fill="var(--muted)">${maxMean.toFixed(1)}\x3c/text>`;
      svg += `<text x="${PL-4}" y="${PT+cH+4}" text-anchor="end" font-size="8" fill="var(--muted)">${minMean.toFixed(1)}\x3c/text>`;
    }

    const step = Math.ceil(n / 10);
    points.forEach((p,i) => {
      if (i % step !== 0 && i !== n-1) return;
      const tx = hasDegrees ? PL + (i+0.5)*(cW/n) : xPos(i);
      svg += `<text x="${tx.toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc(String(p.x))}\x3c/text>`;
    });
    svg += '\x3c/svg>';
    return svg;
  }

  const legend = hasDegrees ? `<div style="display:flex;gap:0.75rem;padding:0.35rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">
    ${degData.map(d => `<span style="display:flex;align-items:center;gap:0.3rem">
      <span style="width:8px;height:8px;border-radius:2px;background:${d.color};display:inline-block"></span>
      <span style="color:var(--muted)">${esc(d.label)}</span>
    </span>`).join('')}
  </div>` : '';

  block.innerHTML = `
    <div class="result-label">
      <span>${esc(label || '').toUpperCase()}</span>
      ${hasDegrees ? `<div style="display:flex;gap:2px">
        <button class="tog" data-mode="ev"  style="font-size:0.55rem;padding:0.1rem 0.4rem;background:var(--accent2);color:var(--bg);border:none;border-radius:3px 0 0 3px;cursor:pointer">E</button>
        <button class="tog" data-mode="pct" style="font-size:0.55rem;padding:0.1rem 0.4rem;background:var(--surface2);color:var(--muted);border:none;border-radius:0 3px 3px 0;cursor:pointer">%</button>
      </div>` : ''}
    </div>
    <div class="svg-wrap" style="padding:0.5rem 0.5rem 0"></div>
    ${legend}`;

  const svgWrap = block.querySelector('.svg-wrap');
  const defaultMode = opts.mode || 'ev';
  svgWrap.innerHTML = buildSVG(defaultMode);

  if (hasDegrees) {
    block.querySelectorAll('.tog').forEach(btn => {
      if (btn.dataset.mode === defaultMode) {
        btn.style.background = 'var(--accent2)';
        btn.style.color = 'var(--bg)';
      } else {
        btn.style.background = 'var(--surface2)';
        btn.style.color = 'var(--muted)';
      }
      btn.onclick = () => {
        block.querySelectorAll('.tog').forEach(b => {
          const active = b.dataset.mode === btn.dataset.mode;
          b.style.background = active ? 'var(--accent2)' : 'var(--surface2)';
          b.style.color = active ? 'var(--bg)' : 'var(--muted)';
        });
        svgWrap.innerHTML = buildSVG(btn.dataset.mode);
      };
    });
  }

  container.appendChild(block);
}

export function renderRollBlock(container, result, label, poolRef) {
  const block = document.createElement('div');
  block.className = 'result-block';

  function renderPool(pool, depth) {
    const indent = '  '.repeat(depth);
    const lbl = pool.name ? `<span style="color:var(--accent2)">${esc(pool.name)}</span>: ` : '';
    const diceStr = (pool.dice||[]).map(d =>
      `<span style="${d.discarded?'opacity:0.35;text-decoration:line-through':''}">[<span style="color:var(--muted)">${esc(d.name||'?')}</span>]<span style="color:var(--accent)">→${d.rolled}</span></span>`
    ).join(' ');
    let html = `<div style="padding:0.1rem 0;white-space:pre">${esc(indent)}${lbl}${diceStr}</div>`;
    if (pool.pools && pool.pools.length)
      html += pool.pools.map(p => renderPool(p, depth + 1)).join('');
    return html;
  }

  function refresh(r) {
    block.querySelector('.roll-content').innerHTML = (r.pools||[]).map(p => renderPool(p, 0)).join('');
    block.querySelector('.roll-total').textContent = r.total;
  }

  const poolsHtml = (result.pools||[]).map(p => renderPool(p, 0)).join('');
  block.innerHTML = `
    <div class="result-label">
      <span>${esc(label).toUpperCase()}</span>
      <span style="display:flex;align-items:center;gap:0.75rem">
        total: <span class="roll-total" style="color:var(--accent);font-size:1rem">${result.total}</span>
        <button class="reroll-btn" style="height:1.5rem;padding:0 0.6rem;font-size:0.65rem;background:transparent;color:var(--accent2);border:1px solid var(--accent2);cursor:pointer;letter-spacing:0.08em">↺ REROLL</button>
      </span>
    </div>
    <div class="roll-content" style="padding:0.85rem;font-size:0.8rem;line-height:1.8;font-family:'DM Mono',monospace">${poolsHtml}</div>`;

  block.querySelector('.reroll-btn').addEventListener('click', () => {
    if (poolRef) refresh(roll(poolRef));
  });

  container.appendChild(block);
}

export function renderStatBlock(container, s, label, passFn, opts) {
  opts = opts || {};
  const block = document.createElement('div');
  block.className = 'result-block';

  const pmfMap = new Map(s.sorted);
  const allFilled = [];
  for (let v = s.min; v <= s.max; v++) allFilled.push([v, pmfMap.get(v) || 0]);
  const nonZero = allFilled.filter(([,p]) => p > 0).length;

  let pPass = null, pFail = null;
  if (passFn) {
    pPass = 0;
    for (const {dice, prob} of s.outcomes || []) if (passFn(dice)) pPass += prob;
    pFail = 1 - pPass;
  }

  const groups = s.groups || {};
  const groupStarts = s.groupStarts || {};
  const groupNames = Object.keys(groups);
  const pinColors = ['var(--accent2)', 'var(--accent3)', 'var(--accent)', '#a78bfa', '#34d399'];
  const groupParent = s.groupParent || {};
  const topLevel = groupNames.filter(n => n === 'base' || !groupParent[n]);
  const children = groupNames.filter(n => n !== 'base' && !!groupParent[n]);

  function renderGroupEntry(name, indent) {
    const i = groupNames.indexOf(name);
    const color = pinColors[i % pinColors.length];
    const kids = children.filter(c => groupParent[c] === name);
    return `<span style="color:${color};display:block;padding-left:${indent}rem">${'·'.repeat(indent > 0 ? 1 : 0)} ${name}: <strong>+${groups[name].toFixed(2)}</strong></span>`
      + kids.map(k => renderGroupEntry(k, indent + 1)).join('');
  }

  const groupRow = groupNames.length ? `
    <div style="padding:0.4rem 0.85rem;font-size:0.6rem;border-top:1px solid var(--border)">
      ${topLevel.map(n => renderGroupEntry(n, 0)).join('')}
    </div>` : '';

  const passRow = pPass !== null ? `
    <div style="padding:0.5rem 0.85rem 0.6rem;border-top:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;font-size:0.6rem">
      <span style="color:#a3e635;font-weight:bold;flex-shrink:0;min-width:3rem;text-align:right">${(pPass*100).toFixed(1)}%</span>
      <span style="color:#a3e635;flex-shrink:0;letter-spacing:0.08em">PASS</span>
      <div style="display:flex;flex:1;align-items:center;gap:5px">
        <div style="flex:${pPass};height:5px;border-radius:99px;background:#a3e635;min-width:2px"></div>
        <div style="flex:${pFail};height:5px;border-radius:99px;background:#ef4444;min-width:2px"></div>
      </div>
      <span style="color:#ef4444;flex-shrink:0;letter-spacing:0.08em">FAIL</span>
      <span style="color:#ef4444;flex-shrink:0;min-width:3rem">${(pFail*100).toFixed(1)}%</span>
    </div>` : '';

  block.innerHTML = `
    <div class="result-label">
      <span>${esc(label).toUpperCase()}</span>
      <span style="display:flex;align-items:center;gap:0.5rem">
        <span class="range-label" style="color:var(--muted);font-size:0.55rem"></span>
        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.55rem;color:var(--muted);cursor:pointer">
          cutoff
          <input type="range" min="0" max="100" step="1" value="0"
            style="width:80px;accent-color:var(--accent2);cursor:pointer">
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
      <div class="pin-area"></div>
    </div>
    ${groupRow}
    <div class="percentile-row">
      <div class="pct-cell"><div class="pct-label">P10</div><div class="pct-val">${s.p10}</div></div>
      <div class="pct-cell"><div class="pct-label">P25</div><div class="pct-val">${s.p25}</div></div>
      <div class="pct-cell"><div class="pct-label">P50</div><div class="pct-val">${s.median}</div></div>
      <div class="pct-cell"><div class="pct-label">P75</div><div class="pct-val">${s.p75}</div></div>
      <div class="pct-cell"><div class="pct-label">P90</div><div class="pct-val">${s.p90}</div></div>
    </div>
    ${passRow}`;

  const barChart    = block.querySelector('.bar-chart');
  const dotRow      = block.querySelector('.dot-row');
  const chartLabels = block.querySelector('.chart-labels');
  const pinAreaEl   = block.querySelector('.pin-area');
  const rangeLabel  = block.querySelector('.range-label');
  const cutoffLabel = block.querySelector('.cutoff-label');
  const slider      = block.querySelector('input[type=range]');

  function update(cutoff) {
    const filled = (() => {
      if (cutoff <= 0) return allFilled;
      let trimmed = allFilled.slice();
      let removed = 0;
      while (trimmed.length > 1) {
        const last = trimmed[trimmed.length - 1];
        if (removed + last[1] <= cutoff) { removed += last[1]; trimmed = trimmed.slice(0, -1); }
        else break;
      }
      return trimmed;
    })();
    if (!filled.length) return;

    const minV = filled[0][0], maxV = filled[filled.length-1][0];
    const showing = filled.filter(([,p]) => p > 0).length;
    const cutoffTxt = cutoff > 0 ? ` ≥${(cutoff*100).toFixed(2)}%` : '';
    rangeLabel.textContent = `${minV}–${maxV} (${showing}${cutoffTxt}/${nonZero})`;

    const maxP = Math.max(...filled.map(([,p]) => p));
    barChart.innerHTML = filled.map(([v, p]) => {
      const h = Math.round((p / maxP) * 100);
      return `<div class="bar-col"><div class="bar-tooltip">${v}: ${(p*100).toFixed(2)}%</div><div class="bar ${v === s.mode ? 'mode-bar' : ''}" style="height:${Math.max(h, p > 0 ? 1 : 0)}%"></div></div>`;
    }).join('');

    chartLabels.innerHTML = `<span>${minV}</span><span>${Math.round((minV+maxV)/2)}</span><span>${maxV}</span>`;

    pinAreaEl.style.cssText = 'position:relative;height:3rem;margin:0 0 0.2rem';
    if (groupNames.length) {
      const totalBars = filled.length;
      const pinGroupNames = groupNames.filter(n => n !== 'base');
      const pinData = pinGroupNames.map(name => {
        const i = groupNames.indexOf(name);
        const startVal = groupStarts[name] ?? s.min;
        const barIdx = filled.findIndex(([v]) => v >= startVal);
        if (barIdx < 0) return null;
        const pct = Math.max(0, Math.min(99, ((barIdx + 0.5) / totalBars) * 100));
        return {name, pct, i, contribution: groups[name]};
      }).filter(Boolean).sort((a,b) => a.pct - b.pct);

      const levels = [];
      pinAreaEl.innerHTML = pinData.map(({name, pct, i, contribution}) => {
        const color = pinColors[i % pinColors.length];
        const labelWidth = name.length * 0.7;
        let level = 0;
        while (levels[level] !== undefined && pct < levels[level] + labelWidth) level++;
        levels[level] = pct;
        const topOffset = level * 1.1;
        return `<div style="position:absolute;left:${pct}%;top:0;display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateX(-50%)" title="${name}: +${contribution.toFixed(2)}">
          <div style="width:1px;height:${0.5+topOffset}rem;background:${color};opacity:0.8"></div>
          <div style="font-size:0.5rem;color:${color};white-space:nowrap">${name}</div>
        </div>`;
      }).join('');
    }

    dotRow.innerHTML = '';
    if (passFn) {
      const outByVal = new Map();
      for (const {dice, prob} of s.outcomes || []) {
        const v = dice.reduce((a,b)=>a+b,0);
        if (!outByVal.has(v)) outByVal.set(v, dice);
      }
      filled.forEach(([v, p], idx) => {
        if (p === 0) return;
        const dice = outByVal.get(v) || [v];
        const pass = passFn(dice);
        const dot = document.createElement('div');
        const pct = ((idx + 0.5) / filled.length) * 100;
        const color = pass ? '#a3e635' : '#ef4444';
        dot.title = `${v}: ${(p*100).toFixed(2)}%`;
        Object.assign(dot.style, {
          position:'absolute', left:`${pct}%`, top:'50%',
          transform:'translate(-50%,-50%)',
          width:'3px', height:'3px',
          borderRadius:'50%', background:color, opacity:'0.75'
        });
        dotRow.appendChild(dot);
      });
    }
  }

  const CUTOFF_MAX = 0.05;
  const defaultCutoff = opts.cutoff != null ? opts.cutoff : 0.0001;
  const defaultT = Math.round(Math.sqrt(defaultCutoff / CUTOFF_MAX) * 100);
  slider.value = defaultT;

  let raf = null;
  slider.addEventListener('input', () => {
    const t = parseFloat(slider.value) / 100;
    const val = CUTOFF_MAX * t * t;
    cutoffLabel.textContent = (val * 100).toFixed(2) + '%';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => update(val));
  });

  update(defaultCutoff);
  cutoffLabel.textContent = '0.00%';
  container.appendChild(block);
}
