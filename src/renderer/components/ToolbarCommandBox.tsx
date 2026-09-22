/**
 * #542: Toolbar Command Box POC component.
 *
 * The Command Box is a mode selector + launcher, NOT a real input field.
 * - Prefix button: cycles the mode. Does NOT open the Command Palette.
 * - Launcher body: opens the existing central Command Palette in the current
 *   mode by calling `onOpenCommandPalette` with the mode's `initialPrefix`.
 *
 * Text input, candidate filtering, IME handling, Enter/Esc navigation, and
 * candidate display are all delegated to the existing Command Palette.
 */

import { useState, type FC } from "react";
import type { Translate } from "../../shared/i18n";
import {
  TOOLBAR_COMMAND_BOX_DEFAULT_INDEX,
  nextToolbarCommandBoxModeIndex,
  resolveToolbarCommandBoxModeEntry
} from "../toolbarCommandBoxModes";
import type { QuickAccessPrefix } from "../quickAccessInputParser";

export interface ToolbarCommandBoxProps {
  /**
   * Called when the user clicks the launcher body (or activates it with
   * Enter/Space). The `initialPrefix` corresponds to the current mode's
   * QuickAccess prefix (e.g. `">"` for command mode, `""` for file mode).
   *
   * IMPORTANT: file mode uses `""` (empty string). The caller must NOT
   * collapse this to `">"`. Use `initialPrefix ?? ">"`, not `initialPrefix || ">"`.
   */
  onOpenCommandPalette: (initialPrefix: QuickAccessPrefix) => void;
  translate: Translate;
}

/**
 * Toolbar Command Box POC.
 *
 * Internal state: `modeIndex` — which entry in `TOOLBAR_COMMAND_BOX_MODES`
 * is currently selected. This state is local to the Command Box and does NOT
 * affect the global Command Palette or Ctrl+Shift+P behavior.
 */
export const ToolbarCommandBox: FC<ToolbarCommandBoxProps> = ({
  onOpenCommandPalette,
  translate
}) => {
  const [modeIndex, setModeIndex] = useState(TOOLBAR_COMMAND_BOX_DEFAULT_INDEX);

  const modeEntry = resolveToolbarCommandBoxModeEntry(modeIndex);

  function handlePrefixClick(): void {
    setModeIndex((current) => nextToolbarCommandBoxModeIndex(current));
  }

  function handleBodyClick(): void {
    onOpenCommandPalette(modeEntry.initialPrefix);
  }

  const prefixLabel =
    modeEntry.initialPrefix !== "" ? modeEntry.initialPrefix : "…";
  const isEmpty = modeEntry.initialPrefix === "";
  const prefixButtonLabel = `${translate(
    "toolbar.commandBox.cycleMode"
  )} (${translate(modeEntry.placeholderKey)})`;

  return (
    <div className="toolbarCommandBoxGroup">
      <div className="toolbarCommandBox" data-testid="toolbarCommandBox">
        {/* Prefix / mode cycle button */}
        <button
          type="button"
          className="toolbarCommandBoxPrefix"
          onClick={handlePrefixClick}
          aria-label={prefixButtonLabel}
          title={prefixButtonLabel}
          data-testid="toolbarCommandBoxPrefix"
          data-mode={modeEntry.mode}
        >
          <span
            className={isEmpty ? "toolbarCommandBoxPrefixEmpty" : undefined}
            aria-hidden="true"
          >
            {prefixLabel}
          </span>
        </button>

        {/* Launcher body — looks like an input, behaves as a button */}
        <button
          type="button"
          className="toolbarCommandBoxBody"
          onClick={handleBodyClick}
          aria-label={translate(modeEntry.launcherLabelKey)}
          title={translate(modeEntry.launcherLabelKey)}
          data-testid="toolbarCommandBoxBody"
          data-mode={modeEntry.mode}
        >
          <span className="toolbarCommandBoxBodyPlaceholder">
            {translate(modeEntry.placeholderKey)}
          </span>
        </button>
      </div>
    </div>
  );
};
