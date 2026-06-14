// ================================================================
// Shared Monaco language + theme registration for 'dicescript'.
// Used by the playground editor (editor.js) and by the docs page's
// static colorizer (docs.js) so highlighting is identical in both.
// ================================================================
import * as monaco from 'monaco-editor';
// Static import of Monaco's own JavaScript Monarch grammar. Importing it
// directly (instead of the lazy `getLanguages().loader()`) guarantees the
// tokenizer is installed synchronously and identically for the editor and for
// the docs page's static colorizer — no dynamic-import timing differences.
import { language as jsGrammar } from 'monaco-editor/esm/vs/basic-languages/javascript/javascript.js';

let done = false;

// Register the language, its JS-based Monarch tokenizer, and the theme.
// Synchronous; returns a resolved promise so async callers (the colorizer)
// can `await setupDiceScript()` uniformly.
export function setupDiceScript() {
  if (done) return Promise.resolve(monaco);
  done = true;

  // A language with NO built-in worker/intellisense (prevents Monaco's JS
  // service from registering a completion provider that hangs on a no-op worker).
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

  // Reuse Monaco's built-in JavaScript Monarch tokenizer for highlighting.
  monaco.languages.setMonarchTokensProvider('dicescript', jsGrammar);

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
    },
  });

  return Promise.resolve(monaco);
}
