/**
 * #424 — CodeMirror wiring that opens the Pergamum active-document Find /
 * Replace panel from Ctrl+F (Mod-f, Search mode) and Ctrl+H (Mod-h, Replace
 * mode) INSTEAD of `@codemirror/search`'s native bottom search panel.
 *
 * The extension never touches React state directly — exactly like
 * `glossaryCompletionExtension.ts`, it takes a `getConfig()` accessor and,
 * when a config is present, calls its `requestOpen` callback. The owning
 * React component (EditorSurface's `MarkdownEditorSurface`) supplies the
 * config; every other MarkdownEditor instance (e.g. the Glossary description
 * field) passes none, so the shortcuts are simply inert there.
 *
 * IME safety mirrors the Ctrl+Space trigger in `glossaryCompletionExtension.ts`:
 * the handler declines (no `preventDefault`, no open) while an IME composition
 * is in progress, checked via `KeyboardEvent.isComposing`,
 * `EditorView.composing`, and a local `compositionstart`/`compositionend` flag.
 *
 * `Prec.highest` puts this keydown handler ahead of the base keymap; the base
 * setup ALSO drops `Mod-f` / `F3` / `Mod-g` from `searchKeymap` (see
 * `markdownEditorCodeMirrorSetup.ts`), so the native panel can never open from
 * the keyboard even if precedence ever changed. `Mod-h` is unbound in the
 * base keymap on Windows / Linux (the emacs-style `Ctrl-h` is `mac:` only).
 */

import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type ActiveFindPanelMode = "search" | "replace";

export interface MarkdownEditorActiveFindConfig {
  /**
   * Open (or switch) the Find panel for the active document. `mode` is
   * `"search"` for Ctrl+F, `"replace"` for Ctrl+H. `initialQuery` is the
   * editor's current single-line selection (if any) — the panel seeds its
   * search box with it.
   */
  readonly requestOpen: (
    mode: ActiveFindPanelMode,
    initialQuery: string
  ) => void;
}

/** Longest editor selection still used to seed the search box. */
const MAX_SELECTION_SEED_LENGTH = 200;

/**
 * `"search"` for Ctrl+F / Cmd+F, `"replace"` for Ctrl+H / Cmd+H, else `null`.
 * No Shift / Alt, and exactly one of Ctrl / Meta so Ctrl+Cmd+F never counts.
 */
function findTriggerMode(event: KeyboardEvent): ActiveFindPanelMode | null {
  if (
    event.altKey ||
    event.shiftKey ||
    event.ctrlKey === event.metaKey
  ) {
    return null;
  }
  if (event.code === "KeyF") {
    return "search";
  }
  if (event.code === "KeyH") {
    return "replace";
  }
  return null;
}

export function createActiveFindKeymapExtension(input: {
  readonly getConfig: () => MarkdownEditorActiveFindConfig | null;
}): Extension {
  // Belt-and-braces third IME signal — compositionstart fires before
  // view.composing flips true (see glossaryCompletionExtension.ts).
  let localComposing = false;

  return Prec.highest(
    EditorView.domEventHandlers({
      compositionstart(): boolean {
        localComposing = true;
        return false;
      },
      compositionend(): boolean {
        localComposing = false;
        return false;
      },
      keydown(event, view): boolean {
        const mode = findTriggerMode(event);
        if (mode === null) {
          return false;
        }

        const config = input.getConfig();
        if (!config) {
          return false;
        }

        if (event.isComposing || view.composing || localComposing) {
          // The IME owns the key while composing — pass it through untouched.
          return false;
        }

        const selection = view.state.selection.main;
        const selectedText = selection.empty
          ? ""
          : view.state.sliceDoc(selection.from, selection.to);
        const initialQuery =
          selectedText.length > 0 &&
          selectedText.length <= MAX_SELECTION_SEED_LENGTH &&
          !selectedText.includes("\n")
            ? selectedText
            : "";

        event.preventDefault();
        config.requestOpen(mode, initialQuery);
        return true;
      }
    })
  );
}
