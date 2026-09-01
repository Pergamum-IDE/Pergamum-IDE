import {
  isPendingCreateProjectInExistingRoot,
  type ProjectOpenFinalizationResult,
  type ProjectOpenResult
} from "../shared/api";
import type { Translate } from "../shared/i18n";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceId
} from "./dialog/appDialogTypes";

export const createProjectConflictChoiceIds = {
  overwriteAndCreate: "overwriteAndCreate",
  cancel: "cancel"
} as const satisfies Record<string, AppDialogChoiceId>;

type CreateProjectConflictChoiceIds = typeof createProjectConflictChoiceIds;

export type CreateProjectConflictChoiceId =
  CreateProjectConflictChoiceIds[keyof CreateProjectConflictChoiceIds];

export function buildCreateProjectConflictChoiceDialogOptions(
  translate: Translate
): AppChoiceDialogOptions {
  return {
    title: translate("dialog.createProjectConflict.title"),
    message: {
      kind: "plainText",
      text: translate("dialog.createProjectConflict.message")
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    choices: [
      {
        id: createProjectConflictChoiceIds.overwriteAndCreate,
        label: translate("dialog.createProjectConflict.overwriteAndCreate"),
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: createProjectConflictChoiceIds.cancel,
        label: translate("common.cancel"),
        role: "cancel"
      }
    ],
    primaryChoiceId: createProjectConflictChoiceIds.overwriteAndCreate,
    cancelChoiceId: createProjectConflictChoiceIds.cancel,
    initialFocusChoiceId: createProjectConflictChoiceIds.cancel,
    clipboardText: null,
    dismissOnBackdropClick: false
  };
}

export interface CreateProjectConflictConfirmationDeps {
  result: ProjectOpenResult;
  translate: Translate;
  choiceDialog: (
    options: AppChoiceDialogOptions
  ) => Promise<AppChoiceDialogResult>;
  confirmCreateProjectInExistingRoot: (
    token: string
  ) => Promise<ProjectOpenFinalizationResult>;
  cancelCreateProjectInExistingRoot: (token: string) => Promise<void>;
}

export async function confirmCreateProjectConflictIfNeeded(
  deps: CreateProjectConflictConfirmationDeps
): Promise<ProjectOpenFinalizationResult> {
  if (!isPendingCreateProjectInExistingRoot(deps.result)) {
    return deps.result;
  }

  const { token } = deps.result;
  let result: AppChoiceDialogResult;

  try {
    result = await deps.choiceDialog(
      buildCreateProjectConflictChoiceDialogOptions(deps.translate)
    );
  } catch (error) {
    if (error instanceof AppDialogError && error.kind === "dialogAlreadyOpen") {
      await deps.cancelCreateProjectInExistingRoot(token);
      return null;
    }

    throw error;
  }

  if (
    result.kind !== "chosen" ||
    result.id !== createProjectConflictChoiceIds.overwriteAndCreate
  ) {
    await deps.cancelCreateProjectInExistingRoot(token);
    return null;
  }

  return deps.confirmCreateProjectInExistingRoot(token);
}
