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
 * desired") - this is that adjustment. Two changes from the verbatim list:
 *
 * 1. `completionKeymap` is excluded (see above) so
 *    `glossaryCompletionExtension.ts` can own Ctrl-Space exclusively.
 *
 * 2. #424: the `@codemirror/search` panel openers - `Mod-f`
 *    (`openSearchPanel`), `F3` and `Mod-g` (`findNext` / `findPrevious`,
 *    which themselves fall back to `openSearchPanel` when there is no active
 *    query) - are dropped from `searchKeymap`. Pergamum shows its OWN
 *    active-document Find panel above the editor (see
 *    `find/activeFindKeymapExtension.ts`), so the native bottom search panel
 *    must never open from the keyboard. Every unrelated `searchKeymap`
 *    binding is kept: `Mod-d` (selectNextOccurrence), `Mod-Alt-g`
 *    (gotoLine), `Mod-Shift-l` (selectSelectionMatches) and `Escape`
 *    (closeSearchPanel - inert when the panel never opens).
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

/**
 * #424: `searchKeymap` bindings that open (or fall back to opening) the
 * native `@codemirror/search` panel. Filtered out of the base keymap so
 * Pergamum's own Find panel is the only Ctrl+F surface.
 */
const NATIVE_SEARCH_PANEL_KEYS: ReadonlySet<string> = new Set([
  "Mod-f",
  "F3",
  "Mod-g"
]);

const searchKeymapWithoutPanelOpeners = searchKeymap.filter(
  (binding) => binding.key === undefined || !NATIVE_SEARCH_PANEL_KEYS.has(binding.key)
);

export interface MarkdownEditorBaseSetupOptions {
  /**
   * #394 Step 1: `editor.undoHistoryMinDepth` (Settings Catalog default /
   * `history()`'s own built-in default: 100). Applied only at `EditorState`
   * construction time (mount, or a document's first-ever build) — Step 1
   * deliberately does NOT reconfigure an existing document's already-built
   * history extension when the setting changes later in the same process
   * (no compartment wraps `history()` for that purpose). See
   * markdownEditorDocumentState.ts's own doc comment for what this means in
   * practice for a document already open when the setting changes.
   */
  readonly undoHistoryMinDepth: number;
}

export function createMarkdownEditorBaseSetup(
  options: MarkdownEditorBaseSetupOptions
): Extension[] {
  return [
    // #428: gutter display order is the left-to-right DOM order of the
    // `activeGutters` facet entries, which follows extension order here.
    // `foldGutter()` is listed BEFORE `lineNumbers()` so the marker (fold)
    // gutter renders on the far left and the line-number gutter sits to its
    // right, next to the text — the swap this issue asks for. Nothing else
    // about the two gutters changes (no width / padding / body-offset
    // tuning); `highlightActiveLineGutter()` still decorates whichever
    // gutter element is on the active line regardless of their order.
    foldGutter(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history({ minDepth: options.undoHistoryMinDepth }),
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
      ...searchKeymapWithoutPanelOpeners,
      ...historyKeymap,
      ...foldKeymap,
      ...lintKeymap
    ])
  ];
}
