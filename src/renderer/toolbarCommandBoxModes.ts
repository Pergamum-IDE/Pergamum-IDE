/**
 * #542: Toolbar Command Box mode definitions.
 *
 * The Command Box is a mode selector + launcher on the toolbar.
 * It does NOT implement text input, candidate filtering, or IME handling.
 * All of those are delegated to the existing central Command Palette.
 *
 * `initialPrefix` maps directly to `initialInputValue` on `CommandPalette`.
 * File mode uses an empty string prefix, which must NOT be collapsed to `">"`.
 */

import type { QuickAccessPrefix } from "./quickAccessInputParser";

export type ToolbarCommandBoxMode =
  | "commands"
  | "projectFiles"
  | "headings"
  | "glossary"
  | "lineJump"
  | "projectSearch";

export interface ToolbarCommandBoxModeEntry {
  readonly mode: ToolbarCommandBoxMode;
  /** The QuickAccess prefix that opens the Command Palette in this mode. */
  readonly initialPrefix: QuickAccessPrefix;
  /** i18n key for the placeholder shown in the launcher body. */
  readonly placeholderKey:
    | "toolbar.commandBox.placeholder.commands"
    | "toolbar.commandBox.placeholder.projectFiles"
    | "toolbar.commandBox.placeholder.headings"
    | "toolbar.commandBox.placeholder.glossary"
    | "toolbar.commandBox.placeholder.lineJump"
    | "toolbar.commandBox.placeholder.projectSearch";
  /** i18n key for the aria-label of the launcher body. */
  readonly launcherLabelKey:
    | "toolbar.commandBox.open.commands"
    | "toolbar.commandBox.open.projectFiles"
    | "toolbar.commandBox.open.headings"
    | "toolbar.commandBox.open.glossary"
    | "toolbar.commandBox.open.lineJump"
    | "toolbar.commandBox.open.projectSearch";
}

/**
 * Ordered cycle: > → (empty) → # → @ → : → %
 * Prefix button click advances to the next entry, wrapping around.
 */
export const TOOLBAR_COMMAND_BOX_MODES: readonly ToolbarCommandBoxModeEntry[] =
  [
    {
      mode: "commands",
      initialPrefix: ">",
      placeholderKey: "toolbar.commandBox.placeholder.commands",
      launcherLabelKey: "toolbar.commandBox.open.commands"
    },
    {
      mode: "projectFiles",
      initialPrefix: "",
      placeholderKey: "toolbar.commandBox.placeholder.projectFiles",
      launcherLabelKey: "toolbar.commandBox.open.projectFiles"
    },
    {
      mode: "headings",
      initialPrefix: "#",
      placeholderKey: "toolbar.commandBox.placeholder.headings",
      launcherLabelKey: "toolbar.commandBox.open.headings"
    },
    {
      mode: "glossary",
      initialPrefix: "@",
      placeholderKey: "toolbar.commandBox.placeholder.glossary",
      launcherLabelKey: "toolbar.commandBox.open.glossary"
    },
    {
      mode: "lineJump",
      initialPrefix: ":",
      placeholderKey: "toolbar.commandBox.placeholder.lineJump",
      launcherLabelKey: "toolbar.commandBox.open.lineJump"
    },
    {
      mode: "projectSearch",
      initialPrefix: "%",
      placeholderKey: "toolbar.commandBox.placeholder.projectSearch",
      launcherLabelKey: "toolbar.commandBox.open.projectSearch"
    }
  ] as const;

/** Index of the default mode (commands / `>`) in the cycle array. */
export const TOOLBAR_COMMAND_BOX_DEFAULT_INDEX = 0;

/**
 * Advance the current mode index by one, wrapping around the end of the cycle.
 */
export function nextToolbarCommandBoxModeIndex(currentIndex: number): number {
  return (currentIndex + 1) % TOOLBAR_COMMAND_BOX_MODES.length;
}

/**
 * Resolve the mode entry at the given index.
 * Clamps to the default entry if the index is out of range.
 */
export function resolveToolbarCommandBoxModeEntry(
  index: number
): ToolbarCommandBoxModeEntry {
  return (
    TOOLBAR_COMMAND_BOX_MODES[index] ??
    TOOLBAR_COMMAND_BOX_MODES[TOOLBAR_COMMAND_BOX_DEFAULT_INDEX]
  );
}
