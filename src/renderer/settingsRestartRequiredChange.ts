/**
 * #394 Step 2: restart-required Settings change detection + the generic
 * "offer a restart" orchestration.
 *
 * Responsibility split (deliberately generic — no per-setting-key branches
 * anywhere in this module):
 *  - Settings Catalog (src/shared/settingsCatalog.ts) owns the
 *    `requiresRestart` metadata itself.
 *  - This module owns detecting whether any `requiresRestart` setting's
 *    EFFECTIVE VALUE actually changed across a save, and the small
 *    save-succeeded -> confirm -> intent state machine.
 *  - The caller (App.tsx) owns the concrete confirmation dialog (reusing the
 *    existing generic ConfirmDialog / DialogController infrastructure — no
 *    new dialog component) and whatever `onRestartRequested` eventually does
 *    (Step 3: a real, safe application-restart pipeline). This module never
 *    imports Electron or touches app lifecycle.
 *
 * Step 2 explicitly stops at "the user asked to restart": `promptRestartIfRequired`
 * only calls its `onRestartRequested` callback — it never calls
 * `app.relaunch()`/`app.quit()`/`app.exit()`, and neither does any Step 2
 * caller. Runtime state already constructed in this process (e.g. a
 * Markdown document's per-tab `EditorState` / CodeMirror `history()` extension
 * — #387/#392/#393) is deliberately left exactly as it is; only a NEW
 * `EditorState` built after this process restarts is guaranteed to reflect
 * the changed value (see markdownEditorCodeMirrorSetup.ts's own doc comment).
 */

import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../shared/settings";
import { getCatalogEntries, type SettingKey } from "../shared/settingsCatalog";
import { readSettingValue } from "./settingsValueByKey";

/**
 * Every cataloged `requiresRestart` key whose effective value differs between
 * `previous` (the settings this process is currently running with) and
 * `next` (the just-submitted save request). Value comparison is a plain
 * `!==`: every current (and realistically foreseeable) catalog entry type —
 * string / number / boolean / enum — is a scalar, so this is exactly the
 * same equality every catalog value already carries, never a
 * setting-specific comparator. Order follows `getCatalogEntries()` (catalog
 * declaration order), which is otherwise unobserved by callers here.
 */
export function changedRestartRequiredSettingKeys(
  previous: ApplicationSettings,
  next: SaveApplicationSettingsRequest
): SettingKey[] {
  return getCatalogEntries()
    .filter((entry) => entry.requiresRestart === true)
    .map((entry) => entry.key as SettingKey)
    .filter(
      (key) => readSettingValue(key, previous) !== readSettingValue(key, next)
    );
}

/**
 * Whether saving `next` (starting from `previous`) changed at least one
 * `requiresRestart` setting's effective value. Multiple such settings
 * changing at once still yields a single `true` — the caller shows exactly
 * one confirmation regardless of how many keys are affected.
 */
export function hasRestartRequiredSettingChange(
  previous: ApplicationSettings,
  next: SaveApplicationSettingsRequest
): boolean {
  return changedRestartRequiredSettingKeys(previous, next).length > 0;
}

export interface PromptRestartIfRequiredOptions {
  /** The settings this process was running with BEFORE the save. */
  readonly previousSettings: ApplicationSettings;
  /** The save request that just succeeded. */
  readonly nextSettings: SaveApplicationSettingsRequest;
  /**
   * Shows the (single, shared, non-setting-specific) restart confirmation
   * dialog and resolves with the user's choice. Only ever invoked when a
   * `requiresRestart` setting actually changed. Any rejection (e.g. a
   * concurrent dialog already open) is the caller's concern — see this
   * function's own try/catch discipline expectations in App.tsx.
   */
  readonly confirmRestart: () => Promise<"confirm" | "cancel">;
  /**
   * The generic "the user asked to restart now" intent — Step 2 stops here.
   * Called at most once, and only for `"confirm"`. Step 3 is expected to
   * wire this to a real, safe application-restart pipeline.
   */
  readonly onRestartRequested: () => void;
}

/**
 * The full save-succeeded -> (maybe) confirm -> (maybe) intent flow, decoupled
 * from any concrete dialog/UI so it can run under test with plain mocks.
 *
 * Does nothing (never calls `confirmRestart`) when no `requiresRestart`
 * setting actually changed — including when a setting was changed and then
 * reverted back to its original value before saving, since only the final
 * `nextSettings` value is ever compared against `previousSettings`.
 */
export async function promptRestartIfRequired(
  options: PromptRestartIfRequiredOptions
): Promise<void> {
  if (
    !hasRestartRequiredSettingChange(
      options.previousSettings,
      options.nextSettings
    )
  ) {
    return;
  }

  const result = await options.confirmRestart();

  if (result === "confirm") {
    options.onRestartRequested();
  }
}
