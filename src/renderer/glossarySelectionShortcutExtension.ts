/**
 * #436 Slice 12 — CodeMirror wiring that fires Ctrl+G ("Mod-g") from the
 * active Markdown editor, handing its current (primary) selection's RAW text
 * up to the host. What that text MEANS (empty → default representative,
 * exact Atom match → edit, else → create) is resolved entirely outside this
 * file, in `glossarySelectionResolution.ts` — this extension only extracts
 * the selection and routes the keystroke.
 *
 * Mirrors `find/activeFindKeymapExtension.ts` (Ctrl+F/Ctrl+H) almost
 * exactly, including WHY it must be a module-level "current config" slot and
 * not a mount-local ref/closure: a document's `EditorState` (and the keymap
 * baked into it) is cached in an App-owned Map that outlives a
 * MarkdownEditor/EditorSurface mount, so a closure captured at state-creation
 * time can go stale across a remount. See that file's doc comment for the
 * full story — identical reasoning applies here. At most ONE
 * `MarkdownEditor` publishes into this slot (EditorSurface's document
 * editor); any other `MarkdownEditor` instance never receives this prop,
 * so Ctrl+G stays inert there — matching the Slice 12 spec's "Preview / settings / glossary pane
 * 等が active → 原則として何もしない".
 *
 * Remediation note (post-Slice-12 review): publishing being instance-scoped
 * is NOT enough on its own -- this keymap extension itself must also only be
 * ATTACHED to the one editor instance that owns the shortcut.
 * `markdownEditorDocumentState.ts` only adds this extension when
 * `glossarySelectionShortcutEnabled` is true for that build, so an auxiliary
 * editor (the Glossary description field) never gets this keydown handler in
 * its own `EditorState` at all -- it cannot read and act on some OTHER
 * editor's currently-published config, because it has no handler to do so.
 *
 * Confirmed free of conflicts: `markdownEditorCodeMirrorSetup.ts` already
 * strips `Mod-g` out of `@codemirror/search`'s `searchKeymap` (that binding
 * is `findNext`/`findPrevious`, unrelated to this); this app's `gotoLine` is
 * bound to `Mod-Alt-g`, not plain `Mod-g`; and no Electron menu accelerator
 * uses "+G". `Prec.highest` still guarantees priority regardless.
 */

import type { EditorView } from "@codemirror/view";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";

export interface MarkdownEditorGlossarySelectionShortcutConfig {
  /** The active Markdown editor's current PRIMARY selection, verbatim
   *  (`""` when the selection is empty) — never normalized here. */
  readonly requestOpen: (selectedText: string) => void;
}

let currentGlossarySelectionShortcutConfig: MarkdownEditorGlossarySelectionShortcutConfig | null =
  null;

/** Make `config` THE current Ctrl+G target. */
export function publishCurrentGlossarySelectionShortcutConfig(
  config: MarkdownEditorGlossarySelectionShortcutConfig
): void {
  currentGlossarySelectionShortcutConfig = config;
}

/** Clear the current target, but only if it is still `config` — so a later
 *  mount's publish is never wiped by an earlier mount's (async) teardown. */
export function unpublishCurrentGlossarySelectionShortcutConfig(
  config: MarkdownEditorGlossarySelectionShortcutConfig
): void {
  if (currentGlossarySelectionShortcutConfig === config) {
    currentGlossarySelectionShortcutConfig = null;
  }
}

/** The current Ctrl+G config, or `null` when no editor has published one. */
export function getCurrentGlossarySelectionShortcutConfig(): MarkdownEditorGlossarySelectionShortcutConfig | null {
  return currentGlossarySelectionShortcutConfig;
}

/** The catalog command `Mod-g` belongs to. */
export const GLOSSARY_SELECTION_COMMAND_ID = "glossary.entry.openFromSelection";

/**
 * #641: commandId -> existing `requestOpen` callback. The key comes from the
 * keybinding catalog. No published config -> the key falls through; an empty
 * selection passes an empty string (no normalization here).
 */
export function createGlossarySelectionKeybindingHandlers(
  getConfig: () => MarkdownEditorGlossarySelectionShortcutConfig | null = getCurrentGlossarySelectionShortcutConfig
): EditorKeybindingHandlers {
  return {
    [GLOSSARY_SELECTION_COMMAND_ID]: (view: EditorView): boolean => {
      const config = getConfig();
      if (!config) {
        return false;
      }
      const selection = view.state.selection.main;
      const selectedText = selection.empty
        ? ""
        : view.state.sliceDoc(selection.from, selection.to);
      config.requestOpen(selectedText);
      return true;
    }
  };
}
