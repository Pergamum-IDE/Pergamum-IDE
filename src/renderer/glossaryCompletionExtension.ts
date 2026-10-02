/**
 * #390 PoC: CodeMirror wiring for Ctrl+Space Glossary Completion.
 *
 * All popup rendering, caret tracking, arrow/Enter/Esc handling, and
 * completion filtering-after-open are delegated to
 * `@codemirror/autocomplete` - this module only supplies the candidate
 * source and a composition-safe Ctrl+Space trigger. See glossaryCompletion.ts
 * for the pure candidate/prefix logic this wires up.
 *
 * IME safety (most important requirement - #390): the trigger MUST NOT open
 * (or preventDefault / stopPropagation) while an IME composition is in
 * progress, so ATOK / MS-IME / Google日本語入力 keep full control of
 * Ctrl+Space. Three signals are checked, matching the Issue exactly:
 * `KeyboardEvent.isComposing`, `EditorView.composing`, and a local
 * `compositionstart`/`compositionend`-tracked flag (belt-and-braces: some
 * platforms leave `isComposing` briefly stale, and `view.composing` only
 * flips true after the composition has produced at least one change).
 */

import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
  type CompletionResult,
  type CompletionSource
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";
import type { GlossaryEntry } from "../shared/glossary";
import {
  GLOSSARY_COMPLETION_SUFFIX_LOOKBACK,
  collectGlossaryCompletionAtoms,
  extractGlossaryCompletionPrefix,
  filterGlossaryCompletionCandidates,
  GLOSSARY_COMPLETION_COMMAND_ID,
  toGlossaryCompletionDisplayItem
} from "./glossaryCompletion";

export interface MarkdownEditorGlossaryCompletionConfig {
  readonly entries: readonly GlossaryEntry[];
  readonly normalizeUnicodeToNfc?: boolean;
}

let currentGlossaryCompletionConfig: MarkdownEditorGlossaryCompletionConfig | null =
  null;

/** Make `config` THE current glossary completion target. */
export function publishCurrentGlossaryCompletionConfig(
  config: MarkdownEditorGlossaryCompletionConfig
): void {
  currentGlossaryCompletionConfig = config;
}

/** Clear the current target, but only if it is still `config` — so a later
 *  mount's publish is never wiped by an earlier mount's (async) teardown. */
export function unpublishCurrentGlossaryCompletionConfig(
  config: MarkdownEditorGlossaryCompletionConfig
): void {
  if (currentGlossaryCompletionConfig === config) {
    currentGlossaryCompletionConfig = null;
  }
}

/** The current glossary completion config, or `null` when no editor has published one. */
export function getCurrentGlossaryCompletionConfig(): MarkdownEditorGlossaryCompletionConfig | null {
  return currentGlossaryCompletionConfig;
}

// Generous relative to GLOSSARY_COMPLETION_SUFFIX_LOOKBACK: the delimiter
// fallback (extractDelimitedGlossaryCompletionPrefix) may need to scan
// further back than the suffix strategy's own window, but a single Markdown
// line is never realistically longer than this.
const GLOSSARY_COMPLETION_MAX_TEXT_LOOKBACK = Math.max(
  GLOSSARY_COMPLETION_SUFFIX_LOOKBACK,
  500
);


function glossaryCompletionSource(
  getConfig: () => MarkdownEditorGlossaryCompletionConfig | null
): CompletionSource {
  return (context): CompletionResult | null => {
    const config = getConfig();

    if (!config) {
      return null;
    }

    const atoms = collectGlossaryCompletionAtoms(config.entries);
    const lookbackFrom = Math.max(
      0,
      context.pos - GLOSSARY_COMPLETION_MAX_TEXT_LOOKBACK
    );
    const textBeforeCaret = context.state.sliceDoc(lookbackFrom, context.pos);
    const prefix = extractGlossaryCompletionPrefix(
      textBeforeCaret,
      atoms.map((atom) => atom.value),
      { normalizeUnicodeToNfc: config.normalizeUnicodeToNfc }
    );
    const candidates = filterGlossaryCompletionCandidates({
      atoms,
      prefix,
      normalizeUnicodeToNfc: config.normalizeUnicodeToNfc
    });

    if (candidates.length === 0) {
      return null;
    }

    return {
      from: context.pos - prefix.length,
      // Built from the SHARED GlossaryCompletionDisplayItem model so the
      // CodeMirror tooltip and the Find/Replace panel popup stay identical:
      // `value` is the label, `detail` ("→ 代表語", only for a non-
      // representative form) is the muted suffix, `insertText` is the RAW
      // atom value (never normalized to the representative form).
      options: candidates.map(toGlossaryCompletionDisplayItem).map((item) => ({
        label: item.value,
        detail: item.detail ?? undefined,
        apply: item.insertText
      })),
      // Candidate order/membership is entirely our own (Glossary sortOrder,
      // startsWith-only) - CodeMirror's built-in fuzzy filter/sort must not
      // second-guess it. The source above is re-invoked on every further
      // keystroke (no `validFor`), so narrowing as the user keeps typing
      // still happens - just recomputed here, not client-side by CM.
      filter: false
    };
  };
}

// Re-binds CodeMirror's own exported completion commands - selection,
// accept, and cancel are NOT reimplemented, only Ctrl+Space is replaced
// (with `defaultKeymap: false` below) so the IME guard can own it exclusively.
const glossaryCompletionKeymapWithoutCtrlSpace: readonly KeyBinding[] = [
  { key: "Escape", run: closeCompletion },
  { key: "ArrowDown", run: moveCompletionSelection(true) },
  { key: "ArrowUp", run: moveCompletionSelection(false) },
  { key: "PageDown", run: moveCompletionSelection(true, "page") },
  { key: "PageUp", run: moveCompletionSelection(false, "page") },
  { key: "Enter", run: acceptCompletion }
];

/**
 * #641: commandId -> handler that opens glossary completion. The key comes
 * from the keybinding catalog. Inert (returns `false`) when the editor has no
 * glossary config or is read-only; the editor keymap dispatcher already
 * withholds every shortcut during IME composition, so the IME keeps Ctrl+Space
 * while composing.
 */
export function createGlossaryCompletionKeybindingHandlers(input: {
  readonly getConfig: () => MarkdownEditorGlossaryCompletionConfig | null;
  readonly isReadOnly: () => boolean;
}): EditorKeybindingHandlers {
  return {
    [GLOSSARY_COMPLETION_COMMAND_ID]: (view: EditorView): boolean => {
      if (!input.getConfig() || input.isReadOnly()) {
        return false;
      }
      startCompletion(view);
      return true;
    }
  };
}

/**
 * Builds the full glossary-completion extension set for one MarkdownEditor
 * EditorView. Safe to install unconditionally on every instance: whenever
 * `getConfig()` returns `null` (an auxiliary MarkdownEditor instance that
 * never supplies a config), the source yields no candidates and the trigger always
 * declines, so Ctrl+Space is inert there - exactly as it already is with no
 * glossary integration wired at all.
 */
export function createGlossaryCompletionExtension(input: {
  readonly getConfig: () => MarkdownEditorGlossaryCompletionConfig | null;
  readonly isReadOnly: () => boolean;
}): Extension {
  return [
    autocompletion({
      activateOnTyping: false,
      override: [glossaryCompletionSource(input.getConfig)],
      // The Issue requires a composition-safe Ctrl+Space guard that plain
      // completion commands can't express - the default keymap's own
      // Ctrl+Space binding is replaced by createGlossaryCompletionTrigger
      // below; every other default binding (Escape/arrows/Enter) is
      // preserved verbatim via glossaryCompletionKeymapWithoutCtrlSpace.
      defaultKeymap: false,
      icons: false
    }),
    Prec.highest(keymap.of(glossaryCompletionKeymapWithoutCtrlSpace))
  ];
}
