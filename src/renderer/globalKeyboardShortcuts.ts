/**
 * #541: a small, reusable registry for app-wide ("global") keyboard
 * shortcuts — ones that must fire regardless of which part of the workbench
 * currently has focus (editor, toolbar, preview pane, ...), unlike the
 * CodeMirror-scoped shortcuts in `editorMarkdownToolbarShortcuts.ts` /
 * `editorEmphasisShortcuts.ts` / etc., which only fire while the editor
 * content itself is focused.
 *
 * One capture-phase `window` keydown listener is attached regardless of how
 * many shortcuts are registered — callers pass an array, so adding another
 * global shortcut (there are more planned after #541's Ctrl+P) never means
 * attaching a second listener.
 *
 * Reuses the existing #480 guard functions (`isEditableTextInputTarget`,
 * `isModalOrDialogActive`) so every global shortcut is silent by default
 * while the user is typing in a text field or a modal dialog is open —
 * exactly like the existing Alt+Left / Alt+Right tab-switch shortcuts.
 */

import { useEffect, useRef } from "react";
import {
  isEditableTextInputTarget,
  isModalOrDialogActive
} from "./editorTabShortcuts";

export interface GlobalKeyboardShortcutMatch {
  /** Compared against `KeyboardEvent.key`, case-insensitively. */
  readonly key: string;
  /** Matches either Ctrl (Windows/Linux) or Cmd (macOS). */
  readonly ctrlOrCmd?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface GlobalKeyboardShortcut {
  /** Unique, stable identifier — for debugging only (not matched on). */
  readonly id: string;
  readonly match: GlobalKeyboardShortcutMatch;
  readonly handler: () => void;
  /** Default `true`: stay silent while an editable text input (other than
   *  the CodeMirror editor content itself) has focus. */
  readonly suppressInTextInputs?: boolean;
  /** Default `true`: stay silent while a modal dialog is open. */
  readonly suppressWhenModalActive?: boolean;
}

export function matchesGlobalKeyboardShortcut(
  event: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
  },
  match: GlobalKeyboardShortcutMatch
): boolean {
  const ctrlOrCmd = event.ctrlKey || event.metaKey;
  if (Boolean(match.ctrlOrCmd) !== ctrlOrCmd) {
    return false;
  }
  if (Boolean(match.shift) !== event.shiftKey) {
    return false;
  }
  if (Boolean(match.alt) !== event.altKey) {
    return false;
  }
  return event.key.toLowerCase() === match.key.toLowerCase();
}

/**
 * React hook that attaches ONE global capture-phase `window` keydown
 * listener for every shortcut in `shortcuts`. Always reads the latest
 * `shortcuts` array via a ref, so callers can pass fresh closures every
 * render without re-attaching the listener (same technique as
 * `useTabSwitchShortcuts`).
 */
export function useGlobalKeyboardShortcuts(
  shortcuts: readonly GlobalKeyboardShortcut[]
): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        if (!matchesGlobalKeyboardShortcut(event, shortcut.match)) {
          continue;
        }

        if (
          (shortcut.suppressInTextInputs ?? true) &&
          isEditableTextInputTarget(event.target)
        ) {
          return;
        }
        if (
          (shortcut.suppressWhenModalActive ?? true) &&
          isModalOrDialogActive(event.target)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
