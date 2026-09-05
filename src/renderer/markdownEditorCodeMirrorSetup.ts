/**
 * #390: a customized copy of `codemirror`'s own `basicSetup`, with the
 * completion keybindings excluded from the base keymap.
 *
 * `codemirror`'s `basicSetup` (see node_modules/codemirror/dist/index.js)
 * unconditionally spreads `@codemirror/autocomplete`'s `completionKeymap`
 * (which binds `Ctrl-Space` -> `startCompletion`) directly into its own
 * `keymap.of([...])` call. That binding runs at the ordinary keymap
 * precedence, independent of any `autocompletion({defaultKeymap: false})`
 * config passed elsewhere - so with `basicSetup` still in the tree, it is
 * IMPOSSIBLE to guarantee "never preventDefault while an IME composition is
 * in progress" (#390's most important requirement) for Ctrl+Space, because
 * that hard-coded binding always wins whenever our own IME-aware trigger
 * (see glossaryCompletionExtension.ts) declines to handle the key.
 *
 * `basicSetup`'s own doc comment explicitly invites exactly this kind of
 * customization ("once you decide you want to configure your editor more
 * precisely, you take this package's source ... and adjust it as
 * desired") - this is that adjustment, kept to the single line that
 * excludes `completionKeymap`. Every other binding it lists is preserved
 * verbatim; `glossaryCompletionExtension.ts`'s own keymap re-adds every
 * completion key EXCEPT Ctrl-Space (Escape / arrows / PageUp / PageDown /
 * Enter), and its trigger extension owns Ctrl-Space exclusively.
 */

import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";

export const markdownEditorBaseSetup: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...lintKeymap
  ])
];
