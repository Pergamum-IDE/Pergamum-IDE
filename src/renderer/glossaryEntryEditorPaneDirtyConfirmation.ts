import type { Translate } from "../shared/i18n";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";

/**
 * #436 Slice 11.
 *
 * The Glossary Entry Editor Pane's own dirty-confirm — deliberately SEPARATE
 * from the existing Markdown/`DirtyWorkingCopy` lifecycle machinery in
 * `dirtyWorkingCopyResolution.ts` / `projectSwitchConfirmation.ts`. Those are
 * `OpenDocumentsState`/`EditorId`-scoped and the pane's draft was never an
 * open editor (Slice 8/9 kept it pane-local state on purpose), so bolting
 * onto that system would mean teaching it about a working-copy kind it can
 * never actually observe. This module is intentionally the same shape
 * (`AppChoiceDialogOptions` builder + a `confirm*` resolver taking the same
 * `translate`/`choiceDialog` deps) so it reads as a sibling, not a fork.
 *
 * Every call site (pane close, entry switch/create start, project close,
 * project switch, app quit/restart) goes through
 * `confirmGlossaryEntryEditorPaneDiscardOrSave` with deps built from the
 * live session's imperative handle (`GlossaryEntryEditorSessionHandle`) —
 * see `App.tsx`'s `confirmGlossaryEntryEditorPaneDirtyIfNeeded`.
 */
export const glossaryEntryEditorPaneDirtyChoiceIds = {
  save: "save",
  discard: "discard",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

export type GlossaryEntryEditorPaneDirtyChoiceId =
  (typeof glossaryEntryEditorPaneDirtyChoiceIds)[keyof typeof glossaryEntryEditorPaneDirtyChoiceIds];

export function buildGlossaryEntryEditorPaneDirtyChoiceDialogOptions(
  translate: Translate
): AppChoiceDialogOptions {
  return {
    title: translate("glossaryEntryEditorPane.dirty.title"),
    message: {
      kind: "plainText",
      text: translate("glossaryEntryEditorPane.dirty.message")
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    choices: [
      {
        id: glossaryEntryEditorPaneDirtyChoiceIds.save,
        label: translate("glossaryEntryEditorPane.dirty.saveAndContinue"),
        role: "primary"
      },
      {
        id: glossaryEntryEditorPaneDirtyChoiceIds.discard,
        label: translate("glossaryEntryEditorPane.dirty.discardAndContinue"),
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: glossaryEntryEditorPaneDirtyChoiceIds.cancel,
        label: translate("glossaryEntryEditorPane.dirty.cancel"),
        role: "cancel"
      }
    ],
    primaryChoiceId: glossaryEntryEditorPaneDirtyChoiceIds.save,
    cancelChoiceId: glossaryEntryEditorPaneDirtyChoiceIds.cancel,
    initialFocusChoiceId: glossaryEntryEditorPaneDirtyChoiceIds.cancel,
    clipboardText: null,
    dismissOnBackdropClick: false
  };
}

export interface GlossaryEntryEditorPaneDirtyConfirmationDeps {
  /** `false` (or no pane open at all) short-circuits — no dialog is shown. */
  readonly isDirty: () => boolean;
  /**
   * Resolves `true` on success (including "nothing to save"), `false` on any
   * failure (invalid draft, read-only, IPC rejection) — mirrors
   * `GlossaryEntryEditorSessionHandle.save()` exactly, since this is always
   * called with that method.
   */
  readonly save: () => Promise<boolean>;
  readonly translate: Translate;
  readonly choiceDialog: (
    options: AppChoiceDialogOptions
  ) => Promise<AppChoiceDialogResult>;
}

/**
 * `"proceed"`: no dirty draft, the user chose to discard it, or the user
 * chose to save it and the save succeeded — the caller's original operation
 * (close the pane, switch entries, close/switch the project, quit/restart)
 * may continue. `"cancel"`: the user cancelled, dismissed the dialog, or
 * chose to save and the save FAILED — the caller must abort its operation
 * and leave everything exactly as it was (the pane stays open; a failed
 * save's own error state is already visible in the pane).
 */
export async function confirmGlossaryEntryEditorPaneDiscardOrSave(
  deps: GlossaryEntryEditorPaneDirtyConfirmationDeps
): Promise<"proceed" | "cancel"> {
  if (!deps.isDirty()) {
    return "proceed";
  }

  let result: AppChoiceDialogResult;

  try {
    result = await deps.choiceDialog(
      buildGlossaryEntryEditorPaneDirtyChoiceDialogOptions(deps.translate)
    );
  } catch (error) {
    if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
      return "cancel";
    }

    throw error;
  }

  if (
    result.kind === "dismissed" ||
    result.id === glossaryEntryEditorPaneDirtyChoiceIds.cancel
  ) {
    return "cancel";
  }

  if (result.id === glossaryEntryEditorPaneDirtyChoiceIds.discard) {
    return "proceed";
  }

  if (result.id !== glossaryEntryEditorPaneDirtyChoiceIds.save) {
    return "cancel";
  }

  return (await deps.save()) ? "proceed" : "cancel";
}
