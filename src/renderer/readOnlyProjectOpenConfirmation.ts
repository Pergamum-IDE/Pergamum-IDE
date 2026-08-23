import {
  isPendingReadOnlyProjectOpen,
  type PergamumProject,
  type ProjectOpenResult
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

export function buildReadOnlyProjectOpenChoiceDialogOptions(
  translate: Translate
): AppChoiceDialogOptions {
  return {
    title: translate("dialog.readOnlyProjectOpen.title"),
    message: {
      kind: "plainText",
      text: translate("dialog.readOnlyProjectOpen.message")
    },
    icon: {
      kind: "info",
      tooltip: translate("dialog.icon.info")
    },
    choices: [
      {
        id: readOnlyProjectOpenChoiceIds.open,
        label: translate("common.open"),
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
  result: ProjectOpenResult;
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
      buildReadOnlyProjectOpenChoiceDialogOptions(deps.translate)
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
