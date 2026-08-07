import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Must be set before monaco is imported
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return new editorWorker();
  },
};

import * as monaco from 'monaco-editor';
import { EXAMPLES, toggleExampleMenu } from './examples.js';
import { toggleProjectsMenu } from './projects.js';
import { runCode } from './display.js';
import { registerHints } from './hints.js';
import { loadDraft, saveDraft } from './storage.js';
import { setupDiceScript } from './monaco-theme.js';

// Suppress the benign ResizeObserver loop notification
const _OriginalResizeObserver = window.ResizeObserver;
window.ResizeObserver = class ResizeObserver extends _OriginalResizeObserver {
  constructor(callback) {
    super((entries, observer) => {
      requestAnimationFrame(() => {
        try { callback(entries, observer); } catch(e) {}
      });
    });
  }
};
window.addEventListener('error', e => {
  if (e.message && e.message.includes('ResizeObserver loop')) {
    e.stopImmediatePropagation(); e.preventDefault(); return false;
  }
}, true);

function getEditorValue() {
  return window._editor ? window._editor.getValue() : '';
}

function doRun() {
  runCode(getEditorValue);
}

// Wire the top-bar buttons. They ship disabled: this module only runs once
// Monaco (~3.7 MB) is in, so enabling them here is what tells the user the app
// is ready — better than a click landing on a handler that doesn't exist yet.
for (const [id, handler] of [
  ['run-btn', doRun],
  ['examples-btn', () => toggleExampleMenu(getEditorValue)],
  ['projects-btn', () => toggleProjectsMenu(getEditorValue)],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener('click', handler);
  btn.disabled = false;
}

// Ctrl+Enter from anywhere on the page. Monaco owns the shortcut while the
// editor itself has focus (addCommand below), so skip it in that case.
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !window._editor?.hasTextFocus()) {
    e.preventDefault();
    doRun();
  }
});

// Register the 'dicescript' language + theme (shared with the docs page).
setupDiceScript();

registerHints();

window._editor = monaco.editor.create(document.getElementById('monaco-container'), {
  value: loadDraft() ?? EXAMPLES['Dice Basics']['Simple dice'],   // restore last session
  language: 'dicescript',
  theme: 'diceTheme',
  fontSize: 13,
  lineHeight: 22,
  fontFamily: "'DM Mono', monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  folding: false,
  lineNumbers: 'on',
  ariaLabel: 'DiceScript editor',
  glyphMargin: false,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 3,
  padding: { top: 12, bottom: 12 },
  tabSize: 2,
  wordWrap: 'off',
  automaticLayout: true,
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',
  suggest: { snippetsPreventQuickSuggestions: false },
});

window._editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, doRun);

// autosave the draft (debounced) so a reload restores the last edit
let _saveTimer = null;
window._editor.onDidChangeModelContent(() => {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveDraft(getEditorValue()), 400);
});

// Full-screen editor requires BOTH: the editor is focused AND the keyboard is
// open. Track each independently — editor-focused via Monaco focus/blur, and
// keyboard-open via VisualViewport (its visible height drops well below the
// layout height when the keyboard opens). Using the keyboard's actual state
// (not just focus) means closing the keyboard restores the half split even if
// the editor stays focused. --vvh holds the visible height so the full-screen
// editor sits above the keyboard with its code scrollable.
window._editor.onDidFocusEditorText(() => document.body.classList.add('editor-focused'));
window._editor.onDidBlurEditorText(() => document.body.classList.remove('editor-focused'));

const vv = window.visualViewport;
if (vv) {
  const sync = () => {
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
    document.body.classList.toggle('keyboard-open', (window.innerHeight - vv.height) > 150);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
} else {
  // no VisualViewport: approximate the keyboard with focus
  window._editor.onDidFocusEditorText(() => document.body.classList.add('keyboard-open'));
  window._editor.onDidBlurEditorText(() => document.body.classList.remove('keyboard-open'));
}

document.fonts.load('13px "DM Mono"').then(() => {
  monaco.editor.remeasureFonts();   // namespace fn, re-measures all editors
});

// run once on load so the output is populated without pressing Run
doRun();
