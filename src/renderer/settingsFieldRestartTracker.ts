/**
 * #394 Step 2 follow-up: per-Settings-panel "focus -> edit(s) -> blur" restart
 * check, decoupled from React so the race it guards against can be exercised
 * directly in a unit test (no jsdom focus/blur simulation needed).
 *
 * Settings fields autosave on every keystroke, but the restart-required
 * check only ever runs once — on blur (see settingsRestartRequiredChange.ts's
 * own doc comment for why). That means this tracker's `handleBlur` has to
 * wait for the field's own in-flight save to settle before it can safely
 * diff against it. The save and the exact request it was saving MUST be
 * captured together, synchronously, before that wait: if a DIFFERENT field
 * gains focus and edits while this field's save is still in flight (e.g. the
 * user tabs from field A to field B and starts typing before A's save has
 * resolved), `handleChangeRequest` for B will have already overwritten
 * whatever "latest request" state this tracker holds. Reading it again
 * *after* awaiting A's save would silently diff A's pre-edit baseline
 * against B's value instead of A's — a mismatched pair that can both miss a
 * real restart-required change and wrongly attribute one.
 */

import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../shared/settings";
import { promptRestartIfRequired } from "./settingsRestartRequiredChange";

export interface SettingsFieldRestartTracker {
  /** A Settings field gained focus: snapshot the pre-edit baseline. */
  handleFocus(currentSettings: ApplicationSettings): void;
  /**
   * A Settings field's value changed (fires on every keystroke/toggle).
   * `saveSettings` is invoked immediately and its result promise is tracked
   * as this tracker's "current pending save" until the next call replaces
   * it or `handleBlur` consumes it.
   */
  handleChangeRequest(
    nextSettings: SaveApplicationSettingsRequest,
    saveSettings: (
      nextSettings: SaveApplicationSettingsRequest
    ) => Promise<boolean>
  ): void;
  /**
   * A Settings field lost focus: waits for ITS OWN save to settle, then (on
   * success, and only if a requiresRestart setting actually changed) offers
   * the shared restart dialog via `confirmRestart`.
   */
  handleBlur(
    confirmRestart: () => Promise<"confirm" | "cancel">,
    onRestartRequested: () => void
  ): Promise<void>;
}

export function createSettingsFieldRestartTracker(): SettingsFieldRestartTracker {
  let settingsAtFocus: ApplicationSettings | null = null;
  let pendingSave: Promise<boolean> = Promise.resolve(true);
  let pendingNextSettings: SaveApplicationSettingsRequest | null = null;

  function handleFocus(currentSettings: ApplicationSettings): void {
    if (settingsAtFocus === null) {
      settingsAtFocus = currentSettings;
    }
  }

  function handleChangeRequest(
    nextSettings: SaveApplicationSettingsRequest,
    saveSettings: (
      nextSettings: SaveApplicationSettingsRequest
    ) => Promise<boolean>
  ): void {
    pendingNextSettings = nextSettings;
    pendingSave = saveSettings(nextSettings);
  }

  async function handleBlur(
    confirmRestart: () => Promise<"confirm" | "cancel">,
    onRestartRequested: () => void
  ): Promise<void> {
    const previousSettings = settingsAtFocus;
    settingsAtFocus = null;

    if (!previousSettings) {
      return;
    }

    // Snapshot the in-flight save and the exact request it belongs to
    // TOGETHER, synchronously, before awaiting anything below — see this
    // module's doc comment for why reading them separately (with the await
    // in between) is the race to avoid.
    const save = pendingSave;
    const nextSettings = pendingNextSettings;

    if (!nextSettings) {
      return;
    }

    const succeeded = await save;

    if (!succeeded) {
      return;
    }

    await promptRestartIfRequired({
      previousSettings,
      nextSettings,
      confirmRestart,
      onRestartRequested
    });
  }

  return { handleFocus, handleChangeRequest, handleBlur };
}
