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

window._toggleExampleMenu = () => toggleExampleMenu(getEditorValue);
window._toggleProjects = () => toggleProjectsMenu(getEditorValue);
window._runCode = doRun;

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !window._editor) {
    e.preventDefault();
    doRun();
  }
});

// Register 'dicescript' as a language that uses JavaScript tokenization
// but has NO built-in worker or intellisense. This prevents Monaco's JS
// language service from registering its own completion provider (which hangs
// with a no-op worker and shows "Loading..." forever).
monaco.languages.register({ id: 'dicescript' });
monaco.languages.setLanguageConfiguration('dicescript', {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['(', ')'], ['[', ']'], ['{', '}']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
  indentationRules: {
    increaseIndentPattern: /^.*\{[^}"'`]*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
});

// Reuse Monaco's built-in JavaScript monarch tokenizer for syntax highlighting.
const jsLang = monaco.languages.getLanguages().find(l => l.id === 'javascript');
if (jsLang && jsLang.loader) {
  jsLang.loader().then(({ language }) => {
    monaco.languages.setMonarchTokensProvider('dicescript', language);
  });
}

registerHints();

monaco.editor.defineTheme('diceTheme', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment',    foreground: '4a4a5a', fontStyle: 'italic' },
    { token: 'keyword',    foreground: '60c8f0' },
    { token: 'number',     foreground: 'f060a8' },
    { token: 'string',     foreground: 'c8f060' },
    { token: 'identifier', foreground: 'e8e8f0' },
  ],
  colors: {
    'editor.background':                  '#0e0e10',
    'editor.foreground':                  '#e8e8f0',
    'editorLineNumber.foreground':        '#2a2a35',
    'editorLineNumber.activeForeground':  '#6a6a80',
    'editor.lineHighlightBackground':     '#16161a',
    'editorCursor.foreground':            '#c8f060',
    'editor.selectionBackground':         '#2a2a35',
    'editorWidget.background':            '#1e1e24',
    'editorSuggestWidget.background':     '#1e1e24',
    'editorSuggestWidget.border':         '#2a2a35',
    'scrollbarSlider.background':         '#2a2a3580',
    'scrollbarSlider.hoverBackground':    '#2a2a35cc',
  }
});

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

// editor focused ≈ on-screen keyboard up → let CSS give it the full screen
// (portrait touch only; the class is inert elsewhere)
window._editor.onDidFocusEditorText(() => document.body.classList.add('keyboard-open'));
window._editor.onDidBlurEditorText(() => document.body.classList.remove('keyboard-open'));

document.fonts.load('13px "DM Mono"').then(() => {
  monaco.editor.remeasureFonts();   // namespace fn, re-measures all editors
});

// run once on load so the output is populated without pressing Run
doRun();
