import type { Translate } from "../shared/i18n";
import type { EditorId } from "../shared/editorId";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";
import {
  isOpenDocumentDirty,
  resolveCloseTargetEditorId,
  type OpenDocumentsState
} from "./openDocuments";

/** Stable choice IDs for the temporary #192 dirty-close dogfood dialog. */
export const dirtyCloseChoiceIds = {
  saveAndClose: "saveAndClose",
  discardAndClose: "discardAndClose",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

export type DirtyCloseChoiceId =
  (typeof dirtyCloseChoiceIds)[keyof typeof dirtyCloseChoiceIds];

export type DirtyCloseSaveResult =
  | "saved"
  | "cancelled"
  | "rejected"
  | "failed"
  | "ignored";

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
  translate: Translate
): AppChoiceDialogOptions {
  return {
    title: translate("dialog.dirtyClose.title"),
    message: {
      kind: "plainText",
      text: translate("dialog.dirtyClose.message")
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    choices: [
      {
        id: dirtyCloseChoiceIds.saveAndClose,
        label: translate("dialog.dirtyClose.saveAndClose"),
        role: "primary"
      },
      {
        id: dirtyCloseChoiceIds.discardAndClose,
        label: translate("dialog.dirtyClose.discardAndClose"),
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: dirtyCloseChoiceIds.cancel,
        label: translate("common.cancel"),
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
 * Resolves the close target (#184: explicit `editorId`, or the active
 * editor when omitted) and, for a dirty target, awaits the dirty-close choice
 * dialog before calling `onClose`. A concurrent close request that lands
 * while a dialog is already open rejects with
 * `AppDialogError("dialogAlreadyOpen")` (#182 D-14) — absorbed here as a
 * silent no-op: no additional close, no rethrow, the existing dialog stays
 * open.
 */
export async function runEditorCloseFlow(
  editorId: EditorId | undefined,
  deps: EditorCloseFlowDeps
): Promise<void> {
  const targetId = resolveCloseTargetEditorId(deps.state, editorId);

  if (!targetId) {
    return;
  }

  if (isOpenDocumentDirty(deps.state, targetId)) {
    let result: AppChoiceDialogResult;

    try {
      result = await deps.choiceDialog(
        buildDirtyCloseChoiceDialogOptions(deps.translate)
      );
    } catch (error) {
      if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
        return;
      }

      throw error;
    }

    if (result.kind === "dismissed") {
      return;
    }

    switch (result.id) {
      case dirtyCloseChoiceIds.saveAndClose:
        if ((await deps.saveDirtyEditorBeforeClose(targetId)) !== "saved") {
          return;
        }
        break;
      case dirtyCloseChoiceIds.discardAndClose:
        break;
      case dirtyCloseChoiceIds.cancel:
        return;
      default:
        return;
    }
  }

  deps.onClose(targetId);
}
