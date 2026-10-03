import { USAGE_TOUR_TARGETS } from "./usageTourTypes";

/**
 * Whether the Editor and Preview surfaces the tour describes (steps 7 and 14)
 * are really on screen: both target elements exist AND are laid out (a hidden
 * special-tab host or a collapsed Preview has no usable size).
 *
 * Used both to decide whether the current screen can host the tour as it is
 * (manual start) and to know — after a built-in Markdown Cheat Sheet has been
 * opened for the tour — that its Editor / Preview have mounted.
 */
export function isUsageTourSurfaceUsable(root: ParentNode = document): boolean {
  return [USAGE_TOUR_TARGETS.editorSurface, USAGE_TOUR_TARGETS.previewSurface].every(
    (targetId) => {
      const element = root.querySelector(
        `[data-usage-tour-target="${targetId}"]`
      );

      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();

      return rect.width > 0 && rect.height > 0;
    }
  );
}

export type UsageTourAutoStartDecision =
  /** Not decidable yet (settings / cold-start restore still in flight, or already decided). */
  | "wait"
  /** Do not show the tour (persistently disabled). */
  | "skip"
  /** A project was restored: tour on the restored screen. */
  | "openTour"
  /** Nothing restored to point at: show the Markdown Cheat Sheet, then the tour. */
  | "openCheatSheetThenTour";

/**
 * The automatic start decision (#714 semantics + the Cheat Sheet). The
 * "restored project" question is only answered after the cold-start restore
 * (and launch routing) has settled, never from a transient `project === null`.
 */
export function decideUsageTourAutoStart(input: {
  readonly settingsLoading: boolean;
  readonly settingsFailed: boolean;
  readonly alreadyDecided: boolean;
  readonly coldStartSettled: boolean;
  readonly launchRoutingSettled: boolean;
  readonly autoShowDisabled: boolean;
  readonly hasProject: boolean;
}): UsageTourAutoStartDecision {
  if (
    input.settingsLoading ||
    input.settingsFailed ||
    input.alreadyDecided ||
    !input.coldStartSettled ||
    !input.launchRoutingSettled
  ) {
    return "wait";
  }

  if (input.autoShowDisabled) {
    return "skip";
  }

  return input.hasProject ? "openTour" : "openCheatSheetThenTour";
}

/**
 * Manual replay: keep the user's current screen when it already shows a
 * usable Editor and Preview; otherwise prepare the Cheat Sheet first.
 */
export function decideUsageTourManualStart(
  surfaceUsable: boolean
): "openTour" | "openCheatSheetThenTour" {
  return surfaceUsable ? "openTour" : "openCheatSheetThenTour";
}
