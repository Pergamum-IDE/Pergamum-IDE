import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentCommand, outdentCommand } from "./indentCommands";
import {
  documentIsMarkdownFacet,
  plainTextTabCommand
} from "./plainTextIndentCommands";
import { tryNavigateTableCell } from "./markdownTableNavigation";

/**
 * Escape / Ctrl+M tab-capture bypass state for accessibility escape hatch.
 * Module-level state: when Escape or Ctrl+M is pressed inside an editor with
 * tab capture ON, the very next Tab / Shift+Tab keypress bypasses editor
 * indentation and falls back to normal browser focus movement.
 */
let bypassNextTab = false;

export function resetTabCaptureBypass(): void {
  bypassNextTab = false;
}

export function isTabCaptureBypassActive(): boolean {
  return bypassNextTab;
}

export function triggerTabCaptureBypass(): void {
  bypassNextTab = true;
}

/**
 * Creates the CodeMirror keymap extension for `editor.captureTabInEditor`.
 * - When `false` (default): returns an empty extension `[]`, so Tab / Shift+Tab
 *   are not captured at all and perform normal focus movement.
 * - When `true`: binds `Tab` -> `indentCommand`, `Shift-Tab` -> `outdentCommand`,
 *   and provides Escape -> Tab / Ctrl+M focus escape hatches.
 */
export function createTabCaptureKeymapExtension(
  captureTabInEditor: boolean
): Extension {
  if (!captureTabInEditor) {
    bypassNextTab = false;
    return [];
  }

  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view): boolean {
        // Escape key: sets bypass flag, but lets event propagate/bubble
        if (event.key === "Escape") {
          bypassNextTab = true;
          return false;
        }

        // Ctrl+M / Cmd+M key: sets bypass flag and consumes event
        if (
          event.code === "KeyM" &&
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey
        ) {
          bypassNextTab = true;
          event.preventDefault();
          return true;
        }

        // Tab / Shift+Tab handling
        if (event.key === "Tab") {
          if (bypassNextTab) {
            bypassNextTab = false;
            return false; // Bypass capture -> allow browser focus movement
          }
          const direction = event.shiftKey ? "previous" : "next";
          if (tryNavigateTableCell(view, direction)) {
            return true;
          }
          if (event.shiftKey) {
            return outdentCommand(view);
          }
          // #546 follow-up: Tab (not Shift+Tab, not Mod+]/Mod+[, not the
          // toolbar) is text-entry-like for a plain text document — see
          // plainTextIndentCommands.ts's plainTextTabCommand doc comment.
          // Markdown documents keep the unchanged, always-line-based
          // indentCommand.
          return view.state.facet(documentIsMarkdownFacet)
            ? indentCommand(view)
            : plainTextTabCommand(view);
        }

        return false;
      }
    })
  );
}
