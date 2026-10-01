import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentCommand, outdentCommand } from "./indentCommands";
import {
  documentIsMarkdownFacet,
  plainTextTabCommand
} from "./plainTextIndentCommands";
import { tryNavigateTableCell } from "./markdownTableNavigation";
import type { PergamumPlatform } from "../shared/keybindings";
import { getRuntimePlatform } from "./platformModifier";
import type { EditorKeybindingHandlers } from "./keybindings/codeMirrorKeymap";
import { eventMatchesCatalogCommand } from "./keybindings/catalogKeyMatch";

/**
 * Escape tab-capture bypass state for accessibility escape hatch.
 * Module-level state: when Escape is pressed inside an editor with tab
 * capture ON, the very next Tab / Shift+Tab keypress bypasses editor
 * indentation and falls back to normal browser focus movement. (#636: Ctrl+M
 * no longer arms this one-shot bypass; it toggles the setting instead.)
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
 * #636: `editor.tabCapture.toggle`. The owner (App) publishes a callback that
 * flips the existing `editor.captureTabInEditor` application setting through
 * the normal settings-save path. Module-level slot, same shape as the other
 * editor shortcut slots (EditorState is cached across remounts).
 */
let currentTabCaptureToggle: (() => void) | null = null;

export function publishTabCaptureToggle(toggle: () => void): void {
  currentTabCaptureToggle = toggle;
}

export function unpublishTabCaptureToggle(toggle: () => void): void {
  if (currentTabCaptureToggle === toggle) {
    currentTabCaptureToggle = null;
  }
}

export const TAB_CAPTURE_TOGGLE_COMMAND_ID = "editor.tabCapture.toggle";
export const TAB_CAPTURE_BYPASS_ONCE_COMMAND_ID = "editor.tabCapture.bypassOnce";

/**
 * #641: commandId -> handler for `editor.tabCapture.toggle` (Ctrl-m, darwin
 * Shift-Alt-m; the key comes from the keybinding catalog). Runs through the
 * editor keymap dispatcher, which withholds it during IME composition. Inert
 * until the App has published its toggle callback.
 */
export function createTabCaptureToggleKeybindingHandlers(
  getToggle: () => (() => void) | null = () => currentTabCaptureToggle
): EditorKeybindingHandlers {
  return {
    [TAB_CAPTURE_TOGGLE_COMMAND_ID]: (): boolean => {
      const toggle = getToggle();
      if (toggle === null) {
        return false;
      }
      toggle();
      return true;
    }
  };
}

/**
 * Creates the CodeMirror extension for `editor.captureTabInEditor`.
 * (The `editor.tabCapture.toggle` shortcut is not here: it must work while
 * capture is off, so it lives in the always-on editor keymap.)
 * - When `false` (default): returns `[]`, so Tab / Shift+Tab are not captured
 *   at all and perform normal focus movement.
 * - When `true`: binds `Tab` -> `indentCommand`, `Shift-Tab` ->
 *   `outdentCommand`, and the catalog's `editor.tabCapture.bypassOnce` key
 *   (Escape) arms a one-shot bypass of the next Tab. This Escape handler is
 *   dedicated: it never consumes the event, and is unrelated to the Escape of
 *   dialogs / popovers / listboxes.
 */
export function createTabCaptureKeymapExtension(
  captureTabInEditor: boolean,
  platform?: PergamumPlatform
): Extension {
  if (!captureTabInEditor) {
    bypassNextTab = false;
    return [];
  }

  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view): boolean {
        // #654: during IME composition Tab / Escape belong to the IME
        // (candidate selection, cancelling the conversion): never indent, and
        // never arm the one-shot bypass from the IME's Escape. keyCode 229
        // covers engines that leave isComposing stale.
        if (event.isComposing || view.composing || event.keyCode === 229) {
          return false;
        }

        // Escape key (catalog: editor.tabCapture.bypassOnce): sets bypass
        // flag, but lets event propagate/bubble
        if (
          eventMatchesCatalogCommand(
            event,
            TAB_CAPTURE_BYPASS_ONCE_COMMAND_ID,
            platform ?? getRuntimePlatform()
          )
        ) {
          bypassNextTab = true;
          return false;
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
