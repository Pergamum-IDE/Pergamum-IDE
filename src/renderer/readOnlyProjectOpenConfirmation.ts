import {
  isPendingReadOnlyProjectOpen,
  type PendingReadOnlyProjectOpen,
  type PergamumProject,
  type ProjectOpenFinalizationResult
} from "../shared/api";
import type { Translate } from "../shared/i18n";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";

export const readOnlyProjectOpenChoiceIds = {
  open: "open",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

type ReadOnlyProjectOpenChoiceIds = typeof readOnlyProjectOpenChoiceIds;

export type ReadOnlyProjectOpenChoiceId =
  ReadOnlyProjectOpenChoiceIds[keyof ReadOnlyProjectOpenChoiceIds];

function readOnlyProjectOpenMessage(
  translate: Translate,
  pending?: PendingReadOnlyProjectOpen
): string {
  if (pending?.readOnlyReason === "lockSetupFailed") {
    return translate("dialog.readOnlyProjectOpen.lockSetupFailedMessage");
  }

  if (pending?.lockOwner) {
    return translate("dialog.readOnlyProjectOpen.messageWithOwner", {
      hostname: pending.lockOwner.hostname,
      openedAt: pending.lockOwner.openedAt
    });
  }

  return translate("dialog.readOnlyProjectOpen.message");
}

export function buildReadOnlyProjectOpenChoiceDialogOptions(
  translate: Translate,
  pending?: PendingReadOnlyProjectOpen
): AppChoiceDialogOptions {
  return {
    title: translate("dialog.readOnlyProjectOpen.title"),
    message: {
      kind: "plainText",
      text: readOnlyProjectOpenMessage(translate, pending)
    },
    icon: {
      kind: "info",
      tooltip: translate("dialog.icon.info")
    },
    choices: [
      {
        id: readOnlyProjectOpenChoiceIds.open,
        label: translate("dialog.readOnlyProjectOpen.openReadOnly"),
        role: "primary"
      },
      {
        id: readOnlyProjectOpenChoiceIds.cancel,
        label: translate("common.cancel"),
        role: "cancel"
      }
    ],
    primaryChoiceId: readOnlyProjectOpenChoiceIds.open,
    cancelChoiceId: readOnlyProjectOpenChoiceIds.cancel,
    initialFocusChoiceId: readOnlyProjectOpenChoiceIds.cancel,
    clipboardText: null,
    dismissOnBackdropClick: false
  };
}

export interface ReadOnlyProjectOpenConfirmationDeps {
  result: ProjectOpenFinalizationResult;
  translate: Translate;
  choiceDialog: (
    options: AppChoiceDialogOptions
  ) => Promise<AppChoiceDialogResult>;
  confirmReadOnlyProjectOpen: (
    token: string
  ) => Promise<PergamumProject | null>;
  cancelReadOnlyProjectOpen: (token: string) => Promise<void>;
}

export async function confirmReadOnlyProjectOpenIfNeeded(
  deps: ReadOnlyProjectOpenConfirmationDeps
): Promise<PergamumProject | null> {
  if (!isPendingReadOnlyProjectOpen(deps.result)) {
    return deps.result;
  }

  const { token } = deps.result;
  let result: AppChoiceDialogResult;

  try {
    result = await deps.choiceDialog(
      buildReadOnlyProjectOpenChoiceDialogOptions(deps.translate, deps.result)
    );
  } catch (error) {
    if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
      await deps.cancelReadOnlyProjectOpen(token);
      return null;
    }

    throw error;
  }

  if (
    result.kind !== "chosen" ||
    result.id !== readOnlyProjectOpenChoiceIds.open
  ) {
    await deps.cancelReadOnlyProjectOpen(token);
    return null;
  }

  return deps.confirmReadOnlyProjectOpen(token);
}
