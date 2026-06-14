// ================================================================
// docs page — render each code sample as a real, read-only Monaco
// editor (identical highlighting to the playground, but not editable),
// and run the ones marked `data-run` so a live chart renders below.
// Reuses the playground's engine/runtime and DOM renderers verbatim.
// ================================================================
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
self.MonacoEnvironment = { getWorker: () => new editorWorker() };

import * as monaco from 'monaco-editor';
import { setupDiceScript } from './monaco-theme.js';
import { runSnippet } from './display.js';
import {
  esc, renderError, renderRollBlock, renderStatBlock,
  renderScalingBlock, renderCumulativeBlock,
} from './render.js';

// ---- a read-only editor that sizes itself to its content ----
function makeReadOnlyEditor(host, code) {
  const ed = monaco.editor.create(host, {
    value: code,
    language: 'dicescript',
    theme: 'diceTheme',
    readOnly: true,
    domReadOnly: true,                 // the underlying textarea is read-only too
    fontSize: 13,
    lineHeight: 22,
    fontFamily: "'DM Mono', monospace",
    minimap: { enabled: false },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'none',
    scrollBeyondLastLine: false,
    contextmenu: false,
    guides: { indentation: false },
    renderWhitespace: 'none',
    padding: { top: 0, bottom: 0 },     // vertical padding comes from .code-ed
    wordWrap: 'off',
    cursorStyle: 'line-thin',
    automaticLayout: true,
    // don't steal page scroll; let long lines scroll horizontally only
    scrollbar: { vertical: 'hidden', horizontalScrollbarSize: 6, handleMouseWheel: false, alwaysConsumeMouseWheel: false },
  });
  // grow the host to the editor's content height (no internal vertical scroll)
  const fit = () => {
    const h = ed.getContentHeight();
    host.style.height = h + 'px';
    ed.layout({ width: host.clientWidth, height: h });
  };
  ed.onDidContentSizeChange(fit);
  fit();
  return ed;
}

// ---- render one snippet's display results into a container ----
function renderInto(container, src) {
  const { results, logs, error } = runSnippet(src);
  if (error) { renderError(container, error); return; }
  if (logs.length) {
    const block = document.createElement('div');
    block.className = 'result-block';
    block.innerHTML = `<div class="result-label"><span>CONSOLE</span></div>`
      + `<div class="log-block">${logs.map(l => `<div class="log-line">${esc(l)}</div>`).join('')}</div>`;
    container.appendChild(block);
  }
  results.forEach((r, i) => {
    if (r.kind === 'roll') renderRollBlock(container, r.result, r.axis, r.title || `Roll ${i + 1}`, r.poolRef);
    else if (r.kind === 'scaling') renderScalingBlock(container, r.rows, r.categories, r.title || `Scaling ${i + 1}`, { mode: r.mode });
    else if (r.kind === 'cumulative') renderCumulativeBlock(container, r.rows, r.single, r.categories, r.title || `Cumulative ${i + 1}`, { mode: r.mode });
    else renderStatBlock(container, r.s, r.title || `Distribution ${i + 1}`, { mode: r.mode });
  });
}

// ---- wire up every <pre><code> on the page ----
async function init() {
  await setupDiceScript();             // register language + theme before creating editors
  for (const pre of [...document.querySelectorAll('pre')]) {
    const codeEl = pre.querySelector('code');
    if (!codeEl) continue;
    const src = codeEl.textContent.replace(/\n$/, '');
    const isRun = pre.hasAttribute('data-run');

    const host = document.createElement('div');
    host.className = 'code-ed' + (isRun ? ' run' : '');
    const inner = document.createElement('div');   // editor mounts here; padding lives on .code-ed
    host.appendChild(inner);
    pre.replaceWith(host);
    makeReadOnlyEditor(inner, src);

    if (isRun) {
      const out = document.createElement('div');
      out.className = 'demo-out';
      host.after(out);
      try { renderInto(out, src); }
      catch (e) { renderError(out, e.message); }
    }
  }
  // re-measure once the editor font is ready so auto-heights are exact
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
