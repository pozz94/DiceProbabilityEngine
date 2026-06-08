import { EXAMPLES, toggleExampleMenu, closeExampleMenu } from './examples.js';
import { runCode } from './display.js';

// ================================================================
// Monaco editor initialisation — single entry point for the app
// ================================================================

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

// getEditorValue is the single dependency injection point so display.js
// never needs to know about window._editor directly.
function getEditorValue() {
  return window._editor ? window._editor.getValue() : '';
}

function doRun() {
  runCode(getEditorValue);
}

// Wire the global onclick handlers used in the HTML markup
window._toggleExampleMenu = () => toggleExampleMenu(getEditorValue);
window._runCode = doRun;

// Keyboard shortcut fallback for when Monaco hasn't loaded yet
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !window._editor) {
    e.preventDefault();
    doRun();
  }
});

// Monaco requires its loader to be on the page already (loaded via <script> in HTML)
window.MonacoEnvironment = {
  getWorker() {
    return {
      postMessage() {},
      addEventListener() {},
      removeEventListener() {},
      terminate() {},
    };
  }
};

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

require(['vs/editor/editor.main'], () => {
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
    value: EXAMPLES['Dice Basics']['Simple dice'],
    language: 'javascript',
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
  });

  window._editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, doRun);
});
