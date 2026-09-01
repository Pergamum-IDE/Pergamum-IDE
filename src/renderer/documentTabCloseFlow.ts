import type { Translate } from "../shared/i18n";
import type { EditorId } from "../shared/editorId";
import type { SaveWorkingCopyOutcome } from "../shared/lifecycle";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";
import {
  findOpenDocument,
  isOpenDocumentDirty,
  resolveCloseTargetEditorId,
  type OpenDocumentsState
} from "./openDocuments";
import { currentEditorTitle } from "./currentEditor";

/** Stable choice IDs for the temporary #192 dirty-close dogfood dialog. */
export const dirtyCloseChoiceIds = {
  saveAndClose: "saveAndClose",
  discardAndClose: "discardAndClose",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

export type DirtyCloseChoiceId =
  (typeof dirtyCloseChoiceIds)[keyof typeof dirtyCloseChoiceIds];

export type DirtyCloseSaveResult = SaveWorkingCopyOutcome;

/**
 * The #192 dirty-close dogfood dialog options: a temporary three-choice
 * application choice dialog, never `window.confirm()` or an Electron native
 * dialog. `icon.kind: "warning"` is passed as a kind, not an SVG file name —
 * `dialogIcons.ts` owns the actual icon mapping.
 *
 * `dismissOnBackdropClick: false` (#184 follow-up): this dialog asks
 * whether to discard unsaved manuscript changes, so an accidental backdrop
 * click must not dismiss it. `Escape` resolves dismissed and keeps the tab
 * open; the explicit cancel button resolves a chosen cancel ID.
 */
export function buildDirtyCloseChoiceDialogOptions(
  translate: Translate,
  targetName: string
): AppChoiceDialogOptions {
  return {
    title: translate("dialog.unsavedChanges.title"),
    message: {
      kind: "plainText",
      text: translate("dialog.unsavedChanges.prompt", { targetName })
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    choices: [
      {
        id: dirtyCloseChoiceIds.saveAndClose,
        label: translate("dialog.unsavedChanges.saveAndClose"),
        role: "primary"
      },
      {
        id: dirtyCloseChoiceIds.discardAndClose,
        label: translate("dialog.unsavedChanges.discardAndClose"),
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: dirtyCloseChoiceIds.cancel,
        label: translate("dialog.unsavedChanges.cancel"),
        role: "cancel"
      }
    ],
    primaryChoiceId: dirtyCloseChoiceIds.saveAndClose,
    cancelChoiceId: dirtyCloseChoiceIds.cancel,
    initialFocusChoiceId: dirtyCloseChoiceIds.cancel,
    clipboardText: null,
    dismissOnBackdropClick: false
  };
}

export interface EditorCloseFlowDeps {
  state: OpenDocumentsState;
  translate: Translate;
  choiceDialog: (
    options: AppChoiceDialogOptions
  ) => Promise<AppChoiceDialogResult>;
  saveDirtyEditorBeforeClose: (
    editorId: EditorId
  ) => Promise<DirtyCloseSaveResult>;
  onClose: (editorId: EditorId) => void;
}

/**
 * #354: the outcome of one close attempt, so a batch close
 * (Close Other / Left / Right Tabs) can stop the moment the user cancels.
 *   - `"closed"`     — the target was (or will be) closed.
 *   - `"cancelled"`  — a dirty confirmation was cancelled / dismissed, or its
 *                      save did not complete; nothing was closed.
 *   - `"noTarget"`   — there was no editor to close.
 */
export type EditorCloseFlowOutcome = "closed" | "cancelled" | "noTarget";

/**
 * Resolves the close target (#184: explicit `editorId`, or the active
 * editor when omitted) and, for a dirty target, awaits the dirty-close choice
 * dialog before calling `onClose`. A concurrent close request that lands
 * while a dialog is already open rejects with
 * `AppDialogError("dialogAlreadyOpen")` (#182 D-14) — absorbed here as a
 * silent no-op: no additional close, no rethrow, the existing dialog stays
 * open.
 *
 * #354: returns an {@link EditorCloseFlowOutcome}. Existing callers may
 * ignore it.
 */
export async function runEditorCloseFlow(
  editorId: EditorId | undefined,
  deps: EditorCloseFlowDeps
): Promise<EditorCloseFlowOutcome> {
  const targetId = resolveCloseTargetEditorId(deps.state, editorId);

  if (!targetId) {
    return "noTarget";
  }

  if (isOpenDocumentDirty(deps.state, targetId)) {
    const targetOpenDocument = findOpenDocument(deps.state, targetId);

    if (!targetOpenDocument) {
      return "noTarget";
    }

    let result: AppChoiceDialogResult;

    try {
      result = await deps.choiceDialog(
        buildDirtyCloseChoiceDialogOptions(
          deps.translate,
          currentEditorTitle(targetOpenDocument.editor)
        )
      );
    } catch (error) {
      if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
        return "cancelled";
      }

      throw error;
    }

    if (result.kind === "dismissed") {
      return "cancelled";
    }

    switch (result.id) {
      case dirtyCloseChoiceIds.saveAndClose:
        if ((await deps.saveDirtyEditorBeforeClose(targetId)) !== "saved") {
          return "cancelled";
        }
        break;
      case dirtyCloseChoiceIds.discardAndClose:
        break;
      case dirtyCloseChoiceIds.cancel:
        return "cancelled";
      default:
        return "cancelled";
    }
  }

  deps.onClose(targetId);
  return "closed";
}
