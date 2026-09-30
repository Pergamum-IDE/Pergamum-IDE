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

/**
 * Ctrl+M on win32/linux, Shift+Option+M on darwin (Cmd+M minimizes the
 * window there). `code` is used because Option+M composes a character.
 */
export function isTabCaptureToggleShortcut(
  event: {
    readonly code: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
  },
  platform: PergamumPlatform = getRuntimePlatform()
): boolean {
  if (event.code !== "KeyM") {
    return false;
  }
  return platform === "darwin"
    ? event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey
    : event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
}

function createTabCaptureToggleHandler(
  getPlatform: () => PergamumPlatform
): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event): boolean {
        if (event.isComposing || !isTabCaptureToggleShortcut(event, getPlatform())) {
          return false;
        }
        const toggle = currentTabCaptureToggle;
        if (toggle === null) {
          return false;
        }
        event.preventDefault();
        toggle();
        return true;
      }
    })
  );
}

/**
 * Creates the CodeMirror keymap extension for `editor.captureTabInEditor`.
 * - Always: the `editor.tabCapture.toggle` shortcut (#636), so capture can be
 *   turned on from the keyboard while it is off.
 * - When `false` (default): Tab / Shift+Tab are not captured at all and
 *   perform normal focus movement.
 * - When `true`: also binds `Tab` -> `indentCommand`, `Shift-Tab` ->
 *   `outdentCommand`, and provides the Escape -> one-shot Tab bypass.
 */
export function createTabCaptureKeymapExtension(
  captureTabInEditor: boolean,
  platform?: PergamumPlatform
): Extension {
  const getPlatform = (): PergamumPlatform => platform ?? getRuntimePlatform();
  const toggleHandler = createTabCaptureToggleHandler(getPlatform);

  if (!captureTabInEditor) {
    bypassNextTab = false;
    return toggleHandler;
  }

  const tabHandler = Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view): boolean {
        // Escape key: sets bypass flag, but lets event propagate/bubble
        if (event.key === "Escape") {
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

  return [toggleHandler, tabHandler];
}
